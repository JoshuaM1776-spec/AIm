// Tests for the Aim Plus AI endpoint's logic (supabase/functions/ai/handler.ts) with fake
// accounts, database and Claude. Run: node --experimental-strip-types tests/ai.test.mjs
import assert from "node:assert";
import { handle } from "../supabase/functions/ai/handler.ts";
import { memDb, memHs, memSync } from "./helpers/memdb.mjs";
import { difficulty } from "../supabase/functions/ai/teachback.ts";
import { splitCurriculum, mergeBuilt } from "../supabase/functions/ai/homeschool.ts";
import { checkoutUrl, handleStripeEvent, handleStripeWebhook, planForStatus, stripeApi, verifyStripeSignature } from "../supabase/functions/ai/billing.ts";

const EXT = "chrome-extension://" + "a".repeat(32);
const LIMITS = { dayCalls: 3, dayTokens: 1000, minuteCalls: 2 };

function makeDeps({ plan = "plus", claude } = {}) {
  const rows = [];
  const calls = [];
  const deps = {
    rows, calls,
    getUser: async token => (token === "good" ? { id: "u1", email: "a@example.com" } : null),
    getPlan: async () => plan,
    usageSince: async () => ({ calls: rows.length, tokens: rows.reduce((s, r) => s + r.inputTokens + r.outputTokens, 0) }),
    begin: async (userId, task, limits) => {
      if (rows.length >= limits.dayCalls) return { usageId: null, limited: "day_calls" };
      rows.push({ userId, task, ok: null, inputTokens: 0, outputTokens: 0 });
      return { usageId: rows.length - 1, limited: null };
    },
    finish: async (id, model, inputTokens, outputTokens, ok) => Object.assign(rows[id], { model, inputTokens, outputTokens, ok }),
    callClaude: async req => {
      calls.push(req);
      return claude ? claude(req) : { ok: true, text: " ready\n", model: "m", inputTokens: 20, outputTokens: 5 };
    },
    now: () => new Date("2026-10-16T12:00:00Z"),
    config: { origins: [], limits: LIMITS, maxBodyBytes: 8192 }
  };
  return deps;
}

function req(body, { token = "good", origin = EXT, method = "POST" } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (origin) headers.Origin = origin;
  return new Request("https://x.supabase.co/functions/v1/ai", { method, headers, body: method === "POST" ? (typeof body === "string" ? body : JSON.stringify(body)) : undefined });
}

async function call(deps, body, opts) {
  const res = await handle(req(body, opts), deps);
  return { status: res.status, headers: res.headers, body: res.status === 204 ? null : await res.json() };
}

const tests = [];
const test = (name, fn) => tests.push([name, fn]);

test("preflight answers the extension with CORS headers", async () => {
  const r = await call(makeDeps(), null, { method: "OPTIONS" });
  assert.strictEqual(r.status, 204);
  assert.strictEqual(r.headers.get("Access-Control-Allow-Origin"), EXT);
  assert.match(r.headers.get("Access-Control-Allow-Headers"), /authorization/);
});

test("the parent website's address is let in alongside the extension", async () => {
  const d = makeDeps(); d.config = { ...d.config, webOrigins: ["https://family.example.com"] };
  assert.strictEqual((await call(d, { task: "status" }, { origin: "https://family.example.com" })).status, 200);
  assert.strictEqual((await call(d, { task: "status" })).status, 200, "the extension still works");
  assert.strictEqual((await call(d, { task: "status" }, { origin: "https://evil.example" })).status, 403);
});

test("other websites are turned away", async () => {
  const r = await call(makeDeps(), { task: "status" }, { origin: "https://evil.example" });
  assert.strictEqual(r.status, 403);
  assert.strictEqual(r.headers.get("Access-Control-Allow-Origin"), null);
});

test("a configured origin list is enforced exactly", async () => {
  const deps = makeDeps();
  deps.config.origins = ["chrome-extension://" + "b".repeat(32)];
  assert.strictEqual((await call(deps, { task: "status" })).status, 403);
  assert.strictEqual((await call(deps, { task: "status" }, { origin: deps.config.origins[0] })).status, 200);
});

test("requires a valid sign-in", async () => {
  assert.strictEqual((await call(makeDeps(), { task: "status" }, { token: null })).body.error.code, "auth");
  const r = await call(makeDeps(), { task: "status" }, { token: "expired" });
  assert.strictEqual(r.status, 401);
});

test("rejects unknown tasks, bad JSON and large bodies", async () => {
  const deps = makeDeps();
  assert.strictEqual((await call(deps, { task: "nope" })).body.error.code, "task");
  assert.strictEqual((await call(deps, { task: "constructor" })).body.error.code, "task");
  assert.strictEqual((await call(deps, "{not json")).body.error.code, "bad_json");
  assert.strictEqual((await call(deps, { task: "check", input: "x".repeat(9000) })).status, 413);
  assert.strictEqual(deps.calls.length, 0);
});

test("status reports plan, usage and limits without calling the AI", async () => {
  const deps = makeDeps({ plan: "free" });
  const r = await call(deps, { task: "status" });
  assert.deepStrictEqual(r.body, { ok: true, email: "a@example.com", plan: "free", usage: { calls: 0, tokens: 0 }, billing: { available: false, status: null, renewsAt: null, cancelAtPeriodEnd: false, manage: false }, sync: false,
    limits: { dayCalls: 1, dayTokens: 100, minuteCalls: 1 } }, "free accounts get a tenth of the Plus allowance");
  assert.strictEqual(deps.calls.length, 0);
});

test("free accounts can't use AI tasks", async () => {
  const deps = makeDeps({ plan: "free" });
  const r = await call(deps, { task: "check" });
  assert.strictEqual(r.status, 403);
  assert.strictEqual(r.body.error.code, "plan");
  assert.strictEqual(deps.calls.length, 0);
  assert.strictEqual(deps.rows.length, 0);
});

test("check calls the AI and records usage", async () => {
  const deps = makeDeps();
  const r = await call(deps, { task: "check" });
  assert.deepStrictEqual(r.body, { ok: true, reply: "ready" });
  assert.deepStrictEqual(deps.rows[0], { userId: "u1", task: "check", ok: true, model: "m", inputTokens: 20, outputTokens: 5 });
});

test("limits stop calls before they reach the AI", async () => {
  const deps = makeDeps();
  for (let i = 0; i < 3; i++) assert.strictEqual((await call(deps, { task: "check" })).status, 200);
  const r = await call(deps, { task: "check" });
  assert.strictEqual(r.status, 429);
  assert.match(r.body.error.message, /today's AI limit/);
  assert.strictEqual(deps.calls.length, 3);
});

test("refusals, overload and failures map to clear errors and are still recorded", async () => {
  const cases = [
    [{ ok: false, kind: "refusal", model: "m", inputTokens: 10, outputTokens: 3 }, 422, "refusal"],
    [{ ok: false, kind: "busy", inputTokens: 0, outputTokens: 0 }, 503, "busy"],
    [{ ok: false, kind: "error", inputTokens: 0, outputTokens: 0 }, 502, "upstream"]
  ];
  for (const [result, status, code] of cases) {
    const deps = makeDeps({ claude: () => result });
    const r = await call(deps, { task: "check" });
    assert.strictEqual(r.status, status);
    assert.strictEqual(r.body.error.code, code);
    assert.strictEqual(deps.rows[0].ok, false);
    assert.strictEqual(deps.rows[0].inputTokens, result.inputTokens);
  }
  const deps = makeDeps({ claude: () => { throw new Error("network down"); } });
  const r = await call(deps, { task: "check" });
  assert.strictEqual(r.status, 502);
  assert.strictEqual(deps.rows[0].ok, false);
});

test("errors never reveal server details", async () => {
  const deps = makeDeps({ claude: () => ({ ok: false, kind: "error", inputTokens: 0, outputTokens: 0, detail: "sk-ant-secret" }) });
  const r = await call(deps, { task: "check" });
  assert.doesNotMatch(JSON.stringify(r.body), /secret/);
});

// ---------- TeachBack ----------

// A scripted Claude: picks the reply by which schema the request asks for.
function tbDeps({ plan = "plus", director, finish, start, hint } = {}) {
  let clock = new Date("2026-10-17T12:00:00Z");
  const deps = makeDeps({ plan, claude: req => {
    const props = Object.keys(req.schema?.properties || {});
    const reply = props.includes("first_question") ? (start || (() => ({ type: "concepts",
        objectives: ["Explain what photosynthesis produces", "Explain the role of light", "Explain where it happens"],
        first_question: "What does a plant actually make during photosynthesis?" })))(req)
      : props.includes("evaluation") ? director(req)
      : props.includes("hint") ? (hint || (() => ({ hint: "Think about what the plant stores." })))(req)
      : props.includes("summary") ? (finish || (() => ({ summary: "You explained the products well.", strengths: ["Products of photosynthesis"],
          objectives: [{ index: 2, note: "Not answered.", explanation: "Light provides the energy.", search: "role of light in photosynthesis" }],
          next_step: "Review the light reactions." })))(req)
      : null;
    if (reply && reply.ok === false) return reply;
    return { ok: true, text: JSON.stringify(reply), model: req.tier || "main", inputTokens: 10, outputTokens: 5 };
  } });
  deps.config.limits = { dayCalls: 999, dayTokens: 1e9, minuteCalls: 999 };
  deps.now = () => clock;
  deps.db = memDb(() => clock);
  deps.advance = ms => { clock = new Date(clock.getTime() + ms); };
  return deps;
}
const ev = (rating, evidence, extra = {}) => ({ rating, evidence, misconception: "", applied: false, note: "", ...extra });
const nx = (action, objective, question = "Next question?", student = "ivy", kind = "follow_up") => ({ action, objective, student, kind, question });
const tb = async (deps, task, input, opts) => (await call(deps, { task, input }, opts)).body;

test("TeachBack: starts with objectives and a first question from Milo, for Plus only", async () => {
  const free = tbDeps({ plan: "free", director: () => null });
  assert.strictEqual((await call(free, { task: "teachback-start", input: { topic: "Photosynthesis" } })).status, 403);
  const deps = tbDeps({ director: () => null });
  const r = await tb(deps, "teachback-start", { topic: "Photosynthesis", notes: "Chapter 8" });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.session.objectives.length, 3);
  assert.deepStrictEqual(r.session.current.student, { id: "milo", name: "Milo", role: "The Curious One" });
  assert.deepStrictEqual(r.session.progress, { objective: 1, of: 3, asked: 1, max: 15 });
  assert.strictEqual((await call(deps, { task: "teachback-start", input: { topic: "x" } })).status, 400);
});

