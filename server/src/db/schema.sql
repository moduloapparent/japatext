-- Japatext local database schema. Idempotent: safe to run on every boot.

CREATE TABLE IF NOT EXISTS characters (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  name_reading TEXT,
  avatar_emoji TEXT,
  medium TEXT NOT NULL DEFAULT 'chat', -- 'chat' | 'email' | 'both'
  register TEXT NOT NULL DEFAULT 'casual',
  persona_json TEXT NOT NULL,
  life_state TEXT,
  boundaries_json TEXT,
  initiation_cadence_minutes INTEGER NOT NULL DEFAULT 240,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS relationship_state (
  character_id TEXT PRIMARY KEY REFERENCES characters(id) ON DELETE CASCADE,
  familiarity TEXT NOT NULL DEFAULT 'acquaintance',
  notes TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS story_threads (
  id TEXT PRIMARY KEY,
  character_id TEXT NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'open', -- 'open' | 'paused' | 'resolved'
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY,
  character_id TEXT NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  medium TEXT NOT NULL DEFAULT 'chat', -- 'chat' | 'email'
  mode TEXT NOT NULL DEFAULT 'comprehensible', -- 'comprehensible' | 'natural'
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender TEXT NOT NULL, -- 'user' | 'character'
  medium TEXT NOT NULL DEFAULT 'chat',
  subject TEXT,
  body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'delivered', -- 'pending' | 'delivered'
  mode TEXT NOT NULL DEFAULT 'comprehensible',
  scheduled_at TEXT,
  delivered_at TEXT,
  read_at TEXT,
  generation_meta_json TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id, created_at);

CREATE TABLE IF NOT EXISTS drafts (
  conversation_id TEXT PRIMARY KEY REFERENCES conversations(id) ON DELETE CASCADE,
  body TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS memories (
  id TEXT PRIMARY KEY,
  character_id TEXT NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  type TEXT NOT NULL DEFAULT 'fact', -- 'fact' | 'event' | 'preference'
  content TEXT NOT NULL,
  source_message_id TEXT,
  confidence REAL NOT NULL DEFAULT 0.8,
  salience REAL NOT NULL DEFAULT 0.5,
  last_referenced_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_memories_character ON memories(character_id);

CREATE TABLE IF NOT EXISTS message_analysis (
  id TEXT PRIMARY KEY,
  message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  kind TEXT NOT NULL, -- 'gloss' | 'comparison'
  prompt_version TEXT NOT NULL,
  content_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(message_id, kind, prompt_version)
);

CREATE TABLE IF NOT EXISTS learning_items (
  id TEXT PRIMARY KEY,
  lemma TEXT NOT NULL,
  surface TEXT,
  reading TEXT,
  kind TEXT NOT NULL DEFAULT 'vocab', -- 'vocab' | 'grammar' | 'chunk' | 'pattern'
  meaning_note TEXT,
  state TEXT NOT NULL DEFAULT 'encountered', -- 'unseen' | 'encountered' | 'learning' | 'known'
  confidence REAL NOT NULL DEFAULT 0.2,
  recognition_confidence REAL NOT NULL DEFAULT 0.2,
  production_confidence REAL NOT NULL DEFAULT 0.0,
  encounters INTEGER NOT NULL DEFAULT 1,
  saved INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(lemma, kind)
);

CREATE TABLE IF NOT EXISTS encounters (
  id TEXT PRIMARY KEY,
  learning_item_id TEXT NOT NULL REFERENCES learning_items(id) ON DELETE CASCADE,
  message_id TEXT,
  kind TEXT NOT NULL, -- 'seen' | 'looked_up' | 'saved' | 'feedback_easy' | 'feedback_good' | 'feedback_hard' | 'recalled'
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_encounters_item ON encounters(learning_item_id);

CREATE TABLE IF NOT EXISTS learner_profile (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  display_name TEXT,
  self_reference TEXT,
  jlpt_baseline TEXT NOT NULL DEFAULT 'N3',
  goals_json TEXT,
  interests_json TEXT,
  boundaries_json TEXT,
  furigana_pref TEXT NOT NULL DEFAULT 'off', -- 'off' | 'on_unknown' | 'always'
  default_mode TEXT NOT NULL DEFAULT 'comprehensible',
  onboarded_at TEXT
);

CREATE TABLE IF NOT EXISTS difficulty_feedback (
  id TEXT PRIMARY KEY,
  message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  rating TEXT NOT NULL, -- 'too_easy' | 'good' | 'too_hard'
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS usage_events (
  id TEXT PRIMARY KEY,
  endpoint TEXT NOT NULL,
  model TEXT,
  input_tokens INTEGER,
  output_tokens INTEGER,
  latency_ms INTEGER,
  error TEXT,
  estimated_cost_usd REAL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Durable async generation jobs (local SQLite mirror of the Postgres jobs table).
CREATE TABLE IF NOT EXISTS generation_jobs (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  kind TEXT NOT NULL DEFAULT 'reply', -- 'reply' | 'initiation'
  status TEXT NOT NULL DEFAULT 'queued', -- 'queued' | 'running' | 'done' | 'failed'
  payload_json TEXT NOT NULL DEFAULT '{}',
  error TEXT,
  idempotency_key TEXT UNIQUE,
  typing_starts_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  started_at TEXT,
  finished_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_generation_jobs_status ON generation_jobs(status, created_at);
CREATE INDEX IF NOT EXISTS idx_generation_jobs_conversation ON generation_jobs(conversation_id, created_at);
