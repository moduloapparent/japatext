import { generateStructured } from "../lib/llm.js";
import { TAGGING_MODEL } from "../config.js";
import { DifficultyTagResultSchema, TAG_DIFFICULTY_TOOL_SCHEMA, type DifficultyTagResult } from "./schemas.js";
import { getKnownConfidenceMap } from "../db/repo.js";

const KNOWN_THRESHOLD = 0.4;

const SYSTEM_PROMPT = `あなたは日本語学習者(JLPT N3程度)向けのテキストを分析するアシスタントです。与えられた日本語のメッセージ本文を読み、その学習者にとって本当に新しい・高度だと思われる語彙・文法だけを、tag_difficultyツールを使って正直に列挙してください。固有名詞や決まり文句、この会話のトピック上どうしても必要な語は is_protected=true としてください。過剰に多く挙げず、機械的な分かち書きではなく本当に難しい項目だけを選んでください。`;

/**
 * Mechanical extraction pass over an already-written Japanese reply: flags
 * vocab/grammar likely beyond the learner's current level. Kept off the
 * creative-generation call so that model isn't also self-grading its output.
 */
export async function tagDifficulty(messageText: string): Promise<DifficultyTagResult> {
  const known = getKnownConfidenceMap();
  const knownLemmas = [...known.entries()]
    .filter(([, confidence]) => confidence >= KNOWN_THRESHOLD)
    .map(([lemma]) => lemma)
    .slice(0, 300)
    .join("、");

  const userContent = `学習者が既に知っている語彙（参考; 網羅的ではありません）:\n${knownLemmas || "（まだ記録がありません）"}\n\n分析対象のメッセージ:\n${messageText}`;

  const { data } = await generateStructured<DifficultyTagResult>({
    endpoint: "tag_difficulty",
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userContent }],
    tool: TAG_DIFFICULTY_TOOL_SCHEMA,
    schema: DifficultyTagResultSchema,
    model: TAGGING_MODEL,
    maxTokens: 2048,
  });

  return data;
}
