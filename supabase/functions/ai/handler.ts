// Aim Plus — the AI endpoint's logic, free of Deno and SDK imports so it can be tested in Node.
// index.ts wires it to Supabase and the Claude API.
//
// Request:  POST { task, input? } with "Authorization: Bearer <user access token>"
// Response: 200 { ok: true, ... } or an error status with { ok: false, error: { code, message } }

import { type AiRequest, type TaskCtx, type TeachbackDb, TaskError, finishTask, get, start, turn } from "./teachback.ts";
import { ask, questions, rank } from "./librarian.ts";
import { studyPlan, studyApply } from "./study.ts";
import { careers, step, themes, where } from "./pathways.ts";
import { videoConcepts } from "./video.ts";
import { talk } from "./talk.ts";
import { scenarioTurn } from "./scenario.ts";
import { deeperStep } from "./deeper.ts";
import { type SyncStore, SyncError, readSyncInput } from "./sync.ts";
import { type HsDb, HS_TASKS } from "./homeschool.ts";

export type Plan = "free" | "plus" | "homeschool"; // Homeschool includes everything in Plus

export interface Limits {
  dayCalls: number;    // AI calls per user per rolling 24 hours
  dayTokens: number;   // input + output tokens per user per rolling 24 hours
  minuteCalls: number; // burst limit
}

export interface Config {
  origins: string[];   // allowed extension origins; empty allows any chrome-extension:// origin
  webOrigins?: string[]; // the parent website's address(es), e.g. https://family.example.com
  limits: Limits;      // Plus accounts
  freeLimits?: Limits; // free accounts (the librarian only); defaults to a tenth of `limits`
  maxBodyBytes: number;
  maxSyncBytes?: number; // a sync round, a curriculum upload or a whole plan carries more; defaults to maxBodyBytes
}

export type ClaudeResult =
  | { ok: true; text: string; model: string; inputTokens: number; outputTokens: number }
  | { ok: false; kind: "refusal" | "busy" | "error"; model?: string; inputTokens: number; outputTokens: number; detail?: string };

export interface Deps {
  getUser(token: string): Promise<{ id: string; email?: string } | null>;
  getPlan(userId: string): Promise<Plan>;
  usageSince(userId: string, since: Date): Promise<{ calls: number; tokens: number }>;
  taskCountSince?(userId: string, task: string, since: Date): Promise<number>; // AI calls of one kind, for per-feature caps
  begin(userId: string, task: string, limits: Limits): Promise<{ usageId: number | null; limited: string | null }>;
  finish(usageId: number, model: string | null, inputTokens: number, outputTokens: number, ok: boolean): Promise<void>;
  callClaude(req: AiRequest): Promise<ClaudeResult>;
  db?: TeachbackDb;
  account?: {
    exportData(userId: string): Promise<Record<string, unknown>>; // everything stored for the account
    deleteUser(userId: string): Promise<void>;                    // deletes the account; its data goes with it
  };
  // Stripe, when configured (billing.ts). Absent: Plus is given by hand in the profiles table.
  billing?: {
    info(userId: string): Promise<{ status: string | null; renewsAt: string | null; cancelAtPeriodEnd: boolean; customer: string | null }>;
    checkout(user: { id: string; email?: string }, customer: string | null): Promise<string>;
    portal(customer: string): Promise<string>;
    close(customer: string): Promise<void>; // deleting the account: cancels the subscription
  };
  sync?: SyncStore;   // Plus sync across devices (sync.ts)
  hs?: HsDb;          // Aim Homeschool: the parent website and paired student devices (homeschool.ts)
  now(): Date;
  config: Config;
}

