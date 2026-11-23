// Drafting challenges with AI, following the Challenge Creation & Quality Standard.
// POST /generate { direction?, type? } with an admin's access token. The model drafts one complete
// challenge (public story, private evaluation guide, quality self-assessment); the server checks it
// and saves it as a draft marked Pending fact verification. Nothing is ever published automatically:
// an editor verifies the facts, reviews the quality scores and approves.
// No imports beyond relative files, so it runs in Deno (Supabase) and Node alike.
import { corsHeaders } from "../evaluation/handler.ts";
import type { EvalProvider, ProviderRequest } from "../evaluation/types.ts";
import { CHALLENGE_STANDARD } from "./standard.ts";

export const CHALLENGE_TYPES = ["solve", "investigate", "decide", "design", "explain"] as const;
export const SCENARIO_KINDS = ["historical", "fictionalized_historical", "contemporary", "fictional", "speculative"] as const;
export const QUALITY_CRITERIA = ["intrigue", "responsibility", "research_depth", "integration", "reasoning", "researchability", "clarity", "articulation"] as const;
// Must match CONSTRAINT_ICONS in src/components/icons.tsx (a unit test checks).
export const CONSTRAINT_ICON_NAMES = ["coins", "users", "mountain", "leaf", "heart-pulse", "scale", "notebook-pen", "landmark", "trending-up",
  "snowflake", "pickaxe", "package", "thermometer-snowflake", "hourglass", "zap", "timer", "wallet", "wind", "route", "map", "compass",
  "target", "gauge", "flame", "circle"] as const;
const CARD_KINDS = ["role", "situation", "constraints", "investigation", "decision"] as const;

export interface RecentChallenge { title: string; type: string; subjects: string[]; setting: string; note: string; role: string }

// ---------------------------------------------------------------------------------------------
// The JSON the model must return
// ---------------------------------------------------------------------------------------------
type Schema = Record<string, unknown>;
const str: Schema = { type: "string" };
const obj = (properties: Record<string, Schema>): Schema => ({ type: "object", properties, required: Object.keys(properties), additionalProperties: false });
const arr = (items: Schema): Schema => ({ type: "array", items });
const en = (values: readonly string[]): Schema => ({ type: "string", enum: [...values] });
const levels = obj({ easy: str, moderate: str, hard: str });

export const GENERATION_SCHEMA: Schema = obj({
  title: str,
  preview: str,
  challenge_type: en(CHALLENGE_TYPES),
  subjects: arr(str),
  research_minutes: { type: "integer" },
  scenario_kind: en(SCENARIO_KINDS),
  scenario_note: str,
  role: obj({ title: str, body: str }),
  situation: str,
  constraints: arr(obj({ label: str, detail: str, icon: en(CONSTRAINT_ICON_NAMES) })),
  investigation: arr(obj({ title: str, questions: arr(obj({ text: str, priority: en(["essential", "exploratory"]) })) })),
  final_task: str,
  expectations: levels,
  image_directions: obj(Object.fromEntries(CARD_KINDS.map(k => [k, str]))),
  reference: obj({
    background: str,
    core_knowledge: str,
    uncertainties: str,
    investigation_map: str,
    approaches: arr(obj({ title: str, summary: str, strengths: str, weaknesses: str, conditions: str })),
    critical_reasoning: str,
    misconceptions: arr(str),
    evidence_expectations: str,
    difficulty_guide: levels,
    fairness_notes: str,
    sources: arr(obj({ title: str, note: str, url: str, critical: { type: "boolean" } })),
  }),
  quality: obj({
    scores: obj(Object.fromEntries(QUALITY_CRITERIA.map(k => [k, { type: "integer" }]))),
    tests: arr(obj({ test: str, passed: { type: "boolean" }, note: str })),
    weaknesses: str,
    recommendation: en(["pending_verification", "needs_revision", "rejected"]),
  }),
});

