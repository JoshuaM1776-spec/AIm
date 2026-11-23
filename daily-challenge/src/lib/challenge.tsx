// Everything a challenge's screens share: the challenge, and the person's work on it.
// Signed-in work lives on the server; a visitor's work lives on this device until they sign in,
// when it moves to their account.
import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Outlet, useParams } from "react-router";
import { ErrorNote, Page, Spinner, TopBar } from "../components/ui.tsx";
import { api, ApiError } from "./api.ts";
import { useAuth } from "./auth.tsx";
import { guest, type GuestAttempt } from "./local.ts";
import type { Attempt, Challenge, Difficulty } from "./types.ts";

export type WorkStatus = "none" | "active" | "submitted" | "abandoned";

export interface Work {
  mode: "guest" | "account";
  status: WorkStatus;
  difficulty: Difficulty | null;
  cardPosition: number;
  briefingDone: boolean;
  attempt: Attempt | null;
  guestAttempt: GuestAttempt | null;
}

export interface Conflict { number: number; title: string }

interface ChallengeValue {
  challenge: Challenge;
  work: Work;
  conflict: Conflict | null;
  clearConflict(): void;
  /** Start (or resume) this challenge. Returns false if another challenge is active and wasn't set aside. */
  begin(difficulty: Difficulty, abandonActive?: boolean): Promise<boolean>;
  setPosition(card: number): void;
  finishBriefing(): Promise<void>;
  setDifficulty(d: Difficulty): Promise<void>;
  saveDraft(kind: "initial" | "revision", body: string): Promise<string>;
  submit(kind: "initial" | "revision", body: string, key: string): Promise<Attempt>;
  abandon(): Promise<void>;
  refresh(): Promise<Attempt | null>;
  setAttempt(a: Attempt): void;
}

const Ctx = createContext<ChallengeValue | null>(null);

export function useChallenge() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useChallenge outside ChallengeLayout");
  return v;
}

function parseConflict(e: unknown): Conflict | null {
  if (e instanceof ApiError && e.code === "active_exists") {
    try {
      return JSON.parse(e.detail) as Conflict;
    } catch {
      return { number: 0, title: "another challenge" };
    }
  }
  return null;
}