// What each task may do. Each one builds its own prompts here on the server, so the extension can
// never send arbitrary prompts on Aim's key. Every AI call a task makes counts against the limits.
interface Task {
  plan?: Plan;
  run(ctx: TaskCtx & { plan?: Plan; usage?: { countSince(task: string, since: Date): Promise<number> } }): Promise<Record<string, unknown>>;
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
  // Study sessions: see study.ts.
  "study-plan": { plan: "plus", run: studyPlan },
  "study-apply": { plan: "plus", run: studyApply },
  // The librarian: any signed-in account, within its plan's allowance. See librarian.ts.
  "librarian-ask": { run: ask },
  "librarian-rank": { run: rank },
  "librarian-questions": { run: questions },
  // Talking a session through: any account; free ones get one conversation a day (talk.ts).
  "librarian-talk": { run: talk },
  // Pathways: see pathways.ts. "Where could this take me?" uses nothing about the student, so any
  // signed-in account may ask; the rest is Aim Plus.
  "pathways-where": { run: where },
  "pathways-themes": { plan: "plus", run: themes },
  "pathways-careers": { plan: "plus", run: careers },
  "pathways-step": { plan: "plus", run: step },
  // "In this video": a video's concepts from its title, description and chapters. See video.ts.
  "video-concepts": { plan: "plus", run: videoConcepts },
  // Scenarios: a situation as it unfolds, from the person's own references. See scenario.ts.
  "scenario-turn": { plan: "plus", run: scenarioTurn },
  // Going deeper: one more level of why. See deeper.ts.
  "deeper-step": { plan: "plus", run: deeperStep }
};

// Requests that may carry more than a few pages: up to maxSyncBytes.
const BIG_TASKS = new Set(["sync", "hs-upload-add", "hs-curriculum-build", "hs-curriculum-save", "hs-week-save",
  "librarian-talk", "video-concepts", "scenario-turn", "deeper-step", "pathways-themes"]); // caption excerpts or reference passages (Plus); each task trims them to its own limits

// Handled directly in handle(), without AI.
const ACCOUNT_TASKS = new Set(["status", "account-export", "account-delete", "billing-checkout", "billing-portal", "sync", "sync-erase"]);