// ---------------------------------------------------------------------------------------------
// The request
// ---------------------------------------------------------------------------------------------
const APP_INSTRUCTIONS = `You are drafting challenges for the Daily Challenge app. Follow the standard above exactly. The app adds these requirements:

- Return one challenge as JSON matching the schema. The public content is shown to users; the reference and quality sections are private.
- Lengths (characters): title at most 60; preview (the short description on the home screen) at most 250; role title at most 40; role body at most 450; situation at most 900; final task at most 600; scenario note at most 250 (say plainly what is invented and what is real); constraint label at most 50 and detail at most 200; investigation area title at most 40; each question at most 220.
- 2 or 3 subjects, named as fields of knowledge (for example "Epidemiology").
- 3 to 5 constraints, each with the closest icon from the list in the schema.
- 3 or 4 investigation areas, each with 1 or 2 questions, each marked essential or exploratory.
- expectations: one or two sentences each, shown to users, on what an Easy, Moderate and Hard response should do. reference.difficulty_guide: what evaluators should look for at each level.
- image_directions: one concrete picture per card (role, situation, constraints, investigation, decision), each different, accurate to the setting. Never generic scenery.
- research_minutes: a realistic estimate of investigation time.
- You cannot browse or check sources in this task. Cite only real works or pages you are confident exist, and leave url empty unless you are certain of it. Mark critical: true for any source the challenge's facts depend on. Every source will be treated as unverified until an editor checks it. Never invent a source, a statistic or a quotation.
- Quality: score honestly, run all ten tests, and list real weaknesses. recommendation is pending_verification when the draft depends on facts an editor must check, needs_revision when it misses the bar, rejected when it should not proceed. Never claim approval: a person approves after verifying.`;

export function buildGenerationRequest(input: { direction?: string; type?: string; recent: RecentChallenge[] }): ProviderRequest {
  const recent = input.recent.length
    ? input.recent.map(r => `- ${r.title} (${r.type}; ${r.subjects.join(", ")}; ${r.setting.replace("_", " ")}; role: ${r.role})${r.note ? `: ${r.note}` : ""}`).join("\n")
    : "- None yet.";
  const prompt = `Draft one new Daily Challenge.

${input.direction ? `<editor_direction>\n${input.direction}\n</editor_direction>` : "No particular direction: choose the intellectual territory yourself."}
${input.type && (CHALLENGE_TYPES as readonly string[]).includes(input.type) ? `Challenge type: ${input.type}.` : "Choose the challenge type that fits best, favouring types the recent challenges haven't used."}

Recent challenges. Make the new one clearly different in setting, period, discipline, type and the user's role:
${recent}

Work through the standard's generation workflow before answering: consider several candidate concepts, choose the one with the strongest intellectual problem, then build, test and score it.`;
  return { system: `${CHALLENGE_STANDARD}\n\n---\n\n${APP_INSTRUCTIONS}`, prompt, schema: GENERATION_SCHEMA };
}

// ---------------------------------------------------------------------------------------------
// Checking the draft. Anything that doesn't fit is rejected (the editor can try again), never
// silently cut down.
// ---------------------------------------------------------------------------------------------
export type ValidatedDraft = { ok: true; doc: Record<string, unknown> } | { ok: false; reason: string };

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

