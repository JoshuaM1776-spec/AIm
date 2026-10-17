// Tests for the Aim Plus AI endpoint's logic (supabase/functions/ai/handler.ts) with fake
// accounts, database and Claude. Run: node --experimental-strip-types tests/ai.test.mjs
import assert from "node:assert";
import { handle } from "../supabase/functions/ai/handler.ts";
import { memDb } from "./helpers/memdb.mjs";

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
  assert.deepStrictEqual(r.body, { ok: true, email: "a@example.com", plan: "free", usage: { calls: 0, tokens: 0 }, limits: LIMITS });
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

test("the one-file dashboard version is up to date with supabase/functions/ai", async () => {
  const fs = await import("node:fs");
  const { build, OUT } = await import("../tools/bundle-ai.mjs");
  assert.ok(fs.readFileSync(OUT, "utf8") === build(), "out of date: run node tools/bundle-ai.mjs");
});

let failed = 0;
for (const [name, fn] of tests) {
  try { await fn(); console.log("ok  ", name); }
  catch (e) { failed++; console.log("FAIL", name, "\n   ", e.message); }
}
console.log(`\n${tests.length - failed}/${tests.length} passed`);
process.exit(failed ? 1 : 0);
