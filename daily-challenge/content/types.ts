// The shape of a challenge as authors write it. scripts/build-seed.ts turns these files into
// supabase/seed.sql. These files are never imported by the app: the reference material in them is
// for the evaluator only and must not reach browsers.

export type Difficulty = "easy" | "moderate" | "hard";
export type CardKind = "role" | "situation" | "constraints" | "investigation" | "decision";

export interface ImageRef {
  key?: string; // a built-in illustration (src/illustrations)
  src?: string; // or an image URL
  alt: string;
  credit?: string;
}

export interface ChallengeSeed {
  number: number;
  slug: string;
  title: string;
  summary: string;
  subjects: string[];
  scenario_kind: "fictional" | "historical" | "hypothetical";
  scenario_note: string;
  role: { title: string; body: string };
  situation: string;
  final_task: string;
  expectations: Record<Difficulty, string>;
  cards: { kind: CardKind; image: ImageRef | null }[];
  constraints: { label: string; detail: string; icon: string }[];
  investigation: { title: string; questions: string[] }[];
  reference: {
    background: string;
    approaches: { title: string; summary: string }[];
    misconceptions: string[];
    evaluator_notes: string;
    sources: { title: string; note: string }[];
  };
  // Clearly labelled sample responses, shown under Selected Approaches until real people share theirs.
  samples: { display_name: string; title: string; selected_label: string; body: string }[];
}
