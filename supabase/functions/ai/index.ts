// Aim Plus — AI endpoint (Supabase Edge Function).
// The Claude API key lives only here, as a Supabase secret. The extension never sees it.
// See supabase/README.md for setup.

import Anthropic from "npm:@anthropic-ai/sdk@0.135.0";
import { createClient } from "npm:@supabase/supabase-js@2.118.0";
import { type ClaudeResult, corsHeaders, type Deps, handle } from "./handler.ts";
import type { AiRequest, Assessment, TeachbackDb, Turn } from "./teachback.ts";
import type { SyncStore } from "./sync.ts";
import type { HsDb } from "./homeschool.ts";
import { type BillingConfig, checkoutUrl, deleteCustomer, portalUrl, stripeApi } from "./billing.ts";

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
    // A student's paired extension works as its learner.
    const device = must(await admin.from("student_devices").select("learner_id").eq("user_id", accountId).maybeSingle());
    if (device) return device.learner_id;
    const found = must(await admin.from("learners").select("id").eq("account_id", accountId).eq("is_self", true).maybeSingle());
    if (found) return found.id;
    const made = await admin.from("learners").insert({ account_id: accountId, is_self: true }).select("id").single();
    if (!made.error) return made.data.id;
    // Created by a request running at the same moment.
    return must(await admin.from("learners").select("id").eq("account_id", accountId).eq("is_self", true).single())!.id;
  },
  async createAssessment({ learnerId, topic, notes, contentType, objectives, planObjective }) {
    return must(await admin.from("assessments")
      .insert({ learner_id: learnerId, topic, notes, content_type: contentType, objectives, plan_objective: planObjective ?? null }).select("id").single())!.id;
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
      objective: e.objective, evidence: e.evidence || null, assessment_id: e.assessmentId, plan_objective: e.planObjective ?? null
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
    const synced = must(await admin.from("sync_items").select("kind, id, rev, data").eq("user_id", userId).order("seq"));
    const household = must(await admin.from("households").select("id, name, settings, created_at").eq("owner", userId).maybeSingle());
    const homeschool = household ? {
      household,
      plans: must(await admin.from("hs_docs").select("kind, key, data, version, updated_at").eq("household_id", household.id)),
      uploads: must(await admin.from("curriculum_uploads").select("id, title, kind, text, created_at").eq("household_id", household.id))
    } : null;
    return { profile, aiUsage: usage, learners, assessments, assessmentTurns: turns, progress, synced, homeschool };
  },
  async deleteUser(userId) {
    const { error } = await admin.auth.admin.deleteUser(userId);
    if (error) throw new Error(error.message);
  }
};

// Stripe, when its secrets are set (STRIPE_SECRET_KEY, STRIPE_PRICE_PLUS). Without them, Plus is
// given by hand (profiles.plan) and Settings says subscriptions aren't available yet.
const billingCfg: BillingConfig = { secretKey: env("STRIPE_SECRET_KEY"), webhookSecret: env("STRIPE_WEBHOOK_SECRET"),
  pricePlus: env("STRIPE_PRICE_PLUS"), publicUrl: `${env("SUPABASE_URL")}/functions/v1` };
const billing: Deps["billing"] = billingCfg.secretKey && billingCfg.pricePlus ? {
  async info(userId) {
    const p = must(await admin.from("profiles").select("stripe_customer_id, plan_status, plan_renews_at, plan_cancel_at_period_end").eq("id", userId).maybeSingle());
    return { customer: p?.stripe_customer_id ?? null, status: p?.plan_status ?? null, renewsAt: p?.plan_renews_at ?? null, cancelAtPeriodEnd: !!p?.plan_cancel_at_period_end };
  },
  checkout: (user, customer) => checkoutUrl(stripeApi(billingCfg.secretKey), billingCfg, user, customer),
  portal: customer => portalUrl(stripeApi(billingCfg.secretKey), billingCfg, customer),
  close: customer => deleteCustomer(billingCfg.secretKey, customer)
} : undefined;

