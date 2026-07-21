-- Japatext multi-tenant Postgres schema for Supabase.
-- Apply via Supabase SQL editor or `supabase db push`.
-- Characters are a shared catalog; all learner state is scoped by user_id
-- (auth.users.id) and protected with Row Level Security.

create extension if not exists "pgcrypto";

-- Shared character catalog (read by all authenticated users)
create table if not exists public.characters (
  id text primary key,
  name text not null,
  name_reading text,
  avatar_emoji text,
  medium text not null default 'chat',
  register text not null default 'casual',
  persona_json jsonb not null default '{}'::jsonb,
  life_state text,
  boundaries_json jsonb,
  initiation_cadence_minutes integer not null default 240,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.invites (
  email text primary key,
  note text,
  created_at timestamptz not null default now(),
  redeemed_at timestamptz
);

create table if not exists public.learner_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  self_reference text,
  jlpt_baseline text not null default 'N3',
  goals_json jsonb default '[]'::jsonb,
  interests_json jsonb default '[]'::jsonb,
  boundaries_json jsonb default '[]'::jsonb,
  furigana_pref text not null default 'off',
  default_mode text not null default 'comprehensible',
  onboarded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.relationship_state (
  user_id uuid not null references auth.users(id) on delete cascade,
  character_id text not null references public.characters(id) on delete cascade,
  familiarity text not null default 'acquaintance',
  notes text,
  updated_at timestamptz not null default now(),
  primary key (user_id, character_id)
);

create table if not exists public.story_threads (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  character_id text not null references public.characters(id) on delete cascade,
  title text not null,
  description text,
  status text not null default 'open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_story_threads_user_character
  on public.story_threads(user_id, character_id);

create table if not exists public.conversations (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  character_id text not null references public.characters(id) on delete cascade,
  medium text not null default 'chat',
  mode text not null default 'comprehensible',
  created_at timestamptz not null default now(),
  unique (user_id, character_id, medium)
);

create table if not exists public.messages (
  id text primary key,
  conversation_id text not null references public.conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  sender text not null,
  medium text not null default 'chat',
  subject text,
  body text not null,
  status text not null default 'delivered',
  mode text not null default 'comprehensible',
  scheduled_at timestamptz,
  delivered_at timestamptz,
  read_at timestamptz,
  generation_meta_json jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_messages_conversation_created
  on public.messages(conversation_id, created_at);

create table if not exists public.drafts (
  conversation_id text primary key references public.conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  body text not null default '',
  updated_at timestamptz not null default now()
);

create table if not exists public.memories (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  character_id text not null references public.characters(id) on delete cascade,
  type text not null default 'fact',
  content text not null,
  source_message_id text,
  confidence real not null default 0.8,
  salience real not null default 0.5,
  last_referenced_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists idx_memories_user_character
  on public.memories(user_id, character_id);

create table if not exists public.message_analysis (
  id text primary key,
  message_id text not null references public.messages(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null,
  prompt_version text not null,
  content_json jsonb not null,
  created_at timestamptz not null default now(),
  unique (message_id, kind, prompt_version)
);

create table if not exists public.learning_items (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  lemma text not null,
  surface text,
  reading text,
  kind text not null default 'vocab',
  meaning_note text,
  state text not null default 'encountered',
  confidence real not null default 0.2,
  recognition_confidence real not null default 0.2,
  production_confidence real not null default 0.0,
  encounters integer not null default 1,
  saved boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, lemma, kind)
);

create table if not exists public.encounters (
  id text primary key,
  learning_item_id text not null references public.learning_items(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  message_id text,
  kind text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.difficulty_feedback (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  message_id text not null references public.messages(id) on delete cascade,
  rating text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.settings (
  user_id uuid not null references auth.users(id) on delete cascade,
  key text not null,
  value text not null,
  primary key (user_id, key)
);

create table if not exists public.usage_events (
  id text primary key,
  user_id uuid references auth.users(id) on delete set null,
  endpoint text not null,
  model text,
  input_tokens integer,
  output_tokens integer,
  latency_ms integer,
  error text,
  estimated_cost_usd real,
  created_at timestamptz not null default now()
);

-- Durable async generation / analysis jobs
create table if not exists public.generation_jobs (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  conversation_id text not null references public.conversations(id) on delete cascade,
  kind text not null default 'reply', -- reply | initiation | analysis
  status text not null default 'queued', -- queued | running | done | failed
  payload_json jsonb not null default '{}'::jsonb,
  error text,
  idempotency_key text unique,
  typing_starts_at timestamptz,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz
);
create index if not exists idx_generation_jobs_status_created
  on public.generation_jobs(status, created_at);
create index if not exists idx_generation_jobs_conversation
  on public.generation_jobs(conversation_id, created_at desc);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.characters enable row level security;
alter table public.invites enable row level security;
alter table public.learner_profiles enable row level security;
alter table public.relationship_state enable row level security;
alter table public.story_threads enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.drafts enable row level security;
alter table public.memories enable row level security;
alter table public.message_analysis enable row level security;
alter table public.learning_items enable row level security;
alter table public.encounters enable row level security;
alter table public.difficulty_feedback enable row level security;
alter table public.settings enable row level security;
alter table public.usage_events enable row level security;
alter table public.generation_jobs enable row level security;

-- Characters: any authenticated user can read the shared catalog
create policy characters_select_authenticated on public.characters
  for select to authenticated using (active = true);

-- Invites: users can only check their own invite row (email match via JWT claim)
-- Service role manages inserts; clients cannot list the full invite table.
create policy invites_select_own on public.invites
  for select to authenticated
  using (lower(email) = lower(coalesce(auth.jwt() ->> 'email', '')));

create policy learner_profiles_own on public.learner_profiles
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy relationship_state_own on public.relationship_state
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy story_threads_own on public.story_threads
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy conversations_own on public.conversations
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy messages_own on public.messages
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy drafts_own on public.drafts
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy memories_own on public.memories
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy message_analysis_own on public.message_analysis
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy learning_items_own on public.learning_items
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy encounters_own on public.encounters
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy difficulty_feedback_own on public.difficulty_feedback
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy settings_own on public.settings
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy usage_events_own_select on public.usage_events
  for select to authenticated
  using (user_id = auth.uid());

create policy generation_jobs_own on public.generation_jobs
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
