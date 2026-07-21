import { Router } from "express";
import { z } from "zod";
import {
  listCharacters,
  getCharacter,
  getOrCreateConversation,
  getConversation,
  listMessages,
  deliverDueMessages,
  createMessage,
  getProfile,
  markConversationRead,
  unreadCount,
  deliverMessageNow,
  getMessage,
  setConversationMode,
  getDraft,
  saveDraft,
  addDifficultyFeedback,
  findLearningItem,
  adjustLearningItemConfidence,
  recordEncounter,
  enqueueGenerationJob,
  latestActiveJobForConversation,
  latestFailedJobForConversation,
  type MessageRow,
} from "../db/repo.js";
import { typingStartsAtIso } from "../engine/delivery.js";
import { asyncRoute } from "../lib/asyncRoute.js";

export const conversationsRouter = Router();

function serializeMessage(m: MessageRow) {
  return {
    id: m.id,
    conversationId: m.conversation_id,
    sender: m.sender,
    medium: m.medium,
    subject: m.subject,
    body: m.body,
    status: m.status,
    mode: m.mode,
    scheduledAt: m.scheduled_at,
    deliveredAt: m.delivered_at,
    readAt: m.read_at,
    createdAt: m.created_at,
  };
}

function generationState(conversationId: string) {
  const active = latestActiveJobForConversation(conversationId);
  const failed = active ? undefined : latestFailedJobForConversation(conversationId);
  return {
    generatingReply: Boolean(active),
    typingStartsAt: active?.typing_starts_at ?? null,
    generationError: failed?.error ?? null,
  };
}

conversationsRouter.get(
  "/",
  asyncRoute(async (_req, res) => {
    const profile = getProfile();
    const defaultMode = profile?.default_mode ?? "comprehensible";
    const characters = listCharacters();
    const summaries = characters.flatMap((character) => {
      const media = character.medium === "both" ? (["chat", "email"] as const) : ([character.medium] as ("chat" | "email")[]);
      return media.map((medium) => {
        const conversation = getOrCreateConversation(character.id, medium, defaultMode);
        deliverDueMessages(conversation.id);
        const messages = listMessages(conversation.id);
        const last = messages[messages.length - 1];
        return {
          conversationId: conversation.id,
          characterId: character.id,
          characterName: character.name,
          avatarEmoji: character.avatar_emoji,
          medium,
          mode: conversation.mode,
          unread: unreadCount(conversation.id),
          lastMessage: last
            ? { body: last.body, sender: last.sender, status: last.status, createdAt: last.created_at, subject: last.subject }
            : null,
        };
      });
    });
    summaries.sort((a, b) => {
      const at = a.lastMessage?.createdAt ?? "";
      const bt = b.lastMessage?.createdAt ?? "";
      return bt.localeCompare(at);
    });
    res.json({ conversations: summaries });
  })
);

conversationsRouter.get(
  "/by-character/:characterId",
  asyncRoute(async (req, res) => {
    const character = getCharacter(req.params.characterId);
    if (!character) {
      res.status(404).json({ error: { message: "Character not found" } });
      return;
    }
    const medium = (req.query.medium as string) === "email" ? "email" : "chat";
    const profile = getProfile();
    const conversation = getOrCreateConversation(character.id, medium, profile?.default_mode ?? "comprehensible");
    deliverDueMessages(conversation.id);
    const messages = listMessages(conversation.id).map(serializeMessage);
    const draft = getDraft(conversation.id);
    const state = generationState(conversation.id);
    res.json({
      conversation,
      messages,
      draft,
      generatingReply: state.generatingReply,
      typingStartsAt: state.typingStartsAt,
      generationError: state.generationError,
    });
  })
);

conversationsRouter.post(
  "/:conversationId/read",
  asyncRoute(async (req, res) => {
    markConversationRead(req.params.conversationId);
    res.json({ ok: true });
  })
);

conversationsRouter.patch(
  "/:conversationId/mode",
  asyncRoute(async (req, res) => {
    const schema = z.object({ mode: z.enum(["comprehensible", "natural"]) });
    const { mode } = schema.parse(req.body);
    setConversationMode(req.params.conversationId, mode);
    res.json({ ok: true });
  })
);