export function ChallengeLayout() {
  const { number: raw } = useParams();
  const number = Number(raw);
  const { session, ready, refreshMe } = useAuth();
  const signedIn = Boolean(session);
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [attempt, setAttemptState] = useState<Attempt | null>(null);
  const [guestAttempt, setGuestAttempt] = useState<GuestAttempt | null>(() => (Number.isInteger(number) ? guest.get(number) : null));
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(true);
  const [conflict, setConflict] = useState<Conflict | null>(null);
  const positionTimer = useRef<number | undefined>(undefined);

  const load = useCallback(async () => {
    if (!Number.isInteger(number) || number < 1) {
      setError(new ApiError("challenge_not_found", "That challenge isn't available."));
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [c, a] = await Promise.all([api.challenge(number), signedIn ? api.attempt(number) : Promise.resolve(null)]);
      setChallenge(c);
      setAttemptState(a);
      setGuestAttempt(guest.get(number));
    } catch (e) {
      setError(e instanceof ApiError ? e : new ApiError("unknown", "Something went wrong loading this challenge."));
    } finally {
      setLoading(false);
    }
  }, [number, signedIn]);

  useEffect(() => {
    if (ready) void load();
  }, [ready, load]);

  // A visitor who wrote something and then signed in: move their work into their account.
  const migrating = useRef(false);
  useEffect(() => {
    const g = guest.get(number);
    if (!signedIn || !challenge || loading || !g || migrating.current) return;
    migrating.current = true;
    (async () => {
      try {
        let a = attempt;
        if (!a) {
          try {
            a = await api.startAttempt(number, g.difficulty);
          } catch (e) {
            const c = parseConflict(e);
            if (c) { setConflict(c); return; } // keep the device copy; the person decides
            throw e;
          }
        }
        if (a.status === "abandoned") return;
        if (a.status === "active") {
          if (g.draft.trim() && !(a.drafts.initial?.body ?? "").trim()) await api.saveDraft(a.id, "initial", g.draft);
          a = await api.updateAttempt(a.id, { card_position: Math.max(a.card_position, g.card_position), briefing_done: g.briefing_done });
        }
        setAttemptState(a);
        guest.clear(number);
        setGuestAttempt(null);
        void refreshMe();
      } catch {
        /* leave the device copy in place and try again next time */
      } finally {
        migrating.current = false;
      }
    })();
  }, [signedIn, challenge, loading, attempt, number, refreshMe]);

  const work = useMemo<Work>(() => {
    if (signedIn && attempt) {
      return { mode: "account", status: attempt.status, difficulty: attempt.difficulty, cardPosition: attempt.card_position,
        briefingDone: attempt.briefing_done, attempt, guestAttempt: null };
    }
    if (guestAttempt) {
      return { mode: signedIn ? "account" : "guest", status: "active", difficulty: guestAttempt.difficulty, cardPosition: guestAttempt.card_position,
        briefingDone: guestAttempt.briefing_done, attempt: null, guestAttempt };
    }
    return { mode: signedIn ? "account" : "guest", status: "none", difficulty: null, cardPosition: 1, briefingDone: false, attempt: null, guestAttempt: null };
  }, [signedIn, attempt, guestAttempt]);

  const updateGuest = useCallback((patch: Partial<GuestAttempt>) => {
    const cur = guest.get(number);
    if (!cur) return;
    const next = { ...cur, ...patch };
    guest.set(next);
    setGuestAttempt(next);
  }, [number]);

  const value = useMemo<ChallengeValue | null>(() => challenge && ({
    challenge,
    work,
    conflict,
    clearConflict: () => setConflict(null),
    async begin(difficulty, abandonActive = false) {
      if (!signedIn) {
        const existing = guest.get(number);
        const g: GuestAttempt = existing ? { ...existing, difficulty } : {
          number, difficulty, card_position: 1, briefing_done: false, draft: "", draft_saved_at: null, started_at: new Date().toISOString(),
        };
        guest.set(g);
        setGuestAttempt(g);
        return true;
      }
      try {
        let a = await api.startAttempt(number, difficulty, abandonActive);
        const g = guest.get(number);
        if (g && a.status === "active") {
          if (g.draft.trim() && !(a.drafts.initial?.body ?? "").trim()) await api.saveDraft(a.id, "initial", g.draft);
          a = await api.updateAttempt(a.id, { card_position: Math.max(a.card_position, g.card_position), briefing_done: g.briefing_done });
          guest.clear(number);
          setGuestAttempt(null);
        }
        if (a.status === "active" && a.difficulty !== difficulty) a = await api.updateAttempt(a.id, { difficulty });
        setAttemptState(a);
        setConflict(null);
        void refreshMe();
        return true;
      } catch (e) {
        const c = parseConflict(e);
        if (c) {
          setConflict(c);
          return false;
        }
        throw e;
      }
    },
    setPosition(card) {
      if (work.mode === "guest" || !attempt) {
        updateGuest({ card_position: card });
        return;
      }
      if (attempt.status !== "active" && attempt.status !== "submitted") return;
      setAttemptState(a => (a ? { ...a, card_position: card } : a));
      window.clearTimeout(positionTimer.current);
      positionTimer.current = window.setTimeout(() => { void api.updateAttempt(attempt.id, { card_position: card }).catch(() => {}); }, 400);
    },
    async finishBriefing() {
      if (!attempt) return updateGuest({ briefing_done: true, card_position: 5 });
      if (attempt.status !== "active") return;
      setAttemptState(await api.updateAttempt(attempt.id, { briefing_done: true, card_position: 5 }));
    },
    async setDifficulty(d) {
      if (!attempt) return updateGuest({ difficulty: d });
      setAttemptState(await api.updateAttempt(attempt.id, { difficulty: d }));
    },
    async saveDraft(kind, body) {
      if (!attempt) {
        const at = new Date().toISOString();
        updateGuest({ draft: body, draft_saved_at: at });
        return at;
      }
      const r = await api.saveDraft(attempt.id, kind, body);
      setAttemptState(a => (a ? { ...a, drafts: { ...a.drafts, [kind]: { body, updated_at: r.updated_at } } } : a));
      return r.updated_at;
    },
    async submit(kind, body, key) {
      if (!attempt) throw new ApiError("auth_required", "Sign in to submit your response.");
      const a = await api.submit(attempt.id, kind, body, key);
      setAttemptState(a);
      void refreshMe();
      return a;
    },
    async abandon() {
      if (!attempt) {
        guest.clear(number);
        setGuestAttempt(null);
        return;
      }
      setAttemptState(await api.abandonAttempt(attempt.id));
      void refreshMe();
    },
    async refresh() {
      if (!signedIn) return null;
      const a = await api.attempt(number);
      setAttemptState(a);
      return a;
    },
    setAttempt: setAttemptState,
  }), [challenge, work, conflict, signedIn, number, attempt, updateGuest, refreshMe]);

  if (loading || !ready) return <Page><TopBar back="/" /><Spinner label="Opening the challenge" /></Page>;
  if (error || !value) {
    return (
      <Page>
        <TopBar back="/" />
        <ErrorNote className="mt-8" message={error?.message ?? "This challenge couldn't be loaded."} onRetry={error?.code === "challenge_not_found" ? undefined : load} />
      </Page>
    );
  }
  return <Ctx.Provider value={value}><Outlet /></Ctx.Provider>;
}

/** Provides a fixed challenge with no attempt: for admin previews. */
export function PreviewProvider({ challenge, difficulty = "moderate", children }: { challenge: Challenge; difficulty?: Difficulty; children: ReactNode }) {
  const noop = async () => {};
  const value: ChallengeValue = {
    challenge,
    work: { mode: "guest", status: "active", difficulty, cardPosition: 1, briefingDone: false, attempt: null, guestAttempt: null },
    conflict: null,
    clearConflict: () => {},
    begin: async () => true,
    setPosition: () => {},
    finishBriefing: noop,
    setDifficulty: noop,
    saveDraft: async () => new Date().toISOString(),
    submit: async () => { throw new ApiError("preview", "This is a preview."); },
    abandon: noop,
    refresh: async () => null,
    setAttempt: () => {},
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
