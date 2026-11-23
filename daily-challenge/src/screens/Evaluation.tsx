import { ChartColumn, ChevronDown, Globe, PenLine, RotateCcw, Share2, Sprout, ThumbsUp, Users } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, Navigate, useSearchParams } from "react-router";
import { CATEGORY_META } from "../components/icons.tsx";
import { Laurel } from "../components/Laurel.tsx";
import { Button, ButtonLink, Card, cx, ErrorNote, Field, inputClass, Notice, Page, Spinner, TopBar } from "../components/ui.tsx";
import { api, ApiError } from "../lib/api.ts";
import { useAuth } from "../lib/auth.tsx";
import { useChallenge } from "../lib/challenge.tsx";
import { DIFFICULTY_LABEL, formatDate, paragraphs } from "../lib/text.ts";
import type { Category, EvaluationRecord, Submission } from "../lib/types.ts";

const CATS: Category[] = ["understanding", "reasoning", "clarity", "organization"];

export function ScoreMeters({ e, compare }: { e: EvaluationRecord; compare?: EvaluationRecord | null }) {
  return (
    <ul className="space-y-3.5">
      {CATS.map(k => {
        const meta = CATEGORY_META[k];
        const Icon = meta.icon;
        const v = e[k] ?? 0;
        const before = compare?.[k];
        const rationale = e.feedback?.rationales?.[k];
        return (
          <li key={k}>
            <details className="group">
              <summary className="flex cursor-pointer list-none items-center gap-3">
                <Icon size={22} strokeWidth={1.5} className="shrink-0 text-ink" aria-hidden />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="font-serif text-[1.08rem] text-ink">{meta.label}</span>
                    <span className="font-serif text-[1.25rem] font-semibold text-ink">
                      {v}
                      {before != null && before !== v && (
                        <span className="ml-1.5 align-middle font-sans text-xs font-semibold text-muted">{v > before ? "+" : "−"}{Math.abs(v - before)}</span>
                      )}
                    </span>
                  </div>
                  <div className="mt-1 h-2 overflow-hidden rounded-full bg-bronze-wash" aria-hidden>
                    <div className="bar-grow h-full rounded-full bg-bronze" style={{ width: `${v}%` }} />
                  </div>
                </div>
                {rationale && <ChevronDown size={16} className="shrink-0 text-muted transition group-open:rotate-180" aria-hidden />}
              </summary>
              {rationale && <p className="ml-[2.1rem] mt-1.5 text-sm text-ink-soft">{rationale}</p>}
            </details>
          </li>
        );
      })}
    </ul>
  );
}

function FeedbackBlock({ e }: { e: EvaluationRecord }) {
  const f = e.feedback;
  if (!f) return null;
  return (
    <div className="space-y-4">
      {f.summary && <p className="font-serif text-[1.15rem] leading-snug text-ink">{f.summary}</p>}
      <section>
        <h3 className="flex items-center gap-2 text-[1.2rem]"><ThumbsUp size={18} className="text-bronze" aria-hidden /> What You Did Well</h3>
        <ul className="mt-1 list-disc space-y-1.5 pl-5 marker:text-bronze">{f.did_well.map(x => <li key={x}>{x}</li>)}</ul>
      </section>
      <section>
        <h3 className="flex items-center gap-2 text-[1.2rem]"><PenLine size={18} className="text-bronze" aria-hidden /> Consider Further</h3>
        <ul className="mt-1 list-disc space-y-1.5 pl-5 marker:text-bronze">{f.consider_further.map(x => <li key={x}>{x}</li>)}</ul>
      </section>
      {f.factual_concerns && f.factual_concerns.length > 0 && (
        <section>
          <h3 className="text-[1.1rem]">Facts to check</h3>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-sm">{f.factual_concerns.map(x => <li key={x}>{x}</li>)}</ul>
        </section>
      )}
      <section className="rounded-xl bg-bronze-wash/60 px-4 py-3">
        <h3 className="flex items-center gap-2 text-[1.2rem]"><Sprout size={18} className="text-bronze" aria-hidden /> To Keep Growing</h3>
        <p className="mt-1">{f.keep_growing}</p>
      </section>
    </div>
  );
}

function ResponseText({ s }: { s: Submission }) {
  return (
    <details className="rounded-2xl border border-line bg-card/70 px-4 py-3">
      <summary className="flex cursor-pointer list-none items-center justify-between font-semibold text-ink">
        Your {s.kind === "revision" ? "revised " : ""}response ({s.word_count} words) <ChevronDown size={16} aria-hidden />
      </summary>
      <div className="mt-3 space-y-3 text-[0.98rem] leading-relaxed">
        {paragraphs(s.body).map((p, i) => <p key={i} className="prose-response">{p}</p>)}
      </div>
      <p className="mt-3 text-xs text-muted">Submitted {formatDate(s.created_at)} · {DIFFICULTY_LABEL[s.difficulty]}</p>
    </details>
  );
}

