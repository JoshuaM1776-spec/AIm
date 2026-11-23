// Checks the evaluator's JSON before anything is stored or shown. Anything that doesn't match is
// rejected (and the user is told the evaluation failed), never patched up into fake feedback.
import { CATEGORIES, type Category, type Evaluation } from "./types.ts";

export type Validated = { ok: true; evaluation: Evaluation } | { ok: false; reason: string };

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

function str(v: unknown, max: number, field: string, allowEmpty = false): string {
  if (typeof v !== "string") throw new Error(`${field} is not text`);
  const s = v.replace(/\s+\n/g, "\n").trim();
  if (!allowEmpty && !s) throw new Error(`${field} is empty`);
  // Overlong text is cut at a word boundary rather than rejected.
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(" "), max - 40)).trim()}…`;
}

function list(v: unknown, min: number, max: number, itemMax: number, field: string): string[] {
  if (!Array.isArray(v)) throw new Error(`${field} is not a list`);
  const items = v.map((x, i) => str(x, itemMax, `${field}[${i}]`, true)).filter(Boolean).slice(0, max);
  if (items.length < min) throw new Error(`${field} needs at least ${min} item(s)`);
  return items;
}

export function validateEvaluation(raw: unknown): Validated {
  try {
    const v = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!isObj(v) || !isObj(v.scores)) throw new Error("missing scores");
    const scores = {} as Record<Category, number>;
    const rationales = {} as Record<Category, string>;
    for (const k of CATEGORIES) {
      const entry = v.scores[k];
      if (!isObj(entry)) throw new Error(`missing ${k}`);
      const n = entry.score;
      if (typeof n !== "number" || !Number.isFinite(n) || n < 0 || n > 100) throw new Error(`${k} score out of range`);
      scores[k] = Math.round(n);
      rationales[k] = str(entry.rationale, 500, `${k}.rationale`);
    }
    return {
      ok: true,
      evaluation: {
        scores,
        feedback: {
          summary: str(v.summary, 400, "summary"),
          did_well: list(v.did_well, 1, 3, 450, "did_well"),
          consider_further: list(v.consider_further, 1, 3, 450, "consider_further"),
          keep_growing: str(v.keep_growing, 450, "keep_growing"),
          factual_concerns: v.factual_concerns === undefined ? [] : list(v.factual_concerns, 0, 3, 400, "factual_concerns"),
          rationales,
        },
      },
    };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : "unreadable" };
  }
}

export const overallScore = (s: Record<Category, number>) =>
  Math.round((s.understanding + s.reasoning + s.clarity + s.organization) / 4);