export function limitsFor(plan: Plan, config: Config): Limits {
  if (plan === "plus" || plan === "homeschool") return config.limits;
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
  if (config.webOrigins?.includes(origin)) return true;
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
  const size = new TextEncoder().encode(raw).length, cfg = deps.config;
  if (size > Math.max(cfg.maxBodyBytes, cfg.maxSyncBytes || 0)) return fail(413, "too_large", "That request is too large.", cors);
  let body: { task?: unknown; input?: unknown };
  try { body = JSON.parse(raw || "{}"); } catch { return fail(400, "bad_json", "The request isn't valid JSON.", cors); }
  const name = typeof body?.task === "string" ? body.task : "";
  if (size > (BIG_TASKS.has(name) ? cfg.maxSyncBytes || cfg.maxBodyBytes : cfg.maxBodyBytes)) return fail(413, "too_large", "That request is too large.", cors);
  if (!ACCOUNT_TASKS.has(name) && !Object.hasOwn(TASKS, name) && !Object.hasOwn(HS_TASKS, name)) return fail(400, "task", "Unknown task.", cors);

  let user;
  try { user = await deps.getUser(token); } catch { user = null; }
  if (!user) return fail(401, "auth", "Your sign-in has expired. Sign in again.", cors);

  // A student's paired extension has its family's plan.
  let plan = await deps.getPlan(user.id);
  const device = plan === "free" && deps.hs ? await deps.hs.deviceOf(user.id) : null;
  if (device) plan = await deps.getPlan(device.ownerId);

  // Account and usage for the signed-in user. No AI.
  if (name === "status") {
    const since = new Date(deps.now().getTime() - 24 * 3600 * 1000);
    const usage = await deps.usageSince(user.id, since);
    const b = deps.billing ? await deps.billing.info(user.id) : null;
    const billing = { available: !!deps.billing, status: b?.status ?? null, renewsAt: b?.renewsAt ?? null,
      cancelAtPeriodEnd: !!b?.cancelAtPeriodEnd, manage: !!b?.customer };
    return json(200, { ok: true, email: user.email ?? null, plan, usage, limits: limitsFor(plan, deps.config), billing, sync: !!deps.sync }, cors);
  }

  // Subscribe, or manage the subscription: a Stripe page for the extension to open.
  if (name === "billing-checkout" || name === "billing-portal") {
    if (!deps.billing) return fail(503, "billing", "Subscriptions aren't available yet.", cors);
    const b = await deps.billing.info(user.id);
    try {
      if (name === "billing-portal") {
        if (!b.customer) return fail(400, "billing", "There's no subscription to manage yet.", cors);
        return json(200, { ok: true, url: await deps.billing.portal(b.customer) }, cors);
      }
      if (plan === "plus" && b.customer) return json(200, { ok: true, url: await deps.billing.portal(b.customer) }, cors);
      return json(200, { ok: true, url: await deps.billing.checkout({ id: user.id, email: user.email }, b.customer) }, cors);
    } catch (e) {
      console.error("billing", (e as Error).message);
      return fail(502, "billing", "Couldn't reach the payment service. Try again shortly.", cors);
    }
  }

  // Sync across devices (Plus): this browser's changes in, other browsers' changes out. Erasing works
  // on any plan, so someone who stopped paying can still remove their copy.
  if (name === "sync" || name === "sync-erase") {
    if (!deps.sync) return fail(503, "sync", "Sync isn't available yet.", cors);
    if (name === "sync-erase") { await deps.sync.erase(user.id); return json(200, { ok: true, erased: true }, cors); }
    if (plan === "free") return fail(403, "plan", "This needs Aim Plus.", cors);
    let input;
    try { input = readSyncInput(body.input, deps.now().getTime()); }
    catch (e) { if (e instanceof SyncError) return fail(400, "sync", e.message, cors); throw e; }
    const r = await deps.sync.apply(user.id, input.device, input.since, input.items);
    return json(200, { ok: true, ...r }, cors);
  }

  // Your data: download all of it, or delete the account and everything with it. No AI.
  if (name === "account-export") {
    if (!deps.account) return fail(500, "server", "Something went wrong. Try again.", cors);
    const data = await deps.account.exportData(user.id);
    return json(200, { ok: true, exportedAt: deps.now().toISOString(), account: { id: user.id, email: user.email ?? null, plan }, ...data }, cors);
  }
  if (name === "account-delete") {
    if ((body.input as { confirm?: unknown } | undefined)?.confirm !== "DELETE") return fail(400, "confirm", "Type DELETE to confirm.", cors);
    if (!deps.account) return fail(500, "server", "Something went wrong. Try again.", cors);
    // Stop the subscription first: if that fails, keep the account, so it can be tried again.
    const customer = deps.billing ? (await deps.billing.info(user.id)).customer : null;
    if (customer) {
      try { await deps.billing!.close(customer); }
      catch (e) { console.error("billing close", (e as Error).message); return fail(502, "billing", "Couldn't cancel your subscription just now, so nothing was deleted. Try again shortly.", cors); }
    }
    await deps.account.deleteUser(user.id);
    return json(200, { ok: true, deleted: true }, cors);
  }

  // Aim Homeschool: the parent website and the student's extension (homeschool.ts checks the plan).
  if (Object.hasOwn(HS_TASKS, name)) {
    if (!deps.hs) return fail(503, "homeschool", "Aim Homeschool isn't available yet.", cors);
    const userId = user.id;
    const ctx = { userId, input: body.input, now: deps.now(), db: deps.db || NO_DB, hs: deps.hs, ownerPlan: deps.getPlan,
      ai: (taskName: string, req: AiRequest) => useAI(deps, userId, taskName, req, limitsFor("plus", deps.config)) };
    try { return json(200, { ok: true, ...(await HS_TASKS[name](ctx)) }, cors); }
    catch (e) {
      if (!(e instanceof TaskError)) throw e;
      if (e.status >= 500) console.error("homeschool", name, e.status, e.code, e.message); // so it's in the function's logs
      return fail(e.status, e.code, e.message, cors);
    }
  }

  const task = TASKS[name];
  if (task.plan === "plus" && plan === "free") return fail(403, "plan", "This needs Aim Plus.", cors);

  const userId = user.id;
  const ctx = {
    userId, input: body.input, now: deps.now(), db: deps.db || NO_DB, plan,
    usage: deps.taskCountSince ? { countSince: (t: string, since: Date) => deps.taskCountSince!(userId, t, since) } : undefined,
    ai: (taskName: string, req: AiRequest) => useAI(deps, userId, taskName, req, limitsFor(plan, deps.config))
  };
  try {
    return json(200, { ok: true, ...(await task.run(ctx)) }, cors);
  } catch (e) {
    if (e instanceof TaskError) return fail(e.status, e.code, e.message, cors);
    throw e;
  }
}