test("TeachBack: follows up, moves on, and derives results from quoted evidence", async () => {
  const script = [
    { evaluation: ev("sound", "glucose and oxygen"), next: nx("follow_up", 1, "Why does the plant need the glucose?") },
    { evaluation: ev("partial", "to grow"), next: nx("next_objective", 2, "Where does the energy come from?", "reese", "question") },
    { evaluation: ev("unclear", ""), next: nx("next_objective", 3, "Where in the cell does it happen?", "grant", "question") },
    { evaluation: ev("incorrect", "in the roots", { misconception: "happens in roots" }), next: nx("finish", 0, "") }
  ];
  const deps = tbDeps({ director: () => script.shift() });
  let s = (await tb(deps, "teachback-start", { topic: "Photosynthesis" })).session;
  s = (await tb(deps, "teachback-turn", { id: s.id, seq: 1, action: "answer", answer: "It makes glucose and oxygen from CO2 and water." })).session;
  assert.strictEqual(s.current.objective, 0, "follow-up stays on objective 1");
  assert.strictEqual(s.current.student.name, "Ivy");
  s = (await tb(deps, "teachback-turn", { id: s.id, seq: 2, action: "answer", answer: "It uses it to grow and for energy." })).session;
  assert.strictEqual(s.current.objective, 1);
  s = (await tb(deps, "teachback-turn", { id: s.id, seq: 3, action: "skip" })).session;
  assert.strictEqual(s.current.objective, 2);
  s = (await tb(deps, "teachback-turn", { id: s.id, seq: 4, action: "answer", answer: "I think it happens in the roots." })).session;
  assert.strictEqual(s.readyToFinish, true);
  assert.strictEqual(s.current, null);
  s = (await tb(deps, "teachback-finish", { id: s.id })).session;
  assert.strictEqual(s.status, "complete");
  const [o1, o2, o3] = s.result.objectives;
  assert.strictEqual(o1.status, "demonstrated");
  assert.deepStrictEqual(o1.evidence, ["glucose and oxygen", "to grow"]);
  assert.strictEqual(o1.review, null);
  assert.strictEqual(o2.status, "not_assessed");
  assert.strictEqual(o2.review.search, "role of light in photosynthesis");
  assert.strictEqual(o3.status, "needs_review");
  assert.strictEqual(s.result.narrative, true);
  assert.deepStrictEqual(deps.db.progress.map(p => p.kind), ["demonstrated", "needs_review"]);
  // Finishing again returns the same results without another AI call.
  const calls = deps.calls.length;
  await tb(deps, "teachback-finish", { id: s.id });
  assert.strictEqual(deps.calls.length, calls);
});

test("TeachBack: quotes the learner didn't write are dropped, so they can't count as evidence", async () => {
  const script = [
    { evaluation: ev("sound", "chlorophyll absorbs light energy"), next: nx("follow_up", 1) },
    { evaluation: ev("sound", "a detailed account of the Calvin cycle"), next: nx("finish", 0, "") }
  ];
  const deps = tbDeps({ director: () => script.shift(), start: () => ({ type: "concepts", objectives: ["Explain the role of light"], first_question: "Why light?" }) });
  let s = (await tb(deps, "teachback-start", { topic: "Light" })).session;
  s = (await tb(deps, "teachback-turn", { id: s.id, seq: 1, action: "answer", answer: "Chlorophyll absorbs light energy." })).session;
  s = (await tb(deps, "teachback-turn", { id: s.id, seq: 2, action: "answer", answer: "Because plants are green, I guess." })).session;
  s = (await tb(deps, "teachback-finish", { id: s.id })).session;
  assert.strictEqual(s.result.objectives[0].status, "partial", "one verified sound answer isn't enough");
  assert.deepStrictEqual(s.result.objectives[0].evidence, ["chlorophyll absorbs light energy"]);
});

test("TeachBack: hints are limited and recorded, and hinted answers don't count as independent", async () => {
  const script = [
    { evaluation: ev("sound", "stores energy as glucose"), next: nx("follow_up", 1) },
    { evaluation: ev("partial", "for growth"), next: nx("finish", 0, "") }
  ];
  const deps = tbDeps({ director: () => script.shift(), start: () => ({ type: "concepts", objectives: ["Explain what it produces"], first_question: "What does it make?" }) });
  let s = (await tb(deps, "teachback-start", { topic: "Photosynthesis" })).session;
  let r = await tb(deps, "teachback-turn", { id: s.id, seq: 1, action: "hint" });
  assert.match(r.hint, /stores/);
  assert.strictEqual(r.session.current.hintsLeft, 1);
  await tb(deps, "teachback-turn", { id: s.id, seq: 1, action: "hint" });
  assert.strictEqual((await call(deps, { task: "teachback-turn", input: { id: s.id, seq: 1, action: "hint" } })).body.error.code, "hints");
  s = (await tb(deps, "teachback-turn", { id: s.id, seq: 1, action: "answer", answer: "It stores energy as glucose." })).session;
  s = (await tb(deps, "teachback-turn", { id: s.id, seq: 2, action: "answer", answer: "The plant uses it for growth." })).session;
  s = (await tb(deps, "teachback-finish", { id: s.id })).session;
  assert.strictEqual(s.result.objectives[0].status, "partial");
  assert.strictEqual(s.result.objectives[0].hinted, true);
});

test("TeachBack: limits per objective, and covering every objective before finishing", async () => {
  const deps = tbDeps({ director: () => ({ evaluation: ev("partial", ""), next: nx("follow_up", 1) }),
    start: () => ({ type: "concepts", objectives: ["One", "Two"], first_question: "First?" }) });
  let s = (await tb(deps, "teachback-start", { topic: "Topic" })).session;
  const seen = [];
  for (let seq = 1; s.current; seq++) {
    seen.push(s.current.objective);
    s = (await tb(deps, "teachback-turn", { id: s.id, seq, action: "answer", answer: "Something about it." })).session;
  }
  assert.deepStrictEqual(seen, [0, 0, 0, 1, 1, 1], "three questions per objective, then the next one, then done");
  assert.strictEqual(s.readyToFinish, true);

  const early = tbDeps({ director: () => ({ evaluation: ev("sound", ""), next: nx("finish", 0, "") }),
    start: () => ({ type: "concepts", objectives: ["Explain causes.", "Explain effects."], first_question: "First?" }) });
  let e = (await tb(early, "teachback-start", { topic: "Topic" })).session;
  e = (await tb(early, "teachback-turn", { id: e.id, seq: 1, action: "answer", answer: "Because." })).session;
  assert.strictEqual(e.current.objective, 1, "doesn't finish while an objective hasn't been asked about");
  assert.strictEqual(e.current.question, "Can you explain this part to me: Explain effects?");
});

test("TeachBack: sessions are private, answers are checked, and stale submissions are refused", async () => {
  const deps = tbDeps({ director: () => ({ evaluation: ev("sound", ""), next: nx("follow_up", 1) }) });
  const s = (await tb(deps, "teachback-start", { topic: "Photosynthesis" })).session;
  const other = { ...deps, getUser: async () => ({ id: "u2" }) };
  assert.strictEqual((await call(other, { task: "teachback-get", input: { id: s.id } })).status, 404);
  assert.strictEqual((await call(deps, { task: "teachback-get", input: { id: "not-a-uuid" } })).status, 404);
  assert.strictEqual((await call(deps, { task: "teachback-turn", input: { id: s.id, seq: 1, action: "answer", answer: "  " } })).status, 400);
  assert.strictEqual((await call(deps, { task: "teachback-turn", input: { id: s.id, seq: 1, action: "answer", answer: "x".repeat(2001) } })).status, 400);
  assert.strictEqual((await call(deps, { task: "teachback-turn", input: { id: s.id, seq: 1, action: "answer", answer: "Glucose." } })).status, 200);
  const stale = await call(deps, { task: "teachback-turn", input: { id: s.id, seq: 1, action: "answer", answer: "Again" } });
  assert.strictEqual(stale.status, 409);
  assert.strictEqual(stale.body.error.code, "stale");
});

