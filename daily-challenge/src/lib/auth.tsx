import type { Session } from "@supabase/supabase-js";
import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api, ApiError } from "./api.ts";
import { guest } from "./local.ts";
import { supabase } from "./supabase.ts";
import type { MyState } from "./types.ts";

interface AuthValue {
  ready: boolean;
  session: Session | null;
  email: string | null;
  me: MyState | null; // the signed-in user's profile and attempt summary
  meError: ApiError | null;
  refreshMe(): Promise<MyState | null>;
  sendCode(email: string): Promise<void>;
  verifyCode(email: string, code: string): Promise<void>;
  signOut(): Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(!supabase);
  const [session, setSession] = useState<Session | null>(null);
  const [me, setMe] = useState<MyState | null>(null);
  const [meError, setMeError] = useState<ApiError | null>(null);

  useEffect(() => {
    if (!supabase) return;
    let alive = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!alive) return;
      setSession(data.session);
      setReady(true);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => {
      alive = false;
      data.subscription.unsubscribe();
    };
  }, []);

  const userId = session?.user.id ?? null;

  const refreshMe = useCallback(async () => {
    if (!userId) {
      setMe(null);
      return null;
    }
    try {
      const s = await api.myState();
      setMe(s);
      setMeError(null);
      return s;
    } catch (e) {
      setMeError(e instanceof ApiError ? e : new ApiError("unknown", "Couldn't load your account."));
      return null;
    }
  }, [userId]);

  useEffect(() => {
    void refreshMe();
  }, [refreshMe]);

  const value = useMemo<AuthValue>(() => ({
    ready,
    session,
    email: session?.user.email ?? null,
    me,
    meError,
    refreshMe,
    async sendCode(email) {
      if (!supabase) throw new ApiError("not_configured", "Accounts aren't set up on this server.");
      const { error } = await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: true, emailRedirectTo: window.location.origin } });
      if (error) throw new ApiError("auth", error.message.includes("rate") ? "Too many codes requested. Please wait a minute and try again." : "We couldn't send a code to that address. Check it and try again.");
    },
    async verifyCode(email, code) {
      if (!supabase) throw new ApiError("not_configured", "Accounts aren't set up on this server.");
      const { error } = await supabase.auth.verifyOtp({ email, token: code.trim(), type: "email" });
      if (error) throw new ApiError("auth", "That code didn't work. Check it, or ask for a new one.");
    },
    async signOut() {
      await supabase?.auth.signOut();
      setMe(null);
    },
  }), [ready, session, me, meError, refreshMe]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const v = useContext(AuthContext);
  if (!v) throw new Error("useAuth outside AuthProvider");
  return v;
}

/** True if this device holds work written before signing in. */
export const hasGuestWork = () => guest.all().some(a => a.draft.trim().length > 0);
