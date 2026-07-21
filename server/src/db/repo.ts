import { nanoid } from "nanoid";
import { db } from "./index.js";

const now = () => new Date().toISOString();

// --------------------------------------------------------------------------------
// Characters
// --------------------------------------------------------------------------------

export interface CharacterRow {
  id: string;
  name: string;
  name_reading: string | null;
  avatar_emoji: string | null;
  medium: string;
  register: string;
  persona_json: string;
  life_state: string | null;
  boundaries_json: string | null;
  initiation_cadence_minutes: number;
  active: number;
  created_at: string;
}

export function listCharacters(): CharacterRow[] {
  return db.prepare("SELECT * FROM characters WHERE active = 1 ORDER BY created_at").all() as CharacterRow[];
}

export function getCharacter(id: string): CharacterRow | undefined {
  return db.prepare("SELECT * FROM characters WHERE id = ?").get(id) as CharacterRow | undefined;
}

export function upsertCharacter(row: Omit<CharacterRow, "created_at" | "active"> & { active?: number }): void {
  db.prepare(
    `INSERT INTO characters (id, name, name_reading, avatar_emoji, medium, register, persona_json, life_state, boundaries_json, initiation_cadence_minutes, active)
     VALUES (@id, @name, @name_reading, @avatar_emoji, @medium, @register, @persona_json, @life_state, @boundaries_json, @initiation_cadence_minutes, @active)
     ON CONFLICT(id) DO UPDATE SET
       name=excluded.name, name_reading=excluded.name_reading, avatar_emoji=excluded.avatar_emoji,
       medium=excluded.medium, register=excluded.register, persona_json=excluded.persona_json,
       life_state=excluded.life_state, boundaries_json=excluded.boundaries_json,
       initiation_cadence_minutes=excluded.initiation_cadence_minutes, active=excluded.active`
  ).run({ active: 1, ...row });
}

export function updateCharacterLifeState(id: string, lifeState: string): void {
  db.prepare("UPDATE characters SET life_state = ? WHERE id = ?").run(lifeState, id);
}

export function deleteCharacter(id: string): void {
  db.prepare("DELETE FROM characters WHERE id = ?").run(id);
}

// --------------------------------------------------------------------------------
// Relationship state
// --------------------------------------------------------------------------------

export function getRelationship(characterId: string): { character_id: string; familiarity: string; notes: string | null } | undefined {
  return db.prepare("SELECT * FROM relationship_state WHERE character_id = ?").get(characterId) as
    | { character_id: string; familiarity: string; notes: string | null }
    | undefined;
}

export function upsertRelationship(characterId: string, familiarity: string, notes: string | null): void {
  db.prepare(
    `INSERT INTO relationship_state (character_id, familiarity, notes, updated_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(character_id) DO UPDATE SET familiarity=excluded.familiarity, notes=excluded.notes, updated_at=excluded.updated_at`
  ).run(characterId, familiarity, notes, now());
}

// --------------------------------------------------------------------------------
// Story threads
// --------------------------------------------------------------------------------

