import { useState } from "react";
import { isAuthConfigured, signInWithMagicLink } from "../lib/supabase";

export function Login() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  if (!isAuthConfigured()) {
    return (
      <div className="login-page">
        <div className="login-card">
          <h1>Japatext</h1>
          <p>Auth is not configured for this build. Local mode does not require sign-in.</p>
        </div>
      </div>
    );
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("sending");
    setError(null);
    const result = await signInWithMagicLink(email.trim());
    if (result.error) {
      setError(result.error);
      setStatus("error");
      return;
    }
    setStatus("sent");
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <h1>Japatext</h1>
        <p className="login-sub">招待制です。登録メールアドレスにマジックリンクを送ります。</p>
        {status === "sent" ? (
          <p className="login-sent">メールを確認してください。リンクから戻るとログインできます。</p>
        ) : (
          <form onSubmit={onSubmit} className="login-form">
            <label>
              メールアドレス
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
              />
            </label>
            {error && <p className="login-error">{error}</p>}
            <button type="submit" disabled={status === "sending" || !email.trim()}>
              {status === "sending" ? "送信中…" : "マジックリンクを送る"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