export function validateDraft(raw: unknown): ValidatedDraft {
  const problems: string[] = [];
  const text = (v: unknown, field: string, min: number, max: number) => {
    if (typeof v !== "string") { problems.push(`${field} is missing`); return ""; }
    const s = v.trim();
    if (s.length < min || s.length > max) problems.push(`${field} is ${s.length} characters (allowed ${min} to ${max})`);
    return s;
  };
  const list = <T>(v: unknown, field: string, min: number, max: number, each: (x: unknown, i: number) => T): T[] => {
    if (!Array.isArray(v)) { problems.push(`${field} is missing`); return []; }
    if (v.length < min || v.length > max) problems.push(`${field} has ${v.length} items (allowed ${min} to ${max})`);
    return v.slice(0, max).map(each);
  };
  const oneOf = <T extends string>(v: unknown, field: string, values: readonly T[]) => {
    if (!values.includes(v as T)) problems.push(`${field} is not one of ${values.join(", ")}`);
    return v as T;
  };

  const d = isObj(raw) ? raw : (typeof raw === "string" ? (() => { try { return JSON.parse(raw); } catch { return null; } })() : null);
  if (!isObj(d)) return { ok: false, reason: "not a JSON object" };
  const role = isObj(d.role) ? d.role : {};
  const ref = isObj(d.reference) ? d.reference : {};
  const q = isObj(d.quality) ? d.quality : {};
  const scores = isObj(q.scores) ? q.scores : {};
  const images = isObj(d.image_directions) ? d.image_directions : {};
  const lvl = (v: unknown, field: string) => {
    const o = isObj(v) ? v : {};
    return { easy: text(o.easy, `${field}.easy`, 5, 600), moderate: text(o.moderate, `${field}.moderate`, 5, 600), hard: text(o.hard, `${field}.hard`, 5, 600) };
  };
  const minutes = typeof d.research_minutes === "number" && Number.isInteger(d.research_minutes) ? d.research_minutes : NaN;
  if (!(minutes >= 10 && minutes <= 600)) problems.push("research_minutes must be a whole number from 10 to 600");

  const doc = {
    title: text(d.title, "title", 3, 80),
    summary: text(d.preview, "preview", 10, 400),
    challenge_type: oneOf(d.challenge_type, "challenge_type", CHALLENGE_TYPES),
    subjects: list(d.subjects, "subjects", 2, 3, (x, i) => text(x, `subjects[${i}]`, 2, 40)),
    research_minutes: minutes,
    scenario_kind: oneOf(d.scenario_kind, "scenario_kind", SCENARIO_KINDS),
    scenario_note: text(d.scenario_note, "scenario_note", 0, 300),
    role: { title: text(role.title, "role.title", 2, 60), body: text(role.body, "role.body", 10, 600) },
    situation: text(d.situation, "situation", 10, 1200),
    final_task: text(d.final_task, "final_task", 10, 800),
    expectations: lvl(d.expectations, "expectations"),
    cards: CARD_KINDS.map(kind => ({ kind, image: null, direction: text(images[kind], `image_directions.${kind}`, 0, 600) })),
    constraints: list(d.constraints, "constraints", 3, 5, (x, i) => {
      const c = isObj(x) ? x : {};
      return { label: text(c.label, `constraints[${i}].label`, 2, 80), detail: text(c.detail, `constraints[${i}].detail`, 0, 300),
        icon: oneOf(c.icon, `constraints[${i}].icon`, CONSTRAINT_ICON_NAMES) };
    }),
    investigation: list(d.investigation, "investigation", 3, 4, (x, i) => {
      const a = isObj(x) ? x : {};
      return {
        title: text(a.title, `investigation[${i}].title`, 2, 60),
        questions: list(a.questions, `investigation[${i}].questions`, 1, 2, (y, j) => {
          const qq = isObj(y) ? y : {};
          return { text: text(qq.text, `investigation[${i}].questions[${j}]`, 5, 300),
            priority: oneOf(qq.priority, `investigation[${i}].questions[${j}].priority`, ["essential", "exploratory"] as const) };
        }),
      };
    }),
    reference: {
      background: text(ref.background, "reference.background", 50, 12000),
      core_knowledge: text(ref.core_knowledge, "reference.core_knowledge", 0, 4000),
      uncertainties: text(ref.uncertainties, "reference.uncertainties", 0, 4000),
      investigation_map: text(ref.investigation_map, "reference.investigation_map", 0, 4000),
      approaches: list(ref.approaches, "reference.approaches", 2, 6, (x, i) => {
        const a = isObj(x) ? x : {};
        return Object.fromEntries(["title", "summary", "strengths", "weaknesses", "conditions"].map(k =>
          [k, text(a[k], `reference.approaches[${i}].${k}`, k === "title" || k === "summary" ? 2 : 0, 1000)]));
      }),
      critical_reasoning: text(ref.critical_reasoning, "reference.critical_reasoning", 0, 4000),
      misconceptions: list(ref.misconceptions, "reference.misconceptions", 1, 10, (x, i) => text(x, `reference.misconceptions[${i}]`, 3, 600)),
      evidence_expectations: text(ref.evidence_expectations, "reference.evidence_expectations", 0, 4000),
      difficulty_guide: lvl(ref.difficulty_guide, "reference.difficulty_guide"),
      fairness_notes: text(ref.fairness_notes, "reference.fairness_notes", 0, 4000),
      evaluator_notes: "",
      // The drafting model can't check sources, so none counts as verified until an editor checks it.
      sources: list(ref.sources, "reference.sources", 0, 12, (x, i) => {
        const s = isObj(x) ? x : {};
        const url = typeof s.url === "string" && /^https:\/\/\S+$/.test(s.url.trim()) ? s.url.trim() : "";
        return { title: text(s.title, `reference.sources[${i}].title`, 3, 300), note: text(s.note, `reference.sources[${i}].note`, 0, 600),
          url, verified: false, critical: s.critical === true };
      }),
    },
    quality: {
      scores: Object.fromEntries(QUALITY_CRITERIA.map(k => {
        const v = scores[k];
        if (typeof v !== "number" || !Number.isInteger(v) || v < 1 || v > 5) problems.push(`quality.scores.${k} must be 1 to 5`);
        return [k, v];
      })),
      tests: Array.isArray(q.tests) ? q.tests.slice(0, 12).filter(isObj).map(t => ({ test: String(t.test ?? "").slice(0, 120), passed: t.passed === true, note: String(t.note ?? "").slice(0, 600) })) : [],
      weaknesses: typeof q.weaknesses === "string" ? q.weaknesses.trim().slice(0, 2000) : "",
      recommendation: oneOf(q.recommendation, "quality.recommendation", ["pending_verification", "needs_revision", "rejected"] as const),
      assessed_by: "ai",
    },
  };
  return problems.length ? { ok: false, reason: problems.slice(0, 6).join("; ") } : { ok: true, doc };
}