test("TeachBack: a refusal or outage leaves the question open to try again", async () => {
  let fail = true;
  const deps = tbDeps({ director: () => (fail ? { ok: false, kind: "busy", inputTokens: 0, outputTokens: 0 } : { evaluation: ev("sound", ""), next: nx("follow_up", 1) }) });
  const s = (await tb(deps, "teachback-start", { topic: "Photosynthesis" })).session;
  assert.strictEqual((await call(deps, { task: "teachback-turn", input: { id: s.id, seq: 1, action: "answer", answer: "Glucose." } })).status, 503);
  assert.strictEqual((await tb(deps, "teachback-get", { id: s.id })).session.current.seq, 1);
  fail = false;
  assert.strictEqual((await tb(deps, "teachback-turn", { id: s.id, seq: 1, action: "answer", answer: "Glucose." })).session.current.seq, 2);
});

test("TeachBack: results still come back if the written summary fails, and old sessions close themselves", async () => {
  const deps = tbDeps({ director: () => ({ evaluation: ev("sound", "glucose"), next: nx("follow_up", 1) }),
    finish: () => ({ ok: false, kind: "error", inputTokens: 0, outputTokens: 0 }) });
  let s = (await tb(deps, "teachback-start", { topic: "Photosynthesis" })).session;
  s = (await tb(deps, "teachback-turn", { id: s.id, seq: 1, action: "answer", answer: "It makes glucose." })).session;
  s = (await tb(deps, "teachback-finish", { id: s.id, end: true })).session;
  assert.strictEqual(s.status, "incomplete", "ended early");
  assert.strictEqual(s.result.narrative, false);
  assert.strictEqual(s.result.objectives[0].status, "partial");

  let old = (await tb(deps, "teachback-start", { topic: "Cells" })).session;
  deps.advance(8 * 86400_000);
  const calls = deps.calls.length;
  old = (await tb(deps, "teachback-get", { id: old.id })).session;
  assert.strictEqual(old.status, "incomplete");
  assert.strictEqual(old.result.objectives.every(o => o.status === "not_assessed"), true);
  assert.strictEqual(deps.calls.length, calls, "closing an old session doesn't call the AI");
});

test("TeachBack: early answers set the difficulty, across objectives too", async () => {
  const t = (rating, extra = {}) => ({ status: "answered", hints: 0, evaluation: ev(rating, "x"), ...extra });
  assert.strictEqual(difficulty([]), 2, "starts at level 2");
  assert.strictEqual(difficulty([t("sound"), t("sound")]), 4, "two strong answers: level 4");
  assert.strictEqual(difficulty([t("sound"), t("sound"), t("sound"), t("sound")]), 5, "never above 5");
  assert.strictEqual(difficulty([t("incorrect"), t("unclear")]), 1, "never below 1");
  assert.strictEqual(difficulty([t("sound", { hints: 1 })]), 2, "a hinted answer doesn't raise it");
  assert.strictEqual(difficulty([t("partial")]), 2, "partly right keeps it");
  assert.strictEqual(difficulty([{ status: "skipped", hints: 0, evaluation: null }]), 1, "a skip lowers it");

  const prompts = [];
  const script = [
    { evaluation: ev("sound", "glucose"), next: nx("follow_up", 1) },
    { evaluation: ev("sound", "starch"), next: nx("next_objective", 2, "How do we know light matters?", "reese", "question") },
    { evaluation: ev("partial", ""), next: nx("follow_up", 2) }
  ];
  const deps = tbDeps({ director: req => { prompts.push(req.prompt); return script.shift(); } });
  let s = (await tb(deps, "teachback-start", { topic: "Photosynthesis" })).session;
  s = (await tb(deps, "teachback-turn", { id: s.id, seq: 1, action: "answer", answer: "It makes glucose." })).session;
  s = (await tb(deps, "teachback-turn", { id: s.id, seq: 2, action: "answer", answer: "It stores it as starch." })).session;
  s = (await tb(deps, "teachback-turn", { id: s.id, seq: 3, action: "answer", answer: "Plants in the dark stop growing." })).session;
  assert.match(prompts[0], /DIFFICULTY SO FAR: level 2 of 5/);
  assert.match(prompts[0], /rated "sound": level 3/);
  assert.match(prompts[1], /DIFFICULTY SO FAR: level 3 of 5/);
  assert.match(prompts[2], /DIFFICULTY SO FAR: level 4 of 5/, "the new objective starts where the learner is, not at basics");
  assert.match(prompts[2], /rated "incorrect" or "unclear": level 3/);
});

// ---------- the librarian ----------

function libDeps({ plan = "free", ask, rank } = {}) {
  const deps = makeDeps({ plan, claude: req => {
    const props = Object.keys(req.schema?.properties || {});
    const reply = props.includes("searches") ? ask(req) : rank(req);
    return { ok: true, text: JSON.stringify(reply), model: "fast", inputTokens: 10, outputTokens: 5 };
  } });
  deps.config.freeLimits = { dayCalls: 2, dayTokens: 1e9, minuteCalls: 99 };
  return deps;
}

test("librarian: any signed-in account can ask, within its plan's allowance", async () => {
  const deps = libDeps({ ask: () => ({ target: "Replace the alternator on my 2014 Tacoma", kind: "project",
    note: "The procedure differs between the 2.7L and the 4.0L engine.", searches: ["2014 Tacoma alternator replacement 4.0 V6", "2014 tacoma alternator 2.7", "2014 Tacoma alternator replacement 4.0 V6"],
    question: "Which engine does it have?", options: ["2.7L four-cylinder", "4.0L V6"], same_target: true }) });
  const r = await call(deps, { task: "librarian-ask", input: { request: "I need to replace the alternator on my 2014 Tacoma" } });
  assert.strictEqual(r.status, 200);
  assert.deepStrictEqual(r.body.searches, ["2014 Tacoma alternator replacement 4.0 V6", "2014 tacoma alternator 2.7"], "duplicates removed");
  assert.deepStrictEqual(r.body.refine, { question: "Which engine does it have?", options: ["2.7L four-cylinder", "4.0L V6"] });
  assert.strictEqual(r.body.kind, "project");
  assert.strictEqual(deps.calls[0].tier, "fast");
  await call(deps, { task: "librarian-ask", input: { request: "jet engines" } });
  const third = await call(deps, { task: "librarian-ask", input: { request: "jet engines" } });
  assert.strictEqual(third.status, 429, "free allowance is smaller");
  assert.strictEqual((await call(deps, { task: "librarian-ask", input: {} }, { token: null })).status, 401, "needs an account");
});

test("librarian: context goes in, one question at most, and an empty question means no choices", async () => {
  let prompt = "";
  const deps = libDeps({ plan: "plus", ask: req => { prompt = req.prompt; return { target: "", kind: "learn", note: "x".repeat(400),
    searches: [], question: "", options: ["a", "b"], same_target: false }; } });
  const r = await call(deps, { task: "librarian-ask", input: { request: "explain that last part more clearly", target: "Understand jet engines",
    thread: [{ role: "person", text: "how do jet engines work" }, { role: "aim", text: "Start with airflow." }],
    searches: ["how jet engines work"], watched: [{ title: "Turbofan basics", channel: "Engines 101" }], last: { title: "Turbofan basics" } } });
  assert.match(prompt, /CURRENT TARGET: Understand jet engines/);
  assert.match(prompt, /LAST VIDEO WATCHED: Turbofan basics/);
  assert.match(prompt, /AIM: Start with airflow\./);
  assert.strictEqual(r.body.refine, null);
  assert.strictEqual(r.body.note.length <= 260, true);
  assert.deepStrictEqual(r.body.searches, ["explain that last part more clearly"], "falls back to the request as a search");
  assert.strictEqual(r.body.sameTarget, false);
  assert.strictEqual(r.body.target, "explain that last part more clearly");
});

test("librarian: ranking keeps only videos YouTube showed, once each, in at most 3 groups", async () => {
  const deps = libDeps({ rank: () => ({ groups: [
    { label: "Start here", videos: [{ id: "abc123def", reason: "Covers the 4.0L V6 specifically" }, { id: "invented99", reason: "?" }] },
    { label: "Step by step", videos: [{ id: "abc123def", reason: "dupe" }, { id: "xyz789ghi", reason: "Full walkthrough" }] },
    { label: "Empty", videos: [] }, { label: "Fourth", videos: [{ id: "qqq111www", reason: "x" }] }] }) });
  const r = await call(deps, { task: "librarian-rank", input: { target: "Replace the alternator on my 2014 Tacoma", query: "tacoma alternator",
    results: [{ id: "abc123def", title: "Tacoma 4.0 alternator", channel: "Shop" }, { id: "xyz789ghi", title: "Alternator swap", channel: "DIY" },
      { id: "qqq111www", title: "Other", channel: "x" }, { id: "bad id!", title: "nope" }] } });
  assert.deepStrictEqual(r.body.groups, [
    { label: "Start here", videos: [{ id: "abc123def", reason: "Covers the 4.0L V6 specifically" }] },
    { label: "Step by step", videos: [{ id: "xyz789ghi", reason: "Full walkthrough" }] }]);
  const none = await call(deps, { task: "librarian-rank", input: { target: "x", results: [] } });
  assert.deepStrictEqual(none.body.groups, []);
});

