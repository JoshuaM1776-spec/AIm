// Tests for Aim's store.js against a fake chrome.storage with random async delays,
// so the races a real browser can produce actually happen here.
// Run: node tests/store.test.js
const fs = require("fs"), path = require("path"), vm = require("vm"), assert = require("assert");
const SRC = fs.readFileSync(path.join(__dirname, "..", "store.js"), "utf8");

function makeEnv(initial = {}) {
  const local = JSON.parse(JSON.stringify(initial)), sess = {};
  const delay = () => new Promise(r => setTimeout(r, Math.random() * 5));
  const area = data => ({
    get: async k => { await delay(); const ks = k == null ? Object.keys(data) : [].concat(k);
      return JSON.parse(JSON.stringify(Object.fromEntries(ks.filter(x => x in data).map(x => [x, data[x]])))); },
    set: async o => { await delay(); Object.assign(data, JSON.parse(JSON.stringify(o))); },
    remove: async k => { await delay(); for (const x of [].concat(k)) delete data[x]; }
  });
  const chrome = { storage: { local: area(local), session: area(sess) } };
  const ctx = vm.createContext({ chrome, crypto, console, setTimeout });
  vm.runInContext(SRC, ctx);
  let clock = new Date(2026, 9, 16, 12, 0, 0).getTime();
  vm.runInContext("Date.now = () => __now()", Object.assign(ctx, { __now: () => clock }));
  return { ctx, local, run: code => vm.runInContext(code, ctx), advance: ms => (clock += ms) };
}

const tests = [];
const test = (name, fn) => tests.push([name, fn]);

test("migrates Waypoint 0.5 data", async () => {
  const env = makeEnv({
    schemaVersion: 1, level: "strict", homeCard: false, recMode: "hide",
    limits: { leisureMin: 60, leisureStart: 0, leisureEnd: 24, totalMin: 90 },
    avoid: { "/@loud": { name: "Loud", action: "block" }, "/@meh/videos": { name: "Meh", action: "warn" } },
    usage: { "2026-10-15": { leisure: 600, purposeful: 1200 } },
    session: { mode: "quick", purpose: "fix faucet", budgetMin: 15, usedSec: 120, path: [], searches: [] },
    sessions: [{ mode: "quick", purpose: "x", path: [] }, { mode: "explore", path: [] }],
    pending: [{ kind: "level" }], log: [{ kind: "video" }], saved: [{ id: "abc" }], apiKey: "k"
  });
  await env.run("migrateStorage()");
  const d = env.local;
  assert.strictEqual(d.schemaVersion, 2);
  assert.deepStrictEqual(d.settings, { homeCard: false, recMode: "hide", hold: true, reminderMin: 90 });
  assert.deepStrictEqual(d.avoid, { "/@loud": { name: "Loud", action: "hide" }, "/@meh": { name: "Meh", action: "warn" } });
  assert.deepStrictEqual(d.usage, { "2026-10-15": 1800 });
  assert.strictEqual(d.session.mode, "focus");
  assert.strictEqual(d.session.timeUp, false);
  assert.deepStrictEqual(d.sessions.map(s => s.mode), ["focus", "explore"]);
  for (const k of ["level", "pending", "limits", "log", "homeCard", "recMode"]) assert.ok(!(k in d), k + " should be removed");
  assert.deepStrictEqual(d.saved, [{ id: "abc" }]);
  assert.strictEqual(d.apiKey, "k");
  await env.run("migrateStorage()"); // second run is a no-op
  assert.strictEqual(d.settings.hold, true);
});

test("fresh install gets defaults", async () => {
  const env = makeEnv({});
  await env.run("migrateStorage()");
  assert.strictEqual(env.local.schemaVersion, 2);
  assert.deepStrictEqual(env.local.settings, { homeCard: true, recMode: "mark", hold: false, reminderMin: 0 });
});

test("pause is never lost to a concurrent tick (serial queue)", async () => {
  for (let i = 0; i < 50; i++) {
    const env = makeEnv({ schemaVersion: 2 });
    await env.run(`startSession({ mode: "focus", purpose: "learn rust ownership", budgetMin: 30 })`);
    env.advance(10000);
    await Promise.all([
      env.run("serial(() => recordTick(10, true))"),
      env.run("serial(() => patchSession({ paused: true }))"),
      env.run("serial(() => recordTick(10, true))")
    ]);
    assert.strictEqual(env.local.session.paused, true, "iteration " + i);
  }
});

test("without the queue the same race does lose the pause (sanity check)", async () => {
  let lost = 0;
  for (let i = 0; i < 50; i++) {
    const env = makeEnv({ schemaVersion: 2 });
    await env.run(`startSession({ mode: "focus", purpose: "learn rust ownership", budgetMin: 30 })`);
    await Promise.all([env.run("recordTick(10, true)"), env.run("patchSession({ paused: true })")]);
    if (!env.local.session.paused) lost++;
  }
  assert.ok(lost > 0, "expected the unqueued race to lose at least one pause");
});

