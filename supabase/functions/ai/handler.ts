// Aim Plus — the AI endpoint's logic, free of Deno and SDK imports so it can be tested in Node.
// index.ts wires it to Supabase and the Claude API.
//
// Request:  POST { task, input? } with "Authorization: Bearer <user access token>"
// Response: 200 { ok: true, ... } or an error status with { ok: false, error: { code, message } }

export type Plan = "free" | "plus";

export interface Limits {
  dayCalls: number;    // AI calls per user per rolling 24 hours
  dayTokens: number;   // input + output tokens per user per rolling 24 hours
  minuteCalls: number; // burst limit
}

export interface Config {
  origins: string[];   // allowed extension origins; empty allows any chrome-extension:// origin
  limits: Limits;
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
  callClaude(req: { system: string; prompt: string; maxTokens: number }): Promise<ClaudeResult>;
  now(): Date;
  config: Config;
}

// What each task may do. Tasks without `ai` never reach Claude and are open to every plan.
interface Task {
  plan?: Plan;
  ai?: (input: unknown) => { system: string; prompt: string; maxTokens: number };
  reply?: (text: string) => Record<string, unknown>;
}

export const TASKS: Record<string, Task> = {
  // Account and usage for the signed-in user. No AI.
  status: {},
  // A tiny AI call that proves the whole path works: account, plan, limits, server key, model.
  check: {
    plan: "plus",
    ai: () => ({
      system: "You are a connection test for the Aim browser extension. Follow the instruction exactly.",
      prompt: "Reply with exactly one word: ready",
      maxTokens: 1024
    }),
    reply: text => ({ reply: text.trim().slice(0, 40) })
  }
};

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
  const task = Object.hasOwn(TASKS, name) ? TASKS[name] : null;
  if (!task) return fail(400, "task", "Unknown task.", cors);

  let user;
  try { user = await deps.getUser(token); } catch { user = null; }
  if (!user) return fail(401, "auth", "Your sign-in has expired. Sign in again.", cors);

  const plan = await deps.getPlan(user.id);

  if (name === "status") {
    const since = new Date(deps.now().getTime() - 24 * 3600 * 1000);
    const usage = await deps.usageSince(user.id, since);
    return json(200, { ok: true, email: user.email ?? null, plan, usage, limits: deps.config.limits }, cors);
  }

  if (task.plan === "plus" && plan !== "plus") return fail(403, "plan", "This needs Aim Plus.", cors);
  if (!task.ai) return fail(400, "task", "Unknown task.", cors);

  let request;
  try { request = task.ai(body.input); } catch (e) { return fail(400, "input", String((e as Error)?.message || e), cors); }

  const { usageId, limited } = await deps.begin(user.id, name, deps.config.limits);
  if (usageId == null) return fail(429, "limit", LIMIT_MESSAGES[limited || ""] || LIMIT_MESSAGES.day_calls, cors);

  let result: ClaudeResult;
  try {
    result = await deps.callClaude(request);
  } catch (e) {
    result = { ok: false, kind: "error", inputTokens: 0, outputTokens: 0, detail: String((e as Error)?.message || e) };
  }
  await deps.finish(usageId, result.model ?? null, result.inputTokens, result.outputTokens, result.ok);

  if (result.ok) return json(200, { ok: true, ...(task.reply ? task.reply(result.text) : { text: result.text }) }, cors);
  if (result.kind === "refusal") return fail(422, "refusal", "The AI declined this request.", cors);
  if (result.kind === "busy") return fail(503, "busy", "The AI is busy right now. Try again shortly.", cors);
  return fail(502, "upstream", "The AI couldn't be reached. Try again shortly.", cors);
}
