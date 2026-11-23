import { Globe } from "lucide-react";
import { useEffect, useState } from "react";
import { Navigate, useNavigate } from "react-router";
import { Button, ButtonLink, cx, Dialog, ErrorNote, Page, TopBar } from "../components/ui.tsx";
import { ApiError } from "../lib/api.ts";
import { useAuth } from "../lib/auth.tsx";
import { useChallenge } from "../lib/challenge.tsx";
import { DIFFICULTY_BLURB, DIFFICULTY_LABEL, LENGTH_GUIDE, SCENARIO_LABEL } from "../lib/text.ts";
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

export default function Overview() {
  const { challenge: c, work, conflict, clearConflict, begin } = useChallenge();
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
  const isToday = c.release_date === (me?.today ?? new Date().toISOString().slice(0, 10));

  const start = async (abandonActive = false) => {
    setBusy(true);
    setError(null);
    try {
      if (await begin(difficulty, abandonActive)) navigate(`/c/${c.number}/story/${work.status === "active" ? work.cardPosition : 1}`);
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
        <h1 className="mt-1 text-[2rem] leading-tight">{isToday ? "Today’s Global Challenge" : `Day ${c.number}`}</h1>
        <p className="mx-auto mt-1 max-w-[16rem] text-[0.95rem]">{isToday ? "A new challenge. The same for everyone today." : "An earlier challenge, still open to everyone."}</p>
      </header>
      <div className="mt-5"><ChallengePreview c={c} compact kindLabel={!c.scenario_note} /></div>
      {c.scenario_note && <p className="mx-auto mt-1 max-w-sm text-center text-xs italic text-muted">{SCENARIO_LABEL[c.scenario_kind]}: {c.scenario_note}</p>}

      <div className="mt-6">
        <DifficultyPicker value={difficulty} onChange={setDifficulty} expectations={c.expectations} />
      </div>
      {error && <ErrorNote className="mt-4" message={error} />}
      <Button size="lg" arrow busy={busy} className="mt-6 w-full" onClick={() => start(false)}>
        {work.status === "active" ? "Continue Challenge" : work.status === "abandoned" ? "Pick This Challenge Back Up" : "Begin Challenge"}
      </Button>
      {work.mode === "guest" && (
        <p className="mt-3 text-center text-xs text-muted">No account needed to explore and write. Sign in when you&rsquo;re ready to submit; your work comes with you.</p>
      )}

      <Dialog open={Boolean(conflict)} onClose={clearConflict} title="You have an unfinished challenge"
        footer={
          <>
            <Button onClick={() => start(true)} busy={busy}>Set it aside and begin Day {c.number}</Button>
            {conflict && conflict.number > 0 && <ButtonLink to={`/c/${conflict.number}/continue`} variant="secondary" onClick={clearConflict}>Continue Day {conflict.number} instead</ButtonLink>}
          </>
        }>
        <p>
          You started <strong className="font-semibold text-ink">{conflict ? `Day ${conflict.number}, ${conflict.title}` : "another challenge"}</strong> and haven&rsquo;t submitted it.
          You can work on one challenge at a time.
        </p>
        <p className="mt-2 text-sm text-muted">Setting it aside doesn&rsquo;t count as completing it. Your writing is kept, and you can pick it back up later.</p>
      </Dialog>
    </Page>
  );
}

/** /c/:n/continue: go wherever this person left off. */
export function Continue() {
  const { challenge: c, work } = useChallenge();
  if (work.status === "submitted") return <Navigate to={`/c/${c.number}/evaluation`} replace />;
  if (work.status !== "active") return <Navigate to={`/c/${c.number}`} replace />;
  if (work.briefingDone) return <Navigate to={`/c/${c.number}/write`} replace />;
  return <Navigate to={`/c/${c.number}/story/${work.cardPosition}`} replace />;
}
