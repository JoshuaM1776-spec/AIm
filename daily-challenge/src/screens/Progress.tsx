import { CalendarDays, Check, LibraryBig, Table2 } from "lucide-react";
import { useState } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { CATEGORY_META } from "../components/icons.tsx";
import { ButtonLink, Card, cx, ErrorNote, NavRow, Page, ScreenTitle, Spinner, TopBar } from "../components/ui.tsx";
import { api } from "../lib/api.ts";
import { useAuth } from "../lib/auth.tsx";
import { formatDate } from "../lib/text.ts";
import type { Category, Progress as ProgressData } from "../lib/types.ts";
import { useLoad } from "../lib/useLoad.ts";

const CATS: Category[] = ["understanding", "reasoning", "clarity", "organization"];
const SURFACE = "#f8f3ea";
const LINE = "#8a5d33";

type Point = ProgressData["trend"][number];

function TrendTooltip({ active, payload, k }: { active?: boolean; payload?: { payload: Point }[]; k: Category }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="rounded-lg border border-line bg-card px-2.5 py-1.5 text-xs shadow">
      <p><strong className="text-sm font-semibold text-ink">{p[k]}</strong> <span className="text-muted">{CATEGORY_META[k].label}</span></p>
      <p className="text-muted">Day {p.number}, {p.title}</p>
    </div>
  );
}