test("two tabs ticking out of step count real time once", async () => {
  const env = makeEnv({ schemaVersion: 2 });
  await env.run(`startSession({ mode: "focus", purpose: "learn rust ownership", budgetMin: 30 })`);
  // Tab A ticks at 0,10,20..., tab B at 3,13,23... for 5 minutes.
  env.advance(1000);
  let t = 1000;
  for (let i = 0; i < 30; i++) {
    await env.run("serial(() => recordTick(10, true))"); env.advance(3000);
    await env.run("serial(() => recordTick(10, true))"); env.advance(7000);
  }
  const used = env.local.session.usedSec;
  assert.ok(used >= 295 && used <= 305, "usedSec " + used);
  const day = Object.values(env.local.usage)[0];
  assert.ok(day >= 295 && day <= 305, "usage " + day);
});

test("paused time isn't charged after resume", async () => {
  const env = makeEnv({ schemaVersion: 2 });
  await env.run(`startSession({ mode: "focus", purpose: "learn rust ownership", budgetMin: 30 })`);
  await env.run("recordTick(10, true)");
  await env.run("patchSession({ paused: true })");
  env.advance(30 * 60 * 1000);
  await env.run("recordTick(10, true)"); // paused: not charged
  await env.run("patchSession({ paused: false })");
  env.advance(2000);
  await env.run("recordTick(10, true)");
  assert.strictEqual(Math.round(env.local.session.usedSec), 12);
});

test("time up, then pivot keeping 0 minutes stays time-up; a new limit clears it", async () => {
  const env = makeEnv({ schemaVersion: 2 });
  await env.run(`startSession({ mode: "explore", budgetMin: 1 })`);
  for (let i = 0; i < 7; i++) { env.advance(10000); await env.run("recordTick(10, true)"); }
  assert.strictEqual(env.local.session.timeUp, true);
  let r = await env.run(`pivotSession("understand sourdough starters", null, "")`);
  assert.strictEqual(r.session.mode, "focus");
  assert.strictEqual(r.session.timeUp, true);
  r = await env.run(`pivotSession("understand sourdough hydration", 15, "")`);
  assert.strictEqual(r.result, "applied");
  assert.strictEqual(r.session.timeUp, false);
  assert.strictEqual(r.session.pivots, 2);
});

test("hold me to my limits: extending needs a reason", async () => {
  const env = makeEnv({ schemaVersion: 2, settings: { hold: true } });
  await env.run(`startSession({ mode: "focus", purpose: "learn rust ownership", budgetMin: 15 })`);
  let r = await env.run(`extendSession(15, "")`);
  assert.strictEqual(r.result, "error");
  r = await env.run(`extendSession(15, "finishing the borrow checker chapter")`);
  assert.strictEqual(r.result, "applied");
  assert.strictEqual(r.session.budgetMin, 30);
  await env.run(`setSetting("hold", false)`);
  r = await env.run(`extendSession(15, "")`);
  assert.strictEqual(r.result, "applied");
});

test("daily reminder fires once per day", async () => {
  const env = makeEnv({ schemaVersion: 2, settings: { reminderMin: 1 } });
  const hits = [];
  for (let i = 0; i < 12; i++) { env.advance(10000); hits.push((await env.run("recordTick(10, false)")).reminder); }
  assert.deepStrictEqual(hits.filter(Boolean), [1]);
  env.advance(24 * 3600 * 1000);
  const r = await env.run("recordTick(10, false)");
  assert.strictEqual(r.reminder, null); // new day starts at 10s, under the minute
});

test("settings are validated", async () => {
  const env = makeEnv({ schemaVersion: 2 });
  assert.strictEqual((await env.run(`setSetting("recMode", "nuke")`)).result, "error");
  assert.strictEqual((await env.run(`setSetting("apiKey", "x")`)).result, "error");
  assert.strictEqual((await env.run(`setSetting("reminderMin", 45)`)).result, "applied");
});

test("channel paths are normalized", async () => {
  const env = makeEnv({ schemaVersion: 2 });
  await env.run(`setAvoid("/@caf%C3%A9/videos", "Café", "hide")`);
  assert.deepStrictEqual(Object.keys(env.local.avoid), ["/@café"]);
  await env.run(`setAvoid("/@café", "Café", null)`);
  assert.deepStrictEqual(env.local.avoid, {});
});

(async () => {
  let failed = 0;
  for (const [name, fn] of tests) {
    try { await fn(); console.log("  ok  " + name); }
    catch (e) { failed++; console.log("  FAIL " + name + "\n       " + e.message); }
  }
  console.log(failed ? `${failed} failed` : `all ${tests.length} passed`);
  process.exit(failed ? 1 : 0);
})();
