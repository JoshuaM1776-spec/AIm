// Shared types for the evaluation service. No imports, so the same files run in Supabase's Deno
// runtime, in the Node dev server and in unit tests.

export type Difficulty = "easy" | "moderate" | "hard";
export type Category = "understanding" | "reasoning" | "clarity" | "organization";
export const CATEGORIES: Category[] = ["understanding", "reasoning", "clarity", "organization"];

export interface ChallengeContext {
  number: number;
  title: string;
  summary: string;
  subjects: string[];
  scenario_kind: string;
  scenario_note: string;
  role: { title: string; body: string };
  situation: string;
  final_task: string;
  expectations: Record<Difficulty, string>;
  constraints: { label: string; detail: string }[];
  investigation: { title: string; questions: string[] }[];
}

export interface ReferenceContext {
  background: string;
  approaches: { title: string; summary: string }[];
  misconceptions: string[];
  evaluator_notes: string;
}

export interface EvalContext {
  challenge: ChallengeContext;
  reference: ReferenceContext | null;
  submission: { id: string; kind: "initial" | "revision"; body: string; word_count: number; difficulty: Difficulty };
}

export interface Feedback {
  summary: string;
  did_well: string[];
  consider_further: string[];
  keep_growing: string;
  factual_concerns: string[];
  rationales: Record<Category, string>;
}

export interface Evaluation {
  scores: Record<Category, number>;
  feedback: Feedback;
}

export interface ProviderRequest {
  system: string;
  prompt: string;
  schema: Record<string, unknown>;
}

export type ProviderErrorCode = "timeout" | "refusal" | "busy" | "upstream" | "invalid_output" | "config";

export type ProviderResult =
  | { ok: true; output: unknown; model: string; inputTokens: number; outputTokens: number }
  | { ok: false; code: ProviderErrorCode; model?: string; detail?: string };

export interface EvalProvider {
  name: string; // "anthropic", or "test" for the built-in test evaluator
  model: string;
  evaluate(req: ProviderRequest, signal: AbortSignal): Promise<ProviderResult>;
}

export type ClaimResult =
  | { state: "not_found" }
  | { state: "complete"; evaluation_id: string }
  | { state: "in_progress"; evaluation_id: string }
  | { state: "rate_limited"; retry_after: number }
  | { state: "claimed"; evaluation_id: string; context: EvalContext };

export interface EvalStore {
  claim(userId: string, submissionId: string, perHour: number, perDay: number): Promise<ClaimResult>;
  complete(evaluationId: string, evaluation: Evaluation, provider: string, model: string,
    inputTokens: number, outputTokens: number): Promise<boolean>;
  fail(evaluationId: string, code: string, provider: string, model: string): Promise<void>;
}

export interface EvalDeps {
  authenticate(authorization: string | null): Promise<string | null>;
  store: EvalStore;
  provider: EvalProvider | null;
  limits: { perHour: number; perDay: number };
  timeoutMs: number;
  allowedOrigins: string[]; // ["*"] allows any origin (requests still need a signed-in user's token)
  log?: (event: string, data: Record<string, unknown>) => void;
}
