import type { ChallengeType, Difficulty, EditorialStatus, ScenarioKind } from "./types.ts";

export const wordCount = (t: string) => (t.trim() ? t.trim().split(/\s+/).length : 0);

export const paragraphs = (t: string) => t.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);

export const LENGTH_GUIDE: Record<Difficulty, { min: number; max: number }> = {
  easy: { min: 150, max: 300 },
  moderate: { min: 250, max: 500 },
  hard: { min: 400, max: 800 },
};

export const MIN_WORDS = 40; // the server refuses anything shorter

export const DIFFICULTY_LABEL: Record<Difficulty, string> = { easy: "Easy", moderate: "Moderate", hard: "Hard" };

export const DIFFICULTY_BLURB: Record<Difficulty, string> = {
  easy: "Identify a reasonable solution and explain why it should work.",
  moderate: "Compare alternatives, justify your recommendation and weigh the trade-offs.",
  hard: "Evaluate competing approaches, address uncertainty and second-order effects, and answer the strongest objections.",
};

export const SCENARIO_LABEL: Record<ScenarioKind, string> = {
  historical: "Historical case", fictionalized_historical: "Fictionalized historical scenario", contemporary: "Contemporary scenario",
  fictional: "Fictional scenario", speculative: "Speculative scenario",
};

export const TYPE_LABEL: Record<ChallengeType, string> = { solve: "Solve", investigate: "Investigate", decide: "Decide", design: "Design", explain: "Explain" };

/** The title of the fifth story card, by kind of challenge. */
export const TASK_HEADING: Record<ChallengeType, string> = {
  decide: "Your Decision", solve: "Your Solution", design: "Your Mission", investigate: "Your Mission", explain: "Your Explanation",
};

export const researchTime = (m: number | null | undefined) =>
  !m ? "" : m < 60 ? `about ${Math.round(m / 5) * 5} minutes` : `about ${Math.round((m / 60) * 2) / 2} hour${m >= 90 ? "s" : ""}`;

export const EDITORIAL_LABEL: Record<EditorialStatus, string> = {
  approved: "Approved", needs_revision: "Needs revision", rejected: "Rejected", pending_verification: "Pending fact verification",
};

export const WORTH_IT = [
  { rating: 4, label: "Absolutely", detail: "I learned something valuable" },
  { rating: 3, label: "Yes", detail: "it was worth investigating" },
  { rating: 2, label: "Somewhat", detail: "it could have been better" },
  { rating: 1, label: "No", detail: "it wasn't worthwhile" },
] as const;

export function formatDate(iso: string | null | undefined, opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" }) {
  if (!iso) return "";
  const d = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? new Date(`${iso}T12:00:00Z`) : new Date(iso);
  return d.toLocaleDateString(undefined, { timeZone: "UTC", ...opts });
}

/** "Open until 00:00 UTC (in 5h 12m)", or until the next challenge when none is scheduled yet. */
export function openUntil(closesAt: string | null) {
  if (!closesAt) return "Open until the next challenge is released";
  if (Date.parse(closesAt) - Date.now() > 24 * 3_600_000) {
    return `Open until 00:00 UTC on ${formatDate(closesAt, { weekday: "short", day: "numeric", month: "short" })}`;
  }
  return `Open until 00:00 UTC (in ${timeUntil(closesAt)})`;
}

export function timeUntil(iso: string) {
  const ms = Date.parse(iso) - Date.now();
  if (ms <= 0) return "soon";
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export const newKey = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : "10000000-1000-4000-8000-100000000000".replace(/[018]/g, c => (Number(c) ^ (Math.random() * 16) >> (Number(c) / 4)).toString(16));
