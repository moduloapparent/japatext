import { createBrowserClient } from "@supabase/ssr";
import type { Session, SupabaseClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export function isAuthConfigured(): boolean {
  return Boolean(url && anonKey);
}

let client: SupabaseClient | null = null;

/** Browser client with cookie-backed session storage (@supabase/ssr). */
export function getSupabase(): SupabaseClient | null {
  if (!isAuthConfigured()) return null;
  if (!client) {
    client = createBrowserClient(url!, anonKey!);
  }
  return client;
}

export async function getSession(): Promise<Session | null> {
  const supabase = getSupabase();
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session;
}

/** Complete a magic-link redirect (PKCE code or implicit hash). */
export async function completeAuthRedirect(): Promise<{ error: string | null }> {
  const supabase = getSupabase();
  if (!supabase) return { error: "Auth is not configured." };

  const params = new URLSearchParams(window.location.search);
  const code = params.get("code");
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    return { error: error?.message ?? null };
  }

  const { error } = await supabase.auth.getSession();
  return { error: error?.message ?? null };
}

export async function signInWithMagicLink(email: string): Promise<{ error: string | null }> {
  const supabase = getSupabase();
  if (!supabase) return { error: "Auth is not configured." };
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: `${window.location.origin}/auth/callback`,
    },
  });
  return { error: error?.message ?? null };
}

export async function signOut(): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) return;
  await supabase.auth.signOut();
}
