import { Search } from "lucide-react";
import { type PointerEvent, type ReactNode, useEffect, useRef, useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router";
import { constraintIcon } from "../components/icons.tsx";
import { Button, NextCircle, Page, Segments, TopBar } from "../components/ui.tsx";
import { Illustration } from "../illustrations/index.tsx";
import { useChallenge } from "../lib/challenge.tsx";
import { DIFFICULTY_LABEL, LENGTH_GUIDE } from "../lib/text.ts";
import type { CardKind, Challenge, Difficulty } from "../lib/types.ts";

const ORDER: CardKind[] = ["role", "situation", "constraints", "investigation", "decision"];
const image = (c: Challenge, kind: CardKind) => c.cards.find(k => k.kind === kind)?.image ?? null;

function Divider() {
  return <div className="mx-auto my-4 h-px w-full bg-line" aria-hidden />;
}

/** One story card's content. Shared by the challenge and the admin preview. */
export function StoryCard({ c, index, difficulty, action }: { c: Challenge; index: number; difficulty: Difficulty; action?: ReactNode }) {
  const kind = ORDER[index - 1];
  const img = image(c, kind);
  switch (kind) {
    case "role":
      return (
        <article className="flex flex-1 flex-col">
          <p className="eyebrow text-center">Your role</p>
          <h1 className="mt-1 text-center text-[2.3rem] leading-tight">Your Role</h1>
          <Divider />
          <h2 className="text-center text-[1.7rem]">{c.role.title}</h2>
          <p className="mt-3 text-[1.08rem] leading-relaxed text-ink-soft">{c.role.body}</p>
          {img && <Illustration image={img} className="mt-auto aspect-[400/260] overflow-hidden rounded-2xl pt-0 [mask-image:linear-gradient(to_bottom,transparent,black_18%)]" />}
        </article>
      );
    case "situation":
      return (
        <article className="flex flex-1 flex-col">
          {img && <Illustration image={img} className="aspect-[400/260] overflow-hidden rounded-2xl border border-line" />}
          <p className="eyebrow mt-5 text-center">The situation</p>
          <h1 className="mt-1 text-center text-[2.1rem] leading-tight">The Situation</h1>
          <p className="mt-3 text-[1.05rem] leading-relaxed text-ink-soft">{c.situation}</p>
        </article>
      );
    case "constraints":
      return (
        <article className="flex flex-1 flex-col">
          <p className="eyebrow text-center">What limits you</p>
          <h1 className="mt-1 text-center text-[2.1rem] leading-tight">The Constraints</h1>
          <ul className="mt-4 divide-y divide-line border-y border-line">
            {c.constraints.map(x => {
              const Icon = constraintIcon(x.icon);
              return (
                <li key={x.label} className="flex items-start gap-4 py-3">
                  <Icon className="mt-0.5 shrink-0 text-ink" size={24} strokeWidth={1.5} aria-hidden />
                  <div>
                    <p className="font-semibold text-ink">{x.label}</p>
                    {x.detail && <p className="text-sm text-ink-soft">{x.detail}</p>}
                  </div>
                </li>
              );
            })}
          </ul>
          {img && <Illustration image={img} className="mt-auto aspect-[400/260] overflow-hidden rounded-2xl pt-4 [mask-image:linear-gradient(to_bottom,transparent,black_15%)]" />}
        </article>
      );
    case "investigation":
      return (
        <article className="flex flex-1 flex-col">
          <Search className="mx-auto text-bronze" size={26} strokeWidth={1.5} aria-hidden />
          <h1 className="mt-1 text-center text-[2.1rem] leading-tight">Your Investigation</h1>
          <p className="mx-auto mt-2 max-w-sm text-center text-[0.98rem]">
            Starting points worth exploring. They&rsquo;re prompts, not a checklist: follow your curiosity wherever it leads.
          </p>
          <div className="mt-5 space-y-4">
            {c.investigation.map(a => (
              <section key={a.title} className="rounded-2xl border border-line bg-card/70 px-4 py-3">
                <h2 className="text-[1.3rem]">{a.title}</h2>
                <ul className="mt-1.5 space-y-1.5">
                  {a.questions.map(q => (
                    <li key={q} className="flex gap-2.5 text-[0.98rem] leading-snug">
                      <span className="mt-[0.55em] h-1.5 w-1.5 shrink-0 rounded-full bg-bronze" aria-hidden />
                      <span>{q}</span>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </article>
      );
    case "decision":
      return (
        <article className="flex flex-1 flex-col">
          <p className="eyebrow text-center">The task</p>
          <h1 className="mt-1 text-center text-[2.1rem] leading-tight">Your Decision</h1>
          <p className="mt-3 text-[1.05rem] leading-relaxed text-ink-soft">{c.final_task}</p>
          <div className="mt-4 rounded-2xl border border-line bg-card/70 px-4 py-3 text-[0.95rem]">
            <p className="eyebrow">{DIFFICULTY_LABEL[difficulty]}</p>
            <p className="mt-1">{c.expectations[difficulty]}</p>
            <p className="mt-1 text-sm text-muted">Suggested length: {LENGTH_GUIDE[difficulty].min}–{LENGTH_GUIDE[difficulty].max} words.</p>
          </div>
          {img && <Illustration image={img} className="mt-4 aspect-[400/230] overflow-hidden rounded-2xl [mask-image:linear-gradient(to_bottom,transparent,black_18%)]" />}
          {action && <div className="mt-5">{action}</div>}
        </article>
      );
  }
}

/** Swipe left/right on touch screens; arrow keys on keyboards. */
function useSwipe(onPrev: () => void, onNext: () => void) {
  const start = useRef<{ x: number; y: number } | null>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLElement && /input|textarea|select/i.test(e.target.tagName)) return;
      if (e.key === "ArrowRight") onNext();
      if (e.key === "ArrowLeft") onPrev();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onPrev, onNext]);
  return {
    onPointerDown: (e: PointerEvent) => { if (e.pointerType !== "mouse") start.current = { x: e.clientX, y: e.clientY }; },
    onPointerUp: (e: PointerEvent) => {
      const s = start.current;
      start.current = null;
      if (!s) return;
      const dx = e.clientX - s.x;
      const dy = e.clientY - s.y;
      if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) (dx < 0 ? onNext : onPrev)();
    },
    onPointerCancel: () => { start.current = null; },
  };
}

export function StoryFrame({ c, index, difficulty, base, back, onNavigate, action }: {
  c: Challenge; index: number; difficulty: Difficulty; base: string; back: string; onNavigate?: (n: number) => void; action?: ReactNode;
}) {
  const navigate = useNavigate();
  const [dir, setDir] = useState<"next" | "prev">("next");
  const go = (n: number) => {
    if (n < 1 || n > 5) return;
    setDir(n > index ? "next" : "prev");
    onNavigate?.(n);
    navigate(`${base}/${n}`, { replace: true });
  };
  const swipe = useSwipe(() => (index > 1 ? go(index - 1) : navigate(back)), () => go(index + 1));
  return (
    <Page className="touch-pan-y">
      <TopBar back={() => (index > 1 ? go(index - 1) : navigate(back))} backLabel={index > 1 ? "Previous card" : "Back"}
        center={<Segments total={5} current={index} />} right={<span aria-hidden>{index} / 5</span>} />
      <div {...swipe} key={index} className={`mt-3 flex flex-1 flex-col ${index < 5 ? "pb-2" : ""} ${dir === "next" ? "anim-next" : "anim-prev"}`} aria-live="polite">
        <StoryCard c={c} index={index} difficulty={difficulty} action={action} />
      </div>
      {index < 5 && (
        <div className="pointer-events-none sticky bottom-4 mt-4 flex justify-end [&>*]:pointer-events-auto">
          <NextCircle onClick={() => go(index + 1)} label={`Next card (${index + 1} of 5)`} />
        </div>
      )}
    </Page>
  );
}

export default function Story() {
  const { card } = useParams();
  const index = Number(card);
  const { challenge: c, work, setPosition, finishBriefing } = useChallenge();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (Number.isInteger(index) && index >= 1 && index <= 5) setPosition(index);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index]);
  if (!Number.isInteger(index) || index < 1 || index > 5) return <Navigate to={`/c/${c.number}/story/1`} replace />;
  if (work.status === "none" || work.status === "abandoned") return <Navigate to={`/c/${c.number}`} replace />;
  const begin = async () => {
    setBusy(true);
    try {
      await finishBriefing();
    } finally {
      setBusy(false);
    }
    navigate(`/c/${c.number}/brief`);
  };
  return (
    <StoryFrame c={c} index={index} difficulty={work.difficulty ?? "moderate"} base={`/c/${c.number}/story`} back={`/c/${c.number}`}
      action={work.status === "submitted"
        ? <Button size="lg" className="w-full" arrow onClick={() => navigate(`/c/${c.number}/evaluation`)}>Back to Your Evaluation</Button>
        : <Button size="lg" className="w-full" arrow busy={busy} onClick={begin}>Begin Investigation</Button>} />
  );
}
