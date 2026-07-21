import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api, ApiError } from "../api/client";
import type { CharacterDetail, Message } from "../api/types";
import { StudyDrawer } from "../components/StudyDrawer";

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" });
}

export function ThreadView({ medium }: { medium: "chat" | "email" }) {
  const { characterId } = useParams<{ characterId: string }>();
  const navigate = useNavigate();

  const [character, setCharacter] = useState<CharacterDetail | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [mode, setMode] = useState<"comprehensible" | "natural">("comprehensible");
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [subject, setSubject] = useState("");
  const [sending, setSending] = useState(false);
  const [waitingForReply, setWaitingForReply] = useState(false);
  const [typingStartsAt, setTypingStartsAt] = useState<string | null>(null);
  const [typingGateOpen, setTypingGateOpen] = useState(true);
  const [typingPulseOn, setTypingPulseOn] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [drawerMessage, setDrawerMessage] = useState<Message | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const draftTimer = useRef<number | null>(null);

  const load = useCallback(async () => {
    if (!characterId) return;
    const [{ character }, convo] = await Promise.all([
      api.getCharacter(characterId),
      api.getConversationByCharacter(characterId, medium),
    ]);
    setCharacter(character);
    setConversationId(convo.conversation.id);
    setMode(convo.conversation.mode);
    setMessages(convo.messages);
    setDraft(convo.draft);
    setWaitingForReply(Boolean(convo.generatingReply));
    setTypingStartsAt(convo.typingStartsAt ?? null);
    if (convo.generationError) setSendError(convo.generationError);
    await api.markRead(convo.conversation.id);
  }, [characterId, medium]);

  useEffect(() => {
    load();
  }, [load]);

  // Hold the typing indicator until read+think has elapsed.
  useEffect(() => {
    if (!typingStartsAt) {
      setTypingGateOpen(true);
      return;
    }
    const starts = new Date(typingStartsAt).getTime();
    const remaining = starts - Date.now();
    if (remaining <= 0) {
      setTypingGateOpen(true);
      return;
    }
    setTypingGateOpen(false);
    const timer = window.setTimeout(() => setTypingGateOpen(true), remaining);
    return () => window.clearTimeout(timer);
  }, [typingStartsAt]);

  const hasPendingCharacterMessage = messages.some((m) => m.sender === "character" && m.status === "pending");
  const awaitingActivity = waitingForReply || hasPendingCharacterMessage;
  const typingReady = awaitingActivity && typingGateOpen;

  // Real people rarely type a longer message in one uninterrupted burst.
  // Alternate between composing and short thinking/editing pauses. A reply
  // that arrives quickly may complete before the first pause.
  useEffect(() => {
    if (!typingReady) {
      setTypingPulseOn(false);
      return;
    }

    let cancelled = false;
    let timer: number | undefined;

    const startTypingBurst = () => {
      if (cancelled) return;
      setTypingPulseOn(true);
      const burstMs = 2600 + Math.random() * 3600;
      timer = window.setTimeout(() => {
        if (cancelled) return;
        setTypingPulseOn(false);
        const pauseMs = 900 + Math.random() * 2800;
        timer = window.setTimeout(startTypingBurst, pauseMs);
      }, burstMs);
    };

    startTypingBurst();
    return () => {
      cancelled = true;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [typingReady]);

  const showTyping = typingReady && typingPulseOn;

  useEffect(() => {
    if (!awaitingActivity || !conversationId || !characterId) return;
    const interval = setInterval(async () => {
      const convo = await api.getConversationByCharacter(characterId, medium);
      setMessages(convo.messages);
      if (convo.typingStartsAt) setTypingStartsAt(convo.typingStartsAt);
      if (convo.generationError) {
        setSendError(convo.generationError);
        setWaitingForReply(false);
        setTypingStartsAt(null);
        return;
      }
      if (!convo.generatingReply) {
        setWaitingForReply(false);
        // Keep typingStartsAt while a pending bubble is still scheduled so the
        // read/think gate continues to apply until delivery.
        if (!convo.messages.some((m) => m.sender === "character" && m.status === "pending")) {
          setTypingStartsAt(null);
        }
      }
    }, 1200);
    return () => clearInterval(interval);
  }, [awaitingActivity, conversationId, characterId, medium]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, showTyping]);

  function onDraftChange(value: string) {
    setDraft(value);
    if (draftTimer.current) window.clearTimeout(draftTimer.current);
    if (!conversationId) return;
    draftTimer.current = window.setTimeout(() => {
      api.saveDraft(conversationId, value).catch(() => undefined);
    }, 500);
  }

  async function handleSend() {
    if (!conversationId || !draft.trim() || sending || waitingForReply) return;
    const text = draft.trim();
    const emailSubject = medium === "email" ? subject : undefined;
    setSending(true);
    setSendError(null);
    // Optimistic: show the learner message immediately, but do NOT flash the
    // typing indicator until the server's read+think timestamp.
    setDraft("");
    setSubject("");
    setWaitingForReply(true);
    setTypingGateOpen(false);
    try {
      const res = await api.sendMessage(conversationId, text, emailSubject);
      setMessages((prev) => {
        if (prev.some((m) => m.id === res.userMessage.id)) return prev;
        return [...prev, res.userMessage];
      });
      if (res.typingStartsAt) setTypingStartsAt(res.typingStartsAt);
      if (res.error) {
        setSendError(res.error.message);
        setWaitingForReply(false);
        setTypingStartsAt(null);
      }
    } catch (err) {
      setDraft(text);
      if (emailSubject) setSubject(emailSubject);
      setWaitingForReply(false);
      setTypingStartsAt(null);
      setSendError(err instanceof ApiError ? err.message : "送信できませんでした。もう一度お試しください。");
    } finally {
      setSending(false);
    }
  }

  async function handleRetryReply() {
    if (!conversationId) return;
    setSendError(null);
    setWaitingForReply(true);
    try {
      const res = await api.retryReply(conversationId);
      if (res.typingStartsAt) setTypingStartsAt(res.typingStartsAt);
    } catch (err) {
      setWaitingForReply(false);
      setTypingStartsAt(null);
      setSendError(err instanceof ApiError ? err.message : "再試行できませんでした。");
    }
  }

  async function handleModeToggle(next: "comprehensible" | "natural") {
    if (!conversationId) return;
    setMode(next);
    await api.setMode(conversationId, next);
  }

  if (!character) {
    return <div className="thread-loading">読み込み中…</div>;
  }

  return (
    <div className="thread-view">
      <header className="thread-header">
        <button className="back-btn" onClick={() => navigate(medium === "chat" ? "/chats" : "/mail")}>
          ←
        </button>
        <div className="avatar">{character.avatarEmoji ?? "🙂"}</div>
        <div className="thread-header-info">
          <span className="thread-name">{character.name}</span>
          <span className="thread-sub">{character.register}</span>
        </div>
        <div className="mode-toggle">
          <button
            className={mode === "comprehensible" ? "active" : ""}
            onClick={() => handleModeToggle("comprehensible")}
            title="自然な日本語のまま、新しい語彙・文法を抑える"
          >
            N+1
          </button>
          <button
            className={mode === "natural" ? "active" : ""}
            onClick={() => handleModeToggle("natural")}
            title="制限なしの完全に自然な日本語"
          >
            Natural
          </button>
        </div>
      </header>

      <div className={`thread-body ${medium}`}>
        {messages.map((m) => (
          <MessageItem key={m.id} message={m} medium={medium} onOpenDrawer={() => setDrawerMessage(m)} />
        ))}
        {showTyping && (
          <div className="pending-row">
            <span className="typing-indicator">
              <span />
              <span />
              <span />
            </span>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {sendError && (
        <div className="send-error">
          {sendError}
          <button className="retry-btn" onClick={handleRetryReply} disabled={waitingForReply}>
            再試行
          </button>
        </div>
      )}

      <div className="compose-bar">
        {medium === "email" && (
          <input
            className="subject-input"
            placeholder="件名"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
          />
        )}
        <textarea
          value={draft}
          onChange={(e) => onDraftChange(e.target.value)}
          placeholder={medium === "chat" ? "メッセージを入力…" : "本文を入力…"}
          onKeyDown={(e) => {
            // Skip Enter presses that are part of IME composition (confirming
            // kana->kanji conversion or a candidate), not intended to submit.
            // Some browsers don't set isComposing reliably, so also check the
            // legacy keyCode 229 used during composition as a fallback.
            const isComposingKeyEvent = e.nativeEvent.isComposing || e.keyCode === 229;
            if (medium === "chat" && e.key === "Enter" && !e.shiftKey && !isComposingKeyEvent) {
              e.preventDefault();
              handleSend();
            }
          }}
        />
        <button className="send-btn" onClick={handleSend} disabled={sending || waitingForReply || !draft.trim()}>
          送信
        </button>
      </div>

      {drawerMessage && (
        <StudyDrawer
          message={drawerMessage}
          conversationId={conversationId!}
          onClose={() => setDrawerMessage(null)}
        />
      )}
    </div>
  );
}

function MessageItem({
  message,
  medium,
  onOpenDrawer,
}: {
  message: Message;
  medium: "chat" | "email";
  onOpenDrawer: () => void;
}) {
  if (message.status === "pending") return null;

  if (medium === "email") {
    return (
      <div className={`email-card ${message.sender}`}>
        <div className="email-card-top">
          <span className="email-sender">{message.sender === "user" ? "自分" : ""}</span>
          <span className="email-time">{formatTimestamp(message.deliveredAt ?? message.createdAt)}</span>
        </div>
        {message.subject && <div className="email-subject">{message.subject}</div>}
        <div className="email-body">{message.body}</div>
        <button className="msg-action" onClick={onOpenDrawer}>
          {message.sender === "user" ? "ネイティブならこう言う？" : "この文を読む"}
        </button>
      </div>
    );
  }

  return (
    <div className={`bubble-row ${message.sender}`}>
      <div className="bubble" onClick={onOpenDrawer}>
        {message.body}
      </div>
      <div className="bubble-meta">
        <span>{formatTimestamp(message.deliveredAt ?? message.createdAt)}</span>
        {message.sender === "user" && message.readAt && <span className="read-receipt">既読</span>}
      </div>
    </div>
  );
}
