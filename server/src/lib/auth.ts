import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import type { Request, Response, NextFunction } from "express";
import {
  isAuthEnabled,
  requireSupabaseAnonKey,
  requireSupabaseUrl,
  SUPABASE_SERVICE_ROLE_KEY,
} from "../config.js";

export type AuthedRequest = Request & {
  userId: string;
  userEmail: string | null;
  user: User | null;
};

let anonClient: SupabaseClient | null = null;
let serviceClient: SupabaseClient | null = null;

export function getAnonSupabase(): SupabaseClient {
  if (!anonClient) {
    anonClient = createClient(requireSupabaseUrl(), requireSupabaseAnonKey(), {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return anonClient;
}

/** Service-role client for trusted server operations that bypass RLS. */
export function getServiceSupabase(): SupabaseClient {
  if (!SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set.");
  }
  if (!serviceClient) {
    serviceClient = createClient(requireSupabaseUrl(), SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return serviceClient;
}

async function isEmailInvited(email: string): Promise<boolean> {
  if (!SUPABASE_SERVICE_ROLE_KEY) {
    // Local/dev without service role: any valid Supabase user is allowed.
    return true;
  }
  const normalized = email.trim().toLowerCase();
  const { data, error } = await getServiceSupabase()
    .from("invites")
    .select("email")
    .ilike("email", normalized)
    .maybeSingle();
  if (error) {
    console.error("Invite lookup failed:", error.message);
    return false;
  }
  if (!data) return false;

  // Best-effort: stamp first successful login.
  void getServiceSupabase()
    .from("invites")
    .update({ redeemed_at: new Date().toISOString() })
    .ilike("email", normalized)
    .is("redeemed_at", null);

  return true;
}

/**
 * Local-dev: attach a synthetic user when auth is not configured.
 * Production: require a valid Supabase JWT + invite row for the user's email.
 */
export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const authed = req as AuthedRequest;

    if (!isAuthEnabled()) {
      authed.userId = "local";
      authed.userEmail = null;
      authed.user = null;
      next();
      return;
    }

    // Health stays public so the UI can show config status before login.
    if (req.path === "/health" || req.originalUrl.includes("/api/health")) {
      next();
      return;
    }

    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) {
      res.status(401).json({ error: { message: "Sign in required." } });
      return;
    }

    const token = header.slice("Bearer ".length).trim();
    const { data, error } = await getAnonSupabase().auth.getUser(token);
    if (error || !data.user) {
      res.status(401).json({ error: { message: "Invalid or expired session." } });
      return;
    }

    const email = data.user.email ?? null;
    if (!(await isEmailInvited(email ?? ""))) {
      res.status(403).json({
        error: { message: "This email is not invited. Ask the owner to add you." },
      });
      return;
    }

    authed.userId = data.user.id;
    authed.userEmail = email;
    authed.user = data.user;
    next();
  })().catch(next);
}
