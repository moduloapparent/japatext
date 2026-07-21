import { useEffect, useState } from "react";
import { api } from "../api/client";
import type { ComparisonResult, GlossResult, Message } from "../api/types";

interface StudyDrawerProps {
  message: Message;
  conversationId: string;
  onClose: () => void;
  onFeedbackGiven?: () => void;
}

type RevealLevel = "readings" | "hint" | "functional" | "english";

export function StudyDrawer({ message, conversationId, onClose, onFeedbackGiven }: StudyDrawerProps) {
  const isUserMessage = message.sender === "user";
  const [gloss, setGloss] = useState<GlossResult | null>(null);
  const [comparison, setComparison] = useState<ComparisonResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [revealed, setRevealed] = useState<Set<RevealLevel>>(new Set());
  const [feedbackSent, setFeedbackSent] = useState(false);
  const [savedLemmas, setSavedLemmas] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setRevealed(new Set());
    (async () => {
      try {
        if (isUserMessage) {
          const { comparison } = await api.getComparison(message.id);
          if (!cancelled) setComparison(comparison);
        } else {
          const { gloss } = await api.getGloss(message.id);
          if (!cancelled) setGloss(gloss);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "読み込みに失敗しました。");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [message.id, isUserMessage]);

  function reveal(level: RevealLevel) {
    setRevealed((prev) => new Set(prev).add(level));
  }

  async function saveToken(token: GlossResult["tokens"][number]) {
    if (!token.lemma) return;
    await api.saveLearningItem({
      lemma: token.lemma,
      kind: "vocab",
      surface: token.surface,
      reading: token.reading,
      meaningNote: token.meaning,
      messageId: message.id,
    });
    setSavedLemmas((prev) => new Set(prev).add(token.lemma));
  }

  async function feedback(rating: "too_easy" | "good" | "too_hard") {
    try {
      await api.sendFeedback(conversationId, message.id, rating);
      setFeedbackSent(true);
      onFeedbackGiven?.();
    } catch {
      // Non-blocking; the learner model simply won't update this time.
    }
  }

  return (
    <div className="drawer-overlay" onClick={onClose}>
      <aside className="study-drawer" onClick={(e) => e.stopPropagation()}>
        <div className="drawer-header">
          <h2>{isUserMessage ? "ネイティブならこう言う？" : "この一文を読む"}</h2>
          <button className="drawer-close" onClick={onClose} aria-label="閉じる">
            ×
          </button>
        </div>

        <div className="drawer-source">{message.body}</div>

        {loading && <p className="drawer-loading">考えています…</p>}
        {error && <p className="error-text">{error}</p>}

        {!loading && !isUserMessage && gloss && (
          <div className="drawer-content">
            <p className="drawer-overview">{gloss.overview}</p>

            <section className="drawer-section">
              <h3>単語</h3>
              <ul className="token-list">
                {gloss.tokens.map((t, i) => (
                  <li key={i} className="token-row">
                    <span className="token-surface">{t.surface}</span>
                    {t.reading && <span className="token-reading">{t.reading}</span>}
                    <span className="token-meaning">{t.meaning}</span>
                    {t.note && <span className="token-note">{t.note}</span>}
                    {t.lemma && (
                      <button
                        className={`token-save ${savedLemmas.has(t.lemma) ? "saved" : ""}`}
                        onClick={() => saveToken(t)}
                        disabled={savedLemmas.has(t.lemma)}
                        title="Notesに保存"
                      >
                        {savedLemmas.has(t.lemma) ? "✓" : "＋"}
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </section>

            {gloss.grammar_points.length > 0 && (
              <section className="drawer-section">
                <h3>文法</h3>
                <ul>
                  {gloss.grammar_points.map((g, i) => (
                    <li key={i}>
                      <strong>{g.pattern}</strong> — {g.explanation}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {gloss.functional_note && (
              <section className="drawer-section">
                {revealed.has("functional") ? (
                  <>
                    <h3>この一文の役割</h3>
                    <p>{gloss.functional_note}</p>
                  </>
                ) : (
                  <button className="reveal-btn" onClick={() => reveal("functional")}>
                    直訳だけでは分からないニュアンスを見る
                  </button>
                )}
              </section>
            )}

            {gloss.english_gloss && (
              <section className="drawer-section">
                {revealed.has("english") ? (
                  <>
                    <h3>English (optional)</h3>
                    <p>{gloss.english_gloss}</p>
                  </>
                ) : (
                  <button className="reveal-btn subtle" onClick={() => reveal("english")}>
                    英語訳を見る
                  </button>
                )}
              </section>
            )}

            <section className="drawer-section feedback-section">
              <h3>この文の難易度は？</h3>
              {feedbackSent ? (
                <p className="feedback-thanks">フィードバックを反映しました。</p>
              ) : (
                <div className="feedback-buttons">
                  <button onClick={() => feedback("too_easy")}>簡単すぎた</button>
                  <button onClick={() => feedback("good")}>ちょうど良い</button>
                  <button onClick={() => feedback("too_hard")}>難しすぎた</button>
                </div>
              )}
            </section>
          </div>
        )}

        {!loading && isUserMessage && comparison && (
          <div className="drawer-content">
            <section className="drawer-section">
              <h3>伝えたかったこと（推測）</h3>
              <p>{comparison.inferred_intent}</p>
              <p className="drawer-hint">推測が違う場合、それも自然なフィードバックです。気にせず読み進めてください。</p>
            </section>

            {comparison.sounds_natural ? (
              <section className="drawer-section">
                <h3>すでに自然です</h3>
                <p>この言い方はそのまま自然に伝わります。</p>
              </section>
            ) : (
              <>
                {comparison.minimal_revision && (
                  <section className="drawer-section">
                    <h3>最小限の修正</h3>
                    <p className="native-phrase">{comparison.minimal_revision}</p>
                  </section>
                )}
                {comparison.idiomatic_alternative && (
                  <section className="drawer-section">
                    {revealed.has("hint") ? (
                      <>
                        <h3>より自然な言い方</h3>
                        <p className="native-phrase">{comparison.idiomatic_alternative}</p>
                      </>
                    ) : (
                      <button className="reveal-btn" onClick={() => reveal("hint")}>
                        もっと自然な言い方も見る
                      </button>
                    )}
                  </section>
                )}
                {comparison.differences && (
                  <section className="drawer-section">
                    <h3>ニュアンスの違い</h3>
                    <p>{comparison.differences}</p>
                  </section>
                )}
              </>
            )}
          </div>
        )}
      </aside>
    </div>
  );
}
