import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api, setAccessToken } from "../api/client";
import type { LearnerProfile } from "../api/types";
import { getSession, getSupabase, isAuthConfigured, signOut as supabaseSignOut } from "../lib/supabase";

interface AppContextValue {
  profile: LearnerProfile | null;
  loadingProfile: boolean;
  apiKeyConfigured: boolean;
  authRequired: boolean;
  sessionReady: boolean;
  signedIn: boolean;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
  initChecked: boolean;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<LearnerProfile | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [apiKeyConfigured, setApiKeyConfigured] = useState(true);
  const [sessionReady, setSessionReady] = useState(!isAuthConfigured());
  const [signedIn, setSignedIn] = useState(!isAuthConfigured());
  const [initChecked, setInitChecked] = useState(false);
  const authRequired = isAuthConfigured();

  const refreshProfile = useCallback(async () => {
    const { profile } = await api.getProfile();
    setProfile(profile);
  }, []);

  const signOut = useCallback(async () => {
    await supabaseSignOut();
    setAccessToken(null);
    setSignedIn(false);
    setProfile(null);
  }, []);

  useEffect(() => {
    if (!authRequired) {
      setSessionReady(true);
      setSignedIn(true);
      return;
    }

    const supabase = getSupabase();
    if (!supabase) {
      setSessionReady(true);
      setSignedIn(false);
      return;
    }

    let cancelled = false;
    (async () => {
      const session = await getSession();
      if (cancelled) return;
      setAccessToken(session?.access_token ?? null);
      setSignedIn(Boolean(session));
      setSessionReady(true);
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setAccessToken(session?.access_token ?? null);
      setSignedIn(Boolean(session));
      setSessionReady(true);
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, [authRequired]);

  useEffect(() => {
    if (!sessionReady) return;
    if (authRequired && !signedIn) {
      setLoadingProfile(false);
      return;
    }
    (async () => {
      setLoadingProfile(true);
      try {
        const health = await api.health();
        setApiKeyConfigured(health.apiKeyConfigured);
        await refreshProfile();
      } finally {
        setLoadingProfile(false);
      }
    })();
  }, [sessionReady, signedIn, authRequired, refreshProfile]);

  useEffect(() => {
    if (!profile?.onboardedAt || initChecked || (authRequired && !signedIn)) return;
    (async () => {
      try {
        await api.checkInit();
      } catch {
        // Non-fatal: the app still works without initiated messages.
      } finally {
        setInitChecked(true);
      }
    })();
  }, [profile, initChecked, authRequired, signedIn]);

  const value = useMemo(
    () => ({
      profile,
      loadingProfile,
      apiKeyConfigured,
      authRequired,
      sessionReady,
      signedIn,
      refreshProfile,
      signOut,
      initChecked,
    }),
    [
      profile,
      loadingProfile,
      apiKeyConfigured,
      authRequired,
      sessionReady,
      signedIn,
      refreshProfile,
      signOut,
      initChecked,
    ]
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}
