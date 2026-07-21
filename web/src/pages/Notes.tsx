import { useEffect, useState } from "react";
import { api } from "../api/client";
import type { LearningItem } from "../api/types";

const STATE_LABEL: Record<string, string> = {
  unseen: "未接触",
  encountered: "出会った",
  learning: "学習中",
  known: "定着",
};

type Filter = "all" | "saved" | "learning" | "known";

export function Notes() {
  const [items, setItems] = useState<LearningItem[] | null>(null);
  const [filter, setFilter] = useState<Filter>("saved");
  const [query, setQuery] = useState("");

  async function load(f: Filter) {
    const params = f === "saved" ? { saved: true } : f === "all" ? {} : { state: f };
    const { items } = await api.listLearningItems(params);
    setItems(items);
  }

  useEffect(() => {
    load(filter);
  }, [filter]);

  async function toggleSaved(item: LearningItem) {
    await api.updateLearningItem(item.id, { saved: item.saved !== 1 });
    load(filter);
  }

  async function markKnown(item: LearningItem) {
    await api.updateLearningItem(item.id, { confidenceDelta: 1 - item.confidence });
    load(filter);
  }

  const visible = (items ?? []).filter((i) => {
    if (!query) return true;
    const q = query.toLowerCase();
    return i.lemma.toLowerCase().includes(q) || (i.surface ?? "").includes(q) || (i.meaning_note ?? "").toLowerCase().includes(q);
  });

  return (
    <div className="notes-page">
      <header className="list-header">
        <h1>ノート</h1>
        <input className="notes-search" placeholder="検索…" value={query} onChange={(e) => setQuery(e.target.value)} />
      </header>

      <div className="notes-tabs">
        {(["saved", "learning", "known", "all"] as Filter[]).map((f) => (
          <button key={f} className={filter === f ? "active" : ""} onClick={() => setFilter(f)}>
            {f === "saved" ? "保存済み" : f === "learning" ? "学習中" : f === "known" ? "定着" : "すべて"}
          </button>
        ))}
      </div>

      <div className="notes-list">
        {visible.map((item) => (
          <div key={item.id} className="note-card">
            <div className="note-top">
              <span className="note-term">{item.surface || item.lemma}</span>
              {item.reading && <span className="note-reading">{item.reading}</span>}
              <span className={`note-state note-state-${item.state}`}>{STATE_LABEL[item.state]}</span>
            </div>
            {item.meaning_note && <p className="note-meaning">{item.meaning_note}</p>}
            <div className="note-meta">
              <span>出会った回数: {item.encounters}</span>
              <div className="confidence-bar">
                <div className="confidence-fill" style={{ width: `${Math.round(item.confidence * 100)}%` }} />
              </div>
            </div>
            <div className="note-actions">
              <button onClick={() => toggleSaved(item)}>{item.saved ? "保存を外す" : "保存する"}</button>
              {item.state !== "known" && <button onClick={() => markKnown(item)}>定着済みにする</button>}
            </div>
          </div>
        ))}
        {items && visible.length === 0 && <p className="empty-state">まだ項目がありません。会話の中で単語をタップして保存してみましょう。</p>}
      </div>
    </div>
  );
}
