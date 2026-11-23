import { CalendarClock, Eye, Plus, TriangleAlert } from "lucide-react";
import { Link } from "react-router";
import { ButtonLink, Card, cx, ErrorNote, Notice, Page, ScreenTitle, Spinner, TopBar } from "../../components/ui.tsx";
import { api } from "../../lib/api.ts";
import { formatDate } from "../../lib/text.ts";
import { useLoad } from "../../lib/useLoad.ts";

const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

const STATUS_STYLE = { draft: "border-line text-muted", published: "border-ok/40 text-ok", archived: "border-line text-muted line-through" } as const;

export default function AdminList() {
  const { data, error, loading, reload } = useLoad(() => api.admin.list(), []);
  const upcomingGaps = data
    ? Array.from({ length: 7 }, (_, i) => addDays(data.today, i)).filter(d => !data.items.some(c => c.release_date === d && c.status === "published"))
    : [];
  return (
    <Page wide>
      <TopBar back="/profile" right={<ButtonLink to="/admin/new" size="md"><Plus size={17} /> New</ButtonLink>} />
      <ScreenTitle title="Challenge Management" subtitle="Write, preview, schedule and publish challenges. Ordinary users only see a published challenge from its UTC release date." />
      {loading && <Spinner />}
      {error && <ErrorNote className="mt-6" message={error.message} onRetry={reload} />}
      {data && (
        <>
          {upcomingGaps.length > 0 && (
            <Notice className="mt-5 flex gap-2">
              <TriangleAlert size={18} className="mt-0.5 shrink-0 text-bronze" aria-hidden />
              <span>
                No published challenge for {upcomingGaps.slice(0, 3).map(d => formatDate(d, { weekday: "short", day: "numeric", month: "short" })).join(", ")}
                {upcomingGaps.length > 3 ? ` and ${upcomingGaps.length - 3} more of the next 7 days` : ""}. On those days everyone keeps seeing the most recent challenge.
              </span>
            </Notice>
          )}
          <p className="mt-4 text-xs text-muted">Today (UTC): {formatDate(data.today, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</p>
          <ul className="mt-3 space-y-2">
            {data.items.map(c => {
              const live = c.status === "published" && c.release_date && c.release_date <= data.today;
              return (
                <li key={c.id}>
                  <Card className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="eyebrow">Day {c.number}</p>
                      <Link to={`/admin/${c.id}`} className="font-serif text-[1.25rem] text-ink hover:underline">{c.title}</Link>
                      <p className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted">
                        <span className={cx("rounded-full border px-2 py-0.5 font-semibold", STATUS_STYLE[c.status])}>{c.status}</span>
                        {c.release_date ? <span className="inline-flex items-center gap-1"><CalendarClock size={12} /> {formatDate(c.release_date)}{live ? " (live)" : ""}</span> : <span>No date</span>}
                        <span>{c.submissions} submitted</span>
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
    </Page>
  );
}
