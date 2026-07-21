import {
  listCharacters,
  getOrCreateConversation,
  listMessages,
  getProfile,
  getSetting,
  enqueueGenerationJob,
  latestActiveJobForConversation,
} from "../db/repo.js";
import type { ConversationRow } from "../db/repo.js";

export interface ScheduledDelivery {
  status: "pending" | "delivered";
  scheduledAt: string | null;
}

export type ReplySpeed = "realistic" | "instant";

export function getReplySpeed(): ReplySpeed {
  return getSetting("reply_speed") === "instant" ? "instant" : "realistic";
}

/**
 * Rough reading units for chat: each Japanese kana/kanji counts as one unit;
 * contiguous Latin runs count as one word each. Good enough for a natural
 * "they need a beat to read this" pause without pretending to be a reading-speed lab.
 */
export function countReadingUnits(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  const cjk = trimmed.match(/[\u3040-\u30ff\u3400-\u9fff\uff66-\uff9d]/g)?.length ?? 0;
  const latinWords = trimmed
    .replace(/[\u3040-\u30ff\u3400-\u9fff\uff66-\uff9d]+/g, " ")
    .split(/\s+/)
    .filter(Boolean).length;
  return Math.max(1, cjk + latinWords);
}

/**
 * Human-ish chat cadence. Japanese units are roughly characters rather than
 * linguistic words. These are deliberately slower than pure reading speed:
 * people notice a notification, orient themselves, read, and decide what to
 * say before their typing indicator appears.
 */
const READ_UNITS_PER_MINUTE = 240;
const READ_FLOOR_MS = 1600;
const READ_CAP_MS = 18_000;
const THINK_BASE_MS = 2600;
const THINK_JITTER_MS = 3800;

/** Approximate phone typing pace for Japanese after conversion/corrections. */
const TYPE_UNITS_PER_MINUTE = 145;
const TYPE_FLOOR_MS = 2200;
const TYPE_CAP_MS = 20_000;

export interface ReadThinkDelay {
  readMs: number;
  thinkMs: number;
  totalMs: number;
}

/**
 * Time before the character would plausibly start composing: read the
 * learner's message, then a short think beat.
 */
export function computeReadThinkDelayMs(userText: string, replySpeed: ReplySpeed = getReplySpeed()): ReadThinkDelay {
  if (replySpeed === "instant") {
    return { readMs: 0, thinkMs: 0, totalMs: 0 };
  }
  const units = countReadingUnits(userText);
  const readMs = Math.min(
    READ_CAP_MS,
    Math.max(READ_FLOOR_MS, Math.round((units / READ_UNITS_PER_MINUTE) * 60_000))
  );
  const thinkMs = Math.round(THINK_BASE_MS + Math.random() * THINK_JITTER_MS);
  return { readMs, thinkMs, totalMs: readMs + thinkMs };
}

export function typingStartsAtIso(userSentAtMs: number, userText: string): string {
  const { totalMs } = computeReadThinkDelayMs(userText);
  return new Date(userSentAtMs + totalMs).toISOString();
}

/**
 * Hybrid cadence: wait for read+think on the learner's message, then simulate
 * actually typing the reply. LLM work runs concurrently, but it does not
 * replace human compose time: a person cannot type a complete response while
 * they are still reading.
 */
export function scheduleDelivery(
  medium: "chat" | "email",
  bodyLength: number,
  initiated = false,
  _elapsedMs = 0,
  opts?: { userText?: string; userSentAtMs?: number; typingStartsAtMs?: number }
): ScheduledDelivery {
  const now = Date.now();

  if (getReplySpeed() === "instant") {
    return { status: "delivered", scheduledAt: null };
  }

  if (medium === "email") {
    const minMinutes = initiated ? 20 : 5;
    const maxMinutes = initiated ? 6 * 60 : 90;
    const delayMinutes = minMinutes + Math.random() * (maxMinutes - minMinutes);
    return { status: "pending", scheduledAt: new Date(now + delayMinutes * 60_000).toISOString() };
  }

  const userText = opts?.userText ?? "";
  const userSentAtMs = opts?.userSentAtMs ?? now;
  const { totalMs: readThinkMs } = computeReadThinkDelayMs(userText);
  const typingStartsAt = opts?.typingStartsAtMs ?? userSentAtMs + readThinkMs;

  const typingMs = Math.min(
    TYPE_CAP_MS,
    Math.max(TYPE_FLOOR_MS, Math.round((bodyLength / TYPE_UNITS_PER_MINUTE) * 60_000))
  );
  const correctionJitterMs = Math.round(500 + Math.random() * 1700);
  const bubbleAt = Math.max(
    now + 500,
    typingStartsAt + typingMs + correctionJitterMs
  );

  return { status: "pending", scheduledAt: new Date(bubbleAt).toISOString() };
}

const MAX_INITIATIONS_PER_CHECK = 3;

/**
 * Called on app load. For each character/conversation that is "due" based on
 * initiation_cadence_minutes and has been quiet, possibly generates a
 * backdated incoming message. Capped so a long absence doesn't produce an
 * implausible flood of unread messages.
 */
export async function checkInitiations(): Promise<{ generated: number; skipped: number }> {
  const profile = getProfile();
  if (!profile || !profile.onboarded_at) return { generated: 0, skipped: 0 };

  const characters = listCharacters();
  let generated = 0;
  let skipped = 0;

  for (const character of characters) {
    if (generated >= MAX_INITIATIONS_PER_CHECK) break;
    const media: ("chat" | "email")[] = character.medium === "both" ? ["chat", "email"] : [character.medium as "chat" | "email"];

    for (const medium of media) {
      if (generated >= MAX_INITIATIONS_PER_CHECK) break;
      const conversation = getOrCreateConversation(character.id, medium, profile.default_mode);
      if (!isDue(conversation, character.initiation_cadence_minutes)) {
        skipped++;
        continue;
      }
      if (latestActiveJobForConversation(conversation.id)) {
        skipped++;
        continue;
      }
      enqueueGenerationJob({
        conversationId: conversation.id,
        kind: "initiation",
        payload: { source: "init_check" },
      });
      generated++;
    }
  }

  return { generated, skipped };
}

function isDue(conversation: ConversationRow, cadenceMinutes: number): boolean {
  const messages = listMessages(conversation.id);
  if (messages.length === 0) return true; // never contacted yet
  const last = messages[messages.length - 1];
  if (last.sender === "character" && last.status === "pending") return false; // already has something waiting
  const lastTime = new Date(last.delivered_at ?? last.created_at).getTime();
  const dueTime = lastTime + cadenceMinutes * 60_000;
  // Add jitter so it doesn't feel mechanical.
  const jitter = (Math.random() - 0.3) * cadenceMinutes * 0.3 * 60_000;
  return Date.now() >= dueTime + jitter;
}