// Sync across devices: one database function applies a browser's changes and returns everyone else's
// (migration 0004), so the newest change wins even when two browsers sync at once.
const sync: SyncStore = {
  async apply(userId, device, since, items) {
    const r = must(await admin.rpc("sync_apply", { p_user: userId, p_device: device, p_since: since, p_items: items })) as
      { items: { kind: string; id: string; rev: number; data: unknown }[]; cursor: number; more: boolean };
    return { items: r.items, cursor: Number(r.cursor), more: !!r.more };
  },
  async erase(userId) { must(await admin.from("sync_items").delete().eq("user_id", userId)); }
};

// Aim Homeschool's storage (migration 0005). The parent's household; its students are learners.
const hsDb: HsDb = {
  async household(owner) {
    return must(await admin.from("households").select("id, owner, name, settings").eq("owner", owner).maybeSingle());
  },
  async createHousehold(owner) {
    const made = await admin.from("households").insert({ owner }).select("id, owner, name, settings").single();
    if (!made.error) return made.data;
    return must(await admin.from("households").select("id, owner, name, settings").eq("owner", owner).single())!; // made at the same moment
  },
  async saveHousehold(id, patch) { must(await admin.from("households").update(patch).eq("id", id)); },
  async learners(householdId) {
    return must(await admin.from("learners").select("id, name, levels, interests").eq("household_id", householdId).order("created_at"))!
      .map(l => ({ id: l.id, name: l.name || "", levels: l.levels || {}, interests: l.interests || "" }));
  },
  async saveLearner(householdId, owner, l) {
    if (l.id) { must(await admin.from("learners").update({ name: l.name, levels: l.levels, interests: l.interests }).eq("id", l.id).eq("household_id", householdId)); return l.id; }
    return must(await admin.from("learners").insert({ account_id: owner, household_id: householdId, name: l.name, levels: l.levels, interests: l.interests }).select("id").single())!.id;
  },
  async removeLearner(householdId, id) { must(await admin.from("learners").delete().eq("id", id).eq("household_id", householdId)); },
  async docs(householdId, kind, prefix = "") {
    let q = admin.from("hs_docs").select("key, data, version").eq("household_id", householdId).eq("kind", kind);
    if (prefix) q = q.like("key", prefix.replace(/[%_]/g, "\\$&") + "%");
    return must(await q)!;
  },
  async saveDoc(householdId, kind, key, data, expect) {
    return must(await admin.rpc("hs_save", { p_household: householdId, p_kind: kind, p_key: key, p_data: data, p_expect: expect })) as number | null;
  },
  async uploads(householdId) {
    return must(await admin.from("curriculum_uploads").select("id, title, kind, text, created_at").eq("household_id", householdId).order("created_at"))!
      .map(u => ({ id: u.id, title: u.title, kind: u.kind, chars: u.text.length, createdAt: u.created_at }));
  },
  async uploadTexts(householdId, ids) {
    if (!ids.length) return [];
    return must(await admin.from("curriculum_uploads").select("id, title, text").eq("household_id", householdId).in("id", ids))!;
  },
  async addUpload(householdId, u) {
    return must(await admin.from("curriculum_uploads").insert({ household_id: householdId, title: u.title, kind: u.kind, text: u.text, confirmed: true }).select("id").single())!.id;
  },
  async deleteUpload(householdId, id) { must(await admin.from("curriculum_uploads").delete().eq("id", id).eq("household_id", householdId)); },
  async devices(householdId) {
    const rows = must(await admin.from("student_devices").select("user_id, learner_id, paired_at, learners!inner(household_id)").eq("learners.household_id", householdId))!;
    return rows.map(r => ({ userId: r.user_id, learnerId: r.learner_id, pairedAt: r.paired_at }));
  },
  async removeDevice(householdId, userId) {
    const d = (await this.devices(householdId)).find(x => x.userId === userId);
    if (d) { must(await admin.from("student_devices").delete().eq("user_id", userId)); await admin.auth.admin.deleteUser(userId); }
  },
  async createPairCode(learnerId, codeHash, expiresAt) {
    must(await admin.from("pairing_codes").insert({ code_hash: codeHash, learner_id: learnerId, expires_at: expiresAt.toISOString() }));
  },
  async consumePairCode(codeHash, userId, now) {
    const c = must(await admin.from("pairing_codes").delete().eq("code_hash", codeHash).select("learner_id, expires_at").maybeSingle());
    if (!c || new Date(c.expires_at) < now) return null;
    must(await admin.from("student_devices").upsert({ user_id: userId, learner_id: c.learner_id, paired_at: now.toISOString() }));
    return c.learner_id;
  },
  async deviceOf(userId) {
    const d = must(await admin.from("student_devices").select("learner_id, learners!inner(household_id, households!inner(owner))").eq("user_id", userId).maybeSingle()) as
      { learner_id: string; learners: { household_id: string; households: { owner: string } } } | null;
    return d ? { learnerId: d.learner_id, householdId: d.learners.household_id, ownerId: d.learners.households.owner } : null;
  },
  async progress(ids) {
    if (!ids.length) return [];
    return must(await admin.from("progress_events").select("learner_id, source, kind, topic, objective, plan_objective, plan_item, evidence, created_at").in("learner_id", ids).order("created_at"))!
      .map(e => ({ learnerId: e.learner_id, source: e.source, kind: e.kind, topic: e.topic, objective: e.objective, planObjective: e.plan_objective, planItem: e.plan_item, evidence: e.evidence, at: e.created_at }));
  },
  async addProgress(events) {
    must(await admin.from("progress_events").insert(events.map(e => ({ learner_id: e.learnerId, source: e.source, kind: e.kind, topic: e.topic,
      objective: e.objective, plan_objective: e.planObjective, plan_item: e.planItem, evidence: e.evidence }))));
  },
  // YouTube's oEmbed: the published way to get a video's title and channel.
  async videoInfo(id) {
    const r = await fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(`https://www.youtube.com/watch?v=${id}`)}`).catch(() => null);
    if (!r?.ok) return null;
    const j = await r.json() as { title?: string; author_name?: string };
    return { title: String(j.title || ""), channel: String(j.author_name || "") };
  }
};

const deps: Deps = {
  async getUser(token) {
    const { data, error } = await admin.auth.getUser(token);
    return error || !data.user ? null : { id: data.user.id, email: data.user.email };
  },
  async getPlan(userId) {
    const { data } = await admin.from("profiles").select("plan").eq("id", userId).maybeSingle();
    return data?.plan === "plus" || data?.plan === "homeschool" ? data.plan as "plus" | "homeschool" : "free";
  },
  async usageSince(userId, since) {
    const { data, error } = await admin.from("ai_usage").select("input_tokens, output_tokens")
      .eq("user_id", userId).gte("created_at", since.toISOString());
    if (error) throw error;
    return { calls: data.length, tokens: data.reduce((s, r) => s + r.input_tokens + r.output_tokens, 0) };
  },
  async taskCountSince(userId, task, since) {
    const { count, error } = await admin.from("ai_usage").select("id", { count: "exact", head: true })
      // Calls that failed don't use up an allowance (a free conversation lost to an AI hiccup).
      .eq("user_id", userId).eq("task", task).not("ok", "is", false).gte("created_at", since.toISOString());
    if (error) throw error;
    return count || 0;
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
  billing,
  sync,
  hs: hsDb,
  now: () => new Date(),
  config: {
    origins: env("AIM_EXTENSION_ORIGINS").split(",").map(s => s.trim()).filter(Boolean),
    webOrigins: env("AIM_WEB_ORIGINS").split(",").map(s => s.trim()).filter(Boolean),
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
    maxBodyBytes: 24 * 1024, // a pasted study guide can run to a few pages
    maxSyncBytes: 1024 * 1024
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
