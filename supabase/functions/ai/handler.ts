// Aim Plus — the AI endpoint's logic, free of Deno and SDK imports so it can be tested in Node.
// index.ts wires it to Supabase and the Claude API.
//
// Request:  POST { task, input? } with "Authorization: Bearer <user access token>"
// Response: 200 { ok: true, ... } or an error status with { ok: false, error: { code, message } }

import { type AiRequest, type TaskCtx, type TeachbackDb, TaskError, finishTask, get, start, turn } from "./teachback.ts";
import { ask, rank } from "./librarian.ts";

export type Plan = "free" | "plus";

export interface Limits {
  dayCalls: number;    // AI calls per user per rolling 24 hours
  dayTokens: number;   // input + output tokens per user per rolling 24 hours
  minuteCalls: number; // burst limit
}

export interface Config {
  origins: string[];   // allowed extension origins; empty allows any chrome-extension:// origin
  limits: Limits;      // Plus accounts
  freeLimits?: Limits; // free accounts (the librarian only); defaults to a tenth of `limits`
  maxBodyBytes: number;
}

export type ClaudeResult =
  | { ok: true; text: string; model: string; inputTokens: number; outputTokens: number }
  | { ok: false; kind: "refusal" | "busy" | "error"; model?: string; inputTokens: number; outputTokens: number; detail?: string };

export interface Deps {
  getUser(token: string): Promise<{ id: string; email?: string } | null>;
  getPlan(userId: string): Promise<Plan>;
  usageSince(userId: string, since: Date): Promise<{ calls: number; tokens: number }>;
  begin(userId: string, task: string, limits: Limits): Promise<{ usageId: number | null; limited: string | null }>;
  finish(usageId: number, model: string | null, inputTokens: number, outputTokens: number, ok: boolean): Promise<void>;
  callClaude(req: AiRequest): Promise<ClaudeResult>;
  db?: TeachbackDb;
  now(): Date;
  config: Config;
}

// What each task may do. Each one builds its own prompts here on the server, so the extension can
// never send arbitrary prompts on Aim's key. Every AI call a task makes counts against the limits.
interface Task {
  plan?: Plan;
  run(ctx: TaskCtx): Promise<Record<string, unknown>>;
}

export const TASKS: Record<string, Task> = {
  // A tiny AI call that proves the whole path works: account, plan, limits, server key, model.
  check: {
    plan: "plus",
    run: async ctx => {
      const text = await ctx.ai("check", {
        system: "You are a connection test for the Aim browser extension. Follow the instruction exactly.",
        prompt: "Reply with exactly one word: ready",
        maxTokens: 1024, tier: "fast"
      });
      return { reply: text.trim().slice(0, 40) };
    }
  },
  // TeachBack: see teachback.ts.
  "teachback-start": { plan: "plus", run: start },
  "teachback-turn": { plan: "plus", run: turn },
  "teachback-finish": { plan: "plus", run: finishTask },
  "teachback-get": { plan: "plus", run: get },
  // The librarian: any signed-in account, within its plan's allowance. See librarian.ts.
  "librarian-ask": { run: ask },
  "librarian-rank": { run: rank }
};

export function limitsFor(plan: Plan, config: Config): Limits {
  if (plan === "plus") return config.limits;
  return config.freeLimits || {
    dayCalls: Math.max(1, Math.round(config.limits.dayCalls / 10)),
    dayTokens: Math.max(1, Math.round(config.limits.dayTokens / 10)),
    minuteCalls: Math.max(1, Math.round(config.limits.minuteCalls / 2))
  };
}

const LIMIT_MESSAGES: Record<string, string> = {
  minute: "Too many requests at once. Try again in a minute.",
  day_calls: "You've reached today's AI limit. It resets over the next 24 hours.",
  day_tokens: "You've reached today's AI limit. It resets over the next 24 hours."
};

export function corsHeaders(origin: string | null, config: Config): Record<string, string> {
  const h: Record<string, string> = {
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin"
  };
  if (origin && originAllowed(origin, config)) h["Access-Control-Allow-Origin"] = origin;
  return h;
}