export interface StoryThreadRow {
  id: string;
  character_id: string;
  title: string;
  description: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

export function listThreads(characterId: string, includeResolved = false): StoryThreadRow[] {
  if (includeResolved) {
    return db.prepare("SELECT * FROM story_threads WHERE character_id = ? ORDER BY updated_at DESC").all(characterId) as StoryThreadRow[];
  }
  return db
    .prepare("SELECT * FROM story_threads WHERE character_id = ? AND status != 'resolved' ORDER BY updated_at DESC")
    .all(characterId) as StoryThreadRow[];
}

export function createThread(characterId: string, title: string, description: string): StoryThreadRow {
  const id = nanoid();
  db.prepare(
    "INSERT INTO story_threads (id, character_id, title, description, status) VALUES (?, ?, ?, ?, 'open')"
  ).run(id, characterId, title, description);
  return db.prepare("SELECT * FROM story_threads WHERE id = ?").get(id) as StoryThreadRow;
}

export function upsertThreadByTitle(characterId: string, title: string, status: string, note: string): void {
  const existing = db
    .prepare("SELECT id FROM story_threads WHERE character_id = ? AND title = ?")
    .get(characterId, title) as { id: string } | undefined;
  if (existing) {
    db.prepare("UPDATE story_threads SET status = ?, description = ?, updated_at = ? WHERE id = ?").run(
      status,
      note,
      now(),
      existing.id
    );
  } else {
    db.prepare(
      "INSERT INTO story_threads (id, character_id, title, description, status) VALUES (?, ?, ?, ?, ?)"
    ).run(nanoid(), characterId, title, note, status);
  }
}

// --------------------------------------------------------------------------------
// Conversations
// --------------------------------------------------------------------------------

export interface ConversationRow {
  id: string;
  character_id: string;
  medium: string;
  mode: string;
  created_at: string;
}

export function listConversations(): ConversationRow[] {
  return db.prepare("SELECT * FROM conversations ORDER BY created_at").all() as ConversationRow[];
}

export function getConversation(id: string): ConversationRow | undefined {
  return db.prepare("SELECT * FROM conversations WHERE id = ?").get(id) as ConversationRow | undefined;
}

export function getConversationsForCharacter(characterId: string): ConversationRow[] {
  return db.prepare("SELECT * FROM conversations WHERE character_id = ? ORDER BY created_at").all(characterId) as ConversationRow[];
}

export function getOrCreateConversation(characterId: string, medium: string, defaultMode: string): ConversationRow {
  const existing = db
    .prepare("SELECT * FROM conversations WHERE character_id = ? AND medium = ?")
    .get(characterId, medium) as ConversationRow | undefined;
  if (existing) return existing;
  const id = nanoid();
  db.prepare("INSERT INTO conversations (id, character_id, medium, mode) VALUES (?, ?, ?, ?)").run(
    id,
    characterId,
    medium,
    defaultMode
  );
  return getConversation(id) as ConversationRow;
}

export function setConversationMode(id: string, mode: string): void {
  db.prepare("UPDATE conversations SET mode = ? WHERE id = ?").run(mode, id);
}

// --------------------------------------------------------------------------------
// Messages
// --------------------------------------------------------------------------------

export interface MessageRow {
  id: string;
  conversation_id: string;
  sender: string;
  medium: string;
  subject: string | null;
  body: string;
  status: string;
  mode: string;
  scheduled_at: string | null;
  delivered_at: string | null;
  read_at: string | null;
  generation_meta_json: string | null;
  created_at: string;
}

export function listMessages(conversationId: string): MessageRow[] {
  return db
    .prepare("SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at")
    .all(conversationId) as MessageRow[];
}

export function getMessage(id: string): MessageRow | undefined {
  return db.prepare("SELECT * FROM messages WHERE id = ?").get(id) as MessageRow | undefined;
}

export function createMessage(input: {
  conversationId: string;
  sender: string;
  medium: string;
  subject?: string | null;
  body: string;
  status?: string;
  mode: string;
  scheduledAt?: string | null;
  deliveredAt?: string | null;
  generationMeta?: unknown;
}): MessageRow {
  const id = nanoid();
  db.prepare(
    `INSERT INTO messages (id, conversation_id, sender, medium, subject, body, status, mode, scheduled_at, delivered_at, generation_meta_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    input.conversationId,
    input.sender,
    input.medium,
    input.subject ?? null,
    input.body,
    input.status ?? "delivered",
    input.mode,
    input.scheduledAt ?? null,
    input.deliveredAt ?? (input.status === "pending" ? null : now()),
    input.generationMeta ? JSON.stringify(input.generationMeta) : null
  );
  return getMessage(id) as MessageRow;
}

export function updateMessageGenerationMeta(id: string, generationMeta: unknown): void {
  db.prepare("UPDATE messages SET generation_meta_json = ? WHERE id = ?").run(
    JSON.stringify(generationMeta),
    id
  );
}

export function deliverDueMessages(conversationId: string): void {
  db.prepare(
    `UPDATE messages SET status = 'delivered', delivered_at = ?
     WHERE conversation_id = ? AND status = 'pending' AND scheduled_at IS NOT NULL AND scheduled_at <= ?`
  ).run(now(), conversationId, now());
}

export function deliverMessageNow(id: string): void {
  db.prepare("UPDATE messages SET status = 'delivered', delivered_at = ? WHERE id = ?").run(now(), id);
}

export function markConversationRead(conversationId: string): void {
  db.prepare(
    "UPDATE messages SET read_at = ? WHERE conversation_id = ? AND sender = 'character' AND status = 'delivered' AND read_at IS NULL"
  ).run(now(), conversationId);
}

export function unreadCount(conversationId: string): number {
  const row = db
    .prepare(
      "SELECT COUNT(*) as c FROM messages WHERE conversation_id = ? AND sender = 'character' AND status = 'delivered' AND read_at IS NULL"
    )
    .get(conversationId) as { c: number };
  return row.c;
}

// --------------------------------------------------------------------------------
// Drafts
// --------------------------------------------------------------------------------

export function getDraft(conversationId: string): string {
  const row = db.prepare("SELECT body FROM drafts WHERE conversation_id = ?").get(conversationId) as
    | { body: string }
    | undefined;
  return row?.body ?? "";
}

export function saveDraft(conversationId: string, body: string): void {
  db.prepare(
    `INSERT INTO drafts (conversation_id, body, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(conversation_id) DO UPDATE SET body=excluded.body, updated_at=excluded.updated_at`
  ).run(conversationId, body, now());
}

// --------------------------------------------------------------------------------
// Memories
// --------------------------------------------------------------------------------

export interface MemoryRow {
  id: string;
  character_id: string;
  type: string;
  content: string;
  source_message_id: string | null;
  confidence: number;
  salience: number;
  last_referenced_at: string | null;
  created_at: string;
}

export function listMemories(characterId: string, limit = 20): MemoryRow[] {
  return db
    .prepare("SELECT * FROM memories WHERE character_id = ? ORDER BY salience DESC, created_at DESC LIMIT ?")
    .all(characterId, limit) as MemoryRow[];
}

export function addMemory(characterId: string, type: string, content: string, sourceMessageId: string | null): void {
  db.prepare(
    "INSERT INTO memories (id, character_id, type, content, source_message_id) VALUES (?, ?, ?, ?, ?)"
  ).run(nanoid(), characterId, type, content, sourceMessageId);
}

// --------------------------------------------------------------------------------
// Message analysis cache
// --------------------------------------------------------------------------------

export function getCachedAnalysis(messageId: string, kind: string, promptVersion: string): unknown | undefined {
  const row = db
    .prepare("SELECT content_json FROM message_analysis WHERE message_id = ? AND kind = ? AND prompt_version = ?")
    .get(messageId, kind, promptVersion) as { content_json: string } | undefined;
  return row ? JSON.parse(row.content_json) : undefined;
}

export function saveAnalysis(messageId: string, kind: string, promptVersion: string, content: unknown): void {
  db.prepare(
    `INSERT INTO message_analysis (id, message_id, kind, prompt_version, content_json) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(message_id, kind, prompt_version) DO UPDATE SET content_json=excluded.content_json`
  ).run(nanoid(), messageId, kind, promptVersion, JSON.stringify(content));
}

// --------------------------------------------------------------------------------
// Learning items
// --------------------------------------------------------------------------------

export interface LearningItemRow {
  id: string;
  lemma: string;
  surface: string | null;
  reading: string | null;
  kind: string;
  meaning_note: string | null;
  state: string;
  confidence: number;
  recognition_confidence: number;
  production_confidence: number;
  encounters: number;
  saved: number;
  created_at: string;
  updated_at: string;
}

export function findLearningItem(lemma: string, kind: string): LearningItemRow | undefined {
  return db.prepare("SELECT * FROM learning_items WHERE lemma = ? AND kind = ?").get(lemma, kind) as
    | LearningItemRow
    | undefined;
}

export function listLearningItems(filter?: { savedOnly?: boolean; state?: string }): LearningItemRow[] {
  let query = "SELECT * FROM learning_items";
  const clauses: string[] = [];
  const params: unknown[] = [];
  if (filter?.savedOnly) clauses.push("saved = 1");
  if (filter?.state) {
    clauses.push("state = ?");
    params.push(filter.state);
  }
  if (clauses.length) query += " WHERE " + clauses.join(" AND ");
  query += " ORDER BY updated_at DESC";
  return db.prepare(query).all(...params) as LearningItemRow[];
}

export function upsertLearningItemOnEncounter(input: {
  lemma: string;
  surface?: string;
  reading?: string;
  kind: string;
  meaningNote?: string;
}): LearningItemRow {
  const existing = findLearningItem(input.lemma, input.kind);
  if (existing) {
    db.prepare(
      "UPDATE learning_items SET encounters = encounters + 1, surface = COALESCE(?, surface), reading = COALESCE(?, reading), updated_at = ? WHERE id = ?"
    ).run(input.surface ?? null, input.reading ?? null, now(), existing.id);
    return findLearningItem(input.lemma, input.kind) as LearningItemRow;
  }
  const id = nanoid();
  db.prepare(
    `INSERT INTO learning_items (id, lemma, surface, reading, kind, meaning_note, state, confidence, recognition_confidence, production_confidence, encounters, saved)
     VALUES (?, ?, ?, ?, ?, ?, 'encountered', 0.2, 0.2, 0.0, 1, 0)`
  ).run(id, input.lemma, input.surface ?? null, input.reading ?? null, input.kind, input.meaningNote ?? null);
  return findLearningItem(input.lemma, input.kind) as LearningItemRow;
}

const CONFIDENCE_TO_STATE = (c: number): string => {
  if (c >= 0.75) return "known";
  if (c >= 0.4) return "learning";
  if (c > 0) return "encountered";
  return "unseen";
};

export function adjustLearningItemConfidence(id: string, delta: number, markSaved?: boolean): void {
  const item = db.prepare("SELECT * FROM learning_items WHERE id = ?").get(id) as LearningItemRow | undefined;
  if (!item) return;
  const nextConfidence = Math.max(0, Math.min(1, item.confidence + delta));
  const nextState = CONFIDENCE_TO_STATE(nextConfidence);
  db.prepare(
    "UPDATE learning_items SET confidence = ?, recognition_confidence = ?, state = ?, saved = COALESCE(?, saved), updated_at = ? WHERE id = ?"
  ).run(nextConfidence, nextConfidence, nextState, markSaved ? 1 : null, now(), id);
}

export function markLearningItemSaved(id: string, saved: boolean): void {
  db.prepare("UPDATE learning_items SET saved = ?, updated_at = ? WHERE id = ?").run(saved ? 1 : 0, now(), id);
}

export function recordEncounter(learningItemId: string, messageId: string | null, kind: string): void {
  db.prepare("INSERT INTO encounters (id, learning_item_id, message_id, kind) VALUES (?, ?, ?, ?)").run(
    nanoid(),
    learningItemId,
    messageId,
    kind
  );
}

export function listEncountersForItem(learningItemId: string): { kind: string; created_at: string }[] {
  return db
    .prepare("SELECT kind, created_at FROM encounters WHERE learning_item_id = ? ORDER BY created_at DESC")
    .all(learningItemId) as { kind: string; created_at: string }[];
}

/** Map of lemma -> confidence for quick lookups when checking new vocabulary against the learner model. */
export function getKnownConfidenceMap(): Map<string, number> {
  const rows = db.prepare("SELECT lemma, confidence FROM learning_items").all() as {
    lemma: string;
    confidence: number;
  }[];
  const map = new Map<string, number>();
  for (const row of rows) map.set(row.lemma, row.confidence);
  return map;
}

// --------------------------------------------------------------------------------
// Learner profile
// --------------------------------------------------------------------------------

export interface LearnerProfileRow {
  id: number;
  display_name: string | null;
  self_reference: string | null;
  jlpt_baseline: string;
  goals_json: string | null;
  interests_json: string | null;
  boundaries_json: string | null;
  furigana_pref: string;
  default_mode: string;
  onboarded_at: string | null;
}

export function getProfile(): LearnerProfileRow | undefined {
  return db.prepare("SELECT * FROM learner_profile WHERE id = 1").get() as LearnerProfileRow | undefined;
}

export function upsertProfile(input: {
  displayName: string;
  selfReference: string;
  jlptBaseline: string;
  goals: string[];
  interests: string[];
  boundaries: string[];
  furiganaPref: string;
  defaultMode: string;
}): void {
  db.prepare(
    `INSERT INTO learner_profile (id, display_name, self_reference, jlpt_baseline, goals_json, interests_json, boundaries_json, furigana_pref, default_mode, onboarded_at)
     VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       display_name=excluded.display_name, self_reference=excluded.self_reference, jlpt_baseline=excluded.jlpt_baseline,
       goals_json=excluded.goals_json, interests_json=excluded.interests_json, boundaries_json=excluded.boundaries_json,
       furigana_pref=excluded.furigana_pref, default_mode=excluded.default_mode,
       onboarded_at=COALESCE(learner_profile.onboarded_at, excluded.onboarded_at)`
  ).run(
    input.displayName,
    input.selfReference,
    input.jlptBaseline,
    JSON.stringify(input.goals),
    JSON.stringify(input.interests),
    JSON.stringify(input.boundaries),
    input.furiganaPref,
    input.defaultMode,
    now()
  );
}

export function setDefaultMode(mode: string): void {
  db.prepare("UPDATE learner_profile SET default_mode = ? WHERE id = 1").run(mode);
}

// --------------------------------------------------------------------------------
// Difficulty feedback
// --------------------------------------------------------------------------------

export function addDifficultyFeedback(messageId: string, rating: string): void {
  db.prepare("INSERT INTO difficulty_feedback (id, message_id, rating) VALUES (?, ?, ?)").run(
    nanoid(),
    messageId,
    rating
  );
}

// --------------------------------------------------------------------------------
// Settings
// --------------------------------------------------------------------------------

export function getSetting(key: string): string | undefined {
  const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key) as { value: string } | undefined;
  return row?.value;
}

export function setSetting(key: string, value: string): void {
  db.prepare(
    "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value"
  ).run(key, value);
}

export function listSettings(): Record<string, string> {
  const rows = db.prepare("SELECT key, value FROM settings").all() as { key: string; value: string }[];
  const out: Record<string, string> = {};
  for (const r of rows) out[r.key] = r.value;
  return out;
}

// --------------------------------------------------------------------------------
// Usage events
// --------------------------------------------------------------------------------

export function recordUsage(entry: {
  endpoint: string;
  model: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  latencyMs: number;
  error: string | null;
  estimatedCostUsd: number | null;
}): void {
  db.prepare(
    `INSERT INTO usage_events (id, endpoint, model, input_tokens, output_tokens, latency_ms, error, estimated_cost_usd)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    nanoid(),
    entry.endpoint,
    entry.model,
    entry.inputTokens,
    entry.outputTokens,
    entry.latencyMs,
    entry.error,
    entry.estimatedCostUsd
  );
}

export function getUsageSummary(): {
  totalRequests: number;
  totalErrors: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCostUsd: number;
  requestsToday: number;
} {
  const totals = db
    .prepare(
      `SELECT COUNT(*) as totalRequests,
              SUM(CASE WHEN error IS NOT NULL THEN 1 ELSE 0 END) as totalErrors,
              COALESCE(SUM(input_tokens), 0) as totalInputTokens,
              COALESCE(SUM(output_tokens), 0) as totalOutputTokens,
              COALESCE(SUM(estimated_cost_usd), 0) as totalCostUsd
       FROM usage_events`
    )
    .get() as {
    totalRequests: number;
    totalErrors: number;
    totalInputTokens: number;
    totalOutputTokens: number;
    totalCostUsd: number;
  };
  const today = db
    .prepare("SELECT COUNT(*) as c FROM usage_events WHERE created_at >= date('now')")
    .get() as { c: number };
  return { ...totals, requestsToday: today.c };
}

export function requestsToday(): number {
  const row = db.prepare("SELECT COUNT(*) as c FROM usage_events WHERE created_at >= date('now')").get() as {
    c: number;
  };
  return row.c;
}

// --------------------------------------------------------------------------------
// Export / reset
// --------------------------------------------------------------------------------

export function exportAll(): Record<string, unknown[]> {
  const tables = [
    "characters",
    "relationship_state",
    "story_threads",
    "conversations",
    "messages",
    "drafts",
    "memories",
    "message_analysis",
    "learning_items",
    "encounters",
    "learner_profile",
    "difficulty_feedback",
    "settings",
  ];
  const out: Record<string, unknown[]> = {};
  for (const t of tables) {
    out[t] = db.prepare(`SELECT * FROM ${t}`).all();
  }
  return out;
}

export function resetAll(): void {
  const tables = [
    "generation_jobs",
    "usage_events",
    "difficulty_feedback",
    "encounters",
    "learning_items",
    "message_analysis",
    "memories",
    "drafts",
    "messages",
    "conversations",
    "story_threads",
    "relationship_state",
    "characters",
    "learner_profile",
    "settings",
  ];
  const txn = db.transaction(() => {
    for (const t of tables) db.prepare(`DELETE FROM ${t}`).run();
  });
  txn();
}

export function resetCharacterHistory(characterId: string): void {
  const txn = db.transaction(() => {
    db.prepare("DELETE FROM memories WHERE character_id = ?").run(characterId);
    db.prepare("DELETE FROM story_threads WHERE character_id = ?").run(characterId);
    const convos = db.prepare("SELECT id FROM conversations WHERE character_id = ?").all(characterId) as {
      id: string;
    }[];
    for (const c of convos) {
      db.prepare("DELETE FROM generation_jobs WHERE conversation_id = ?").run(c.id);
      db.prepare("DELETE FROM messages WHERE conversation_id = ?").run(c.id);
      db.prepare("DELETE FROM drafts WHERE conversation_id = ?").run(c.id);
    }
    db.prepare("DELETE FROM conversations WHERE character_id = ?").run(characterId);
  });
  txn();
}

// --------------------------------------------------------------------------------
// Generation jobs (durable async reply queue)
// --------------------------------------------------------------------------------

export interface GenerationJobRow {
  id: string;
  conversation_id: string;
  kind: string;
  status: string;
  payload_json: string;
  error: string | null;
  idempotency_key: string | null;
  typing_starts_at: string | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
}

export function enqueueGenerationJob(input: {
  conversationId: string;
  kind?: "reply" | "initiation";
  payload?: Record<string, unknown>;
  typingStartsAt?: string | null;
  idempotencyKey?: string | null;
}): GenerationJobRow {
  // One active job per conversation keeps retries from stacking duplicates.
  const existing = db
    .prepare(
      `SELECT * FROM generation_jobs
       WHERE conversation_id = ? AND status IN ('queued', 'running')
       ORDER BY created_at DESC LIMIT 1`
    )
    .get(input.conversationId) as GenerationJobRow | undefined;
  if (existing) return existing;

  const id = nanoid();
  db.prepare(
    `INSERT INTO generation_jobs
      (id, conversation_id, kind, status, payload_json, idempotency_key, typing_starts_at)
     VALUES (?, ?, ?, 'queued', ?, ?, ?)`
  ).run(
    id,
    input.conversationId,
    input.kind ?? "reply",
    JSON.stringify(input.payload ?? {}),
    input.idempotencyKey ?? null,
    input.typingStartsAt ?? null
  );
  return db.prepare("SELECT * FROM generation_jobs WHERE id = ?").get(id) as GenerationJobRow;
}

export function claimNextGenerationJob(): GenerationJobRow | undefined {
  const job = db
    .prepare(
      `SELECT * FROM generation_jobs
       WHERE status = 'queued'
       ORDER BY created_at ASC
       LIMIT 1`
    )
    .get() as GenerationJobRow | undefined;
  if (!job) return undefined;
  db.prepare(
    `UPDATE generation_jobs SET status = 'running', started_at = ? WHERE id = ? AND status = 'queued'`
  ).run(now(), job.id);
  return db.prepare("SELECT * FROM generation_jobs WHERE id = ?").get(job.id) as GenerationJobRow;
}

export function completeGenerationJob(id: string): void {
  db.prepare(
    `UPDATE generation_jobs SET status = 'done', finished_at = ?, error = NULL WHERE id = ?`
  ).run(now(), id);
}

export function failGenerationJob(id: string, error: string): void {
  db.prepare(
    `UPDATE generation_jobs SET status = 'failed', finished_at = ?, error = ? WHERE id = ?`
  ).run(now(), error, id);
}

export function requeueStuckRunningJobs(olderThanMs = 5 * 60_000): number {
  if (olderThanMs <= 0) {
    const result = db
      .prepare(`UPDATE generation_jobs SET status = 'queued', started_at = NULL WHERE status = 'running'`)
      .run();
    return result.changes;
  }
  const cutoff = new Date(Date.now() - olderThanMs).toISOString();
  const result = db
    .prepare(
      `UPDATE generation_jobs
       SET status = 'queued', started_at = NULL
       WHERE status = 'running' AND started_at IS NOT NULL AND started_at < ?`
    )
    .run(cutoff);
  return result.changes;
}

export function latestActiveJobForConversation(conversationId: string): GenerationJobRow | undefined {
  return db
    .prepare(
      `SELECT * FROM generation_jobs
       WHERE conversation_id = ? AND status IN ('queued', 'running')
       ORDER BY created_at DESC LIMIT 1`
    )
    .get(conversationId) as GenerationJobRow | undefined;
}

export function latestFailedJobForConversation(conversationId: string): GenerationJobRow | undefined {
  return db
    .prepare(
      `SELECT * FROM generation_jobs
       WHERE conversation_id = ?
         AND status = 'failed'
         AND NOT EXISTS (
           SELECT 1 FROM generation_jobs later
           WHERE later.conversation_id = generation_jobs.conversation_id
             AND later.status = 'done'
             AND later.created_at > generation_jobs.created_at
         )
       ORDER BY created_at DESC LIMIT 1`
    )
    .get(conversationId) as GenerationJobRow | undefined;
}
