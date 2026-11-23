import { Globe, Table2 } from "lucide-react";
import { useState } from "react";
import { Card, ErrorNote, Page, Spinner, TopBar, ButtonLink } from "../components/ui.tsx";
import { api } from "../lib/api.ts";
import { useChallenge } from "../lib/challenge.tsx";
import type { Stats } from "../lib/types.ts";
import { useLoad } from "../lib/useLoad.ts";

/** Score distribution: one series in bronze, the bucket holding your score in dark ink and labelled. */
function Distribution({ stats }: { stats: Stats }) {
  const [hover, setHover] = useState<number | null>(null);
  const [table, setTable] = useState(false);
  const dist = stats.distribution ?? [];
  const max = Math.max(1, ...dist.map(d => d.count));
  const mine = stats.your_score == null ? -1 : Math.min(9, Math.floor(stats.your_score / 10));
  const H = 150;
  return (
    <figure>
      <figcaption className="sr-only">Number of people by first-evaluation score, in bands of ten points.</figcaption>
      {table ? (
        <table className="w-full text-sm">
          <thead><tr className="text-left text-muted"><th className="py-1 font-semibold">Score</th><th className="py-1 text-right font-semibold">People</th></tr></thead>
          <tbody>
            {dist.map((d, i) => (
              <tr key={d.from} className="border-t border-line-soft">
                <td className="py-1">{d.from}–{d.to}{i === mine ? " (yours)" : ""}</td>
                <td className="py-1 text-right tabular-nums">{d.count.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="relative pt-8">
          {/* hairline baseline and the bars */}
          <div className="flex items-end gap-[2px] border-b border-line" style={{ height: H }}>
            {dist.map((d, i) => {
              const h = d.count ? Math.max(3, (d.count / max) * (H - 24)) : 0;
              return (
                <button key={d.from} type="button" className="relative flex h-full flex-1 items-end justify-center focus:outline-none"
                  onPointerEnter={() => setHover(i)} onPointerLeave={() => setHover(null)} onFocus={() => setHover(i)} onBlur={() => setHover(null)}
                  aria-label={`Scores ${d.from} to ${d.to}: ${d.count} ${d.count === 1 ? "person" : "people"}${i === mine ? ", including you" : ""}`}>
                  <span className={`block w-full max-w-6 rounded-t ${i === mine ? "bg-button" : "bg-bronze-soft"} ${hover === i ? "opacity-80" : ""}`} style={{ height: h }} />
                  {i === mine && (
                    <span className="absolute left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md bg-button px-2 py-0.5 text-xs font-semibold text-[#f8f1e6]" style={{ bottom: h + 6 }}>
                      You: {stats.your_score}
                    </span>
                  )}
                  {hover === i && i !== mine && (
                    <span className="pointer-events-none absolute left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded-md border border-line bg-card px-2 py-1 text-xs shadow" style={{ bottom: h + 6 }}>
                      <strong className="font-semibold text-ink">{d.count.toLocaleString()}</strong> <span className="text-muted">scored {d.from}–{d.to}</span>
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          <div className="mt-1 flex justify-between text-xs text-muted tabular-nums" aria-hidden>
            {[0, 20, 40, 60, 80, 100].map(t => <span key={t}>{t}</span>)}
          </div>
        </div>
      )}
      <button type="button" onClick={() => setTable(t => !t)} className="mt-2 inline-flex min-h-10 items-center gap-1.5 text-xs font-semibold text-bronze">
        <Table2 size={14} /> {table ? "Show chart" : "Show as table"}
      </button>
    </figure>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex-1 px-2 py-3 text-center">
      <p className="font-serif text-[2rem] font-semibold leading-none text-ink">{value}</p>
      <p className="mt-1 text-xs text-muted">{label}</p>
    </div>
  );
}

export default function Results() {
  const { challenge: c, work } = useChallenge();
  const { data: s, error, loading, reload } = useLoad(() => api.stats(c.number), [c.number]);
  return (
    <Page>
      <TopBar back={work.status === "submitted" ? `/c/${c.number}/evaluation` : "/"} />
      <header className="text-center">
        <Globe className="mx-auto text-bronze" size={30} strokeWidth={1.5} aria-hidden />
        <h1 className="mt-1 text-[2.2rem] leading-tight">Global Results</h1>
        <p className="mt-1">How everyone did on this challenge.</p>
        <p className="text-sm text-muted">Day {c.number} · {c.title}</p>
      </header>
      {loading && <Spinner />}
      {error && <ErrorNote className="mt-6" message={error.message} onRetry={reload} />}
      {s && (
        <div className="anim-fade">
          <div className="mt-6 text-center">
            <p className="font-serif text-[3.2rem] font-semibold leading-none text-ink tabular-nums">{s.submitted.toLocaleString()}</p>
            <p className="mt-1">{s.submitted === 1 ? "person has" : "people have"} completed this challenge</p>
          </div>

          {s.distribution ? (
            <Card className="mt-6 px-4 py-4">
              <h2 className="text-lg">First-evaluation scores</h2>
              <Distribution stats={s} />
            </Card>
          ) : (
            <Card className="mt-6 px-4 py-5 text-center text-sm">
              <p>The average and the spread of scores appear once at least {s.threshold} people have been evaluated{s.evaluated ? ` (${s.evaluated} so far)` : ""}.</p>
              <p className="mt-1 text-muted">Until then there aren&rsquo;t enough results for a fair picture.</p>
            </Card>
          )}

          <Card className="mt-4 flex divide-x divide-line">
            <Tile label="Your score" value={s.your_score != null ? String(s.your_score) : "—"} />
            <Tile label="Global average" value={s.average != null ? String(s.average) : "—"} />
            <Tile label="Median" value={s.median != null ? String(s.median) : "—"} />
          </Card>
          <p className="mt-3 text-center text-xs text-muted">
            First versions only, so revisions don&rsquo;t skew the comparison. Scores are an AI&rsquo;s judgement of writing and reasoning, not a ranking of people.
          </p>
          <div className="mt-6 flex flex-col gap-3">
            {work.status === "submitted"
              ? <ButtonLink to={`/c/${c.number}/community`} variant="secondary">Read &amp; learn from others</ButtonLink>
              : <ButtonLink to={`/c/${c.number}`} arrow>Take on this challenge</ButtonLink>}
          </div>
        </div>
      )}
    </Page>
  );
}