// ---------------------------------------------------------------------------------------------
// The endpoint
// ---------------------------------------------------------------------------------------------
export type GenClaim =
  | { state: "forbidden" }
  | { state: "rate_limited"; retry_after: number }
  | { state: "claimed"; call_id: number; recent: RecentChallenge[] };

export interface GenStore {
  claim(userId: string, perDay: number): Promise<GenClaim>;
  save(userId: string, callId: number, doc: Record<string, unknown>, provider: string, model: string, inputTokens: number, outputTokens: number): Promise<{ id: string; number: number }>;
  fail(callId: number, code: string, provider: string, model: string): Promise<void>;
}

export interface GenDeps {
  authenticate(authorization: string | null): Promise<string | null>;
  store: GenStore;
  provider: EvalProvider | null;
  perDay: number;
  timeoutMs: number;
  effort?: "low" | "medium" | "high";
  allowedOrigins: string[];
  log?: (event: string, data: Record<string, unknown>) => void;
}

const MESSAGES: Record<string, string> = {
  auth: "Please sign in again.",
  forbidden: "Only administrators can draft challenges.",
  bad_request: "That request wasn't understood.",
  not_configured: "AI drafting isn't set up on this server.",
  rate_limited: "You've reached today's limit for AI drafts.",
  timeout: "The draft took too long. Try again, perhaps with a narrower direction.",
  busy: "The AI service is busy. Please try again in a minute.",
  refusal: "The model declined to draft this. Try a different direction.",
  invalid_output: "The draft didn't meet the standard's format, so it wasn't saved. Please try again.",
  upstream: "Something went wrong reaching the AI service. Please try again.",
  config: "AI drafting is misconfigured on the server.",
  server: "Something went wrong on our side. Please try again.",
};

export async function serveGenerate(req: Request, deps: GenDeps): Promise<Response> {
  const cors = corsHeaders(req.headers.get("origin"), deps.allowedOrigins);
  const reply = (status: number, body: Record<string, unknown>) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, "content-type": "application/json" } });
  const fail = (status: number, code: string, more: Record<string, unknown> = {}) =>
    reply(status, { ok: false, error: { code, message: MESSAGES[code] ?? MESSAGES.server, ...more } });

  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return fail(405, "bad_request");
  const userId = await deps.authenticate(req.headers.get("authorization"));
  if (!userId) return fail(401, "auth");

  let direction = "";
  let type = "";
  try {
    const text = await req.text();
    if (text.length > 4000) return fail(413, "bad_request");
    const body = (text ? JSON.parse(text) : {}) as { direction?: unknown; type?: unknown };
    direction = typeof body.direction === "string" ? body.direction.trim().slice(0, 800) : "";
    type = typeof body.type === "string" ? body.type : "";
  } catch {
    return fail(400, "bad_request");
  }
  if (!deps.provider) return fail(503, "not_configured");

  let claim: GenClaim;
  try {
    claim = await deps.store.claim(userId, deps.perDay);
  } catch (e) {
    deps.log?.("gen_claim_failed", { error: String(e) });
    return fail(500, "server");
  }
  if (claim.state === "forbidden") return fail(403, "forbidden");
  if (claim.state === "rate_limited") return fail(429, "rate_limited", { retry_after: claim.retry_after });

  const { provider } = deps;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), deps.timeoutMs);
  const started = Date.now();
  try {
    const result = await provider.run(buildGenerationRequest({ direction, type, recent: claim.recent }), controller.signal,
      { maxTokens: 32000, effort: deps.effort ?? "medium", stream: true });
    if (!result.ok) {
      await deps.store.fail(claim.call_id, result.code, provider.name, result.model ?? provider.model);
      deps.log?.("generation_failed", { code: result.code, detail: result.detail, ms: Date.now() - started });
      const status = result.code === "timeout" ? 504 : result.code === "busy" ? 503 : result.code === "refusal" ? 422 : 502;
      return fail(status, result.code);
    }
    const checked = validateDraft(result.output);
    if (!checked.ok) {
      await deps.store.fail(claim.call_id, "invalid_output", provider.name, result.model);
      deps.log?.("generation_invalid", { reason: checked.reason, ms: Date.now() - started });
      return fail(502, "invalid_output", { detail: checked.reason });
    }
    const saved = await deps.store.save(userId, claim.call_id, checked.doc, provider.name, result.model, result.inputTokens, result.outputTokens);
    deps.log?.("generation_complete", { ms: Date.now() - started, model: result.model, number: saved.number });
    return reply(200, { ok: true, id: saved.id, number: saved.number });
  } catch (e) {
    deps.log?.("generation_error", { error: String(e) });
    await deps.store.fail(claim.call_id, "server", provider.name, provider.model).catch(() => {});
    return fail(500, "server");
  } finally {
    clearTimeout(timer);
  }
}
