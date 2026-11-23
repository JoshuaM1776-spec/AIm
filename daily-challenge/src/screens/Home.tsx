import { ChartColumn, Info, UserRound, Users } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router";
import { Emblem } from "../components/Emblem.tsx";
import { ButtonLink, Card, ErrorNote, NavRow, Page, Spinner, Tag } from "../components/ui.tsx";
import { Illustration } from "../illustrations/index.tsx";
import { api } from "../lib/api.ts";
import { useAuth } from "../lib/auth.tsx";
import { guest } from "../lib/local.ts";
import { SCENARIO_LABEL, timeUntil } from "../lib/text.ts";
import type { Challenge } from "../lib/types.ts";
import { useLoad } from "../lib/useLoad.ts";

export const heroImage = (c: Challenge) => c.cards.find(k => k.kind === "decision")?.image ?? c.cards.find(k => k.image)?.image ?? null;

function usePrimaryAction(c: Challenge | null) {
  const { session, me } = useAuth();
  if (!c) return null;
  const base = `/c/${c.number}`;
  if (session) {
    const s = me?.attempts[String(c.number)];
    if (!s || s.status === "abandoned") return { label: s ? "Return to Today's Challenge" : "Begin Today's Challenge", to: base };
    if (s.status === "active") return { label: "Continue Challenge", to: `${base}/continue` };
    if (!s.has_evaluation) return { label: "View Your Evaluation", to: `${base}/evaluation` };
    return { label: "Explore Today's Results", to: `${base}/results` };
  }
  const g = guest.get(c.number);
  return g ? { label: "Continue Challenge", to: `${base}/continue` } : { label: "Begin Today's Challenge", to: base };
}

export function ChallengePreview({ c, compact = false, kindLabel = true }: { c: Challenge; compact?: boolean; kindLabel?: boolean }) {
  return (
    <div>
      <div className="relative">
        <Illustration image={heroImage(c)} className="aspect-[400/250] overflow-hidden rounded-2xl border border-line shadow-[0_1px_0_rgba(0,0,0,.04)]" />
        <span className="absolute -bottom-3.5 left-1/2 -translate-x-1/2 rounded-full border border-line bg-paper px-4 py-1 text-xs font-semibold tracking-[0.14em] text-ink">
          DAY {c.number}
        </span>
      </div>
      <h2 className={compact ? "mt-6 text-center text-[1.9rem] leading-tight" : "mt-7 text-center text-[2.15rem] leading-tight"}>{c.title}</h2>
      <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
        {c.subjects.map((s, i) => (
          <span key={s} className="flex items-center gap-2">
            {i > 0 && <span className="text-muted" aria-hidden>+</span>}
            <Tag>{s}</Tag>
          </span>
        ))}
      </div>
      <p className="mx-auto mt-4 max-w-sm text-center text-[1.02rem] leading-relaxed text-ink-soft">{c.summary}</p>
      {kindLabel && <p className="mt-2 text-center text-xs text-muted">{SCENARIO_LABEL[c.scenario_kind]}</p>}
    </div>
  );
}

export default function Home() {
  const { session, me } = useAuth();
  const today = useLoad(() => api.today(), []);
  const c = today.data?.challenge ?? null;
  const action = usePrimaryAction(c);
  const [, tick] = useState(0);
  useEffect(() => {
    const t = window.setInterval(() => tick(n => n + 1), 60_000);
    return () => window.clearInterval(t);
  }, []);
  const unfinished = me?.active && c && me.active.number !== c.number ? me.active : null;

  return (
    <Page>
      <header className="flex items-center justify-between pt-1">
        <span className="w-11" />
        <Emblem size={58} title="Daily Challenge" />
        <Link to={session ? "/profile" : "/signin"} aria-label={session ? "Your profile and settings" : "Sign in"}
          className="grid h-11 w-11 place-items-center rounded-full text-ink hover:bg-paper-deep">
          <UserRound size={22} strokeWidth={1.7} />
        </Link>
      </header>

      <div className="mt-2 text-center">
        <h1 className="text-[2.75rem] leading-[1.02]">Today&rsquo;s Challenge</h1>
        <p className="mt-2 text-[1.08rem] text-ink-soft">The same challenge for everyone today.</p>
      </div>

      <section className="mt-6" aria-label="Today's challenge">
        {today.loading && <Spinner label="Finding today's challenge" />}
        {today.error && <ErrorNote message={today.error.message} onRetry={today.reload} />}
        {today.data && !c && (
          <Card className="p-6 text-center">
            <p className="font-serif text-xl text-ink">No challenge has been published yet.</p>
            <p className="mt-2 text-sm">Check back soon. A new challenge appears every day at 00:00 UTC.</p>
          </Card>
        )}
        {c && action && (
          <>
            <ChallengePreview c={c} />
            {unfinished && (
              <Card className="mt-5 px-4 py-3 text-sm">
                <p className="text-ink">
                  You have an unfinished challenge: <strong className="font-semibold">Day {unfinished.number}, {unfinished.title}</strong>.
                </p>
                <p className="mt-1 text-muted">There&rsquo;s no need to catch up. Pick it back up, or start today&rsquo;s and set it aside.</p>
                <Link to={`/c/${unfinished.number}/continue`} className="mt-2 inline-block font-semibold text-bronze underline underline-offset-2">
                  Continue Day {unfinished.number}
                </Link>
              </Card>
            )}
            <ButtonLink to={action.to} size="lg" arrow className="mt-6 w-full">{action.label}</ButtonLink>
            {today.data && (
              <p className="mt-3 text-center text-xs text-muted">
                A new challenge in {timeUntil(today.data.next_reset)} (00:00 UTC).
              </p>
            )}
          </>
        )}
      </section>

      <nav className="mt-6 flex flex-col gap-3" aria-label="More">
        {c && <NavRow to={`/c/${c.number}/community`} icon={Users}>Community Responses</NavRow>}
        <NavRow to="/progress" icon={ChartColumn}>Your Progress</NavRow>
      </nav>

      <footer className="mt-auto flex justify-center gap-5 pt-10 text-sm text-muted">
        <Link to="/mission" className="inline-flex items-center gap-1.5 hover:text-ink"><Info size={15} /> Our mission</Link>
        <Link to="/about" className="hover:text-ink">How it works</Link>
      </footer>
    </Page>
  );
}
