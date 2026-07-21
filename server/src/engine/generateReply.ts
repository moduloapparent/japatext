import { generateStructured } from "../lib/llm.js";
import type { ChatMessage } from "../lib/llmTypes.js";
import { GENERATION_MODEL, isMockLlm } from "../config.js";
import {
  ReplyResultSchema,
  REPLY_TOOL_SCHEMA,
  type ReplyResult,
  InitiationResultSchema,
  INITIATION_TOOL_SCHEMA,
  type InitiationResult,
  type DifficultyTagResult,
} from "./schemas.js";
import { buildSystemPrompt } from "./prompts.js";
import { checkDifficulty, computeTargetStretchItems } from "./difficulty.js";
import { tagDifficulty } from "./tagDifficulty.js";
import {
  getCharacter,
  getRelationship,
  listThreads,
  listMemories,
  getProfile,
  listMessages,
  getMessage,
  createMessage,
  updateMessageGenerationMeta,
  addMemory,
  upsertThreadByTitle,
  upsertLearningItemOnEncounter,
  recordEncounter,
  type MessageRow,
  type ConversationRow,
} from "../db/repo.js";
import { scheduleDelivery } from "./delivery.js";
import { getTypingStartsAt } from "./generationStatus.js";

/** A reply/initiation result merged with its (separately tagged) difficulty metadata. */
type TaggedReply = (ReplyResult | InitiationResult) & DifficultyTagResult;

function historyToMessages(messages: MessageRow[]): ChatMessage[] {
  return messages
    .filter((m) => m.status === "delivered")
    .slice(-24)
    .map((m) => ({
      role: m.sender === "user" ? ("user" as const) : ("assistant" as const),
      content: m.subject ? `件名: ${m.subject}\n\n${m.body}` : m.body,
    }));
}

function applyNarrativeSideEffects(
  characterId: string,
  result: ReplyResult | InitiationResult,
  messageId: string | null
): void {
  for (const mem of result.memory_updates) {
    addMemory(characterId, mem.type, mem.content, messageId);
  }
  for (const thread of result.story_thread_updates) {
    upsertThreadByTitle(characterId, thread.thread_title, thread.status, thread.note ?? "");
  }
}

function applyLearningSideEffects(
  result: DifficultyTagResult,
  messageId: string | null
): void {
  for (const vocab of result.new_vocabulary) {
    const item = upsertLearningItemOnEncounter({
      lemma: vocab.lemma,
      surface: vocab.surface,
      reading: vocab.reading,
      kind: "vocab",
      meaningNote: vocab.meaning_note,
    });
    recordEncounter(item.id, messageId, "seen");
  }
  for (const grammar of result.new_grammar) {
    const item = upsertLearningItemOnEncounter({
      lemma: grammar.pattern,
      kind: "grammar",
      meaningNote: grammar.note,
    });
    recordEncounter(item.id, messageId, "seen");
  }
}

function applySideEffects(characterId: string, result: TaggedReply, messageId: string | null): void {
  applyNarrativeSideEffects(characterId, result, messageId);
  applyLearningSideEffects(result, messageId);
}

export interface GenerateReplyReport {
  message: MessageRow;
  regenerated: boolean;
  difficulty: ReturnType<typeof checkDifficulty>;
}

async function callReply(args: {
  system: string;
  history: ChatMessage[];
  regenerationNote?: string;
}): Promise<{ data: ReplyResult; usage: { inputTokens: number; outputTokens: number } }> {
  const messages: ChatMessage[] = [...args.history];
  if (args.regenerationNote) {
    messages.push({ role: "user", content: args.regenerationNote });
  }
  return generateStructured({
    endpoint: "reply",
    system: args.system,
    messages,
    tool: REPLY_TOOL_SCHEMA,
    schema: ReplyResultSchema,
    model: GENERATION_MODEL,
    maxTokens: 4096,
  });
}

/**
 * Generation + difficulty check + (if over budget in comprehensible mode)
 * one regeneration pass, for either a reply or an initiated message. The
 * generation call and the difficulty tagging call are separate models
 * (mini for voice, nano for extraction), so each regeneration re-runs both.
 */
