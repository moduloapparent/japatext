import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const PORT = Number(process.env.PORT ?? 8787);
export const NODE_ENV = process.env.NODE_ENV ?? "development";
export const OPENAI_API_KEY = process.env.OPENAI_API_KEY ?? "";
export const DATA_DIR =
  process.env.JAPATEXT_DATA_DIR ??
  process.env.JAPATEXT_TEST_DATA_DIR ??
  path.join(__dirname, "..", "data");

/** Comma-separated browser origins allowed to call the API (production CORS). */
export const WEB_ORIGINS = (process.env.WEB_ORIGIN ?? "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

export const SUPABASE_URL = process.env.SUPABASE_URL ?? "";
export const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY ?? "";
export const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

/** Auth is only enforced when a Supabase project is configured. Local SQLite stays open. */
export function isAuthEnabled(): boolean {
  return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
}

/** Postgres-backed storage (Supabase repo). Not wired yet — SQLite remains the default. */
export function isPostgresEnabled(): boolean {
  return process.env.JAPATEXT_DATABASE === "postgres" && Boolean(SUPABASE_SERVICE_ROLE_KEY);
}

export function assertProductionStorage(): void {
  if (NODE_ENV !== "production") return;
  if (!isAuthEnabled()) return;
  if (isPostgresEnabled()) return;
  throw new Error(
    "Production auth requires JAPATEXT_DATABASE=postgres and SUPABASE_SERVICE_ROLE_KEY. " +
      "SQLite is single-user only — leave Supabase env vars unset for a personal deploy."
  );
}

export function requireSupabaseUrl(): string {
  if (!SUPABASE_URL) throw new Error("SUPABASE_URL is not set.");
  return SUPABASE_URL;
}

export function requireSupabaseAnonKey(): string {
  if (!SUPABASE_ANON_KEY) throw new Error("SUPABASE_ANON_KEY is not set.");
  return SUPABASE_ANON_KEY;
}

// Task-based model routing: in-character generation needs a model that can
// reliably hold voice/register, so it uses the mid-tier model. Mechanical
// extraction/classification (difficulty tagging, gloss, phrasing comparison)
// is cheaper and works well on the nano tier.
export const GENERATION_MODEL = process.env.JAPATEXT_GENERATION_MODEL ?? "gpt-5-mini";
export const TAGGING_MODEL = process.env.JAPATEXT_TAGGING_MODEL ?? "gpt-5.4-nano";

// Simple local cost guard shown in the in-app usage dashboard only, never used
// for real billing. Keyed by model so mixed generation/tagging calls are each
// estimated at their own price point.
export const PRICE_PER_MTOK_USD: Record<string, { input: number; output: number }> = {
  "gpt-5-mini": { input: 0.25, output: 2.0 },
  "gpt-5.4-nano": { input: 0.2, output: 1.25 },
};
export const DEFAULT_PRICE_PER_MTOK_USD = { input: 0.25, output: 2.0 };

export const MAX_REQUESTS_PER_DAY = Number(process.env.JAPATEXT_MAX_REQUESTS_PER_DAY ?? 400);

export function requireApiKey(): string {
  if (!OPENAI_API_KEY) {
    throw new Error(
      "OPENAI_API_KEY is not set. Add it to server/.env (see server/.env.example)."
    );
  }
  return OPENAI_API_KEY;
}

/**
 * Checked at call time (not captured once at import) so tests can flip this
 * on/off between test tiers within the same process. When enabled, real
 * OpenAI calls are replaced with deterministic fixtures — useful for
 * exercising the pipeline (schema validation, difficulty regeneration,
 * memory/story side effects, caching) at zero cost when no API credit is
 * available. Never enabled by the app itself in normal use.
 */
export function isMockLlm(): boolean {
  return process.env.JAPATEXT_MOCK_LLM === "1";
}
