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

/**
 * Local-dev: attach a synthetic user when auth is not configured.
 * Production/multi-user: require a valid Supabase JWT Bearer token.
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
    authed.userId = data.user.id;
    authed.userEmail = data.user.email ?? null;
    authed.user = data.user;
    next();
  })().catch(next);
}
