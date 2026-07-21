import { useEffect, useState } from "react";
import { api } from "../api/client";
import { useApp } from "../state/AppContext";
import type { UsageSummary } from "../api/types";

export function Settings() {
  const { profile, refreshProfile, apiKeyConfigured, authRequired, signOut } = useApp();
  const [usage, setUsage] = useState<UsageSummary | null>(null);
  const [confirmingReset, setConfirmingReset] = useState(false);
  const [busy, setBusy] = useState(false);
  const [replySpeed, setReplySpeedState] = useState<"realistic" | "instant" | null>(null);

  useEffect(() => {
    api.getUsage().then(setUsage).catch(() => undefined);
    api.getReplySpeed().then((r) => setReplySpeedState(r.replySpeed)).catch(() => undefined);
  }, []);

  async function toggleDefaultMode(mode: "comprehensible" | "natural") {
    await api.setDefaultMode(mode);
    await refreshProfile();
  }

  async function toggleReplySpeed(speed: "realistic" | "instant") {
    setReplySpeedState(speed);
    await api.setReplySpeed(speed);
  }

  async function handleReset() {
    setBusy(true);
    try {
      await api.resetAll();
      window.location.reload();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="settings-page">
      <header className="list-header">
        <h1>Settings</h1>
      </header>

      <section className="settings-section">
        <h2>プロフィール</h2>
        <p>
          {profile?.displayName} さん（JLPT基準: {profile?.jlptBaseline}）
        </p>
        <p className="settings-note">興味: {profile?.interests.join("、") || "未設定"}</p>
      </section>

      <section className="settings-section">
        <h2>デフォルトの難易度モード</h2>
        <div className="mode-toggle">
          <button
            className={profile?.defaultMode === "comprehensible" ? "active" : ""}
            onClick={() => toggleDefaultMode("comprehensible")}
          >
            Comprehensible (N+1)
          </button>
          <button className={profile?.defaultMode === "natural" ? "active" : ""} onClick={() => toggleDefaultMode("natural")}>
            Natural
          </button>
        </div>
        <p className="settings-note">個別の会話ではチャット/メール画面右上のトグルでも切り替えられます。</p>
      </section>

      <section className="settings-section">
        <h2>返信スピード</h2>
        <div className="mode-toggle">
          <button className={replySpeed === "realistic" ? "active" : ""} onClick={() => toggleReplySpeed("realistic")}>
            リアルなタイミング
          </button>
          <button className={replySpeed === "instant" ? "active" : ""} onClick={() => toggleReplySpeed("instant")}>
            すぐに返信
          </button>
        </div>
        <p className="settings-note">
          「リアルなタイミング」は、入力中インジケーターと自然な間を演出します。「すぐに返信」はテンポよく練習したいときのための設定で、いつでもここで元に戻せます。
        </p>
      </section>

      <section className="settings-section">
        <h2>API接続とコスト</h2>
        <p>
          OpenAI APIキー: {apiKeyConfigured ? <span className="status-ok">設定済み</span> : <span className="status-bad">未設定</span>}
        </p>
        {usage && (
          <div className="usage-grid">
            <div>
              <span className="usage-label">本日のリクエスト</span>
              <span className="usage-value">
                {usage.requestsToday} / {usage.maxRequestsPerDay}
              </span>
            </div>
            <div>
              <span className="usage-label">合計リクエスト</span>
              <span className="usage-value">{usage.totalRequests}</span>
            </div>
            <div>
              <span className="usage-label">推定コスト</span>
              <span className="usage-value">${usage.totalCostUsd.toFixed(3)}</span>
            </div>
            <div>
              <span className="usage-label">エラー</span>
              <span className="usage-value">{usage.totalErrors}</span>
            </div>
          </div>
        )}
        <p className="settings-note">これはローカルでの概算です。正式な利用料金はOpenAIの管理画面をご確認ください。</p>
      </section>

      <section className="settings-section">
        <h2>データ</h2>
        <p className="settings-note">
          {authRequired
            ? "アカウントデータはSupabaseに保存されます。会話内容は生成・解析のためにOpenAIへ送信されます。"
            : "すべてのデータはローカルのSQLiteデータベースに保存されます。会話内容は生成・解析のためにOpenAIへ送信されます。"}
        </p>
        <div className="settings-actions">
          <a className="btn-secondary" href={api.exportUrl()} download="japatext-export.json">
            データを書き出す (JSON)
          </a>
          {!confirmingReset ? (
            <button className="btn-danger" onClick={() => setConfirmingReset(true)}>
              すべてリセット
            </button>
          ) : (
            <div className="reset-confirm">
              <span>本当にすべてのデータを削除しますか？</span>
              <button className="btn-danger" onClick={handleReset} disabled={busy}>
                {busy ? "削除中…" : "削除する"}
              </button>
              <button className="btn-secondary" onClick={() => setConfirmingReset(false)}>
                キャンセル
              </button>
            </div>
          )}
          {authRequired && (
            <button className="btn-secondary" onClick={() => void signOut()}>
              ログアウト
            </button>
          )}
        </div>
      </section>
    </div>
  );
}
