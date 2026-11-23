import { Check, ChevronDown, CloudOff, FileText, Loader, Lock, PenLine } from "lucide-react";
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Navigate, useNavigate } from "react-router";
import { Button, ButtonLink, Dialog, ErrorNote, Notice, Page, TopBar } from "../components/ui.tsx";
import { ApiError } from "../lib/api.ts";
import { useChallenge } from "../lib/challenge.tsx";
import { backup, guest, readLocal, removeLocal, writeLocal } from "../lib/local.ts";
import { DIFFICULTY_LABEL, LENGTH_GUIDE, MIN_WORDS, newKey, openUntil, wordCount } from "../lib/text.ts";
import { BriefContent } from "./Brief.tsx";

type SaveState = "idle" | "saving" | "saved" | "local" | "error" | "closed";

const STRONG = [
  "States a clear recommendation or solution.",
  "Explains the reasoning behind it.",
  "Supports its claims with evidence from your research.",
  "Considers the main alternatives and trade-offs.",
  "Is honest about what remains uncertain.",
];

function SaveStatus({ state, mode }: { state: SaveState; mode: "guest" | "account" }) {
  const map: Record<SaveState, [ReactNode, string]> = {
    idle: [null, ""],
    saving: [<Loader key="i" size={14} className="animate-spin" />, "Saving…"],
    saved: [<Check key="i" size={14} />, mode === "guest" ? "Saved on this device" : "Saved"],
    local: [<CloudOff key="i" size={14} />, "Saved on this device. Will sync when you're back online."],
    error: [<CloudOff key="i" size={14} />, "Couldn't save to your account. A copy is kept on this device."],
    closed: [<Lock key="i" size={14} />, "This challenge has closed. Your writing is kept on this device."],
  };
  const [icon, text] = map[state];
  return <span className="inline-flex items-center gap-1.5" role="status" aria-live="polite">{icon}{text}</span>;
}