conversationsRouter.get(
  "/:conversationId/draft",
  asyncRoute(async (req, res) => {
    res.json({ draft: getDraft(req.params.conversationId) });
  })
);

conversationsRouter.put(
  "/:conversationId/draft",
  asyncRoute(async (req, res) => {
    const schema = z.object({ body: z.string() });
    const { body } = schema.parse(req.body);
    saveDraft(req.params.conversationId, body);
    res.json({ ok: true });
  })
);

conversationsRouter.post(
  "/:conversationId/deliver-now",
  asyncRoute(async (req, res) => {
    const messages = listMessages(req.params.conversationId);
    const pending = [...messages].reverse().find((m) => m.status === "pending" && m.sender === "character");
    if (pending) deliverMessageNow(pending.id);
    res.json({ ok: true, delivered: Boolean(pending) });
  })
);

conversationsRouter.post(
  "/:conversationId/messages",
  asyncRoute(async (req, res) => {
    const schema = z.object({ text: z.string().min(1), subject: z.string().optional() });
    const { text, subject } = schema.parse(req.body);
    const conversation = getConversation(req.params.conversationId);
    if (!conversation) {
      res.status(404).json({ error: { message: "Conversation not found" } });
      return;
    }

    saveDraft(conversation.id, "");
    const userMessage = createMessage({
      conversationId: conversation.id,
      sender: "user",
      medium: conversation.medium,
      subject: subject ?? null,
      body: text,
      status: "delivered",
      mode: conversation.mode,
    });
    markConversationRead(conversation.id);

    const userSentAtMs = new Date(userMessage.created_at).getTime();
    const typingStartsAt = typingStartsAtIso(userSentAtMs, text);
    enqueueGenerationJob({
      conversationId: conversation.id,
      kind: "reply",
      typingStartsAt,
      payload: { userMessageId: userMessage.id },
      idempotencyKey: `reply:${userMessage.id}`,
    });

    res.status(202).json({
      userMessage: serializeMessage(userMessage),
      generatingReply: true,
      typingStartsAt,
    });
  })
);

conversationsRouter.post(
  "/:conversationId/retry-reply",
  asyncRoute(async (req, res) => {
    const conversation = getConversation(req.params.conversationId);
    if (!conversation) {
      res.status(404).json({ error: { message: "Conversation not found" } });
      return;
    }
    const active = latestActiveJobForConversation(conversation.id);
    if (active) {
      res.status(202).json({
        generatingReply: true,
        typingStartsAt: active.typing_starts_at,
      });
      return;
    }
    const typingStartsAt = new Date(Date.now() + 900).toISOString();
    enqueueGenerationJob({
      conversationId: conversation.id,
      kind: "reply",
      typingStartsAt,
      payload: { retry: true },
    });
    res.status(202).json({ generatingReply: true, typingStartsAt });
  })
);

conversationsRouter.post(
  "/:conversationId/messages/:messageId/feedback",
  asyncRoute(async (req, res) => {
    const schema = z.object({ rating: z.enum(["too_easy", "good", "too_hard"]) });
    const { rating } = schema.parse(req.body);
    const message = getMessage(req.params.messageId);
    if (!message) {
      res.status(404).json({ error: { message: "Message not found" } });
      return;
    }
    addDifficultyFeedback(message.id, rating);
    const meta = message.generation_meta_json ? JSON.parse(message.generation_meta_json) : null;
    const delta = rating === "too_hard" ? -0.15 : rating === "too_easy" ? 0.1 : 0.05;
    if (meta?.new_vocabulary) {
      for (const v of meta.new_vocabulary as { lemma: string }[]) {
        const item = findLearningItem(v.lemma, "vocab");
        if (item) {
          adjustLearningItemConfidence(item.id, delta);
          recordEncounter(item.id, message.id, `feedback_${rating === "too_easy" ? "easy" : rating === "too_hard" ? "hard" : "good"}`);
        }
      }
    }
    res.json({ ok: true });
  })
);
