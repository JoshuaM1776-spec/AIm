// Tests for the Aim Plus AI endpoint's logic (supabase/functions/ai/handler.ts) with fake
// accounts, database and Claude. Run: node --experimental-strip-types tests/ai.test.mjs
import assert from "node:assert";
import { handle } from "../supabase/functions/ai/handler.ts";

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

test("the one-file dashboard version is up to date with handler.ts and index.ts", async () => {
  const fs = await import("node:fs");
  const read = f => fs.readFileSync(new URL(f, import.meta.url), "utf8");
  const bundled = read("../supabase/functions/ai-dashboard.ts");
  assert.ok(bundled.includes(read("../supabase/functions/ai/handler.ts")), "run: node tools/bundle-ai.mjs");
  const indexBody = read("../supabase/functions/ai/index.ts").split("\n").filter(l => !l.startsWith("import ")).join("\n").trim();
  assert.ok(bundled.includes(indexBody.slice(-400)), "run: node tools/bundle-ai.mjs");
});

let failed = 0;
for (const [name, fn] of tests) {
  try { await fn(); console.log("ok  ", name); }
  catch (e) { failed++; console.log("FAIL", name, "\n   ", e.message); }
}
console.log(`\n${tests.length - failed}/${tests.length} passed`);
process.exit(failed ? 1 : 0);
