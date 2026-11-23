// Everything a challenge's screens share: the challenge, and the person's work on it.
// Signed-in work lives on the server; a visitor's work lives on this device until they sign in,
// when it moves to their account. Only the one open challenge can be worked on; work on a
// challenge that has closed is kept and shown read-only.
import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Outlet, useParams } from "react-router";
import { ErrorNote, Page, Spinner, TopBar } from "../components/ui.tsx";
import { api, ApiError } from "./api.ts";
import { useAuth } from "./auth.tsx";
import { guest, type GuestAttempt } from "./local.ts";
import type { Attempt, Challenge, Difficulty } from "./types.ts";

export type WorkStatus = "none" | "active" | "submitted" | "expired";

export interface Work {
  mode: "guest" | "account";
  status: WorkStatus;
  difficulty: Difficulty | null;
  cardPosition: number;
  briefingDone: boolean;
  attempt: Attempt | null;
  guestAttempt: GuestAttempt | null;
}

interface ChallengeValue {
  challenge: Challenge;
  work: Work;
  /** Start (or resume) the open challenge. */
  begin(difficulty: Difficulty): Promise<void>;
  setPosition(card: number): void;
  finishBriefing(): Promise<void>;
  setDifficulty(d: Difficulty): Promise<void>;
  saveDraft(kind: "initial" | "revision", body: string): Promise<string>;
  submit(kind: "initial" | "revision", body: string, key: string): Promise<Attempt>;
  refresh(): Promise<Attempt | null>;
  setAttempt(a: Attempt): void;
}

const Ctx = createContext<ChallengeValue | null>(null);

export function useChallenge() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useChallenge outside ChallengeLayout");
  return v;
}

/** Moves a visitor's device draft into their account's attempt, then forgets the device copy. */
async function moveGuestWork(attempt: Attempt, number: number): Promise<Attempt> {
  const g = guest.get(number);
  if (!g) return attempt;
  let a = attempt;
  if (a.status === "active") {
    if (g.draft.trim() && !(a.drafts.initial?.body ?? "").trim()) await api.saveDraft(a.id, "initial", g.draft);
    a = await api.updateAttempt(a.id, { card_position: Math.max(a.card_position, g.card_position), briefing_done: g.briefing_done });
    // anything typed on the device while this was happening
    const latest = guest.get(number);
    if (latest && latest.draft !== g.draft && latest.draft.trim()) {
      await api.saveDraft(a.id, "initial", latest.draft);
      a = (await api.attempt(number)) ?? a;
    }
  }
  guest.clear(number); // only once the account has it (or already has its own submitted work)
  return a;
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
    // (a draft on a challenge that has closed stays on the device, read-only)
    if (!signedIn || !challenge?.is_open || loading || !g || migrating.current) return;
    migrating.current = true;
    (async () => {
      try {
        const a = await moveGuestWork(attempt ?? await api.startAttempt(number, g.difficulty), number);
        setAttemptState(a);
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
      return { mode: signedIn ? "account" : "guest", status: challenge?.is_open ? "active" : "expired", difficulty: guestAttempt.difficulty, cardPosition: guestAttempt.card_position,
        briefingDone: guestAttempt.briefing_done, attempt: null, guestAttempt };
    }
    return { mode: signedIn ? "account" : "guest", status: "none", difficulty: null, cardPosition: 1, briefingDone: false, attempt: null, guestAttempt: null };
  }, [signedIn, attempt, guestAttempt, challenge?.is_open]);

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
    async begin(difficulty) {
      if (!challenge.is_open) throw new ApiError("challenge_closed", "This challenge has closed. Each challenge is open on its own day, until 00:00 UTC.");
      if (!signedIn) {
        const existing = guest.get(number);
        const g: GuestAttempt = existing ? { ...existing, difficulty } : {
          number, difficulty, card_position: 1, briefing_done: false, draft: "", draft_saved_at: null, started_at: new Date().toISOString(),
        };
        guest.set(g);
        setGuestAttempt(g);
        return;
      }
      let a = await api.startAttempt(number, difficulty);
      if (guest.get(number)) {
        a = await moveGuestWork(a, number);
        setGuestAttempt(null);
      }
      if (a.status === "active" && a.difficulty !== difficulty) a = await api.updateAttempt(a.id, { difficulty });
      setAttemptState(a);
      void refreshMe();
    },
    setPosition(card) {
      if (work.mode === "guest" || !attempt) {
        updateGuest({ card_position: card });
        return;
      }
      setAttemptState(a => (a ? { ...a, card_position: card } : a));
      window.clearTimeout(positionTimer.current);
      positionTimer.current = window.setTimeout(() => { void api.updateAttempt(attempt.id, { card_position: card }).catch(() => {}); }, 400);
    },
    async finishBriefing() {
      if (!attempt) return updateGuest({ briefing_done: true, card_position: 5 });
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
    async refresh() {
      if (!signedIn) return null;
      const a = await api.attempt(number);
      setAttemptState(a);
      return a;
    },
    setAttempt: setAttemptState,
  }), [challenge, work, signedIn, number, attempt, updateGuest, refreshMe]);

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
    begin: noop,
    setPosition: () => {},
    finishBriefing: noop,
    setDifficulty: noop,
    saveDraft: async () => new Date().toISOString(),
    submit: async () => { throw new ApiError("preview", "This is a preview."); },
    refresh: async () => null,
    setAttempt: () => {},
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