export function originAllowed(origin: string, config: Config): boolean {
  return config.origins.length ? config.origins.includes(origin) : /^chrome-extension:\/\/[a-p]{32}$/.test(origin);
}

function json(status: number, body: unknown, cors: Record<string, string>): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

function fail(status: number, code: string, message: string, cors: Record<string, string>): Response {
  return json(status, { ok: false, error: { code, message } }, cors);
}

// One AI call on the user's behalf: checked against their limits first, recorded afterwards
// (failed calls too, so retry loops can't run up a bill).
async function useAI(deps: Deps, userId: string, task: string, req: AiRequest, limits: Limits): Promise<string> {
  const { usageId, limited } = await deps.begin(userId, task, limits);
  if (usageId == null) throw new TaskError(429, "limit", LIMIT_MESSAGES[limited || ""] || LIMIT_MESSAGES.day_calls);
  let result: ClaudeResult;
  try {
    result = await deps.callClaude(req);
  } catch (e) {
    result = { ok: false, kind: "error", inputTokens: 0, outputTokens: 0, detail: String((e as Error)?.message || e) };
  }
  await deps.finish(usageId, result.model ?? null, result.inputTokens, result.outputTokens, result.ok);
  if (result.ok) return result.text;
  if (result.kind === "refusal") throw new TaskError(422, "refusal", "The AI declined this request.");
  if (result.kind === "busy") throw new TaskError(503, "busy", "The AI is busy right now. Try again shortly.");
  throw new TaskError(502, "upstream", "The AI couldn't be reached. Try again shortly.");
}

const NO_DB: TeachbackDb = new Proxy({} as TeachbackDb, {
  get: () => () => { throw new TaskError(500, "server", "Something went wrong. Try again."); }
});

export async function handle(req: Request, deps: Deps): Promise<Response> {
  const origin = req.headers.get("Origin");
  const cors = corsHeaders(origin, deps.config);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return fail(405, "method", "Use POST.", cors);
  // Browsers always send Origin on cross-origin requests. Requests without one (scripts, curl)
  // still need a valid account, so the origin check only keeps other websites out.
  if (origin && !originAllowed(origin, deps.config)) return fail(403, "origin", "This origin isn't allowed.", cors);

  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return fail(401, "auth", "Sign in to use Aim Plus.", cors);

  const raw = await req.text();
  if (new TextEncoder().encode(raw).length > deps.config.maxBodyBytes) return fail(413, "too_large", "That request is too large.", cors);
  let body: { task?: unknown; input?: unknown };
  try { body = JSON.parse(raw || "{}"); } catch { return fail(400, "bad_json", "The request isn't valid JSON.", cors); }
  const name = typeof body?.task === "string" ? body.task : "";
  if (name !== "status" && !Object.hasOwn(TASKS, name)) return fail(400, "task", "Unknown task.", cors);

  let user;
  try { user = await deps.getUser(token); } catch { user = null; }
  if (!user) return fail(401, "auth", "Your sign-in has expired. Sign in again.", cors);

  const plan = await deps.getPlan(user.id);

  // Account and usage for the signed-in user. No AI.
  if (name === "status") {
    const since = new Date(deps.now().getTime() - 24 * 3600 * 1000);
    const usage = await deps.usageSince(user.id, since);
    return json(200, { ok: true, email: user.email ?? null, plan, usage, limits: limitsFor(plan, deps.config) }, cors);
  }

  const task = TASKS[name];
  if (task.plan === "plus" && plan !== "plus") return fail(403, "plan", "This needs Aim Plus.", cors);

  const userId = user.id;
  const ctx: TaskCtx = {
    userId, input: body.input, now: deps.now(), db: deps.db || NO_DB,
    ai: (taskName, req) => useAI(deps, userId, taskName, req, limitsFor(plan, deps.config))
  };
  try {
    return json(200, { ok: true, ...(await task.run(ctx)) }, cors);
  } catch (e) {
    if (e instanceof TaskError) return fail(e.status, e.code, e.message, cors);
    throw e;
  }
}