async function generateWithDifficultyLoop(args: {
  system: string;
  history: ChatMessage[];
  medium: "chat" | "email";
  mode: "comprehensible" | "natural";
  kind: "reply" | "initiation";
  fallbackHistoryNote?: string;
}): Promise<{ data: ReplyResult | InitiationResult; tags: DifficultyTagResult; difficulty: ReturnType<typeof checkDifficulty>; regenerated: boolean }> {
  const messages: ChatMessage[] =
    args.history.length > 0 || !args.fallbackHistoryNote
      ? args.history
      : [{ role: "user", content: args.fallbackHistoryNote }];

  let data: ReplyResult | InitiationResult;
  if (args.kind === "initiation") {
    const result = await generateStructured<InitiationResult>({
      endpoint: "initiation",
      system: args.system,
      messages,
      tool: INITIATION_TOOL_SCHEMA,
      schema: InitiationResultSchema,
      model: GENERATION_MODEL,
      maxTokens: 4096,
    });
    data = result.data;
  } else {
    const result = await callReply({ system: args.system, history: messages });
    data = result.data;
  }

  if (args.kind === "initiation" && !(data as InitiationResult).should_send) {
    return { data, tags: { new_vocabulary: [], new_grammar: [] }, difficulty: checkDifficulty(data.message, { new_vocabulary: [], new_grammar: [] }, args.medium), regenerated: false };
  }

  let tags = await tagDifficulty(data.message);
  let difficulty = checkDifficulty(data.message, tags, args.medium);
  let regenerated = false;

  if (args.mode === "comprehensible" && !difficulty.withinTarget) {
    const offendingList = difficulty.offendingVocab.map((v) => v.surface).join("、");
    const note = `（システムより）直前の返信には新しい語彙・文法が多すぎます。特に「${offendingList}」あたりを、文脈で意味が推測できる範囲でもう少し易しい表現に調整して、自然な日本語のまま同じ内容をもう一度書き直してください。難しくても自然さを優先してください。`;

    if (args.kind === "initiation") {
      const retry = await generateStructured<InitiationResult>({
        endpoint: "initiation",
        system: args.system,
        messages: [...messages, { role: "user", content: note }],
        tool: INITIATION_TOOL_SCHEMA,
        schema: InitiationResultSchema,
        model: GENERATION_MODEL,
        maxTokens: 4096,
      });
      data = retry.data;
    } else {
      const retry = await callReply({ system: args.system, history: messages, regenerationNote: note });
      data = retry.data;
    }
    tags = await tagDifficulty(data.message);
    difficulty = checkDifficulty(data.message, tags, args.medium);
    regenerated = true;
  }

  return { data, tags, difficulty, regenerated };
}

