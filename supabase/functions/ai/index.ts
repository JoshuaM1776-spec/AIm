// Aim Plus — AI endpoint (Supabase Edge Function).
// The Claude API key lives only here, as a Supabase secret. The extension never sees it.
// See supabase/README.md for setup.

import Anthropic from "npm:@anthropic-ai/sdk@0.135.0";
import { createClient } from "npm:@supabase/supabase-js@2.118.0";
import { type ClaudeResult, corsHeaders, type Deps, handle } from "./handler.ts";
import type { AiRequest, Assessment, TeachbackDb, Turn } from "./teachback.ts";

const env = (k: string, d = "") => Deno.env.get(k) ?? d;
const num = (k: string, d: number) => {
  const n = Number(env(k));
  return Number.isFinite(n) && n > 0 ? n : d;
};

// "main" plans sessions and writes results; "fast" handles each answer, where speed matters.
const MODELS = {
  main: env("AIM_MODEL", "claude-opus-5-5"),
  fast: env("AIM_MODEL_FAST", "claude-haiku-5-5")
};

const admin = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { persistSession: false, autoRefreshToken: false }
});
const anthropic = new Anthropic({ apiKey: env("ANTHROPIC_API_KEY") });

// Tokens consumed across every attempt, including a fallback model's.
function tokens(usage: Anthropic.Beta.BetaUsage | undefined) {
  if (!usage) return { inputTokens: 0, outputTokens: 0 };
  if (usage.iterations?.length) {
    let inputTokens = 0, outputTokens = 0;
    for (const it of usage.iterations) {
      inputTokens += (it as { input_tokens?: number }).input_tokens ?? 0;
      outputTokens += (it as { output_tokens?: number }).output_tokens ?? 0;
    }
    return { inputTokens, outputTokens };
  }
  return { inputTokens: usage.input_tokens ?? 0, outputTokens: usage.output_tokens ?? 0 };
}

async function callClaude({ system, prompt, maxTokens, tier = "main", schema }: AiRequest): Promise<ClaudeResult> {
  try {
    const msg = await anthropic.beta.messages.create({
      model: MODELS[tier],
      max_tokens: maxTokens,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default", // if the model declines, the API retries on its default fallback model
      output_config: { effort: "low", ...(schema ? { format: { type: "json_schema" as const, schema } } : {}) },
      system,
      messages: [{ role: "user", content: prompt }]
    });
    const used = tokens(msg.usage);
    if (msg.stop_reason === "refusal") {
      console.warn("refusal", msg.stop_details?.category ?? null);
      return { ok: false, kind: "refusal", model: msg.model, ...used };
    }
    if (msg.stop_reason === "max_tokens") console.warn("reply cut off at max_tokens", tier);
    const text = msg.content.map(b => (b.type === "text" ? b.text : "")).join("");
    return { ok: true, text, model: msg.model, ...used };
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) return { ok: false, kind: "busy", inputTokens: 0, outputTokens: 0 };
    if (e instanceof Anthropic.APIError) {
      console.error("claude api error", e.status, e.message);
      const busy = e.status === 529 || e.status === 503;
      return { ok: false, kind: busy ? "busy" : "error", inputTokens: 0, outputTokens: 0, detail: `status ${e.status}` };
    }
    console.error("claude call failed", e);
    return { ok: false, kind: "error", inputTokens: 0, outputTokens: 0 };
  }
}

// TeachBack's storage. Only this server writes these tables; users can read their own rows (RLS).
const must = <T>(r: { data: T; error: { message: string } | null }): T => {
  if (r.error) throw new Error(r.error.message);
  return r.data;
};
const db: TeachbackDb = {
  async selfLearner(accountId) {
    const found = must(await admin.from("learners").select("id").eq("account_id", accountId).eq("is_self", true).maybeSingle());
    if (found) return found.id;
    const made = await admin.from("learners").insert({ account_id: accountId, is_self: true }).select("id").single();
    if (!made.error) return made.data.id;
    // Created by a request running at the same moment.
    return must(await admin.from("learners").select("id").eq("account_id", accountId).eq("is_self", true).single())!.id;
  },
  async createAssessment({ learnerId, topic, notes, contentType, objectives }) {
    return must(await admin.from("assessments")
      .insert({ learner_id: learnerId, topic, notes, content_type: contentType, objectives }).select("id").single())!.id;
  },
  async getAssessment(id) {
    const a = must(await admin.from("assessments").select("*, learners!inner(account_id)").eq("id", id).maybeSingle());
    if (!a) return null;
    const turns = must(await admin.from("assessment_turns")
      .select("seq, objective, student, kind, question, status, answer, hints, evaluation").eq("assessment_id", id).order("seq"));
    const { learners, ...assessment } = a as Assessment & { learners: { account_id: string } };
    return { assessment: assessment as Assessment, accountId: learners.account_id, turns: turns as Turn[] };
  },
  async addTurn(assessmentId, t) {
    must(await admin.from("assessment_turns").insert({ assessment_id: assessmentId, ...t }));
    must(await admin.from("assessments").update({ updated_at: new Date().toISOString() }).eq("id", assessmentId));
  },
  async updateTurn(assessmentId, seq, patch) {
    must(await admin.from("assessment_turns").update(patch).eq("assessment_id", assessmentId).eq("seq", seq));
    must(await admin.from("assessments").update({ updated_at: new Date().toISOString() }).eq("id", assessmentId));
  },
  async updateAssessment(id, { status, result, finished }) {
    const now = new Date().toISOString();
    must(await admin.from("assessments").update({
      updated_at: now, ...(status ? { status } : {}), ...(result ? { result } : {}), ...(finished ? { finished_at: now } : {})
    }).eq("id", id));
  },
  async addProgress(events) {
    must(await admin.from("progress_events").insert(events.map(e => ({
      learner_id: e.learnerId, source: "teachback", kind: e.kind, topic: e.topic,
      objective: e.objective, evidence: e.evidence || null, assessment_id: e.assessmentId
    }))));
  }
};