/** One small chart per category: a single series each, so no legend or colour key is needed. */
function SmallMultiple({ k, data }: { k: Category; data: Point[] }) {
  const last = data[data.length - 1];
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <h3 className="font-serif text-[1.05rem] text-ink">{CATEGORY_META[k].label}</h3>
        <span className="text-sm font-semibold text-ink tabular-nums">{last[k]}</span>
      </div>
      <div className="h-24" aria-hidden>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -28 }}>
            <CartesianGrid vertical={false} stroke="#e7ddcf" strokeWidth={1} />
            <XAxis dataKey="number" tickFormatter={n => `${n}`} tick={{ fontSize: 10, fill: "#7a6858" }} tickLine={false} axisLine={{ stroke: "#dccfbc" }} interval="preserveStartEnd" />
            <YAxis domain={[0, 100]} ticks={[0, 50, 100]} tick={{ fontSize: 10, fill: "#7a6858" }} tickLine={false} axisLine={false} />
            <Tooltip content={<TrendTooltip k={k} />} cursor={{ stroke: "#b5895c", strokeWidth: 1 }} isAnimationActive={false} />
            <Line type="monotone" dataKey={k} stroke={LINE} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" isAnimationActive={false}
              dot={{ r: 4, fill: LINE, stroke: SURFACE, strokeWidth: 2 }} activeDot={{ r: 5, fill: LINE, stroke: SURFACE, strokeWidth: 2 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function TrendTable({ data }: { data: Point[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[22rem] text-sm">
        <caption className="sr-only">Your evaluated scores by challenge</caption>
        <thead>
          <tr className="text-left text-xs text-muted">
            <th className="py-1 font-semibold">Day</th>
            {CATS.map(k => <th key={k} className="py-1 text-right font-semibold">{CATEGORY_META[k].label.split(" ")[0]}</th>)}
            <th className="py-1 text-right font-semibold">Overall</th>
          </tr>
        </thead>
        <tbody>
          {data.map(p => (
            <tr key={p.number} className="border-t border-line-soft tabular-nums">
              <td className="py-1">{p.number}</td>
              {CATS.map(k => <td key={k} className="py-1 text-right">{p[k]}</td>)}
              <td className="py-1 text-right font-semibold">{p.overall}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card className="px-3 py-3 text-center">
      <p className="font-serif text-[1.9rem] font-semibold leading-none text-ink tabular-nums">{value}</p>
      <p className="mt-1 text-xs text-muted">{label}</p>
    </Card>
  );
}

export default function Progress() {
  const { session, ready } = useAuth();
  const { data: p, error, loading, reload } = useLoad(() => api.progress(), [session?.user.id], Boolean(session));
  const [table, setTable] = useState(false);

  if (ready && !session) {
    return (
      <Page>
        <TopBar back="/" />
        <ScreenTitle title="Your Progress" subtitle="Your completed challenges, streaks and how your evaluated reasoning develops over time." />
        <Card className="mt-6 px-5 py-6 text-center">
          <p>Progress is kept with an account, so it&rsquo;s there on any device.</p>
          <ButtonLink to="/signin?next=/progress" className="mt-4 w-full" arrow>Sign in or create an account</ButtonLink>
        </Card>
      </Page>
    );
  }

  return (
    <Page>
      <TopBar back="/" />
      <ScreenTitle title="Your Progress" />
      {loading && <Spinner />}
      {error && <ErrorNote className="mt-6" message={error.message} onRetry={reload} />}
      {p && (
        <div className="anim-fade">
          {/* The streak: a small acknowledgement of consistency, nothing more */}
          <Card className="mt-5 px-4 py-4">
            <div className="flex items-center gap-2">
              <CalendarDays size={20} className="text-bronze" aria-hidden />
              <h2 className="text-[1.2rem]">The Streak</h2>
              <span className="ml-auto font-serif text-2xl font-semibold text-ink tabular-nums">{p.current_streak} <span className="text-base font-normal text-muted">{p.current_streak === 1 ? "day" : "days"}</span></span>
            </div>
            <ol className="mt-3 grid grid-cols-7 gap-1.5" aria-label="The last seven days">
              {p.recent_days.map(d => (
                <li key={d.date} className="flex flex-col items-center gap-1">
                  <span className="text-[0.7rem] text-muted">{formatDate(d.date, { weekday: "short" })}</span>
                  <span className={cx("grid h-8 w-8 place-items-center rounded-lg border", d.done ? "border-button bg-button text-[#f8f1e6]" : "border-line bg-card")}
                    aria-label={`${formatDate(d.date, { weekday: "long", day: "numeric", month: "short" })}: ${d.done ? "took part" : "no challenge submitted"}`}>
                    {d.done && <Check size={16} strokeWidth={2.4} aria-hidden />}
                  </span>
                </li>
              ))}
            </ol>
            <p className="mt-3 text-xs text-muted">
              Days you submitted a challenge. Missing a day is fine; there&rsquo;s nothing to catch up on. Longest so far: {p.longest_streak} {p.longest_streak === 1 ? "day" : "days"}.
            </p>
          </Card>

          <div className="mt-4 grid grid-cols-2 gap-3">
            <Stat label="Challenges completed" value={String(p.completed)} />
            <Stat label="Average score" value={p.average != null ? String(p.average) : "—"} />
            <Stat label="Current streak" value={String(p.current_streak)} />
            <Stat label="Longest streak" value={String(p.longest_streak)} />
          </div>

          <Card className="mt-4 px-4 py-4">
            <div className="flex items-baseline justify-between">
              <h2 className="text-[1.2rem]">Evaluated reasoning over time</h2>
            </div>
            {p.trend.length < 2 ? (
              <p className="mt-2 text-sm text-muted">
                {p.trend.length === 0 ? "Complete a challenge to see your evaluations here." : "Your trends appear after your second evaluated challenge."}
              </p>
            ) : table ? (
              <div className="mt-2"><TrendTable data={p.trend} /></div>
            ) : (
              <div className="mt-2 grid grid-cols-1 gap-4 sm:grid-cols-2">
                {CATS.map(k => <SmallMultiple key={k} k={k} data={p.trend} />)}
              </div>
            )}
            {p.trend.length >= 2 && (
              <button type="button" onClick={() => setTable(t => !t)} className="mt-2 inline-flex min-h-10 items-center gap-1.5 text-xs font-semibold text-bronze">
                <Table2 size={14} /> {table ? "Show charts" : "Show as table"}
              </button>
            )}
            <p className="mt-2 text-xs text-muted">
              First-version scores by challenge number. Challenges and difficulty differ from day to day, and AI scores vary by a few points,
              so read these as a rough picture of your evaluated writing and reasoning, not a precise measurement.
            </p>
          </Card>

          <div className="mt-4"><NavRow to="/library" icon={LibraryBig} hint="Every response and its feedback">Completed Challenges</NavRow></div>
        </div>
      )}
    </Page>
  );
}
