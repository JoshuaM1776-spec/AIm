import { CalendarClock, Eye, Plus, Sparkles, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { Button, ButtonLink, Card, cx, Dialog, ErrorNote, Field, inputClass, Notice, Page, ScreenTitle, Spinner, TopBar } from "../../components/ui.tsx";
import { api, ApiError } from "../../lib/api.ts";
import { EDITORIAL_LABEL, formatDate, TYPE_LABEL } from "../../lib/text.ts";
import type { AdminChallengeRow } from "../../lib/types.ts";
import { useLoad } from "../../lib/useLoad.ts";

const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

const STATUS_STYLE = { draft: "border-line text-muted", published: "border-ok/40 text-ok", archived: "border-line text-muted line-through" } as const;
const EDITORIAL_STYLE = { approved: "text-ok", needs_revision: "text-bronze", pending_verification: "text-bronze", rejected: "text-danger" } as const;

const worthIt = (c: AdminChallengeRow) => {
  const f = c.feedback;
  if (!f?.count) return null;
  return Math.round(((f.ratings["4"] + f.ratings["3"]) / f.count) * 100);
};

/** Draft a challenge with AI, following the Challenge Creation & Quality Standard. */
function DraftWithAI({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const [direction, setDirection] = useState("");
  const [type, setType] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const draft = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await api.admin.generate(direction.trim(), type);
      navigate(`/admin/${r.id}`);
    } catch (e) {
      setError(e instanceof ApiError ? `${e.message}${e.detail ? ` (${e.detail})` : ""}` : "Drafting failed. Please try again.");
      setBusy(false);
    }
  };
  return (
    <Dialog open={open} onClose={() => !busy && onClose()} title="Draft a challenge with AI"
      footer={<Button onClick={draft} busy={busy} icon={Sparkles}>{busy ? "Drafting… this can take a minute or two" : "Draft a challenge"}</Button>}>
      <p className="text-sm">
        The AI follows the Challenge Creation &amp; Quality Standard: it weighs several concepts, builds the strongest, writes the story cards and the private
        evaluation guide, and scores its own draft. It avoids repeating your recent challenges.
      </p>
      <div className="mt-4 space-y-3">
        <Field label="Direction (optional)" hint="A field, theme or kind of problem to explore. Leave empty to let it choose.">
          {id => <textarea id={id} rows={3} maxLength={800} className={inputClass} value={direction} onChange={e => setDirection(e.target.value)}
            placeholder="For example: something connecting music and physics, set outside Europe" disabled={busy} />}
        </Field>
        <Field label="Challenge type">
          {id => (
            <select id={id} className={inputClass} value={type} onChange={e => setType(e.target.value)} disabled={busy}>
              <option value="">Let the AI choose</option>
              {Object.entries(TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          )}
        </Field>
      </div>
      <Notice className="mt-4 text-xs">
        The draft is saved as <strong>Pending fact verification</strong> and is never published automatically. You check its facts and sources, review it, and decide.
      </Notice>
      {error && <ErrorNote className="mt-3" message={error} />}
    </Dialog>
  );
}

export default function AdminList() {
  const { data, error, loading, reload } = useLoad(() => api.admin.list(), []);
  const [drafting, setDrafting] = useState(false);
  const upcomingGaps = data
    ? Array.from({ length: 7 }, (_, i) => addDays(data.today, i)).filter(d => !data.items.some(c => c.release_date === d && c.status === "published"))
    : [];
  return (
    <Page wide>
      <TopBar back="/profile" right={
        <div className="flex gap-2">
          <Button variant="secondary" icon={Sparkles} onClick={() => setDrafting(true)}>Draft with AI</Button>
          <ButtonLink to="/admin/new" size="md"><Plus size={17} /> New</ButtonLink>
        </div>
      } />
      <ScreenTitle title="Challenge Management" subtitle="Write or draft, verify, approve, schedule and publish. Ordinary users see one challenge at a time, from its UTC release date." />
      <p className="mt-2 text-center text-xs text-muted">Every challenge follows the Challenge Creation &amp; Quality Standard (docs/challenge-standard.md).</p>
      {loading && <Spinner />}
      {error && <ErrorNote className="mt-6" message={error.message} onRetry={reload} />}
      {data && (
        <>
          {upcomingGaps.length > 0 && (
            <Notice className="mt-5 flex gap-2">
              <TriangleAlert size={18} className="mt-0.5 shrink-0 text-bronze" aria-hidden />
              <span>
                No published challenge for {upcomingGaps.slice(0, 3).map(d => formatDate(d, { weekday: "short", day: "numeric", month: "short" })).join(", ")}
                {upcomingGaps.length > 3 ? ` and ${upcomingGaps.length - 3} more of the next 7 days` : ""}. On those days the current challenge stays open.
              </span>
            </Notice>
          )}
          <p className="mt-4 text-xs text-muted">Today (UTC): {formatDate(data.today, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</p>
          <ul className="mt-3 space-y-2">
            {data.items.map(c => {
              const live = c.status === "published" && c.release_date && c.release_date <= data.today;
              const worth = worthIt(c);
              return (
                <li key={c.id}>
                  <Card className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="eyebrow">Day {c.number} · {TYPE_LABEL[c.challenge_type]}{c.origin === "ai" ? " · AI draft" : ""}</p>
                      <Link to={`/admin/${c.id}`} className="font-serif text-[1.25rem] text-ink hover:underline">{c.title}</Link>
                      <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
                        <span className={cx("rounded-full border px-2 py-0.5 font-semibold", STATUS_STYLE[c.status])}>{c.status}</span>
                        <span className={cx("font-semibold", EDITORIAL_STYLE[c.editorial_status])}>{EDITORIAL_LABEL[c.editorial_status]}</span>
                        {c.release_date ? <span className="inline-flex items-center gap-1"><CalendarClock size={12} /> {formatDate(c.release_date)}{live ? " (live)" : ""}</span> : <span>No date</span>}
                        <span>{c.submissions} submitted</span>
                        {worth !== null && <span>{worth}% found it worth their time ({c.feedback.count})</span>}
                        {c.open_reports > 0 && <span className="font-semibold text-danger">{c.open_reports} open report{c.open_reports > 1 ? "s" : ""}</span>}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <ButtonLink to={`/admin/${c.id}/preview`} variant="ghost"><Eye size={16} /> Preview</ButtonLink>
                      <ButtonLink to={`/admin/${c.id}`} variant="secondary">Edit</ButtonLink>
                    </div>
                  </Card>
                </li>
              );
            })}
          </ul>
        </>
      )}
      <DraftWithAI open={drafting} onClose={() => setDrafting(false)} />
    </Page>
  );
}
