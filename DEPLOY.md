# Deploying Japatext

Japatext splits across three services:

| Service | Host | Role |
|---------|------|------|
| **Web** | [Vercel](https://vercel.com) | Vite/React SPA |
| **API** | [Railway](https://railway.app) (or Fly.io) | Express + OpenAI |
| **Auth + DB** | [Supabase](https://supabase.com) | Magic-link login, Postgres (multi-user) |

The API cannot run on Vercel serverless today — it uses long-lived SQLite, background job workers, and `better-sqlite3`.

## Two deploy modes

### A. Personal deploy (available now)

Single-user production with SQLite on Railway. **Do not** set `SUPABASE_*` on the API server — auth stays off and all data lives in one SQLite file on a persistent volume.

Good for: your own hosted copy with a real URL, no login wall.

### B. Multi-user deploy (in progress)

Requires the Postgres repo layer (`JAPATEXT_DATABASE=postgres`) which is not wired yet. Until then, enabling Supabase auth on a production API will **fail at startup** by design — SQLite has no per-user isolation.

---

## 1. Supabase setup

1. Open your project → **SQL Editor** → run `supabase/migrations/20260720120000_initial.sql`.

2. **Authentication → URL configuration**
   - Site URL: your Vercel URL (e.g. `https://japatext.vercel.app`)
   - Redirect URLs:
     - `http://localhost:5173/auth/callback` (dev)
     - `https://japatext.vercel.app/auth/callback` (prod)

3. **Project Settings → API** — copy:
   - Project URL → `SUPABASE_URL` / `VITE_SUPABASE_URL`
   - Publishable (anon) key → `SUPABASE_ANON_KEY` / `VITE_SUPABASE_ANON_KEY`
   - Service role key → `SUPABASE_SERVICE_ROLE_KEY` (server only, never in the browser)

4. Seed shared characters (after migration):

   ```bash
   # Add service role key to server/.env first
   npm run seed:supabase --workspace server
   ```

5. Add invite rows for allowed emails:

   ```sql
   insert into public.invites (email, note)
   values ('you@example.com', 'founder');
   ```

Skip steps 4–5 for **personal deploy** (mode A).

---

## 2. Deploy the API (Railway)

1. Create a new Railway project → **Deploy from GitHub repo** (this repo).

2. **Settings → Volumes** — add a volume mounted at `/data`.

3. **Variables** (mode A — personal):

   | Variable | Value |
   |----------|-------|
   | `NODE_ENV` | `production` |
   | `OPENAI_API_KEY` | your key |
   | `JAPATEXT_DATA_DIR` | `/data` |
   | `WEB_ORIGIN` | `https://your-app.vercel.app` |
   | `PORT` | `8787` (Railway may override — that's fine) |

   Do **not** set `SUPABASE_URL` / `SUPABASE_ANON_KEY` for mode A.

4. Railway detects `railway.toml` + `Dockerfile`. Deploy and note the public URL, e.g. `https://japatext-api.up.railway.app`.

5. Verify: `curl https://YOUR-API.up.railway.app/api/health`

---

## 3. Deploy the web (Railway — same project)

You already have `japatext-web` next to the API. Point it at the API:

1. Open **japatext-web** → **Settings** → **Build**
   - **Dockerfile path:** `Dockerfile.web` (not the default `Dockerfile`)
2. **Variables** on `japatext-web`:

   | Variable | Value |
   |----------|-------|
   | `VITE_API_BASE_URL` | `https://japatext-server-production.up.railway.app/api` |

   (Vite bakes this in at **build** time — after changing it, redeploy / rebuild.)

3. **Settings** → **Networking** → **Generate Domain** (port Railway suggests / `PORT` is fine).
4. On **japatext-server** → **Variables**, set:

   | Variable | Value |
   |----------|-------|
   | `WEB_ORIGIN` | `https://YOUR-WEB-DOMAIN.up.railway.app` |

   Until that is set, CORS allows all origins (ok for first smoke test).

5. Open the web domain — you should hit onboarding / the chat list.

### Alternative: Vercel for web

1. Import the repo in Vercel (root uses `vercel.json`).
2. Set `VITE_API_BASE_URL` as above.
3. Set `WEB_ORIGIN` on Railway to the Vercel URL.

---

## 4. Post-deploy checklist

- [ ] `/api/health` returns `{ ok: true }`
- [ ] Web loads, onboarding works, can send a message
- [ ] Settings shows API key configured
- [ ] (Mode B) Magic-link login completes at `/auth/callback`
- [ ] (Mode B) Two users see isolated data

---

## Local dev with production API

```bash
# web/.env.local
VITE_API_BASE_URL=https://YOUR-API.up.railway.app/api
```

Restart `npm run dev:web`.

---

## What's next for multi-user (mode B)

- [ ] Rewrite `server/src/db/repo.ts` for async Supabase/Postgres queries scoped by `user_id`
- [ ] Set `JAPATEXT_DATABASE=postgres` on Railway
- [ ] Enable `SUPABASE_*` on API + `VITE_SUPABASE_*` on Vercel
- [ ] Per-user quotas, idempotency, privacy export/delete
