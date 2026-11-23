// The built-in TEST evaluator, for local development and automated tests only. It is not an AI
// and its feedback is mechanical; the app labels every evaluation it produces as a test
// evaluation. It is never used unless EVAL_PROVIDER=test is set explicitly, and the Supabase
// Edge Function refuses to load it.
import type { EvalProvider, ProviderRequest, ProviderResult } from "../types.ts";

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

export function testProvider(opts: { delayMs?: number; fail?: "timeout" | "invalid" | null } = {}): EvalProvider {
  return {
    name: "test",
    model: "test-evaluator",
    async evaluate(req: ProviderRequest, signal: AbortSignal): Promise<ProviderResult> {
      if (opts.delayMs) {
        await new Promise<void>((resolve, reject) => {
          const t = setTimeout(resolve, opts.delayMs);
          signal.addEventListener("abort", () => { clearTimeout(t); reject(new Error("aborted")); });
        }).catch(() => undefined);
        if (signal.aborted) return { ok: false, code: "timeout" };
      }
      const body = /<response[^>]*>\n([\s\S]*?)\n<\/response>/.exec(req.prompt)?.[1] ?? "";
      if (opts.fail === "invalid" || /\[\[test:invalid\]\]/.test(body)) return { ok: true, output: { scores: {} }, model: "test-evaluator", inputTokens: 0, outputTokens: 0 };
      if (opts.fail === "timeout" || /\[\[test:timeout\]\]/.test(body)) return { ok: false, code: "timeout" };
      const words = body.split(/\s+/).filter(Boolean);
      const paragraphs = body.split(/\n\s*\n/).filter(p => p.trim()).length;
      const has = (re: RegExp) => re.test(body.toLowerCase());
      const reasoning = 45 + (has(/\bbecause\b/) ? 12 : 0) + (has(/\bhowever\b|\bbut\b/) ? 8 : 0) + (has(/trade-?off|risk/) ? 10 : 0) + (has(/evidence|data|records/) ? 8 : 0);
      const understanding = 50 + Math.min(30, words.length / 12);
      const organization = 50 + Math.min(30, paragraphs * 7);
      const sentences = body.split(/[.!?]+\s/).filter(Boolean);
      const avg = words.length / Math.max(1, sentences.length);
      const clarity = 85 - Math.max(0, avg - 22) * 2;
      const first = (sentences[0] ?? "").trim().slice(0, 120);
      return {
        ok: true,
        model: "test-evaluator",
        inputTokens: 0,
        outputTokens: 0,
        output: {
          scores: {
            understanding: { score: clamp(understanding), rationale: `Test evaluator: based on length (${words.length} words).` },
            reasoning: { score: clamp(reasoning), rationale: "Test evaluator: based on reasoning words such as because, however and trade-off." },
            clarity: { score: clamp(clarity), rationale: `Test evaluator: average sentence length ${avg.toFixed(0)} words.` },
            organization: { score: clamp(organization), rationale: `Test evaluator: ${paragraphs} paragraph(s).` },
          },
          summary: "This is a mechanical test evaluation, not an AI assessment.",
          did_well: [first ? `You opened with a clear statement: "${first}"` : "You submitted a response."],
          consider_further: [has(/trade-?off/) ? "Test evaluator: consider naming the strongest objection to your plan." : "Test evaluator: you didn't mention any trade-offs."],
          keep_growing: "Test evaluator: in a real evaluation, this would be a specific suggestion.",
          factual_concerns: [],
        },
      };
    },
  };
}