test("librarian: the channels you prefer go to the ranking (names only, at most 30)", async () => {
  let prompt = "";
  const deps = libDeps({ rank: req => { prompt = req.prompt || JSON.stringify(req); return { groups: [] }; } });
  await call(deps, { task: "librarian-rank", input: { target: "Fix a leaky faucet", query: "faucet washer", preferred: ["Plumb Co", "", ...Array(40).fill("X")],
    results: [{ id: "abc123def", title: "Faucet washer", channel: "Plumb Co" }] } });
  assert.match(prompt, /CHANNELS THEY TRUST: Plumb Co; X/);
  assert.strictEqual((prompt.match(/; X/g) || []).length, 29, "at most 30 names");
  const without = libDeps({ rank: req => { prompt = req.prompt || JSON.stringify(req); return { groups: [] }; } });
  await call(without, { task: "librarian-rank", input: { target: "x", results: [{ id: "abc123def", title: "t", channel: "c" }] } });
  assert.ok(!prompt.includes("CHANNELS THEY TRUST"));
});

test("Put it to work: Plus only; leans on what needs practice; tidied and bounded", async () => {
  let prompt = "";
  const deps = makeDeps({ plan: "plus", claude: req => {
    prompt = req.prompt;
    return { ok: true, model: "main", inputTokens: 10, outputTokens: 5, text: JSON.stringify({ title: "Trace a sugar cube", task: "Follow glucose to ATP.",
      steps: ["a", "b", "c", "d", "e", "f", ""], shows: "You can explain ATP.", minutes: 900, safety: "" }) };
  } });
  const r = await call(deps, { task: "study-apply", input: { title: "Cellular respiration", previous: "Draw a mitochondrion",
    topics: [{ title: "Glycolysis", brief: "Glucose is split.", practice: ["Where glycolysis happens"] }, { title: "" }] } });
  assert.strictEqual(r.status, 200);
  assert.match(prompt, /needs practice: Where glycolysis happens/);
  assert.match(prompt, /PREVIOUS SUGGESTION: Draw a mitochondrion/);
  assert.strictEqual(r.body.steps.length, 5);
  assert.strictEqual(r.body.minutes, 240);
  assert.strictEqual((await call(makeDeps({ plan: "free" }), { task: "study-apply", input: { title: "x y" } })).status, 403);
});

