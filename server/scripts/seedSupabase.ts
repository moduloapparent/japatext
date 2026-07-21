/**
 * Seed the shared character catalog into Supabase Postgres.
 * Requires SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in server/.env.
 *
 *   npm run seed:supabase --workspace server
 */
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import { CHARACTERS } from "../src/db/seed.js";

dotenv.config();

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in server/.env");
  process.exit(1);
}

const supabase = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function main(): Promise<void> {
  const rows = CHARACTERS.map((c) => ({
    id: c.id,
    name: c.name,
    name_reading: c.nameReading,
    avatar_emoji: c.avatarEmoji,
    medium: c.medium,
    register: c.register,
    persona_json: c.persona,
    life_state: (c.persona.currentSituation as string) ?? null,
    boundaries_json: c.boundaries,
    initiation_cadence_minutes: c.cadenceMinutes,
    active: true,
  }));

  const { error } = await supabase.from("characters").upsert(rows, { onConflict: "id" });
  if (error) {
    console.error("Seed failed:", error.message);
    process.exit(1);
  }
  console.log(`Seeded ${rows.length} characters into Supabase.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
