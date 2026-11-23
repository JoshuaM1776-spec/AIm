// Daily Challenge: the evaluate Edge Function (Supabase, Deno).
// The AI key lives only here, as a Supabase secret; browsers never see it.
// Logic: ../_shared/evaluation/handler.ts (also run by the Node dev server and the tests).
import Anthropic from "npm:@anthropic-ai/sdk@1.12.0";
import { createClient } from "npm:@supabase/supabase-js@2.119.2";
import { serveEvaluate } from "../_shared/evaluation/handler.ts";
import { anthropicProvider } from "../_shared/evaluation/providers/anthropic.ts";
import type { ClaimResult, EvalProvider, EvalStore } from "../_shared/evaluation/types.ts";

const env = (k: string, d = "") => Deno.env.get(k) ?? d;
const num = (k: string, d: number) => {
  const n = Number(env(k));
  return Number.isFinite(n) && n > 0 ? n : d;
};

const admin = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { persistSession: false, autoRefreshToken: false },
});

const must = <T>(r: { data: T; error: { message: string } | null }): T => {
  if (r.error) throw new Error(r.error.message);
  return r.data;
};

const store: EvalStore = {
  async claim(userId, submissionId, perHour, perDay) {
    return must(await admin.rpc("eval_claim", { p_user: userId, p_submission: submissionId, p_per_hour: perHour, p_per_day: perDay })) as ClaimResult;
  },
  async complete(id, evaluation, provider, model, inputTokens, outputTokens) {
    const r = must(await admin.rpc("eval_complete", {
      p_evaluation: id, p_scores: evaluation.scores, p_feedback: evaluation.feedback, p_provider: provider,
      p_model: model, p_input_tokens: inputTokens, p_output_tokens: outputTokens,
    })) as { ok: boolean };
    return r.ok;
  },
  async fail(id, code, provider, model) {
    must(await admin.rpc("eval_fail", { p_evaluation: id, p_code: code, p_provider: provider, p_model: model }));
  },
};

// Only the real AI provider is available here. The test evaluator is for local development.
let provider: EvalProvider | null = null;
const kind = env("EVAL_PROVIDER", "anthropic");
if (kind === "anthropic" && env("ANTHROPIC_API_KEY")) {
  provider = anthropicProvider(new Anthropic({ apiKey: env("ANTHROPIC_API_KEY") }), Anthropic, {
    model: env("EVAL_MODEL", "claude-opus-5-5"),
    effort: (env("EVAL_EFFORT", "medium") as "low" | "medium" | "high"),
  });
} else {
  console.warn("evaluate: no AI provider configured (set ANTHROPIC_API_KEY); requests will get not_configured");
}

Deno.serve(req => serveEvaluate(req, {
  async authenticate(authorization) {
    const token = authorization?.replace(/^Bearer\s+/i, "");
    if (!token) return null;
    const { data, error } = await admin.auth.getUser(token);
    return error || !data.user || data.user.is_anonymous ? null : data.user.id;
  },
  store,
  provider,
  limits: { perHour: num("EVAL_PER_HOUR", 8), perDay: num("EVAL_PER_DAY", 24) },
  timeoutMs: num("EVAL_TIMEOUT_MS", 120_000),
  allowedOrigins: env("APP_ORIGINS", "*").split(",").map(s => s.trim()).filter(Boolean),
  // Never log response text.
  log: (event, data) => console.log(JSON.stringify({ event, ...data })),
}));
