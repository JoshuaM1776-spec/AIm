import { BookOpen, Compass } from "lucide-react";
import type { ReactNode } from "react";
import { Link, Navigate } from "react-router";
import { constraintIcon } from "../components/icons.tsx";
import { ButtonLink, Page, TopBar } from "../components/ui.tsx";
import { useChallenge } from "../lib/challenge.tsx";
import { DIFFICULTY_LABEL, LENGTH_GUIDE, SCENARIO_LABEL } from "../lib/text.ts";
import type { Challenge, Difficulty } from "../lib/types.ts";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-t border-line py-4">
      <h2 className="eyebrow">{title}</h2>
      <div className="mt-1.5">{children}</div>
    </section>
  );
}

/** Everything needed to work on the challenge, on one page. Also shown beside the editor. */
export function BriefContent({ c, difficulty }: { c: Challenge; difficulty: Difficulty }) {
  return (
    <div className="text-[0.98rem] leading-relaxed">
      <Section title="Your role">
        <p><strong className="font-semibold text-ink">{c.role.title}.</strong> {c.role.body}</p>
      </Section>
      <Section title="The situation">
        <p>{c.situation}</p>
        <p className="mt-2 text-xs italic text-muted">{SCENARIO_LABEL[c.scenario_kind]}{c.scenario_note ? `: ${c.scenario_note}` : "."}</p>
      </Section>
      <Section title="The constraints">
        <ul className="space-y-2">
          {c.constraints.map(x => {
            const Icon = constraintIcon(x.icon);
            return (
              <li key={x.label} className="flex gap-3">
                <Icon size={18} strokeWidth={1.6} className="mt-1 shrink-0 text-bronze" aria-hidden />
                <span><span className="font-semibold text-ink">{x.label}</span>{x.detail ? `: ${x.detail}` : ""}</span>
              </li>
            );
          })}
        </ul>
      </Section>
      <Section title="Areas worth investigating">
        <div className="space-y-3">
          {c.investigation.map(a => (
            <div key={a.title}>
              <h3 className="font-serif text-lg">{a.title}</h3>
              <ul className="mt-0.5 list-disc space-y-1 pl-5 marker:text-bronze">
                {a.questions.map(q => <li key={q}>{q}</li>)}
              </ul>
            </div>
          ))}
        </div>
        <p className="mt-2 text-xs text-muted">Optional starting points. Pursue whatever lines of inquiry you find most useful.</p>
      </Section>
      <Section title="Your decision">
        <p>{c.final_task}</p>
      </Section>
      <Section title={`Difficulty: ${DIFFICULTY_LABEL[difficulty]}`}>
        <p>{c.expectations[difficulty]}</p>
        <p className="mt-1 text-sm text-muted">Suggested length: {LENGTH_GUIDE[difficulty].min}–{LENGTH_GUIDE[difficulty].max} words. A guide, not a rule.</p>
      </Section>
    </div>
  );
}

export default function Brief() {
  const { challenge: c, work } = useChallenge();
  if (work.status === "none" || work.status === "abandoned") return <Navigate to={`/c/${c.number}`} replace />;
  const draft = work.attempt?.drafts.initial?.body ?? work.guestAttempt?.draft ?? "";
  return (
    <Page>
      <TopBar back={`/c/${c.number}/story/5`} center={<span className="eyebrow">Mission brief</span>} />
      <header className="mt-2 text-center">
        <p className="eyebrow">Day {c.number}</p>
        <h1 className="text-[2.2rem] leading-tight">{c.title}</h1>
        <p className="mt-1 text-sm text-muted">{c.subjects.join(" · ")}</p>
      </header>

      <div className="mt-5 rounded-2xl border border-line bg-bronze-wash/50 px-4 py-4">
        <div className="flex items-center gap-2 text-ink">
          <Compass size={20} strokeWidth={1.6} className="text-bronze" aria-hidden />
          <h2 className="font-serif text-xl">Now, investigate</h2>
        </div>
        <p className="mt-1.5 text-[0.95rem]">
          Take this problem with you. Search, read, watch, compare examples, run the numbers, look for the strongest arguments
          against your first idea. However you like to find things out. Come back when you&rsquo;re ready to write: this brief will be here.
        </p>
      </div>

      <div className="mt-4"><BriefContent c={c} difficulty={work.difficulty ?? "moderate"} /></div>

      {work.status === "submitted" ? (
        <ButtonLink to={`/c/${c.number}/evaluation`} size="lg" arrow className="mt-4 w-full">Your Evaluation</ButtonLink>
      ) : (
        <ButtonLink to={`/c/${c.number}/write`} size="lg" arrow className="mt-4 w-full">{draft.trim() ? "Continue Writing" : "Write Your Response"}</ButtonLink>
      )}
      <Link to={`/c/${c.number}/story/1`} className="mt-4 inline-flex items-center justify-center gap-2 text-sm font-semibold text-bronze">
        <BookOpen size={16} /> Reread the story
      </Link>
    </Page>
  );
}