// ---------- billing (Stripe) ----------
const WHSEC = "whsec_test_secret";
async function signed(payload, secret = WHSEC, t = Math.floor(Date.now() / 1000)) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = [...new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${t}.${payload}`)))].map(b => b.toString(16).padStart(2, "0")).join("");
  return `t=${t},v1=${sig}`;
}
function billingDb() {
  const events = new Set(), users = { u1: { customer: null, plan: "free" } };
  return { users, events,
    firstTime: async id => (events.has(id) ? false : (events.add(id), true)),
    linkCustomer: async (userId, customer) => { users[userId].customer = customer; },
    setPlanByCustomer: async (customer, p) => { const u = Object.values(users).find(x => x.customer === customer); if (!u) return false; Object.assign(u, p); return true; } };
}

test("billing: which subscription states are Plus", () => {
  for (const s of ["active", "trialing", "past_due"]) assert.strictEqual(planForStatus(s), "plus", s);
  for (const s of ["canceled", "unpaid", "incomplete", "incomplete_expired", "paused", ""]) assert.strictEqual(planForStatus(s), "free", s);
});

test("billing: Stripe signatures are checked, old ones refused", async () => {
  const body = JSON.stringify({ id: "evt_1" }), now = Date.now();
  assert.ok(await verifyStripeSignature(body, await signed(body), WHSEC, now));
  assert.ok(!(await verifyStripeSignature(body, await signed(body, "whsec_other"), WHSEC, now)), "wrong secret");
  assert.ok(!(await verifyStripeSignature(body + " ", await signed(body), WHSEC, now)), "changed body");
  assert.ok(!(await verifyStripeSignature(body, await signed(body, WHSEC, Math.floor(now / 1000) - 600), WHSEC, now)), "replayed later");
  assert.ok(!(await verifyStripeSignature(body, "", WHSEC, now)));
  assert.ok(await verifyStripeSignature(body, `${await signed(body)},v1=deadbeef`, WHSEC, now), "any matching v1 is enough");
});

test("billing: checkout links the customer and turns on Plus; subscription changes follow; each event once", async () => {
  const db = billingDb();
  assert.strictEqual(await handleStripeEvent({ id: "evt_a", type: "checkout.session.completed",
    data: { object: { client_reference_id: "u1", customer: "cus_1", mode: "subscription", payment_status: "paid" } } }, db), "linked");
  assert.deepStrictEqual([db.users.u1.customer, db.users.u1.plan], ["cus_1", "plus"]);
  assert.strictEqual(await handleStripeEvent({ id: "evt_a", type: "checkout.session.completed", data: { object: {} } }, db), "duplicate");
  await handleStripeEvent({ id: "evt_b", type: "customer.subscription.updated",
    data: { object: { customer: "cus_1", status: "past_due", cancel_at_period_end: true, items: { data: [{ current_period_end: 1800000000 }] } } } }, db);
  assert.deepStrictEqual([db.users.u1.plan, db.users.u1.status, db.users.u1.cancelAtPeriodEnd, db.users.u1.renewsAt], ["plus", "past_due", true, new Date(1800000000 * 1000).toISOString()]);
  await handleStripeEvent({ id: "evt_c", type: "customer.subscription.deleted", data: { object: { customer: "cus_1", status: "active" } } }, db);
  assert.deepStrictEqual([db.users.u1.plan, db.users.u1.status], ["free", "canceled"], "deleted means canceled, whatever status it carries");
  assert.strictEqual(await handleStripeEvent({ id: "evt_d", type: "customer.subscription.updated", data: { object: { customer: "cus_unknown", status: "active" } } }, db), "unknown customer");
  assert.strictEqual(await handleStripeEvent({ id: "evt_e", type: "invoice.paid", data: { object: {} } }, db), "ignored");
});

test("billing: the webhook refuses unsigned requests and serves the return pages", async () => {
  const db = billingDb(), body = JSON.stringify({ id: "evt_w", type: "checkout.session.completed", data: { object: { client_reference_id: "u1", customer: "cus_9", mode: "subscription" } } });
  const bad = await handleStripeWebhook(new Request("https://x/stripe-webhook", { method: "POST", body, headers: { "Stripe-Signature": "t=1,v1=00" } }), { webhookSecret: WHSEC }, db);
  assert.strictEqual(bad.status, 400);
  assert.strictEqual(db.users.u1.customer, null, "nothing applied");
  const ok = await handleStripeWebhook(new Request("https://x/stripe-webhook", { method: "POST", body, headers: { "Stripe-Signature": await signed(body) } }), { webhookSecret: WHSEC }, db);
  assert.strictEqual(ok.status, 200);
  assert.strictEqual(db.users.u1.plan, "plus");
  const done = await handleStripeWebhook(new Request("https://x/stripe-webhook?page=done"), { webhookSecret: WHSEC }, db);
  assert.match(await done.text(), /You're on Aim Plus/);
});

test("billing: Checkout asks Stripe for a Plus subscription tied to the user", async () => {
  let sent;
  const fetcher = async (url, init) => { sent = { url, body: init.body.toString(), auth: init.headers.Authorization }; return new Response(JSON.stringify({ url: "https://checkout.stripe.com/c/x" }), { status: 200 }); };
  const url = await checkoutUrl(stripeApi("sk_test_1", fetcher), { secretKey: "sk_test_1", pricePlus: "price_plus", publicUrl: "https://p.supabase.co/functions/v1" }, { id: "u1", email: "a@example.com" }, null);
  assert.strictEqual(url, "https://checkout.stripe.com/c/x");
  assert.strictEqual(sent.url, "https://api.stripe.com/v1/checkout/sessions");
  const p = new URLSearchParams(sent.body);
  assert.deepStrictEqual([p.get("mode"), p.get("line_items[0][price]"), p.get("client_reference_id"), p.get("customer_email"), p.get("subscription_data[metadata][aim_user]")],
    ["subscription", "price_plus", "u1", "a@example.com", "u1"]);
  assert.match(p.get("success_url"), /stripe-webhook\?page=done$/);
  assert.strictEqual(sent.auth, "Bearer sk_test_1");
});

test("billing: subscribe and manage tasks, and what status says", async () => {
  const none = makeDeps({ plan: "free" });
  assert.strictEqual((await call(none, { task: "billing-checkout" })).status, 503, "not configured yet");
  assert.deepStrictEqual((await call(none, { task: "status" })).body.billing, { available: false, status: null, renewsAt: null, cancelAtPeriodEnd: false, manage: false });
  const opened = [];
  const withBilling = (plan, customer) => Object.assign(makeDeps({ plan }), { billing: {
    info: async () => ({ customer, status: customer ? "active" : null, renewsAt: null, cancelAtPeriodEnd: false }),
    checkout: async (user, c) => (opened.push(["checkout", user.id, c]), "https://checkout"),
    portal: async c => (opened.push(["portal", c]), "https://portal") } });
  assert.strictEqual((await call(withBilling("free", null), { task: "billing-checkout" })).body.url, "https://checkout");
  assert.strictEqual((await call(withBilling("plus", "cus_1"), { task: "billing-checkout" })).body.url, "https://portal", "already Plus: manage instead of paying twice");
  assert.strictEqual((await call(withBilling("free", null), { task: "billing-portal" })).status, 400);
  assert.strictEqual((await call(withBilling("free", "cus_2"), { task: "billing-checkout" })).body.url, "https://checkout");
  assert.deepStrictEqual(opened, [["checkout", "u1", null], ["portal", "cus_1"], ["checkout", "u1", "cus_2"]]);
  assert.strictEqual((await call(withBilling("plus", "cus_1"), { task: "status" })).body.billing.manage, true);
});

test("billing: deleting the account cancels the subscription first, and keeps the account if that fails", async () => {
  const closed = [], deleted = [];
  const mk = fail => Object.assign(makeDeps({ plan: "plus" }), {
    account: { exportData: async () => ({}), deleteUser: async id => deleted.push(id) },
    billing: { info: async () => ({ customer: "cus_1", status: "active", renewsAt: null, cancelAtPeriodEnd: false }),
      checkout: async () => "", portal: async () => "", close: async c => { if (fail) throw new Error("down"); closed.push(c); } } });
  const bad = await call(mk(true), { task: "account-delete", input: { confirm: "DELETE" } });
  assert.strictEqual(bad.status, 502);
  assert.deepStrictEqual(deleted, [], "nothing deleted while the subscription is still running");
  const ok = await call(mk(false), { task: "account-delete", input: { confirm: "DELETE" } });
  assert.strictEqual(ok.status, 200);
  assert.deepStrictEqual([closed, deleted], [["cus_1"], ["u1"]]);
});

test("study sessions: Plus only; the student's notes keep their structure; topics are tidied", async () => {
  let prompt = "";
  const deps = makeDeps({ plan: "plus", claude: req => {
    prompt = req.prompt;
    return { ok: true, model: "main", inputTokens: 10, outputTokens: 5, text: JSON.stringify({ title: "Cellular respiration", scope_note: "",
      topics: [{ title: "Glycolysis", brief: "Glucose is split in the cytoplasm.", searches: ["glycolysis explained", "glycolysis steps", "extra"] },
        { title: "Krebs cycle", brief: "In the mitochondria.", searches: [] }, { title: "", brief: "dropped", searches: [] }] }) };
  } });
  const r = await call(deps, { task: "study-plan", input: { objective: "Cellular respiration exam Friday", notes: "Unit 3\n- glycolysis\n- Krebs cycle" } });
  assert.strictEqual(r.status, 200);
  assert.match(prompt, /Unit 3\n- glycolysis/);
  assert.deepStrictEqual(r.body.topics.map(t => t.title), ["Glycolysis", "Krebs cycle"]);
  assert.deepStrictEqual(r.body.topics[0].searches, ["glycolysis explained", "glycolysis steps"]);
  assert.deepStrictEqual(r.body.topics[1].searches, ["Krebs cycle explained"], "a topic always has a search");
  assert.strictEqual(deps.calls[0].tier, "main");
  const free = makeDeps({ plan: "free" });
  assert.strictEqual((await call(free, { task: "study-plan", input: { objective: "x y" } })).status, 403);
});

test("pathways: Where could this take me? is open to any account and keeps only complete uses", async () => {
  let sys = "", prompt = "";
  const deps = makeDeps({ plan: "free", claude: req => {
    sys = req.system; prompt = req.prompt;
    return { ok: true, model: "main", inputTokens: 10, outputTokens: 5, text: JSON.stringify({ intro: "Algebra is how people work out an unknown.",
      uses: [{ field: "Aviation", how: "Pilots plan fuel.", problem: "A plane burns 9 gallons an hour. How long do 45 gallons last?", hint: "Divide.", answer: "5 hours" },
        { field: "Construction", how: "Estimating.", problem: "", hint: "", answer: "" }] }) };
  } });
  const r = await call(deps, { task: "pathways-where", input: { topic: "Algebra", context: "Solving for x", stage: "middle" } });
  assert.strictEqual(r.status, 200);
  assert.deepStrictEqual(r.body.uses.map(u => u.field), ["Aviation"], "a use without its problem is dropped");
  assert.match(prompt, /SUBJECT OR TOPIC: Algebra/);
  assert.match(sys, /middle school/);
  assert.match(sys, /No pay, salary/);
  assert.strictEqual((await call(deps, { task: "pathways-where", input: { topic: "" } })).status, 400);
});

test("pathways: themes come only from what the student was keen on, with real evidence", async () => {
  let prompt = "";
  const deps = makeDeps({ plan: "plus", claude: req => {
    prompt = req.prompt;
    return { ok: true, model: "main", inputTokens: 10, outputTokens: 5, text: JSON.stringify({ themes: [
      { name: "aviation", offer: "You've been exploring aviation. Want to see some of the careers connected to it?", evidence: [0, 1, 1, 9] },
      { name: "cooking", offer: "", evidence: [2] },
      { name: "weather", offer: "", evidence: [3, 4] }] }) };
  } });
  const items = [{ topic: "How wings make lift", answer: "yes" }, { topic: "Jet engines", answer: "maybe" }, { topic: "Baking bread", answer: "no" },
    { topic: "Thunderstorms", answer: "yes", note: "loved the radar part" }, { topic: "Clouds", answer: "yes" }];
  const r = await call(deps, { task: "pathways-themes", input: { stage: "high", items } });
  assert.strictEqual(r.status, 200);
  assert.deepStrictEqual(r.body.themes.map(t => [t.name, t.evidence]), [["aviation", [0, 1]], ["weather", [3, 4]]],
    "made-up or repeated evidence is dropped, and a theme needs two items");
  assert.match(r.body.themes[1].offer, /You've been exploring weather/, "a missing offer gets a plain one");
  assert.match(prompt, /3\. Thunderstorms: yes \(“loved the radar part”\)/);
  const few = await call(deps, { task: "pathways-themes", input: { items: [{ topic: "x", answer: "yes" }, { topic: "y", answer: "no" }] } });
  assert.deepStrictEqual(few.body.themes, [], "too little to go on: no AI call, no themes");
  assert.strictEqual(deps.calls.length, 1);
  assert.strictEqual((await call(makeDeps({ plan: "free" }), { task: "pathways-themes", input: { items } })).status, 403);
});

test("pathways: careers skip what was 'not for me'; younger students get kinds of work", async () => {
  let sys = "";
  const deps = makeDeps({ plan: "plus", claude: req => {
    sys = req.system;
    return { ok: true, model: "main", inputTokens: 10, outputTokens: 5, text: JSON.stringify({ careers: [
      { title: "Aircraft Mechanic", what: "Inspects and repairs.", connection: "Planes." }, { title: "Air Traffic Controller", what: "Guides aircraft.", connection: "Flight." }] }) };
  } });
  const r = await call(deps, { task: "pathways-careers", input: { theme: "aviation", stage: "high", notFor: ["aircraft mechanic"] } });
  assert.deepStrictEqual(r.body.careers.map(c => c.title), ["Air Traffic Controller"]);
  assert.strictEqual(r.body.kind, "careers");
  const kid = await call(deps, { task: "pathways-careers", input: { theme: "aviation", stage: "middle" } });
  assert.strictEqual(kid.body.kind, "work");
  assert.match(sys, /not job titles/);
});

test("pathways: a path's steps, with Try it as a real brief and no Prepare for younger students", async () => {
  const deps = makeDeps({ plan: "plus", claude: req => ({ ok: true, model: "main", inputTokens: 10, outputTokens: 5, text: JSON.stringify(
    req.schema.properties.client ? { title: "Design a reading cabin", client: "A family", brief: "They want a small cabin.", constraints: ["Budget $8,000", "10 by 12 ft site"],
      deliverable: "Floor plan and materials list", materials: ["Graph paper"], steps: ["Measure", "Sketch"], rubric: [{ criterion: "Fits the budget", good: "Costed list under $8,000" }],
      time: "Two sittings", together: false, together_reason: "", skills: ["Spatial design"] }
    : { summary: "Days at a desk and on site.", realities: ["Deadlines", "Lots of revisions"], searches: ["architect day in the life"] }) }) });
  const t = await call(deps, { task: "pathways-step", input: { step: "try", career: "Architect", theme: "building things", stage: "high" } });
  assert.strictEqual(t.status, 200);
  assert.strictEqual(t.body.client, "A family");
  assert.deepStrictEqual(t.body.rubric, [{ criterion: "Fits the budget", good: "Costed list under $8,000" }]);
  assert.match(deps.calls[0].system, /most important step/);
  const s = await call(deps, { task: "pathways-step", input: { step: "see", career: "Architect", stage: "high" } });
  assert.deepStrictEqual(s.body.searches, ["architect day in the life"]);
  assert.strictEqual((await call(deps, { task: "pathways-step", input: { step: "prepare", career: "Architect", stage: "middle" } })).status, 400);
  assert.strictEqual((await call(deps, { task: "pathways-step", input: { step: "dance", career: "Architect" } })).status, 400);
});

test("video concepts: Plus only; chapters are evidence; descriptions keep their lines", async () => {
  let prompt = "";
  const deps = makeDeps({ plan: "plus", claude: req => {
    prompt = req.prompt;
    return { ok: true, model: "main", inputTokens: 10, outputTokens: 5, text: JSON.stringify({ subject: "Private pilot training", regulated: true,
      references: ["FAA Airman Certification Standards: Private Pilot"],
      concepts: [
        { name: "Density altitude", summary: "How heat and elevation thin the air.", chapter: 1, basis: "listed",
          contexts: [{ label: "Hot-day takeoff accident analysis", search: "density altitude accident analysis" }, { label: "", search: "dropped" }] },
        { name: "Aeromedical factors", summary: "Hypoxia and fatigue.", chapter: 99, basis: "listed", contexts: [] },
        { name: "", summary: "dropped", chapter: -1, basis: "likely", contexts: [] }] }) };
  } });
  const r = await call(deps, { task: "video-concepts", input: { id: "abc", title: "Private Pilot Oral Exam", channel: "Flight School",
    description: "Mock checkride.\n0:00 Intro\n4:10 Density altitude", chapters: [{ t: 0, title: "Intro" }, { t: 250, title: "Density altitude" }], target: "Pass my checkride" } });
  assert.strictEqual(r.status, 200);
  assert.deepStrictEqual(r.body.concepts.map(c => [c.name, c.basis, c.chapter?.t ?? null]), [["Density altitude", "listed", 250], ["Aeromedical factors", "likely", null]],
    "a made-up chapter is dropped, and without a chapter or mention a concept is only 'likely'");
  assert.deepStrictEqual(r.body.concepts[0].contexts, [{ label: "Hot-day takeoff accident analysis", search: "density altitude accident analysis" }]);
  assert.strictEqual(r.body.regulated, true);
  assert.strictEqual(r.body.basis, "title, description and chapters");
  assert.match(prompt, /1\. 4:10 Density altitude/);
  assert.match(prompt, /Mock checkride\.\n0:00 Intro/);
  assert.strictEqual((await call(makeDeps({ plan: "free" }), { task: "video-concepts", input: { title: "x y" } })).status, 403);
});

test("librarian: 'relax' is its own kind, never the same Target, and sees recent Targets", async () => {
  let prompt = "";
  const deps = makeDeps({ plan: "free", claude: req => {
    prompt = req.prompt;
    return { ok: true, model: "fast", inputTokens: 10, outputTokens: 5, text: JSON.stringify({ target: "Aviation engineering", kind: "relax",
      note: "Picked with your flight review prep in mind.", searches: ["how jet engines work", "aircraft design documentary"], question: "", options: [], same_target: true }) };
  } });
  const r = await call(deps, { task: "librarian-ask", input: { request: "some engineering videos", target: "Research Gated Rentals", recent: ["Prepare for my flight review", "Research Gated Rentals"] } });
  assert.strictEqual(r.body.kind, "relax");
  assert.strictEqual(r.body.sameTarget, false, "relaxing never continues the current Target");
  assert.match(prompt, /THEIR RECENT TARGETS: Prepare for my flight review \| Research Gated Rentals/);
  assert.match(deps.calls[0].system, /"relax"/);
});

test("librarian: suggested questions skip ones already in the notes", async () => {
  const deps = makeDeps({ plan: "free", claude: () => ({ ok: true, model: "fast", inputTokens: 10, outputTokens: 5,
    text: JSON.stringify({ questions: ["What's the occupancy rate?", "How long is the minimum stay?", ""] }) }) });
  const r = await call(deps, { task: "librarian-questions", input: { target: "Research Gated Rentals before my call", notes: "- how long is the minimum stay?", watched: [{ title: "Tour" }] } });
  assert.deepStrictEqual(r.body.questions, ["What's the occupancy rate?"]);
  assert.strictEqual((await call(deps, { task: "librarian-questions", input: { target: "" } })).status, 400);
});

test("account: download everything, or delete only with DELETE typed; both need a sign-in", async () => {
  const deleted = [];
  const deps = makeDeps({ plan: "free" });
  deps.account = {
    exportData: async id => ({ profile: { plan: "free" }, aiUsage: [{ task: "librarian-ask" }], learners: [{ id: "l1" }], assessments: [], assessmentTurns: [], progress: [] }),
    deleteUser: async id => { deleted.push(id); }
  };
  const ex = await call(deps, { task: "account-export" });
  assert.strictEqual(ex.status, 200);
  assert.deepStrictEqual(ex.body.account, { id: "u1", email: "a@example.com", plan: "free" });
  assert.strictEqual(ex.body.aiUsage.length, 1);
  assert.ok(ex.body.exportedAt);
  assert.strictEqual(deps.calls.length, 0, "no AI involved");
  assert.strictEqual((await call(deps, { task: "account-delete", input: {} })).body.error.code, "confirm");
  assert.strictEqual((await call(deps, { task: "account-delete", input: { confirm: "delete" } })).status, 400, "exactly DELETE");
  assert.deepStrictEqual(deleted, []);
  const del = await call(deps, { task: "account-delete", input: { confirm: "DELETE" } });
  assert.strictEqual(del.status, 200);
  assert.deepStrictEqual(deleted, ["u1"]);
  assert.strictEqual((await call(deps, { task: "account-export" }, { token: null })).status, 401);
  assert.strictEqual((await call(deps, { task: "account-delete", input: { confirm: "DELETE" } }, { token: "bad" })).status, 401);
});

// ---------- sync across devices ----------
test("sync: Plus only; changes go between browsers, newest wins; erase removes the copy", async () => {
  const free = makeDeps({ plan: "free" }); free.sync = memSync();
  assert.strictEqual((await call(free, { task: "sync", input: { device: "device-aaaa", since: 0 } })).status, 403);
  const d = makeDeps(); d.sync = memSync();
  assert.strictEqual((await call(makeDeps(), { task: "sync", input: { device: "device-aaaa" } })).status, 503, "not set up");
  assert.strictEqual((await call(d, { task: "status" })).body.sync, true);
  const now = d.now().getTime();
  const t1 = { kind: "target", id: "t1", rev: now - 1000, data: { state: "paused", record: { id: "t1", text: "Fix the sink" } } };
  let a = await call(d, { task: "sync", input: { device: "device-aaaa", since: 0, items: [t1] } });
  assert.strictEqual(a.status, 200);
  assert.deepStrictEqual(a.body.items, [], "a browser doesn't get its own changes back");
  let b = await call(d, { task: "sync", input: { device: "device-bbbb", since: 0 } });
  assert.deepStrictEqual(b.body.items, [t1]);
  // An older change loses; a newer one reaches the other browser.
  await call(d, { task: "sync", input: { device: "device-bbbb", since: b.body.cursor, items: [{ ...t1, rev: now - 5000, data: { state: "completed", record: {} } }] } });
  assert.strictEqual([...d.sync.rows.values()][0].data.state, "paused");
  await call(d, { task: "sync", input: { device: "device-bbbb", since: b.body.cursor, items: [{ ...t1, rev: now, data: null }] } });
  a = await call(d, { task: "sync", input: { device: "device-aaaa", since: a.body.cursor } });
  assert.deepStrictEqual(a.body.items, [{ ...t1, rev: now, data: null }], "deletions sync too");
  // Bad input is refused.
  for (const input of [{ since: 0 }, { device: "device-aaaa", items: [{ kind: "history", id: "x", rev: 1, data: {} }] },
    { device: "device-aaaa", items: [{ kind: "target", id: "../x", rev: 1, data: {} }] },
    { device: "device-aaaa", items: [{ kind: "target", id: "x", rev: now + 2 * 864e5, data: {} }] },
    { device: "device-aaaa", items: [{ kind: "target", id: "x", rev: 1, data: [1] }] }])
    assert.strictEqual((await call(d, { task: "sync", input })).status, 400, JSON.stringify(input));
  // Erasing works on any plan.
  free.sync = d.sync;
  assert.ok((await call(free, { task: "sync-erase" })).body.erased);
  assert.strictEqual(d.sync.rows.size, 0);
});

test("sync: a round may be larger than other requests, but not without limit", async () => {
  const d = makeDeps(); d.sync = memSync(); d.config = { ...d.config, maxSyncBytes: 200_000 };
  const items = Array.from({ length: 20 }, (_, i) => ({ kind: "target", id: `t${i}`, rev: 1, data: { text: "x".repeat(5000) } }));
  assert.strictEqual((await call(d, { task: "sync", input: { device: "device-aaaa", items } })).status, 200);
  assert.strictEqual((await call(d, { task: "check", input: { pad: "x".repeat(10000) } })).status, 413, "other tasks keep the small limit");
  const huge = Array.from({ length: 50 }, (_, i) => ({ kind: "target", id: `t${i}`, rev: 1, data: { text: "x".repeat(5000) } }));
  assert.strictEqual((await call(d, { task: "sync", input: { device: "device-aaaa", items: huge } })).status, 413);
});

// ---------- Aim Homeschool ----------
// A parent (u1, plan homeschool) and a student's extension (s1, an anonymous account, plan free).
function hsDeps(plans = { u1: "homeschool" }) {
  const replies = [];
  const d = makeDeps({ claude: req => ({ ok: true, text: JSON.stringify(replies.shift()), model: "m", inputTokens: 10, outputTokens: 10 }) });
  d.config = { ...d.config, limits: { dayCalls: 100, dayTokens: 100000, minuteCalls: 100 }, maxBodyBytes: 200000 };
  d.getUser = async t => ({ good: { id: "u1", email: "parent@example.com" }, kid: { id: "s1" }, other: { id: "u2", email: "x@example.com" } })[t] || null;
  d.getPlan = async id => plans[id] || "free";
  d.now = () => new Date("2026-10-19T15:00:00Z"); // a Monday
  d.db = memDb(d.now);
  d.hs = memHs(d.db, { now: d.now, videos: { dQw4w9WgXcQ: { title: "Volcanoes 101", channel: "Science Co" } } });
  d.replies = replies;
  return d;
}
const hs = (d, task, input, token = "good") => call(d, { task, input }, { token });
const BUILT = { note: "", subjects: [{ name: "Science", units: [
  { title: "Earth Systems", weeks: 2, weeks_inferred: false, objectives: [{ text: "Explain how volcanoes form", inferred: false }, { text: "Describe plate boundaries", inferred: false }], requires: [], project: "Build a volcano model" },
  { title: "Weather", weeks: 2, weeks_inferred: true, objectives: [{ text: "Explain the water cycle", inferred: true }], requires: ["Earth Systems"], project: "" }] }] };
const weekReply = (ids, extra = {}) => ({ note: "", days: [
  { day: "Mon", items: [{ kind: "video", subject: "Science", title: "How volcanoes form", objectiveId: ids[0], why: "Introduces it.", detail: "Watch and note three causes.", minutes: 20, search: "how volcanoes form", together: false }] },
  { day: "Thu", items: [{ kind: "teachback", subject: "Science", title: "Explain volcanoes", objectiveId: ids[0], why: "Check.", detail: "Explain it.", minutes: 10, search: "", together: false }] },
  { day: "Sat", items: [{ kind: "reading", subject: "Science", title: "Not a school day", objectiveId: ids[0], why: "", detail: "", minutes: 10, search: "", together: false }] }],
  project: { title: "Volcano model", subject: "Science", objectiveId: ids[0], day: "Fri", minutes: 60, involvement: "together", materials: [{ name: "Baking soda", qty: "2 tbsp", kind: "consumable" }, { name: "Tray", qty: "1", kind: "reusable" }], deliverables: ["A photo"], prep: ["Buy vinegar"], safety: "Wear goggles" }, ...extra });

test("homeschool: only a Homeschool account; a family, a student, a curriculum it brought, approved", async () => {
  const d = hsDeps({ u1: "plus" });
  assert.strictEqual((await hs(d, "hs-home")).status, 403, "Plus isn't Homeschool");
  const h = hsDeps();
  let r = await hs(h, "hs-home");
  assert.strictEqual(r.status, 200);
  assert.deepStrictEqual(r.body.learners, []);
  r = await hs(h, "hs-learner-save", { name: "Alex", levels: { Science: "Grade 5", Math: "Grade 6" }, interests: "volcanoes" });
  const alex = r.body.id;
  assert.strictEqual((await hs(h, "hs-upload-add", { title: "Our science", kind: "purchased", text: "x".repeat(100) })).status, 400, "the parent confirms their right to use it");
  r = await hs(h, "hs-upload-add", { title: "Our science", kind: "purchased", confirmed: true, text: "Unit 1 Earth Systems: volcanoes, plates. Unit 2 Weather." + " ".repeat(10) });
  const up = r.body.id;
  h.replies.push(BUILT);
  r = await hs(h, "hs-curriculum-build", { learnerId: alex, uploadIds: [up], startDate: "2026-10-19" });
  assert.strictEqual(r.status, 200, JSON.stringify(r.body));
  assert.match(h.calls.at(-1).prompt, /Unit 1 Earth Systems/, "built from the family's own text");
  assert.match(h.calls.at(-1).system, /Don't invent units/);
  const draft = r.body.draft;
  assert.strictEqual(draft.subjects[0].level, "Grade 5", "the student's level in that subject");
  assert.deepStrictEqual(draft.subjects[0].units[1].requires, [draft.subjects[0].units[0].id], "prerequisites by unit");
  assert.strictEqual(draft.subjects[0].units[1].objectives[0].inferred, true);
  // Moving Weather before Earth Systems warns, but saves.
  const moved = { ...draft, subjects: [{ ...draft.subjects[0], units: [draft.subjects[0].units[1], draft.subjects[0].units[0]] }] };
  r = await hs(h, "hs-curriculum-save", { learnerId: alex, draft: moved, version: r.body.version });
  assert.strictEqual(r.status, 200);
  assert.match(r.body.warnings[0].text, /comes before “Earth Systems”/);
  assert.strictEqual((await hs(h, "hs-curriculum-save", { learnerId: alex, draft, version: 1 })).status, 409, "a stale copy can't overwrite");
  r = await hs(h, "hs-curriculum-save", { learnerId: alex, draft, version: r.body.version });
  // No week before the curriculum is approved.
  assert.strictEqual((await hs(h, "hs-week-propose", { learnerId: alex, weekStart: "2026-10-19" })).status, 400);
  r = await hs(h, "hs-curriculum-approve", { learnerId: alex });
  assert.strictEqual(r.body.approvedVersion, 1);
  const home = (await hs(h, "hs-home")).body;
  assert.strictEqual(home.learners[0].curriculum.approvedVersion, 1);
  assert.strictEqual(home.learners[0].curriculum.pending, false);
  assert.deepStrictEqual(home.uploads.map(u => u.title), ["Our science"]);
  // Uploads are this household's only, and deletable.
  const other = hsDeps({ u1: "homeschool", u2: "homeschool" });
  Object.assign(other, { hs: h.hs, db: h.db });
  assert.deepStrictEqual((await hs(other, "hs-home", {}, "other")).body.uploads, [], "another family sees nothing");
  await hs(h, "hs-upload-delete", { id: up });
  assert.strictEqual(h.hs.store.uploads.size, 0);
});

test("homeschool: a week from the approved curriculum; gaps decided before approval; the student gets only what's approved", async () => {
  const h = hsDeps();
  const alex = (await hs(h, "hs-learner-save", { name: "Alex", levels: { Science: "Grade 5" } })).body.id;
  h.replies.push(BUILT);
  await hs(h, "hs-curriculum-build", { learnerId: alex, text: "Unit 1 Earth Systems: volcanoes and plates. Unit 2 Weather and water.", startDate: "2026-10-19" });
  await hs(h, "hs-curriculum-approve", { learnerId: alex });
  const cur = (await hs(h, "hs-home")).body.learners[0].curriculum.approved;
  const ids = cur.subjects[0].units[0].objectives.map(o => o.id);
  h.replies.push(weekReply(ids));
  let r = await hs(h, "hs-week-propose", { learnerId: alex, weekStart: "2026-10-21" });
  assert.strictEqual(r.status, 200, JSON.stringify(r.body));
  assert.strictEqual(r.body.week.weekStart, "2026-10-19", "weeks start on Monday");
  assert.match(h.calls.at(-1).prompt, /Earth Systems", week 1 of 2/);
  assert.match(h.calls.at(-1).prompt, /Explain how volcanoes form/);
  assert.doesNotMatch(h.calls.at(-1).prompt, /water cycle/, "only this week's unit");
  assert.strictEqual(r.body.week.days[0].items[0].objective, "Explain how volcanoes form", "the curriculum's words");
  assert.strictEqual(r.body.week.days[5].items.length, 0, "nothing on a non-school day");
  assert.strictEqual(r.body.week.days[2].items.length, 0, "a day the plan leaves out stays empty (Wednesday isn't Thursday)");
  assert.deepStrictEqual(r.body.gaps, [{ subject: "Science", items: [r.body.week.days[0].items[0].id] }], "no preferred Science channel yet");
  // The student isn't connected yet; pairing with a one-time code.
  const code = (await hs(h, "hs-pair-code", { learnerId: alex })).body.code;
  assert.match(code, /^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  assert.strictEqual((await hs(h, "student-today", {}, "kid")).status, 403);
  r = await hs(h, "student-pair", { code: code.toLowerCase() }, "kid");
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.body.student, "Alex");
  assert.strictEqual(r.body.planned, false, "nothing approved yet, so nothing for the student");
  assert.strictEqual((await hs(h, "student-pair", { code }, "kid")).status, 400, "a code works once");
  // Approving waits for the gap decision.
  r = await hs(h, "hs-week-approve", { learnerId: alex, weekStart: "2026-10-19" });
  assert.strictEqual(r.status, 400);
  assert.match(r.body.error.message, /Science/);
  await hs(h, "hs-channels-save", { bySubject: { Science: [{ name: "SciShow", handle: "@SciShow", id: "UCZYTClx2T1of7BRZ86-8fow" }, { name: "bad", handle: "nope" }] } });
  r = await hs(h, "hs-week-approve", { learnerId: alex, weekStart: "2026-10-19" });
  assert.strictEqual(r.status, 200, JSON.stringify(r.body));
  r = await hs(h, "student-today", {}, "kid");
  assert.deepStrictEqual(r.body.items.map(i => i.title), ["How volcanoes form"]);
  assert.strictEqual(r.body.project.title, "Volcano model");
  assert.deepStrictEqual(r.body.channels.map(c => c.name), ["SciShow"], "only valid channels kept");
  // An edit to the approved week waits for approval again; the student keeps the approved copy.
  const home = (await hs(h, "hs-home")).body.learners[0].weeks[0];
  const edited = structuredClone(home.draft);
  edited.days[0].items[0].title = "Volcanoes, revised";
  r = await hs(h, "hs-week-save", { learnerId: alex, weekStart: "2026-10-19", draft: edited, version: home.version });
  assert.strictEqual(r.body.status, "changed");
  assert.deepStrictEqual((await hs(h, "student-today", {}, "kid")).body.items.map(i => i.title), ["How volcanoes form"], "never silently changed");
  assert.strictEqual((await hs(h, "hs-week-propose", { learnerId: alex, weekStart: "2026-10-19" })).status, 409, "an approved week isn't replaced");
  // A plain-language change: the AI revises the draft, chosen videos stay.
  h.replies.push(weekReply(ids, { note: "Lighter Monday." }));
  r = await hs(h, "hs-week-revise", { learnerId: alex, weekStart: "2026-10-19", request: "Make Monday lighter" });
  assert.strictEqual(r.body.status, "changed");
  assert.match(h.calls.at(-1).prompt, /The parent asks: Make Monday lighter/);
  await hs(h, "hs-week-approve", { learnerId: alex, weekStart: "2026-10-19", version: r.body.version });
  // Progress: lessons done count as watched, never as understanding.
  const item = (await hs(h, "student-today", {}, "kid")).body.items[0];
  await hs(h, "student-progress", { itemId: item.id, kind: "done", video: { id: "abc", title: "Volcanoes", channel: "SciShow" } }, "kid");
  assert.strictEqual((await hs(h, "student-today", {}, "kid")).body.items[0].done, true);
  let obj = (await hs(h, "hs-home")).body.learners[0].objectives[ids[0]];
  assert.deepStrictEqual([obj.status, obj.watched], ["not_assessed", 1]);
  // A TeachBack from the student's device counts for that objective (here: partial → Developing).
  h.db.progress.push({ learnerId: alex, source: "teachback", kind: "developing", topic: "Volcanoes", objective: "x", planObjective: ids[0], evidence: "magma rises", at: "2026-10-22T10:00:00Z" });
  obj = (await hs(h, "hs-home")).body.learners[0].objectives[ids[0]];
  assert.deepStrictEqual([obj.status, obj.evidence], ["developing", "magma rises"]);
  // The student's extension has its family's plan: TeachBack and the rest of Plus work there.
  h.replies.push("ready");
  assert.strictEqual((await call(h, { task: "check" }, { token: "kid" })).status, 200);
  // Unpairing.
  await hs(h, "hs-device-remove", { userId: "s1".padEnd(36, "0") });
  h.hs.store.devices.delete("s1");
  assert.strictEqual((await hs(h, "student-today", {}, "kid")).status, 403);
});

test("homeschool: a video chosen by link; materials you own; project status on both copies", async () => {
  const h = hsDeps();
  assert.strictEqual((await hs(h, "hs-video-info", { url: "https://example.com/x" })).status, 400);
  const r = await hs(h, "hs-video-info", { url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10" });
  assert.deepStrictEqual(r.body.video, { id: "dQw4w9WgXcQ", title: "Volcanoes 101", channel: "Science Co" });
  const m = await hs(h, "hs-materials-save", { owned: ["Tray", "tray", "Goggles"] });
  assert.deepStrictEqual([...h.hs.store.docs.values()].find(d => d.kind === "materials").data.owned, ["tray", "goggles"]);
  assert.strictEqual((await hs(h, "hs-materials-save", { owned: [], version: m.body.version + 5 })).status, 409);
});

test("homeschool: a long curriculum is organized in parts at once, joined in order; a big upload fits", async () => {
  const unit = n => `Unit ${n}: Topic ${n}\n` + `Lesson about topic ${n}. `.repeat(120) + "\n\n";
  const text = Array.from({ length: 8 }, (_, n) => unit(n + 1)).join("");
  const parts = splitCurriculum(text);
  assert.ok(parts.length >= 3 && parts.every(p => p.length <= 9000), parts.map(p => p.length).join());
  assert.ok(parts.slice(1).every(p => /^Unit \d/.test(p)), "parts start at a unit");
  assert.strictEqual(parts.join("").replace(/\s/g, ""), text.replace(/\s/g, ""), "nothing lost");
  const merged = mergeBuilt([{ subjects: [{ name: "Science", units: [{ title: "A" }] }], note: "" }, { subjects: [{ name: "science", units: [{ title: "B" }] }, { name: "Math", units: [{ title: "C" }] }], note: "x" }]);
  assert.deepStrictEqual(merged.subjects.map(s => [s.name, s.units.map(u => u.title).join()]), [["Science", "A,B"], ["Math", "C"]]);
  // End to end: three parts, three AI calls at once; a unit split across parts becomes one.
  const h = hsDeps();
  h.config = { ...h.config, maxBodyBytes: 24 * 1024, maxSyncBytes: 1024 * 1024 };
  const alex = (await hs(h, "hs-learner-save", { name: "Alex", levels: {} })).body.id;
  const big = (await hs(h, "hs-upload-add", { title: "Big", kind: "own", confirmed: true, text: text + text }));
  assert.strictEqual(big.status, 200, "an upload bigger than other requests is accepted");
  const u = (n, objs) => ({ title: `Topic ${n}`, weeks: 1, weeks_inferred: false, objectives: objs.map(t => ({ text: t, inferred: false })), requires: [], project: "" });
  const replies = [{ note: "", subjects: [{ name: "Science", units: [u(1, ["a"]), u(2, ["b"])] }] }, { note: "", subjects: [{ name: "Science", units: [u(2, ["c"]), u(3, ["d"])] }] }];
  h.callClaude = async req => { h.calls.push(req); return { ok: true, text: JSON.stringify(replies[h.calls.length - 1] || { note: "", subjects: [] }), model: "m", inputTokens: 1, outputTokens: 1 }; };
  const r = await hs(h, "hs-curriculum-build", { learnerId: alex, uploadIds: [big.body.id] });
  assert.strictEqual(r.status, 200, JSON.stringify(r.body));
  assert.ok(r.body.parts > 2 && h.calls.length === r.body.parts && /part 1 of/.test(h.calls[0].prompt));
  assert.deepStrictEqual(r.body.draft.subjects[0].units.map(x => [x.title, x.objectives.map(o => o.text).join()]), [["Topic 1", "a"], ["Topic 2", "b,c"], ["Topic 3", "d"]]);
});

test("the one-file dashboard version is up to date with supabase/functions/ai", async () => {
  const fs = await import("node:fs");
  const { build, OUT, buildWebhook, OUT_WEBHOOK } = await import("../tools/bundle-ai.mjs");
  assert.ok(fs.readFileSync(OUT, "utf8") === build(), "out of date: run node tools/bundle-ai.mjs");
  assert.ok(fs.readFileSync(OUT_WEBHOOK, "utf8") === buildWebhook(), "webhook out of date: run node tools/bundle-ai.mjs");
  // The files are pasted together, so top-level names must not repeat across them.
  const names = [...build().matchAll(/^(?:export )?(?:const|let|function|class|async function) (\w+)/gm)].map(m => m[1]);
  const dupes = names.filter((n, i) => names.indexOf(n) !== i);
  assert.deepStrictEqual(dupes, [], "top-level names repeat in the one-file version");
  // Imports between the files disappear when they're merged, so they can't rename anything.
  for (const f of ["handler.ts", "index.ts", "librarian.ts", "study.ts", "pathways.ts", "video.ts", "sync.ts", "homeschool.ts"]) {
    const src = fs.readFileSync(new URL(`../supabase/functions/ai/${f}`, import.meta.url), "utf8");
    assert.doesNotMatch(src, /^import [^\n]*\bas\b[^\n]*from "\.\//m, `${f}: no "as" in local imports`);
  }
});

let failed = 0;
for (const [name, fn] of tests) {
  try { await fn(); console.log("ok  ", name); }
  catch (e) { failed++; console.log("FAIL", name, "\n   ", process.env.DEBUG ? e.stack : e.message); }
}
console.log(`\n${tests.length - failed}/${tests.length} passed`);
process.exit(failed ? 1 : 0);
