// Daily Challenge: the generate Edge Function (Supabase, Deno). Admins draft challenges with AI,
// following the Challenge Creation & Quality Standard. Drafts are saved Pending fact verification
// and are never published automatically. Logic: ../_shared/generation/generate.ts
import Anthropic from "npm:@anthropic-ai/sdk@1.12.0";
import { createClient } from "npm:@supabase/supabase-js@2.119.2";
import { anthropicProvider } from "../_shared/evaluation/providers/anthropic.ts";
import type { EvalProvider } from "../_shared/evaluation/types.ts";
import { type GenClaim, type GenStore, serveGenerate } from "../_shared/generation/generate.ts";

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

const store: GenStore = {
  async claim(userId, perDay) {
    return must(await admin.rpc("gen_claim", { p_user: userId, p_per_day: perDay })) as GenClaim;
  },
  async save(userId, callId, doc, provider, model, inputTokens, outputTokens) {
    return must(await admin.rpc("gen_save_draft", { p_user: userId, p_call: callId, p_doc: doc, p_provider: provider, p_model: model,
      p_input_tokens: inputTokens, p_output_tokens: outputTokens })) as { id: string; number: number };
  },
  async fail(callId, code, provider, model) {
    must(await admin.rpc("gen_fail", { p_call: callId, p_code: code, p_provider: provider, p_model: model }));
  },
};

let provider: EvalProvider | null = null;
if (env("ANTHROPIC_API_KEY")) {
  provider = anthropicProvider(new Anthropic({ apiKey: env("ANTHROPIC_API_KEY") }), Anthropic, { model: env("GEN_MODEL", "claude-opus-5-5") });
} else {
  console.warn("generate: no AI provider configured (set ANTHROPIC_API_KEY); requests will get not_configured");
}

Deno.serve(req => serveGenerate(req, {
  async authenticate(authorization) {
    const token = authorization?.replace(/^Bearer\s+/i, "");
    if (!token) return null;
    const { data, error } = await admin.auth.getUser(token);
    return error || !data.user || data.user.is_anonymous ? null : data.user.id; // admin rights are checked in gen_claim
  },
  store,
  provider,
  perDay: num("GEN_PER_DAY", 10),
  // Supabase stops a function after 150 s on the free plan (400 s on paid plans).
  timeoutMs: num("GEN_TIMEOUT_MS", 140_000),
  effort: (env("GEN_EFFORT", "medium") as "low" | "medium" | "high"),
  allowedOrigins: env("APP_ORIGINS", "*").split(",").map(s => s.trim()).filter(Boolean),
  log: (event, data) => console.log(JSON.stringify({ event, ...data })),
}));
