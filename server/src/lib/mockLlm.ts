/**
 * Deterministic fixture responses used in place of real OpenAI calls when
 * JAPATEXT_MOCK_LLM=1 (see config.isMockLlm). This exists purely to exercise
 * the surrounding pipeline code — schema validation, the difficulty
 * regeneration loop, memory/story side effects, and analysis caching —
 * without spending API credit. It does NOT validate real Japanese quality;
 * only the live model can do that.
 */
import type { ChatMessage } from "./llmTypes.js";

function textOf(content: ChatMessage["content"]): string {
  return content;
}

function isRegenerationRequest(messages: ChatMessage[]): boolean {
  const last = messages[messages.length - 1];
  if (!last) return false;
  return textOf(last.content).includes("システムより");
}

function isEmail(system: string): boolean {
  return system.includes("これはメールです");
}

export function mockToolInput(toolName: string, system: string, messages: ChatMessage[]): Record<string, unknown> {
  switch (toolName) {
    case "send_reply":
    case "send_initiated_message": {
      const email = isEmail(system);
      const regenerated = isRegenerationRequest(messages);

      if (regenerated) {
        // Simulates a successful simplification: fewer/no flagged items.
        const base = {
          message: email
            ? "ご連絡ありがとうございます。来週、詳しい資料をお送りします。よろしくお願いします。"
            : "了解！また連絡するね。",
          subject: email ? "Re: ご連絡" : "",
          register: "neutral",
          intent_summary: "Acknowledge and promise a follow-up.",
          memory_updates: [{ type: "event", content: "[mock] Follow-up acknowledged after simplification." }],
          story_thread_updates: [],
        };
        if (toolName === "send_initiated_message") return { ...base, should_send: true };
        return base;
      }

      const base = {
        message: email
          ? "お世話になっております。来月のキックオフに向けて、資料の草稿を添付いたしましたので、ご確認いただけますでしょうか。ご不明な点がございましたら遠慮なくお知らせください。"
          : "今日は天気がいいから、公園に行こうと思ってるんだけど、一緒に散歩しない？",
        subject: email ? "来月のキックオフについて" : "",
        register: email ? "keigo" : "casual",
        intent_summary: "Invite the learner to do something together / share an update.",
        memory_updates: [{ type: "event", content: "[mock] Reached out with an invitation/update." }],
        story_thread_updates: [],
      };
      if (toolName === "send_initiated_message") return { ...base, should_send: true };
      return base;
    }

    case "tag_difficulty": {
      const userText = textOf(messages[messages.length - 1]?.content ?? "");
      const isFollowUp = userText.includes("了解！また連絡するね。") || userText.includes("ご連絡ありがとうございます");
      if (isFollowUp) {
        return { new_vocabulary: [], new_grammar: [] };
      }
      return {
        new_vocabulary: [
          { surface: "草稿", lemma: "草稿", reading: "そうこう", meaning_note: "draft", is_protected: false },
          { surface: "添付", lemma: "添付", reading: "てんぷ", meaning_note: "attach", is_protected: false },
          { surface: "散歩", lemma: "散歩", reading: "さんぽ", meaning_note: "a walk", is_protected: false },
        ],
        new_grammar: [{ pattern: "〜と思ってる", note: "casual stated intention" }],
      };
    }

    case "explain_message": {
      const userText = textOf(messages[messages.length - 1]?.content ?? "");
      const targetLine = userText.split("\n").filter(Boolean).pop() ?? "";
      return {
        overview: "[mock] This message casually invites the listener to join an activity together.",
        tokens: [
          { surface: "散歩", reading: "さんぽ", lemma: "散歩", meaning: "a walk", note: "often paired with 犬の散歩 (dog walk)" },
          { surface: "一緒に", reading: "いっしょに", lemma: "一緒に", meaning: "together", note: "" },
        ],
        grammar_points: [{ pattern: "〜ない？", explanation: "Casual invitation form, softer than 〜しよう。" }],
        functional_note: `[mock] A literal translation would miss that this is a low-pressure invitation, not a real question. (source: ${targetLine.slice(0, 30)})`,
        english_gloss: "Wanna go for a walk together since the weather's nice today?",
      };
    }

    case "compare_phrasing": {
      return {
        inferred_intent: "[mock] The learner wants to say they plan to rest at home tonight because they're tired.",
        sounds_natural: false,
        minimal_revision: "今夜は疲れてるから、家でゆっくりするつもり。",
        idiomatic_alternative: "今日はもう疲れたから、家でゆっくりしようと思って。",
        differences: "[mock] The revised versions drop the stiff '〜することを計画しています' (a literal 'planning to' construction) in favor of 〜つもり/〜しようと思って, which is how natives actually talk about near-term intentions.",
      };
    }

    default:
      throw new Error(`No mock fixture defined for tool "${toolName}"`);
  }
}
