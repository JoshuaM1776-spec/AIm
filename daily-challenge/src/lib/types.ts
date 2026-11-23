export type Difficulty = "easy" | "moderate" | "hard";
export type CardKind = "role" | "situation" | "constraints" | "investigation" | "decision";
export type Category = "understanding" | "reasoning" | "clarity" | "organization";
export type ChallengeType = "solve" | "investigate" | "decide" | "design" | "explain";
export type ScenarioKind = "historical" | "fictionalized_historical" | "contemporary" | "fictional" | "speculative";
export type EditorialStatus = "approved" | "needs_revision" | "rejected" | "pending_verification";
export const QUALITY_CRITERIA = ["intrigue", "responsibility", "research_depth", "integration", "reasoning", "researchability", "clarity", "articulation"] as const;
export type QualityCriterion = (typeof QUALITY_CRITERIA)[number];

export interface ImageRef { key?: string; src?: string; alt: string; credit?: string }

export interface Challenge {
  id: string;
  number: number;
  slug: string;
  title: string;
  summary: string;
  subjects: string[];
  scenario_kind: ScenarioKind;
  scenario_note: string;
  challenge_type: ChallengeType;
  research_minutes: number | null;
  role: { title: string; body: string };
  situation: string;
  final_task: string;
  expectations: Record<Difficulty, string>;
  status: "draft" | "published" | "archived";
  release_date: string | null;
  /** The one open challenge: the only one that can be started, written and submitted. */
  is_open: boolean;
  /** When the open challenge closes (00:00 UTC on the next release); null if nothing is scheduled yet. */
  closes_at: string | null;
  cards: { position: number; kind: CardKind; image: ImageRef | null }[];
  constraints: { label: string; detail: string; icon: string }[];
  investigation: { title: string; questions: string[] }[];
}

export interface Source { title: string; note: string; url?: string; verified?: boolean; critical?: boolean }
export interface Approach { title: string; summary: string; strengths?: string; weaknesses?: string; conditions?: string }
export interface Reference {
  background: string;
  core_knowledge: string;
  uncertainties: string;
  investigation_map: string;
  approaches: Approach[];
  critical_reasoning: string;
  misconceptions: string[];
  evidence_expectations: string;
  difficulty_guide: Partial<Record<Difficulty, string>>;
  fairness_notes: string;
  evaluator_notes: string;
  sources: Source[];
}
export interface Quality {
  scores: Partial<Record<QualityCriterion, number>>;
  tests?: { test: string; passed: boolean; note: string }[];
  weaknesses?: string;
  recommendation?: EditorialStatus;
  assessed_by?: "ai" | "editor";
  assessed_at?: string;
}
export interface FeedbackSummary { count: number; ratings: Record<"1" | "2" | "3" | "4", number> }

export interface ChallengeAdmin extends Challenge {
  reference: Reference | null;
  origin: "editor" | "ai";
  editorial_status: EditorialStatus;
  quality: Quality | null;
  quality_problem: string | null;
  approved_at: string | null;
  card_directions: Partial<Record<CardKind, string>>;
  question_priorities: ("essential" | "exploratory")[][];
  feedback: FeedbackSummary;
  feedback_comments: { rating: number; comment: string; created_at: string }[];
}

export interface Feedback {
  summary: string;
  did_well: string[];
  consider_further: string[];
  keep_growing: string;
  factual_concerns?: string[];
  rationales?: Partial<Record<Category, string>>;
}

export interface EvaluationRecord {
  id: string;
  status: "pending" | "complete" | "failed";
  understanding: number | null;
  reasoning: number | null;
  clarity: number | null;
  organization: number | null;
  overall: number | null;
  feedback: Feedback | null;
  provider: string | null;
  model: string | null;
  error_code: string | null;
  started_at: string | null;
  completed_at: string | null;
}

export interface Submission {
  id: string;
  kind: "initial" | "revision";
  body: string;
  word_count: number;
  difficulty: Difficulty;
  created_at: string;
  evaluation: EvaluationRecord | null;
}

export interface Attempt {
  id: string;
  challenge_id: string;
  difficulty: Difficulty;
  status: "active" | "submitted" | "expired";
  card_position: number;
  briefing_done: boolean;
  started_at: string;
  submitted_at: string | null;
  updated_at: string;
  drafts: Partial<Record<"initial" | "revision", { body: string; updated_at: string }>>;
  submissions: Submission[];
  shared: { id: string; display_name: string; title: string; submission_id: string; hidden: boolean; created_at: string } | null;
  feedback: { rating: number; comment: string } | null;
}

export interface Today {
  today: string;
  closes_at: string | null;
  challenge: Challenge | null;
  is_new_today: boolean;
}

export interface MyState {
  today: string;
  profile: { id: string; display_name: string | null; preferred_difficulty: Difficulty; is_admin: boolean };
  attempts: Record<string, { status: Attempt["status"]; has_evaluation: boolean }>;
}

export interface CommunityItem {
  id: string;
  display_name: string;
  title: string;
  body: string;
  is_sample: boolean;
  selected_label: string | null;
  is_mine: boolean;
  created_at: string;
  word_count: number;
  difficulty: Difficulty | null;
  reported_by_me: boolean;
}

export interface Stats {
  submitted: number;
  evaluated: number;
  threshold: number;
  your_score: number | null;
  average: number | null;
  median: number | null;
  distribution: { from: number; to: number; count: number }[] | null;
}

export interface Progress {
  completed: number;
  current_streak: number;
  longest_streak: number;
  participated_today: boolean;
  recent_days: { date: string; done: boolean }[];
  average: number | null;
  trend: ({ number: number; title: string; date: string; difficulty: Difficulty } & Record<Category | "overall", number>)[];
}

export interface LibraryItem {
  number: number;
  title: string;
  subjects: string[];
  difficulty: Difficulty;
  submitted_at: string | null;
  release_date: string | null;
  /** A draft on a challenge that closed before it was submitted. */
  unfinished: boolean;
  initial: { overall: number | null; status: EvaluationRecord["status"] | null } | null;
  revision: { overall: number | null; status: EvaluationRecord["status"] | null } | null;
  shared: boolean;
}

export interface AdminChallengeRow {
  id: string;
  number: number;
  title: string;
  status: Challenge["status"];
  subjects: string[];
  release_date: string | null;
  updated_at: string;
  submissions: number;
  open_reports: number;
  challenge_type: ChallengeType;
  editorial_status: EditorialStatus;
  origin: "editor" | "ai";
  feedback: FeedbackSummary;
}

export interface AdminResponse {
  id: string;
  display_name: string;
  title: string;
  body: string;
  is_sample: boolean;
  selected_label: string | null;
  selected_position: number | null;
  hidden: boolean;
  report_count: number;
  created_at: string;
  reports: { reason: string; details: string; status: string; created_at: string }[];
}
