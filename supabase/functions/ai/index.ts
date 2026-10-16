// Aim Plus — AI endpoint (Supabase Edge Function).
// The Claude API key lives only here, as a Supabase secret. The extension never sees it.
// See supabase/README.md for setup.

import Anthropic from "npm:@anthropic-ai/sdk@0.135.0";
import { createClient } from "npm:@supabase/supabase-js@2.118.0";
import { type ClaudeResult, corsHeaders, type Deps, handle } from "./handler.ts";

const env = (k: string, d = "") => Deno.env.get(k) ?? d;
const num = (k: string, d: number) => {
  const n = Number(env(k));
  return Number.isFinite(n) && n > 0 ? n : d;
};

const MODEL = env("AIM_MODEL", "claude-opus-5-5");

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

async function callClaude({ system, prompt, maxTokens }: { system: string; prompt: string; maxTokens: number }): Promise<ClaudeResult> {
  try {
    const msg = await anthropic.beta.messages.create({
      model: MODEL,
      max_tokens: maxTokens,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default", // if the model declines, the API retries on its default fallback model
      output_config: { effort: "low" },
      system,
      messages: [{ role: "user", content: prompt }]
    });
    const used = tokens(msg.usage);
    if (msg.stop_reason === "refusal") {
      console.warn("refusal", msg.stop_details?.category ?? null);
      return { ok: false, kind: "refusal", model: msg.model, ...used };
    }
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
  now: () => new Date(),
  config: {
    origins: env("AIM_EXTENSION_ORIGINS").split(",").map(s => s.trim()).filter(Boolean),
    limits: {
      dayCalls: num("AIM_DAY_CALLS", 300),
      dayTokens: num("AIM_DAY_TOKENS", 400_000),
      minuteCalls: num("AIM_MINUTE_CALLS", 20)
    },
    maxBodyBytes: 8 * 1024
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