// Your data. Deleting the auth user removes everything else too: every table references it
// (or a learner that does) with "on delete cascade".
const account: NonNullable<Deps["account"]> = {
  async exportData(userId) {
    const profile = must(await admin.from("profiles").select("plan, created_at").eq("id", userId).maybeSingle());
    const usage = must(await admin.from("ai_usage").select("created_at, task, model, input_tokens, output_tokens, ok")
      .eq("user_id", userId).order("created_at"));
    const learners = must(await admin.from("learners").select("id, name, is_self, created_at").eq("account_id", userId));
    const ids = (learners || []).map(l => l.id);
    const assessments = ids.length ? must(await admin.from("assessments")
      .select("id, learner_id, kind, topic, notes, objectives, status, result, created_at, finished_at").in("learner_id", ids).order("created_at")) : [];
    const aIds = (assessments || []).map(a => a.id);
    const turns = aIds.length ? must(await admin.from("assessment_turns")
      .select("assessment_id, seq, objective, student, kind, question, status, answer, hints, evaluation, created_at").in("assessment_id", aIds).order("seq")) : [];
    const progress = ids.length ? must(await admin.from("progress_events")
      .select("learner_id, source, kind, topic, objective, evidence, assessment_id, created_at").in("learner_id", ids).order("created_at")) : [];
    return { profile, aiUsage: usage, learners, assessments, assessmentTurns: turns, progress };
  },
  async deleteUser(userId) {
    const { error } = await admin.auth.admin.deleteUser(userId);
    if (error) throw new Error(error.message);
  }
};

const deps: Deps = {
  async getUser(token) {
    const { data, error } = await admin.auth.getUser(token);
    return error || !data.user ? null : { id: data.user.id, email: data.user.email };
  },
  async getPlan(userId) {
    const { data } = await admin.from("profiles").select("plan").eq("id", userId).maybeSingle();
    return data?.plan === "plus" ? "plus" : "free";
  },
  async usageSince(userId, since) {
    const { data, error } = await admin.from("ai_usage").select("input_tokens, output_tokens")
      .eq("user_id", userId).gte("created_at", since.toISOString());
    if (error) throw error;
    return { calls: data.length, tokens: data.reduce((s, r) => s + r.input_tokens + r.output_tokens, 0) };
  },
  async begin(userId, task, limits) {
    const { data, error } = await admin.rpc("ai_begin", {
      p_user: userId, p_task: task,
      p_day_calls: limits.dayCalls, p_day_tokens: limits.dayTokens, p_minute_calls: limits.minuteCalls
    }).single();
    if (error) throw error;
    const row = data as { usage_id: number | null; limited: string | null };
    return { usageId: row.usage_id, limited: row.limited };
  },
  async finish(usageId, model, inputTokens, outputTokens, ok) {
    const { error } = await admin.rpc("ai_finish", { p_id: usageId, p_model: model, p_input: inputTokens, p_output: outputTokens, p_ok: ok });
    if (error) console.error("ai_finish failed", error.message);
  },
  callClaude,
  db,
  account,
  now: () => new Date(),
  config: {
    origins: env("AIM_EXTENSION_ORIGINS").split(",").map(s => s.trim()).filter(Boolean),
    limits: {
      dayCalls: num("AIM_DAY_CALLS", 300),
      dayTokens: num("AIM_DAY_TOKENS", 400_000),
      minuteCalls: num("AIM_MINUTE_CALLS", 20)
    },
    // Free accounts use only the librarian: a small daily allowance.
    freeLimits: {
      dayCalls: num("AIM_FREE_DAY_CALLS", 40),
      dayTokens: num("AIM_FREE_DAY_TOKENS", 80_000),
      minuteCalls: num("AIM_FREE_MINUTE_CALLS", 10)
    },
    maxBodyBytes: 24 * 1024 // a pasted study guide can run to a few pages
  }
};

Deno.serve(async req => {
  try {
    return await handle(req, deps);
  } catch (e) {
    console.error("unhandled", e);
    return new Response(JSON.stringify({ ok: false, error: { code: "server", message: "Something went wrong. Try again." } }),
      { status: 500, headers: { ...corsHeaders(req.headers.get("Origin"), deps.config), "Content-Type": "application/json" } });
  }
});