export async function generateCharacterReply(conversation: ConversationRow): Promise<GenerateReplyReport> {
  const generationStartedAt = Date.now();
  const character = getCharacter(conversation.character_id);
  if (!character) throw new Error("Character not found");
  const relationship = getRelationship(character.id);
  const threads = listThreads(character.id);
  const memories = listMemories(character.id, 20);
  const profile = getProfile();
  const mode = conversation.mode as "comprehensible" | "natural";
  const medium = conversation.medium as "chat" | "email";

  const history = historyToMessages(listMessages(conversation.id));
  const approxTarget = computeTargetStretchItems(medium === "email" ? 400 : 80, medium);

  const system = buildSystemPrompt({
    character,
    relationshipNotes: relationship?.notes ?? null,
    familiarity: relationship?.familiarity ?? "acquaintance",
    threads,
    memories,
    profile,
    medium,
    mode,
    targetStretchItems: approxTarget,
  });

  // Keep the visible reply path to one model call. Difficulty tagging is
  // useful learning metadata, but it must not hold the conversation hostage
  // behind a second API request (or a third/fourth request for regeneration).
  const { data } = await callReply({ system, history });
  const emptyTags: DifficultyTagResult = { new_vocabulary: [], new_grammar: [] };
  const initialDifficulty = checkDifficulty(data.message, emptyTags, medium);

  const elapsedMs = Date.now() - generationStartedAt;
  const allMessages = listMessages(conversation.id);
  const lastUser = [...allMessages].reverse().find((m) => m.sender === "user");
  const trackedTypingStartsAt = getTypingStartsAt(conversation.id);
  const scheduled = scheduleDelivery(medium, data.message.length, false, elapsedMs, {
    userText: lastUser?.body ?? "",
    userSentAtMs: lastUser
      ? new Date(lastUser.delivered_at ?? lastUser.created_at).getTime()
      : Date.now(),
    typingStartsAtMs: trackedTypingStartsAt
      ? new Date(trackedTypingStartsAt).getTime()
      : undefined,
  });
  const message = createMessage({
    conversationId: conversation.id,
    sender: "character",
    medium,
    subject: medium === "email" ? data.subject || "（件名なし）" : null,
    body: data.message,
    status: scheduled.status,
    mode,
    scheduledAt: scheduled.scheduledAt,
    generationMeta: {
      register: data.register,
      intent_summary: data.intent_summary,
      new_vocabulary: [],
      new_grammar: [],
      regenerated: false,
      difficulty: initialDifficulty,
      analysis_status: "pending",
    },
  });

  applyNarrativeSideEffects(character.id, data, message.id);

  const enrich = async () => {
    try {
      const tags = await tagDifficulty(data.message);
      const difficulty = checkDifficulty(data.message, tags, medium);
      updateMessageGenerationMeta(message.id, {
        register: data.register,
        intent_summary: data.intent_summary,
        new_vocabulary: tags.new_vocabulary,
        new_grammar: tags.new_grammar,
        regenerated: false,
        difficulty,
        analysis_status: "complete",
      });
      applyLearningSideEffects(tags, message.id);
    } catch (err) {
      updateMessageGenerationMeta(message.id, {
        register: data.register,
        intent_summary: data.intent_summary,
        new_vocabulary: [],
        new_grammar: [],
        regenerated: false,
        difficulty: initialDifficulty,
        analysis_status: "failed",
        analysis_error: err instanceof Error ? err.message : String(err),
      });
    }
  };

  // Keep deterministic fixtures synchronous for tests. Live analysis is
  // deliberately detached so the character message becomes visible as soon
  // as generation finishes.
  if (isMockLlm()) await enrich();
  else void enrich();

  return {
    message: isMockLlm() ? getMessage(message.id) ?? message : message,
    regenerated: false,
    difficulty: initialDifficulty,
  };
}

export async function generateInitiatedMessage(conversation: ConversationRow): Promise<GenerateReplyReport | null> {
  const generationStartedAt = Date.now();
  const character = getCharacter(conversation.character_id);
  if (!character) return null;
  const relationship = getRelationship(character.id);
  const threads = listThreads(character.id);
  const memories = listMemories(character.id, 20);
  const profile = getProfile();
  const mode = conversation.mode as "comprehensible" | "natural";
  const medium = conversation.medium as "chat" | "email";
  const history = historyToMessages(listMessages(conversation.id));
  const approxTarget = computeTargetStretchItems(medium === "email" ? 400 : 80, medium);

  const system =
    buildSystemPrompt({
      character,
      relationshipNotes: relationship?.notes ?? null,
      familiarity: relationship?.familiarity ?? "acquaintance",
      threads,
      memories,
      profile,
      medium,
      mode,
      targetStretchItems: approxTarget,
    }) +
    `\n\n## 状況\nしばらく学習者からの連絡がありません。あなたから連絡してもよいタイミングか判断してください。send_initiated_messageツールのshould_sendで判断を示し、trueの場合のみ自然な内容のメッセージを書いてください。`;

  const { data, tags, difficulty, regenerated } = await generateWithDifficultyLoop({
    system,
    history,
    medium,
    mode,
    kind: "initiation",
    fallbackHistoryNote: "（これはまだやり取りのない最初のきっかけです。自然な最初の一言を送ってください。）",
  });

  const initiationData = data as InitiationResult;
  if (!initiationData.should_send) return null;

  const elapsedMs = Date.now() - generationStartedAt;
  const scheduled = scheduleDelivery(medium, data.message.length, true, elapsedMs);
  const message = createMessage({
    conversationId: conversation.id,
    sender: "character",
    medium,
    subject: medium === "email" ? data.subject || "（件名なし）" : null,
    body: data.message,
    status: scheduled.status,
    mode,
    scheduledAt: scheduled.scheduledAt,
    generationMeta: {
      register: data.register,
      intent_summary: data.intent_summary,
      initiated: true,
      new_vocabulary: tags.new_vocabulary,
      new_grammar: tags.new_grammar,
      difficulty,
    },
  });

  applySideEffects(character.id, { ...data, ...tags }, message.id);

  return { message, regenerated, difficulty };
}
