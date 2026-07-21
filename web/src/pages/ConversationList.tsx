import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";
import type { ConversationSummary } from "../api/types";

function formatTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return d.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" });
  return d.toLocaleDateString("ja-JP", { month: "numeric", day: "numeric" });
}

export function ConversationList({ medium }: { medium: "chat" | "email" }) {
  const [conversations, setConversations] = useState<ConversationSummary[] | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const { conversations } = await api.listConversations();
      if (!cancelled) setConversations(conversations.filter((c) => c.medium === medium));
    }
    load();
    const interval = setInterval(load, 5000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [medium]);

  return (
    <div className="conversation-list">
      <header className="list-header">
        <h1>{medium === "chat" ? "チャット" : "メール"}</h1>
      </header>
      {!conversations && <p className="list-loading">読み込み中…</p>}
      <ul>
        {(conversations ?? []).map((c) => (
          <li
            key={c.conversationId}
            className={`conversation-row ${c.unread > 0 ? "unread" : ""}`}
            onClick={() => navigate(`/${medium === "chat" ? "chats" : "mail"}/${c.characterId}`)}
          >
            <div className="avatar" aria-hidden>
              {c.avatarEmoji ?? "🙂"}
            </div>
            <div className="conversation-body">
              <div className="conversation-top">
                <span className="conversation-name">{c.characterName}</span>
                {c.lastMessage && <span className="conversation-time">{formatTime(c.lastMessage.createdAt)}</span>}
              </div>
              <div className="conversation-preview">
                {c.lastMessage?.status === "pending" && c.lastMessage.sender === "character" ? (
                  <span className="preview-typing">入力中…</span>
                ) : medium === "email" && c.lastMessage?.subject ? (
                  <span>{c.lastMessage.subject}</span>
                ) : (
                  <span>{c.lastMessage?.body ?? "まだメッセージはありません"}</span>
                )}
              </div>
            </div>
            {c.unread > 0 && (
              <span className="unread-badge" aria-label={`未読 ${c.unread}件`}>
                {c.unread}
              </span>
            )}
          </li>
        ))}
        {conversations && conversations.length === 0 && (
          <li className="empty-state">
            {medium === "chat"
              ? "まだ誰とも話していません。気になる人を選んで、ひとこと送ってみましょう。"
              : "まだメールはありません。相手を選んで、最初の一通を書いてみましょう。"}
          </li>
        )}
      </ul>
    </div>
  );
}
