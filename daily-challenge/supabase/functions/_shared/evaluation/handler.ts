// POST /evaluate { submissionId } with the user's access token.
// Evaluates one stored submission, at most once: a completed evaluation is never regenerated,
// a request already running is not duplicated, and every AI call counts against the user's limits.
// Uses only web-standard Request/Response, so it runs unchanged in Deno (Supabase) and Node.
import { buildRequest } from "./rubric.ts";
import type { EvalDeps } from "./types.ts";
import { validateEvaluation } from "./validate.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const MESSAGES: Record<string, string> = {
  auth: "Please sign in again.",
  bad_request: "That request wasn't understood.",
  not_found: "That submission wasn't found.",
  not_configured: "Evaluation isn't set up on this server yet. Your response is saved.",
  rate_limited: "You've requested several evaluations recently. Please try again a little later. Your response is saved.",
  timeout: "The evaluator took too long to respond. Your response is saved; please try again.",
  busy: "The evaluator is busy right now. Your response is saved; please try again in a minute.",
  refusal: "The evaluator declined to assess this response. Your response is saved.",
  invalid_output: "The evaluator returned something we couldn't use, so we didn't show it. Your response is saved; please try again.",
  upstream: "Something went wrong reaching the evaluator. Your response is saved; please try again.",
  config: "Evaluation is misconfigured on the server. Your response is saved.",
  server: "Something went wrong on our side. Your response is saved; please try again.",
};

export function corsHeaders(origin: string | null, allowed: string[]): Record<string, string> {
  const allow = allowed.includes("*") ? "*" : origin && allowed.includes(origin) ? origin : allowed[0] ?? "";
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

export async function serveEvaluate(req: Request, deps: EvalDeps): Promise<Response> {
  const cors = corsHeaders(req.headers.get("origin"), deps.allowedOrigins);
  const reply = (status: number, body: Record<string, unknown>, extra: Record<string, string> = {}) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, "content-type": "application/json", ...extra } });
  const fail = (status: number, code: string, more: Record<string, unknown> = {}) =>
    reply(status, { ok: false, error: { code, message: MESSAGES[code] ?? MESSAGES.server, ...more } });

  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return fail(405, "bad_request");

  const userId = await deps.authenticate(req.headers.get("authorization"));
  if (!userId) return fail(401, "auth");

  let submissionId: unknown;
  try {
    const text = await req.text();
    if (text.length > 2000) return fail(413, "bad_request");
    submissionId = (JSON.parse(text) as { submissionId?: unknown }).submissionId;
  } catch {
    return fail(400, "bad_request");
  }
  if (typeof submissionId !== "string" || !UUID.test(submissionId)) return fail(400, "bad_request");
  if (!deps.provider) return fail(503, "not_configured", { retryable: false });

  let claim;
  try {
    claim = await deps.store.claim(userId, submissionId, deps.limits.perHour, deps.limits.perDay);
  } catch (e) {
    deps.log?.("claim_failed", { error: String(e) });
    return fail(500, "server", { retryable: true });
  }
  switch (claim.state) {
    case "not_found": return fail(404, "not_found");
    case "complete": return reply(200, { ok: true, status: "complete" });
    case "in_progress": return reply(202, { ok: true, status: "in_progress" });
    case "rate_limited":
      return fail(429, "rate_limited", { retryable: true, retry_after: claim.retry_after });
  }

  const { provider } = deps;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), deps.timeoutMs);
  const started = Date.now();
  try {
    const result = await provider.run(buildRequest(claim.context), controller.signal);
    if (!result.ok) {
      await deps.store.fail(claim.evaluation_id, result.code, provider.name, result.model ?? provider.model);
      deps.log?.("evaluation_failed", { code: result.code, detail: result.detail, ms: Date.now() - started });
      const status = result.code === "timeout" ? 504 : result.code === "busy" ? 503 : result.code === "refusal" ? 422 : 502;
      return fail(status, result.code, { retryable: result.code !== "refusal" && result.code !== "config" });
    }
    const checked = validateEvaluation(result.output);
    if (!checked.ok) {
      await deps.store.fail(claim.evaluation_id, "invalid_output", provider.name, result.model);
      deps.log?.("evaluation_invalid", { reason: checked.reason, ms: Date.now() - started });
      return fail(502, "invalid_output", { retryable: true });
    }
    const stored = await deps.store.complete(claim.evaluation_id, checked.evaluation, provider.name, result.model,
      result.inputTokens, result.outputTokens);
    deps.log?.("evaluation_complete", { ms: Date.now() - started, model: result.model, stored });
    return reply(200, { ok: true, status: "complete" });
  } catch (e) {
    deps.log?.("evaluation_error", { error: String(e) });
    await deps.store.fail(claim.evaluation_id, "server", provider.name, provider.model).catch(() => {});
    return fail(500, "server", { retryable: true });
  } finally {
    clearTimeout(timer);
  }
}
