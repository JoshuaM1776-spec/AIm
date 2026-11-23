import { Flag, Lock, Users } from "lucide-react";
import { useEffect, useState } from "react";
import { Button, ButtonLink, Card, cx, Dialog, ErrorNote, Field, inputClass, Notice, Page, Spinner, TopBar } from "../components/ui.tsx";
import { api, ApiError } from "../lib/api.ts";
import { useAuth } from "../lib/auth.tsx";
import { useChallenge } from "../lib/challenge.tsx";
import { DIFFICULTY_LABEL, paragraphs } from "../lib/text.ts";
import type { CommunityItem } from "../lib/types.ts";

const REASONS = [
  ["abusive", "Abusive or hateful"],
  ["spam", "Spam or off-topic"],
  ["personal_information", "Shares someone's personal information"],
  ["plagiarism", "Copied from someone else"],
  ["other", "Something else"],
] as const;

function ResponseCard({ item, onReport }: { item: CommunityItem; onReport: (i: CommunityItem) => void }) {
  const [open, setOpen] = useState(false);
  const paras = paragraphs(item.body);
  const excerpt = item.body.length > 260 ? `${item.body.slice(0, 260).replace(/\s+\S*$/, "")}…` : item.body;
  return (
    <Card as="article" className="px-4 py-4">
      {item.selected_label && <p className="eyebrow">{item.selected_label}</p>}
      <h2 className="mt-0.5 text-[1.3rem] leading-snug">{item.title || "Untitled approach"}</h2>
      <p className="mt-0.5 text-xs text-muted">
        {item.is_sample ? <span className="mr-1 rounded-full border border-bronze-soft px-2 py-0.5 font-semibold text-bronze">Sample</span> : null}
        {item.is_sample ? "Written to illustrate one approach" : <>by {item.display_name}{item.is_mine ? " (you)" : ""}</>}
        {item.difficulty ? ` · ${DIFFICULTY_LABEL[item.difficulty]}` : ""} · {item.word_count} words
      </p>
      <div className="mt-2.5 space-y-2.5 text-[0.97rem] leading-relaxed">
        {open ? paras.map((p, i) => <p key={i} className="prose-response">{p}</p>) : <p className="prose-response">{excerpt}</p>}
      </div>
      <div className="mt-2 flex items-center justify-between">
        {item.body.length > 260 ? (
          <button type="button" onClick={() => setOpen(o => !o)} className="min-h-10 font-semibold text-bronze" aria-expanded={open}>
            {open ? "Show less" : "Read the full response"}
          </button>
        ) : <span />}
        {!item.is_mine && !item.is_sample && (
          item.reported_by_me
            ? <span className="text-xs text-muted">Reported</span>
            : <button type="button" onClick={() => onReport(item)} className="inline-flex min-h-10 items-center gap-1 text-xs text-muted hover:text-danger" aria-label={`Report the response by ${item.display_name}`}>
                <Flag size={14} /> Report
              </button>
        )}
      </div>
    </Card>
  );
}

