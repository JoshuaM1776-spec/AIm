import { Globe, Lock } from "lucide-react";
import { useEffect, useState } from "react";
import { Navigate, useNavigate } from "react-router";
import { Button, ButtonLink, Card, cx, ErrorNote, Page, TopBar } from "../components/ui.tsx";
import { ApiError } from "../lib/api.ts";
import { useAuth } from "../lib/auth.tsx";
import { useChallenge } from "../lib/challenge.tsx";
import { DIFFICULTY_BLURB, DIFFICULTY_LABEL, LENGTH_GUIDE, openUntil, SCENARIO_LABEL } from "../lib/text.ts";
import type { Difficulty } from "../lib/types.ts";
import { ChallengePreview } from "./Home.tsx";

export function DifficultyPicker({ value, onChange, expectations, disabled }: { value: Difficulty; onChange: (d: Difficulty) => void; expectations?: Record<Difficulty, string>; disabled?: boolean }) {
  return (
    <fieldset className="mt-1" disabled={disabled}>
      <legend className="eyebrow mb-2">Choose your difficulty</legend>
      <div className="grid grid-cols-3 gap-2" role="radiogroup">
        {(["easy", "moderate", "hard"] as Difficulty[]).map(d => (
          <label key={d} className={cx("flex min-h-12 cursor-pointer items-center justify-center rounded-xl border text-[0.95rem] font-semibold transition",
            value === d ? "border-button bg-button text-[#f8f1e6]" : "border-line bg-card text-ink hover:border-bronze-soft")}>
            <input type="radio" name="difficulty" value={d} checked={value === d} onChange={() => onChange(d)} className="sr-only" />
            {DIFFICULTY_LABEL[d]}
          </label>
        ))}
      </div>
      <p className="mt-3 text-sm text-ink-soft" aria-live="polite">
        {expectations?.[value] ?? DIFFICULTY_BLURB[value]}{" "}
        <span className="text-muted">Suggested length: {LENGTH_GUIDE[value].min}–{LENGTH_GUIDE[value].max} words.</span>
      </p>
      <p className="mt-1 text-xs text-muted">Everyone gets the same scenario. Difficulty changes what your written response is expected to do.</p>
    </fieldset>
  );
}

/** A challenge that has closed: only its participants get here, to reread their work. */
function Closed() {
  const { challenge: c, work } = useChallenge();
  const hasDraft = Boolean((work.attempt?.drafts.initial?.body ?? work.guestAttempt?.draft ?? "").trim());
  return (
    <Page>
      <TopBar back="/" />
      <div className="mt-2"><ChallengePreview c={c} compact /></div>
      <Card className="mt-6 px-5 py-5 text-center">
        <Lock className="mx-auto text-bronze" size={24} strokeWidth={1.5} aria-hidden />
        <p className="mt-2 font-serif text-xl text-ink">This challenge has closed</p>
        <p className="mt-1 text-sm">
          There&rsquo;s one challenge at a time, the same for everyone. Each is open on its own day, until 00:00 UTC.
          {hasDraft ? " Your unfinished draft is kept here for you to reread." : ""}
        </p>
        {hasDraft && <ButtonLink to={`/c/${c.number}/write`} variant="secondary" className="mt-4 w-full">Read your draft</ButtonLink>}
        <ButtonLink to="/" className="mt-3 w-full" arrow>Today&rsquo;s challenge</ButtonLink>
      </Card>
    </Page>
  );
}

export default function Overview() {
  const { challenge: c, work, begin } = useChallenge();
  const { me } = useAuth();
  const navigate = useNavigate();
  const [difficulty, setDifficulty] = useState<Difficulty>(work.difficulty ?? me?.profile.preferred_difficulty ?? "moderate");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (work.difficulty) setDifficulty(work.difficulty);
    else if (me?.profile.preferred_difficulty) setDifficulty(me.profile.preferred_difficulty);
  }, [work.difficulty, me?.profile.preferred_difficulty]);

  if (work.status === "submitted") return <Navigate to={`/c/${c.number}/evaluation`} replace />;
  if (!c.is_open) return <Closed />;

  const start = async () => {
    setBusy(true);
    setError(null);
    try {
      await begin(difficulty);
      navigate(`/c/${c.number}/story/${work.status === "active" ? work.cardPosition : 1}`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't start the challenge. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Page>
      <TopBar back="/" />
      <header className="text-center">
        <Globe className="mx-auto text-bronze" size={28} strokeWidth={1.5} aria-hidden />
        <h1 className="mt-1 text-[2rem] leading-tight">Today&rsquo;s Global Challenge</h1>
        <p className="mx-auto mt-1 max-w-[16rem] text-[0.95rem]">A new challenge. The same for everyone today.</p>
      </header>
      <div className="mt-5"><ChallengePreview c={c} compact kindLabel={!c.scenario_note} /></div>
      {c.scenario_note && <p className="mx-auto mt-1 max-w-sm text-center text-xs italic text-muted">{SCENARIO_LABEL[c.scenario_kind]}: {c.scenario_note}</p>}

      <div className="mt-6">
        <DifficultyPicker value={difficulty} onChange={setDifficulty} expectations={c.expectations} />
      </div>
      {error && <ErrorNote className="mt-4" message={error} />}
      <Button size="lg" arrow busy={busy} className="mt-6 w-full" onClick={start}>
        {work.status === "active" ? "Continue Challenge" : "Begin Challenge"}
      </Button>
      <p className="mt-3 text-center text-xs text-muted">{openUntil(c.closes_at)}.</p>
      {work.mode === "guest" && (
        <p className="mt-2 text-center text-xs text-muted">No account needed to explore and write. Sign in when you&rsquo;re ready to submit; your work comes with you.</p>
      )}
    </Page>
  );
}

/** /c/:n/continue: go wherever this person left off. */
export function Continue() {
  const { challenge: c, work } = useChallenge();
  if (work.status === "submitted") return <Navigate to={`/c/${c.number}/evaluation`} replace />;
  if (work.status !== "active" || !c.is_open) return <Navigate to={`/c/${c.number}`} replace />;
  if (work.briefingDone) return <Navigate to={`/c/${c.number}/write`} replace />;
  return <Navigate to={`/c/${c.number}/story/${work.cardPosition}`} replace />;
}