const POLL_MS = 4000;

/** Requests the evaluation if it has never been requested, and follows it until it finishes. */
function useEvaluation(s: Submission | undefined) {
  const { refresh } = useChallenge();
  const [error, setError] = useState<ApiError | null>(null);
  const [working, setWorking] = useState(false);
  const requested = useRef<string | null>(null);

  const run = useCallback(async () => {
    if (!s) return;
    setError(null);
    setWorking(true);
    try {
      const status = await api.evaluate(s.id);
      if (status === "complete") await refresh();
      else {
        // another request is already evaluating it: wait for that one
        for (let i = 0; i < 45; i++) {
          await new Promise(r => setTimeout(r, POLL_MS));
          const a = await refresh();
          const e = a?.submissions.find(x => x.id === s.id)?.evaluation;
          if (e && e.status !== "pending") break;
        }
      }
    } catch (e) {
      setError(e instanceof ApiError ? e : new ApiError("server", "Something went wrong. Your response is saved; please try again."));
      await refresh().catch(() => null);
    } finally {
      setWorking(false);
    }
  }, [s, refresh]);

  useEffect(() => {
    if (!s || requested.current === s.id) return;
    // Only ever start automatically when no evaluation exists yet; a failure waits for the person to retry.
    if (!s.evaluation || s.evaluation.status === "pending") {
      requested.current = s.id;
      void run();
    }
  }, [s, run]);

  return { error, working, retry: run };
}

