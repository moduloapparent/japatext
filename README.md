# Japatext

A local web app for learning Japanese through realistic text-message and email
exchanges with persistent, AI-powered characters (OpenAI). Two modes control
difficulty:

- **Comprehensible (N+1)** — fully natural Japanese, but new vocabulary/grammar
  per message is kept within an adaptive budget based on what you've actually
  demonstrated you know.
- **Natural** — no learner-level constraints.

Learning support (word/grammar glosses, native-phrasing comparisons, saved
vocabulary) lives in a slide-out "study drawer" so the conversation itself
stays immersive — no inline translations or corrections.

## Project layout

```
server/   Express + TypeScript API, SQLite (better-sqlite3), OpenAI integration
web/      Vite + React + TypeScript frontend
```

## Setup

1. **Install dependencies** (from the repo root):

   ```bash
   npm install
   ```

2. **Add your OpenAI API key.** Copy the template and edit it:

   ```bash
   cp server/.env.example server/.env
   ```

   Open `server/.env` and replace `sk-your-key-here` with your real key.
   This file is gitignored and is only read by the local backend — the key
   never reaches the browser.

3. **Seed the database** (creates `server/data/japatext.sqlite` and the five
   starter characters):

   ```bash
   npm run seed
   ```

4. **Run the app** (two terminals, from the repo root):

   ```bash
   npm run dev:server   # http://localhost:8787
   npm run dev:web       # http://localhost:5173
   ```

   Open `http://localhost:5173`. The web dev server proxies `/api` to the
   backend, so no CORS setup is needed in development.

On first launch you'll go through a short onboarding flow (name, interests,
default difficulty mode). After that you'll land on the chat list with five
characters: a gamer friend, a foodie friend, a senior coworker (great for
keigo), a Kyoto guesthouse owner (email, warm polite Japanese), and an online
gaming friend (internet-casual Japanese).

## How the pieces fit together

- **Conversation engine** (`server/src/engine/generateReply.ts`) calls
  `gpt-5-mini` with the character's persona, relationship state, story
  threads, recent memories, and the learner profile, using a forced tool call
  (OpenAI Structured Outputs, strict mode) so the response is structured
  (message text + memory/story updates). A separate, cheaper `gpt-5.4-nano`
  call (`server/src/engine/tagDifficulty.ts`) then tags which words/grammar in
  that reply are likely new for you — kept out of the generation call so the
  model writing the character's voice isn't also self-grading its own
  difficulty. In Comprehensible mode, those tags are checked against what
  you've actually encountered (`server/src/engine/difficulty.ts`); if a reply
  is too dense, the engine asks `gpt-5-mini` to rewrite it once, naming the
  specific offending words, then re-tags the rewrite.
- **Learner model** (`learning_items` / `encounters` tables) tracks confidence
  per word/grammar pattern from encounters, lookups, saves, and your own
  "too easy / good / too hard" feedback on any message — not from a static
  JLPT label.
- **Study drawer** (`server/src/engine/analysis.ts`, `web/src/components/StudyDrawer.tsx`)
  generates on-demand, cached explanations (also `gpt-5.4-nano`) that
  prioritize communicative function over literal translation, and — for your
  own messages — infers your intent first, then shows how a native speaker
  would phrase the same intent (never a mechanical grammar correction).
- **Cadence** (`server/src/engine/delivery.ts`) gives chat messages a short
  randomized delay with a typing indicator and email messages a longer
  simulated delay, with a "deliver now" override always available. On app
  load, characters may generate a plausible backdated message if enough time
  has passed since you last talked (capped so a long absence doesn't flood
  you with messages).

## Testing

```bash
npm run test:server
```

This runs three tiers against a throwaway database:

1. **Logic tests** (always run, no API calls) — difficulty budgeting,
   learner-model updates, message lifecycle, export/reset.
2. **Pipeline tests against a mocked OpenAI** (always run, zero API cost,
   `JAPATEXT_MOCK_LLM` is set automatically for this tier only) — deterministic
   fixtures in `server/src/lib/mockLlm.ts` stand in for the real model so the
   surrounding code can be exercised end-to-end: the difficulty regeneration
   loop actually regenerates and re-checks, Natural mode correctly skips it,
   tagged vocabulary lands in `learning_items`, gloss results are cached, and
   character initiation applies `should_send`. This validates *our* code but
   can't judge real Japanese quality — only the live tier can.
3. **Live tests against the real OpenAI API** — only run if
   `OPENAI_API_KEY` is set in `server/.env`. If your account can't be billed
   yet, these will fail with an OpenAI billing error rather than a code
   error; the other two tiers still tell you whether the app itself is
   working.

## Cost and data

- Go to **Settings** in the app for a local usage/cost estimate and API key
  status, plus buttons to export all your data as JSON or reset everything.
- All data lives in `server/data/japatext.sqlite`. Nothing is sent anywhere
  except to OpenAI when generating or analyzing a message — see the
  disclosure in Settings.
- A soft daily request cap (`JAPATEXT_MAX_REQUESTS_PER_DAY` in `server/.env`,
  default 400) prevents runaway usage from launch-time character-initiated
  message generation.

## Multi-user / deploy

Deployment guide: **[DEPLOY.md](./DEPLOY.md)**.

- **Now:** personal production deploy — Vercel (web) + Railway (API + SQLite volume). Leave Supabase env vars unset on the API.
- **In progress:** Postgres repo layer for true multi-user auth on Supabase. Until that ships, production auth is blocked when SQLite is the storage backend.
- Postgres schema + RLS: `supabase/migrations/`. Seed characters: `npm run seed:supabase --workspace server`.
- Reply generation uses a durable job queue (`generation_jobs`) so a server restart does not drop in-flight replies.