export default function Community() {
  const { challenge: c, work } = useChallenge();
  const { session } = useAuth();
  const [tab, setTab] = useState<"selected" | "all">("selected");
  const [items, setItems] = useState<CommunityItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | null>(null);
  const [reporting, setReporting] = useState<CommunityItem | null>(null);
  const [reason, setReason] = useState<string>("abusive");
  const [details, setDetails] = useState("");
  const [reportBusy, setReportBusy] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);
  const submitted = work.status === "submitted";

  const load = async (t: typeof tab, offset = 0) => {
    setLoading(true);
    setError(null);
    try {
      const r = await api.community(c.number, t, offset);
      setItems(prev => (offset ? [...prev, ...r.items] : r.items));
      setTotal(r.total);
    } catch (e) {
      setError(e instanceof ApiError ? e : new ApiError("unknown", "Couldn't load responses."));
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    if (session && submitted) void load(tab);
    else setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, session, submitted]);

  const sendReport = async () => {
    if (!reporting) return;
    setReportBusy(true);
    setReportError(null);
    try {
      await api.report(reporting.id, reason, details);
      setItems(list => list.map(i => (i.id === reporting.id ? { ...i, reported_by_me: true } : i)));
      setReporting(null);
      setDetails("");
    } catch (e) {
      setReportError(e instanceof ApiError ? e.message : "Couldn't send the report.");
    } finally {
      setReportBusy(false);
    }
  };

  const locked = !session || !submitted;
  return (
    <Page>
      <TopBar back={submitted ? `/c/${c.number}/evaluation` : "/"} />
      <header className="text-center">
        <Users className="mx-auto text-bronze" size={30} strokeWidth={1.5} aria-hidden />
        <h1 className="mt-1 text-[2.2rem] leading-tight">The Community</h1>
        <p className="mt-1">See how others approached {submitted ? "this" : "today’s"} challenge.</p>
        <p className="text-sm text-muted">Day {c.number} · {c.title}</p>
      </header>

      {locked ? (
        <Card className="mt-6 px-5 py-6 text-center">
          <Lock className="mx-auto text-bronze" size={26} strokeWidth={1.5} aria-hidden />
          <p className="mt-2 font-serif text-xl text-ink">Form your own view first</p>
          <p className="mt-1 text-sm">Others&rsquo; responses open once you&rsquo;ve submitted yours, so everyone&rsquo;s first thinking is their own.</p>
          <ButtonLink to={!c.is_open ? "/" : work.status === "active" ? `/c/${c.number}/continue` : `/c/${c.number}`} className="mt-4 w-full" arrow>
            {!c.is_open ? "Today\u2019s challenge" : work.status === "active" ? "Continue the challenge" : "Take on the challenge"}
          </ButtonLink>
        </Card>
      ) : (
        <>
          <div className="mt-5 grid grid-cols-2 rounded-full border border-line bg-card p-1 text-[0.95rem] font-semibold" role="tablist" aria-label="Which responses">
            {([["selected", "Selected Approaches"], ["all", "All Responses"]] as const).map(([t, label]) => (
              <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => setTab(t)}
                className={cx("min-h-11 rounded-full", tab === t ? "bg-button text-[#f8f1e6]" : "text-ink")}>{label}</button>
            ))}
          </div>
          <p className="mt-3 text-center text-xs text-muted">
            {tab === "selected"
              ? "Chosen to show meaningfully different lines of reasoning, not the highest scores. None is the one right answer."
              : "Responses people chose to share, newest first. Scores are never shown."}
          </p>
          {items.some(i => i.is_sample) && (
            <Notice className="mt-3 text-xs">Responses marked <strong>Sample</strong> were written by the Daily Challenge team to illustrate different approaches until more people share theirs.</Notice>
          )}
          <div className="mt-4 space-y-3">
            {items.map(i => <ResponseCard key={i.id} item={i} onReport={setReporting} />)}
          </div>
          {loading && <Spinner />}
          {error && <ErrorNote className="mt-3" message={error.message} onRetry={() => load(tab)} />}
          {!loading && !error && items.length === 0 && (
            <Card className="mt-2 px-4 py-6 text-center text-sm">
              {tab === "selected" ? "No approaches have been selected for this challenge yet." : "Nobody has shared a response yet. You could be the first."}
            </Card>
          )}
          {!loading && tab === "all" && items.length < total && (
            <Button variant="secondary" className="mt-4 w-full" onClick={() => load(tab, items.length)}>Show more</Button>
          )}
          {work.attempt && !work.attempt.shared && (
            <ButtonLink to={`/c/${c.number}/evaluation`} variant="ghost" className="mt-5">Share your own response</ButtonLink>
          )}
        </>
      )}

      <Dialog open={Boolean(reporting)} onClose={() => setReporting(null)} title="Report this response"
        footer={<Button onClick={sendReport} busy={reportBusy}>Send report</Button>}>
        <fieldset>
          <legend className="text-sm">What&rsquo;s wrong with it?</legend>
          <div className="mt-2 space-y-1">
            {REASONS.map(([v, label]) => (
              <label key={v} className="flex min-h-10 items-center gap-3">
                <input type="radio" name="reason" value={v} checked={reason === v} onChange={() => setReason(v)} className="h-4 w-4 accent-[#8a5d33]" />
                {label}
              </label>
            ))}
          </div>
        </fieldset>
        <div className="mt-3">
          <Field label="Anything else? (optional)">
            {id => <textarea id={id} className={inputClass} rows={3} maxLength={500} value={details} onChange={e => setDetails(e.target.value)} />}
          </Field>
        </div>
        <p className="mt-2 text-xs text-muted">Reports are reviewed. A response reported by several people is hidden until then.</p>
        {reportError && <ErrorNote className="mt-3" message={reportError} />}
      </Dialog>
    </Page>
  );
}