function ShareCard() {
  const { work, setAttempt } = useChallenge();
  const { me, refreshMe } = useAuth();
  const a = work.attempt!;
  const [name, setName] = useState(me?.profile.display_name ?? "");
  const [title, setTitle] = useState("");
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const latest = a.submissions[a.submissions.length - 1];
  const act = async (fn: () => Promise<typeof a>) => {
    setBusy(true);
    setError(null);
    try {
      setAttempt(await fn());
      setOpen(false);
      void refreshMe();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't update sharing. Please try again.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card className="px-4 py-4">
      <div className="flex items-center gap-2">
        <Share2 size={18} className="text-bronze" aria-hidden />
        <h2 className="text-[1.25rem]">Share with the community</h2>
      </div>
      {a.shared ? (
        <>
          <p className="mt-1.5 text-sm">
            Shared as <strong className="font-semibold text-ink">{a.shared.display_name}</strong>
            {a.shared.title ? <>: &ldquo;{a.shared.title}&rdquo;</> : null}. Your scores and feedback stay private.
            {a.shared.hidden && <span className="block text-danger">Hidden while reports are reviewed.</span>}
          </p>
          {latest && latest.id !== a.shared.submission_id && (
            <Button variant="secondary" className="mt-3 w-full" busy={busy} onClick={() => act(() => api.publish(a.id, a.shared!.display_name, a.shared!.title))}>
              Share your revised version instead
            </Button>
          )}
          <Button variant="ghost" className="mt-2 w-full" busy={busy} onClick={() => act(() => api.unpublish(a.id))}>Remove from the community</Button>
        </>
      ) : !open ? (
        <>
          <p className="mt-1.5 text-sm">Your response is private. You can share it under a name of your choosing so others can learn from your approach. Scores and feedback are never shared.</p>
          <Button variant="secondary" className="mt-3 w-full" onClick={() => setOpen(true)}>Share my response…</Button>
        </>
      ) : (
        <form className="mt-3 space-y-3" onSubmit={e => { e.preventDefault(); void act(() => api.publish(a.id, name.trim(), title.trim())); }}>
          <Field label="Display name" hint="A pseudonym is fine. Shown with your response.">
            {id => <input id={id} className={inputClass} value={name} onChange={e => setName(e.target.value)} maxLength={40} required minLength={2} autoComplete="nickname" />}
          </Field>
          <Field label="Title for your approach (optional)" hint={`For example: "Health now, supply in stages"`}>
            {id => <input id={id} className={inputClass} value={title} onChange={e => setTitle(e.target.value)} maxLength={80} />}
          </Field>
          <p className="text-xs text-muted">You can remove it at any time.</p>
          <div className="flex gap-2">
            <Button type="submit" busy={busy} className="flex-1">Share publicly</Button>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          </div>
        </form>
      )}
      {error && <ErrorNote className="mt-3" message={error} />}
    </Card>
  );
}

export default function Evaluation() {
  const { challenge: c, work } = useChallenge();
  const [params, setParams] = useSearchParams();
  const a = work.attempt;
  const initial = a?.submissions.find(s => s.kind === "initial");
  const revision = a?.submissions.find(s => s.kind === "revision");
  const showing = params.get("v") === "revision" && revision ? revision : params.get("v") === "initial" ? initial : revision ?? initial;
  const { error, working, retry } = useEvaluation(showing);

  if (!a || !initial) return <Navigate to={work.status === "none" ? `/c/${c.number}` : `/c/${c.number}/write`} replace />;
  const e = showing?.evaluation ?? null;
  const pending = working || e?.status === "pending" || (!e && !error);
  const other = showing?.kind === "revision" ? initial.evaluation : null;

  return (
    <Page>
      <TopBar back="/" center={<span className="eyebrow">Day {c.number}</span>} />
      <h1 className="text-center text-[2.2rem] leading-tight">Your Evaluation</h1>
      <p className="text-center text-sm text-muted">{c.title} · {DIFFICULTY_LABEL[showing!.difficulty]}</p>

      {revision && (
        <div className="mx-auto mt-4 grid w-full max-w-xs grid-cols-2 rounded-full border border-line bg-card p-1 text-sm font-semibold" role="tablist" aria-label="Version">
          {([["initial", "First version"], ["revision", "Revision"]] as const).map(([v, label]) => (
            <button key={v} type="button" role="tab" aria-selected={showing?.kind === v} onClick={() => setParams({ v }, { replace: true })}
              className={cx("min-h-10 rounded-full", showing?.kind === v ? "bg-button text-[#f8f1e6]" : "text-ink")}>{label}</button>
          ))}
        </div>
      )}

      {pending && (
        <div className="mt-10 text-center">
          <Spinner label="Reading your response carefully" />
          <p className="mx-auto max-w-xs text-sm text-muted">This usually takes under a minute. You can leave this page; the evaluation will be waiting when you come back.</p>
        </div>
      )}

      {!pending && (error || e?.status === "failed") && (
        <div className="mt-8 space-y-3">
          <ErrorNote message={error?.message ?? "The last evaluation attempt didn't succeed. Your response is saved."} />
          {(error?.retryable ?? true) && error?.code !== "not_configured" && (
            <Button className="w-full" icon={RotateCcw} onClick={retry}>Try the evaluation again</Button>
          )}
          {error?.retryAfter && <p className="text-center text-xs text-muted">You can try again in about {Math.ceil(error.retryAfter / 60)} minutes.</p>}
        </div>
      )}

      {!pending && e?.status === "complete" && e.overall != null && (
        <div className="anim-fade">
          <div className="mt-5">
            <Laurel>
              <p className="font-serif text-[3.6rem] font-semibold leading-none text-ink">{e.overall}</p>
              <p className="mt-1 font-serif text-lg text-muted">/ 100</p>
            </Laurel>
            {other?.overall != null && (
              <p className="mt-2 text-center text-sm text-ink">
                First version {other.overall} → revision {e.overall}{" "}
                <strong className="font-semibold">({e.overall - other.overall >= 0 ? "+" : "−"}{Math.abs(e.overall - other.overall)})</strong>
              </p>
            )}
          </div>
          <div className="mt-6"><ScoreMeters e={e} compare={other} /></div>
          <p className="mt-3 text-center text-xs text-muted">The overall score is the average of the four. Tap a category for the reason behind it.</p>

          <Card className="mt-6 px-4 py-4"><FeedbackBlock e={e} /></Card>

          <Notice className="mt-4 text-xs">
            {e.provider === "test"
              ? "Evaluated by the built-in test evaluator, not an AI model. This happens only on development servers."
              : "This is an AI's reading of one response: a guide for your growth, not a verdict. Scores are judgements and can vary; the feedback matters more than the number."}
          </Notice>

          <div className="mt-6 flex flex-col gap-3">
            {showing?.kind === "initial" && !revision && c.is_open && (
              <>
                <ButtonLink to={`/c/${c.number}/revise`} variant="primary" size="lg" arrow>Revise Your Response</ButtonLink>
                <p className="-mt-1 text-center text-xs text-muted">Optional. You can revise once, while the challenge is open; both versions are kept.</p>
              </>
            )}
            <ButtonLink to={`/c/${c.number}/community`} variant="secondary" className="w-full"><Users size={18} /> See how others approached it</ButtonLink>
            <ButtonLink to={`/c/${c.number}/results`} variant="secondary" className="w-full"><Globe size={18} /> Global results</ButtonLink>
          </div>
        </div>
      )}

      <div className="mt-6 space-y-4">
        {showing && <ResponseText s={showing} />}
        {!pending && (initial.evaluation?.status === "complete" || a.shared) && <ShareCard />}
        <div className="flex justify-center gap-5 text-sm">
          <Link to={`/c/${c.number}/brief`} className="font-semibold text-bronze">Mission brief</Link>
          <Link to="/progress" className="inline-flex items-center gap-1 font-semibold text-bronze"><ChartColumn size={15} /> Your progress</Link>
        </div>
      </div>
    </Page>
  );
}