export default function Write({ kind = "initial" }: { kind?: "initial" | "revision" }) {
  const { challenge: c, work, saveDraft, submit } = useChallenge();
  const navigate = useNavigate();
  const attempt = work.attempt;
  const scope = attempt ? attempt.id : `guest-${c.number}`;
  const initialSub = attempt?.submissions.find(s => s.kind === "initial");
  const revisionSub = attempt?.submissions.find(s => s.kind === "revision");

  // Start from the newest copy: the server's draft, this device's backup, or a draft written
  // before signing in that hasn't finished moving to the account yet.
  const startText = useMemo(() => {
    if (work.mode === "guest" || !attempt) return work.guestAttempt?.draft ?? "";
    const copies: { body: string; at: number }[] = [];
    const server = attempt.drafts[kind];
    if (server) copies.push({ body: server.body, at: Date.parse(server.updated_at) });
    const local = backup.get(scope, kind);
    if (local) copies.push({ body: local.body, at: Date.parse(local.saved_at) });
    const device = kind === "initial" ? guest.get(c.number) : null;
    if (device) copies.push({ body: device.draft, at: Date.parse(device.draft_saved_at ?? device.started_at) });
    const newest = copies.filter(x => x.body.trim()).sort((x, y) => y.at - x.at)[0];
    if (newest) return newest.body;
    return kind === "revision" ? initialSub?.body ?? "" : "";
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt?.id, kind]);

  const [text, setText] = useState(startText);
  const [save, setSave] = useState<SaveState>("idle");
  const [briefOpen, setBriefOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [signInOpen, setSignInOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const pending = useRef<string | null>(null);
  const area = useRef<HTMLTextAreaElement>(null);

  const flush = useCallback(async () => {
    window.clearTimeout(timer.current);
    const body = pending.current;
    if (body === null) return;
    pending.current = null;
    setSave("saving");
    try {
      await saveDraft(kind, body);
      setSave("saved");
    } catch (e) {
      setSave(e instanceof ApiError && e.code === "network" ? "local" : e instanceof ApiError && e.code === "challenge_closed" ? "closed" : "error");
      if (pending.current === null) pending.current = body; // retry with the next change or on leaving
    }
  }, [saveDraft, kind]);

  // If a change hasn't reached the server when the person leaves, send it.
  useEffect(() => {
    const onHide = () => { void flush(); };
    window.addEventListener("pagehide", onHide);
    document.addEventListener("visibilitychange", onHide);
    return () => {
      window.removeEventListener("pagehide", onHide);
      document.removeEventListener("visibilitychange", onHide);
      void flush();
    };
  }, [flush]);

  // A taller box as the response grows.
  useEffect(() => {
    const el = area.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.max(el.scrollHeight, window.innerHeight * 0.42)}px`;
  }, [text]);

  const words = wordCount(text);
  const difficulty = work.difficulty ?? "moderate";
  const guide = LENGTH_GUIDE[difficulty];

  if (work.status === "none") return <Navigate to={`/c/${c.number}`} replace />;
  if (kind === "initial" && work.status === "submitted") return <Navigate to={`/c/${c.number}/evaluation`} replace />;
  if (kind === "revision" && (revisionSub || initialSub?.evaluation?.status !== "complete" || !c.is_open)) return <Navigate to={`/c/${c.number}/evaluation`} replace />;

  // The challenge closed before this was submitted: the draft is kept, read-only.
  if (work.status === "expired") {
    return (
      <Page>
        <TopBar back={`/c/${c.number}`} center={<span className="eyebrow">Unfinished draft</span>} />
        <h1 className="text-center text-[2rem] leading-tight">{c.title}</h1>
        <p className="text-center text-sm text-muted">Day {c.number} · {DIFFICULTY_LABEL[difficulty]}</p>
        <Notice className="mt-5 flex gap-2">
          <Lock size={16} className="mt-0.5 shrink-0 text-bronze" aria-hidden />
          <span>This challenge closed before your response was submitted. Your draft is kept here to reread; it can&rsquo;t be submitted now.</span>
        </Notice>
        <article className="mt-4 rounded-2xl border border-line bg-card/80 px-4 py-4 text-[1.02rem] leading-relaxed" aria-label="Your draft">
          {text.trim() ? text.split(/\n\s*\n/).map((p, i) => <p key={i} className="prose-response mt-3 first:mt-0">{p}</p>)
            : <p className="text-muted">This draft is empty.</p>}
        </article>
        <ButtonLink to="/" className="mt-5 w-full" arrow>Today&rsquo;s challenge</ButtonLink>
      </Page>
    );
  }

  const onChange = (v: string) => {
    setText(v);
    if (work.mode === "account" && attempt) backup.set(scope, kind, v);
    pending.current = v;
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => { void flush(); }, work.mode === "guest" ? 300 : 1200);
  };

  const keyName = `dc.submitkey.${scope}.${kind}`;
  const doSubmit = async () => {
    setSubmitting(true);
    setSubmitError(null);
    // The same key for retries of this submission, even after a refresh: the server returns the
    // existing submission instead of creating a second one.
    let key = readLocal<string>(keyName);
    if (!key) {
      key = newKey();
      writeLocal(keyName, key);
    }
    try {
      await flush();
      await submit(kind, text, key);
      backup.clear(scope, kind);
      removeLocal(keyName);
      navigate(`/c/${c.number}/evaluation${kind === "revision" ? "?v=revision" : ""}`, { replace: true });
    } catch (e) {
      setSubmitError(e instanceof ApiError ? e.message : "Couldn't submit. Your writing is saved; please try again.");
      setSubmitting(false);
    }
  };

  const shortWarning = words < guide.min;
  const longNote = words > guide.max * 1.6;
  const feedback = initialSub?.evaluation?.feedback;

  return (
    <Page>
      <TopBar back={kind === "revision" ? `/c/${c.number}/evaluation` : `/c/${c.number}/brief`}
        center={<span className="eyebrow">{kind === "revision" ? "Revision" : "Your response"}</span>}
        right={<button type="button" onClick={() => setBriefOpen(true)} className="inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 text-bronze hover:bg-paper-deep">
          <FileText size={17} /> Brief
        </button>} />

      <header className="mt-1">
        <h1 className="text-center text-[2.05rem] leading-tight">{kind === "revision" ? "Revise Your Response" : "Present Your Decision"}</h1>
        <p className="mt-1 text-center text-sm text-muted">Day {c.number} · {c.title} · {DIFFICULTY_LABEL[difficulty]}</p>
      </header>

      {kind === "revision" && feedback && (
        <details className="mt-4 rounded-2xl border border-line bg-card/70 px-4 py-3 text-sm">
          <summary className="flex cursor-pointer list-none items-center justify-between font-semibold text-ink">
            Feedback on your first version <ChevronDown size={16} aria-hidden />
          </summary>
          <p className="mt-2 font-semibold text-ink">Consider further</p>
          <ul className="list-disc pl-5">{feedback.consider_further.map(x => <li key={x}>{x}</li>)}</ul>
          <p className="mt-2 font-semibold text-ink">To keep growing</p>
          <p>{feedback.keep_growing}</p>
        </details>
      )}

      <details className="mt-4 rounded-2xl border border-line bg-card/70 px-4 py-3 text-sm">
        <summary className="flex cursor-pointer list-none items-center justify-between font-semibold text-ink">
          What a strong response does <ChevronDown size={16} aria-hidden />
        </summary>
        <ul className="mt-2 list-disc space-y-1 pl-5 marker:text-bronze">{STRONG.map(s => <li key={s}>{s}</li>)}</ul>
        <p className="mt-2 text-muted">Use your own words and structure. These are expectations, not required headings.</p>
      </details>

      <div className="mt-4 rounded-2xl border border-line bg-card/90 focus-within:border-bronze">
        <label htmlFor="response" className="sr-only">Your response</label>
        <textarea id="response" ref={area} value={text} onChange={e => onChange(e.target.value)} spellCheck
          placeholder="Explain your recommendation, your reasoning, the evidence that supports it, and the trade-offs you expect…"
          className="block w-full resize-none rounded-2xl bg-transparent px-4 py-4 text-[1.05rem] leading-relaxed text-ink placeholder:text-muted/70 focus:outline-none"
          maxLength={30000} />
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line-soft px-4 py-2 text-xs text-muted">
          <SaveStatus state={save} mode={work.mode} />
          <span aria-live="polite">{words} {words === 1 ? "word" : "words"} · suggested {guide.min}–{guide.max}</span>
        </div>
      </div>
      <p className="mt-2 text-center text-xs text-muted">{openUntil(c.closes_at)}. {kind === "revision" ? "Your revision" : "Your response"} must be submitted while the challenge is open.</p>

      {work.mode === "guest" && (
        <Notice className="mt-3">Your writing is saved on this device. Sign in to submit it for evaluation; it moves to your account.</Notice>
      )}

      <Button size="lg" className="mt-5 w-full" icon={PenLine} disabled={!text.trim()}
        onClick={() => (work.mode === "guest" ? setSignInOpen(true) : setConfirmOpen(true))}>
        Submit for Review
      </Button>

      <Dialog open={briefOpen} onClose={() => setBriefOpen(false)} title="Mission Brief">
        <BriefContent c={c} difficulty={difficulty} />
      </Dialog>

      <Dialog open={signInOpen} onClose={() => setSignInOpen(false)} title="Create a free account to submit"
        footer={<ButtonLink to={`/signin?next=${encodeURIComponent(`/c/${c.number}/write`)}`} onClick={() => void flush()}>Sign in or create an account</ButtonLink>}>
        <p>Evaluations, your progress and sharing with the community need an account. It only takes an email address; no password.</p>
        <p className="mt-2 text-sm text-muted">Your draft stays on this device and moves to your account when you sign in.</p>
      </Dialog>

      <Dialog open={confirmOpen} onClose={() => !submitting && setConfirmOpen(false)} title={kind === "revision" ? "Submit your revision?" : "Submit for review?"}
        footer={
          <>
            <Button onClick={doSubmit} busy={submitting} disabled={words < MIN_WORDS} data-autofocus>
              {kind === "revision" ? "Submit Revision" : "Submit for Review"}
            </Button>
            <Button variant="secondary" onClick={() => setConfirmOpen(false)} disabled={submitting}>Keep writing</Button>
          </>
        }>
        <p>
          {words} words at <strong className="font-semibold text-ink">{DIFFICULTY_LABEL[difficulty]}</strong>.{" "}
          {kind === "revision"
            ? "This is your one revision. It will be evaluated with the same standard, and both versions are kept."
            : "Once submitted, this version can't be edited. You'll get feedback and can revise once."}
        </p>
        {words < MIN_WORDS && <ErrorNote className="mt-3" message={`Write at least ${MIN_WORDS} words so there's enough to evaluate.`} />}
        {words >= MIN_WORDS && shortWarning && (
          <Notice className="mt-3">This is shorter than the suggested {guide.min}–{guide.max} words. Concise is fine if it&rsquo;s well reasoned, but a very short response may be hard to evaluate fully.</Notice>
        )}
        {longNote && <Notice className="mt-3">This is longer than suggested. That&rsquo;s fine; length isn&rsquo;t rewarded for its own sake.</Notice>}
        {submitError && <ErrorNote className="mt-3" message={submitError} />}
      </Dialog>
    </Page>
  );
}
