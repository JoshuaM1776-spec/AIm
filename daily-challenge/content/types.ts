// The shape of a challenge as authors write it, following the Challenge Creation & Quality
// Standard (docs/challenge-standard.md). scripts/build-seed.ts turns these files into
// supabase/seed.sql. These files are never imported by the app: the private guide in them is for
// the evaluator and editors only and must not reach browsers.

export type Difficulty = "easy" | "moderate" | "hard";
export type CardKind = "role" | "situation" | "constraints" | "investigation" | "decision";
export type ChallengeType = "solve" | "investigate" | "decide" | "design" | "explain";
export type ScenarioKind = "historical" | "fictionalized_historical" | "contemporary" | "fictional" | "speculative";
export type EditorialStatus = "approved" | "needs_revision" | "rejected" | "pending_verification";

export const QUALITY_CRITERIA = ["intrigue", "responsibility", "research_depth", "integration", "reasoning", "researchability", "clarity", "articulation"] as const;
export type QualityCriterion = (typeof QUALITY_CRITERIA)[number];

export interface ImageRef {
  key?: string; // a built-in illustration (src/illustrations)
  src?: string; // or an image URL
  alt: string;
  credit?: string;
}

export interface Source {
  title: string;
  note: string;
  url?: string;
  verified: boolean; // checked against the source itself
  critical: boolean; // the challenge depends on this claim
}

export interface ChallengeSeed {
  number: number;
  slug: string;
  title: string;
  summary: string; // the short preview
  subjects: string[];
  challenge_type: ChallengeType;
  research_minutes: number; // estimated research time, not a limit
  scenario_kind: ScenarioKind;
  scenario_note: string;
  role: { title: string; body: string };
  situation: string;
  final_task: string;
  expectations: Record<Difficulty, string>;
  cards: { kind: CardKind; image: ImageRef | null; direction: string }[];
  constraints: { label: string; detail: string; icon: string }[];
  investigation: { title: string; questions: { text: string; priority: "essential" | "exploratory" }[] }[];
  reference: {
    background: string; // factual reference guide
    core_knowledge: string;
    uncertainties: string;
    investigation_map: string;
    approaches: { title: string; summary: string; strengths: string; weaknesses: string; conditions: string }[];
    critical_reasoning: string;
    misconceptions: string[]; // common mistakes
    evidence_expectations: string;
    difficulty_guide: Record<Difficulty, string>;
    fairness_notes: string;
    evaluator_notes: string;
    sources: Source[];
  };
  quality: {
    scores: Record<QualityCriterion, number>;
    weaknesses: string;
    recommendation: EditorialStatus;
    assessed_by: "ai" | "editor";
  };
  editorial_status: EditorialStatus;
  // Clearly labelled sample responses, shown under Selected Approaches until real people share theirs.
  samples: { display_name: string; title: string; selected_label: string; body: string }[];
}
