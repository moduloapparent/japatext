import { generateStructured } from "../lib/llm.js";
import { TAGGING_MODEL } from "../config.js";
import {
  GlossResultSchema,
  GLOSS_TOOL_SCHEMA,
  type GlossResult,
  ComparisonResultSchema,
  COMPARISON_TOOL_SCHEMA,
  type ComparisonResult,
} from "./schemas.js";
import { buildGlossSystemPrompt, buildComparisonSystemPrompt } from "./prompts.js";
import {
  getMessage,
  getCachedAnalysis,
  saveAnalysis,
  listMessages,
  upsertLearningItemOnEncounter,
  recordEncounter,
  type MessageRow,
} from "../db/repo.js";

const PROMPT_VERSION = "v1";

function contextWindow(messages: MessageRow[], targetId: string, radius = 6): MessageRow[] {
  const idx = messages.findIndex((m) => m.id === targetId);
  if (idx === -1) return messages.slice(-radius);
  return messages.slice(Math.max(0, idx - radius), idx + 1);
}

export async function getOrGenerateGloss(messageId: string): Promise<GlossResult> {
  const cached = getCachedAnalysis(messageId, "gloss", PROMPT_VERSION);
  if (cached) return cached as GlossResult;

  const message = getMessage(messageId);
  if (!message) throw new Error("Message not found");

  const allMessages = listMessages(message.conversation_id);
  const window = contextWindow(allMessages, messageId);
  const contextText = window
    .map((m) => `${m.sender === "user" ? "学習者" : "相手"}: ${m.body}`)
    .join("\n");

  const userContent = `会話の流れ:\n${contextText}\n\n解説してほしいメッセージ:\n${message.body}`;

  const { data } = await generateStructured<GlossResult>({
    endpoint: "gloss",
    system: buildGlossSystemPrompt(),
    messages: [{ role: "user", content: userContent }],
    tool: GLOSS_TOOL_SCHEMA,
    schema: GlossResultSchema,
    model: TAGGING_MODEL,
    maxTokens: 2048,
  });

  for (const token of data.tokens) {
    if (!token.lemma) continue;
    const item = upsertLearningItemOnEncounter({
      lemma: token.lemma,
      surface: token.surface,
      reading: token.reading,
      kind: "vocab",
      meaningNote: token.meaning,
    });
    recordEncounter(item.id, messageId, "looked_up");
  }

  saveAnalysis(messageId, "gloss", PROMPT_VERSION, data);
  return data;
}

export async function compareWithNativePhrasing(messageId: string): Promise<ComparisonResult> {
  const message = getMessage(messageId);
  if (!message) throw new Error("Message not found");
  if (message.sender !== "user") {
    throw new Error("Comparison is only available for the learner's own messages.");
  }

  const cached = getCachedAnalysis(messageId, "comparison", PROMPT_VERSION);
  if (cached) return cached as ComparisonResult;

  const allMessages = listMessages(message.conversation_id);
  const window = contextWindow(allMessages, messageId);
  const contextText = window
    .map((m) => `${m.sender === "user" ? "学習者" : "相手"}: ${m.body}`)
    .join("\n");

  const userContent = `会話の流れ（最後が学習者の発言です）:\n${contextText}\n\n評価してほしい学習者の発言:\n${message.body}`;

  const { data } = await generateStructured<ComparisonResult>({
    endpoint: "comparison",
    system: buildComparisonSystemPrompt(),
    messages: [{ role: "user", content: userContent }],
    tool: COMPARISON_TOOL_SCHEMA,
    schema: ComparisonResultSchema,
    model: TAGGING_MODEL,
    maxTokens: 2048,
  });

  saveAnalysis(messageId, "comparison", PROMPT_VERSION, data);
  return data;
}
