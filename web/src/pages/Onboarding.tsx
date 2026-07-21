import { useState } from "react";
import { api } from "../api/client";
import { useApp } from "../state/AppContext";

const INTEREST_OPTIONS = ["ゲーム", "アニメ・漫画", "テクノロジー", "旅行", "料理・食べ歩き", "音楽・映画", "スポーツ", "仕事・キャリア"];

export function Onboarding() {
  const { refreshProfile } = useApp();
  const [step, setStep] = useState(0);
  const [displayName, setDisplayName] = useState("");
  const [selfReference, setSelfReference] = useState("");
  const [interests, setInterests] = useState<string[]>([]);
  const [goals, setGoals] = useState("");
  const [furiganaPref, setFuriganaPref] = useState<"off" | "on_unknown" | "always">("off");
  const [defaultMode, setDefaultMode] = useState<"comprehensible" | "natural">("comprehensible");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleInterest(interest: string) {
    setInterests((prev) => (prev.includes(interest) ? prev.filter((i) => i !== interest) : [...prev, interest]));
  }

  async function finish() {
    setSaving(true);
    setError(null);
    try {
      await api.saveProfile({
        displayName: displayName || "あなた",
        selfReference: selfReference || displayName || "私",
        jlptBaseline: "N3",
        goals: goals
          .split(/[、,\n]/)
          .map((g) => g.trim())
          .filter(Boolean),
        interests,
        boundaries: [],
        furiganaPref,
        defaultMode,
      });
      await refreshProfile();
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存に失敗しました。");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="onboarding">
      <div className="onboarding-card">
        <h1>Japatextへようこそ</h1>
        <p className="onboarding-sub">
          AIキャラクターとのチャット・メールを通して、自然な日本語に触れながら学べるアプリです。まずは少し教えてください。
        </p>

        {step === 0 && (
          <div className="onboarding-step">
            <label>
              お名前・呼び方
              <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="例: たける" />
            </label>
            <label>
              キャラクターに呼んでほしい自分の呼び方（任意）
              <input value={selfReference} onChange={(e) => setSelfReference(e.target.value)} placeholder="例: たけるくん" />
            </label>
            <button className="btn-primary" onClick={() => setStep(1)} disabled={!displayName}>
              次へ
            </button>
          </div>
        )}

        {step === 1 && (
          <div className="onboarding-step">
            <p>興味のあるトピックを選んでください（複数選択可）。キャラクターや話題選びに使われます。</p>
            <div className="chip-grid">
              {INTEREST_OPTIONS.map((interest) => (
                <button
                  key={interest}
                  className={`chip ${interests.includes(interest) ? "chip-selected" : ""}`}
                  onClick={() => toggleInterest(interest)}
                  type="button"
                >
                  {interest}
                </button>
              ))}
            </div>
            <label>
              学びたいこと・目標（任意）
              <textarea value={goals} onChange={(e) => setGoals(e.target.value)} placeholder="例: 敬語に慣れたい、旅行会話を練習したい" />
            </label>
            <div className="onboarding-actions">
              <button className="btn-secondary" onClick={() => setStep(0)}>
                戻る
              </button>
              <button className="btn-primary" onClick={() => setStep(2)}>
                次へ
              </button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="onboarding-step">
            <p>あなたのレベルは、目安として N3（中級）から開始します。実際の理解度に応じて自動で調整されます。</p>

            <fieldset>
              <legend>デフォルトの難易度モード</legend>
              <label className="radio-row">
                <input
                  type="radio"
                  checked={defaultMode === "comprehensible"}
                  onChange={() => setDefaultMode("comprehensible")}
                />
                Comprehensible（N+1） — 自然な日本語のまま、新しい語彙・文法を抑えめに調整
              </label>
              <label className="radio-row">
                <input type="radio" checked={defaultMode === "natural"} onChange={() => setDefaultMode("natural")} />
                Natural — 完全に自然な日本語、レベル調整なし
              </label>
            </fieldset>

            <fieldset>
              <legend>ふりがな</legend>
              <label className="radio-row">
                <input type="radio" checked={furiganaPref === "off"} onChange={() => setFuriganaPref("off")} />
                表示しない
              </label>
              <label className="radio-row">
                <input
                  type="radio"
                  checked={furiganaPref === "on_unknown"}
                  onChange={() => setFuriganaPref("on_unknown")}
                />
                未習の語のみ（Study drawerで確認）
              </label>
            </fieldset>

            {error && <p className="error-text">{error}</p>}
            <div className="onboarding-actions">
              <button className="btn-secondary" onClick={() => setStep(1)}>
                戻る
              </button>
              <button className="btn-primary" onClick={finish} disabled={saving}>
                {saving ? "保存中…" : "はじめる"}
              </button>
            </div>
          </div>
        )}

        <div className="onboarding-progress">
          {[0, 1, 2].map((s) => (
            <span key={s} className={`dot ${s === step ? "dot-active" : ""}`} />
          ))}
        </div>
      </div>
    </div>
  );
}
