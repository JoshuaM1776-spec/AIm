// Tests for Aim's store.js against a fake chrome.storage with random async delays,
// so the races a real browser can produce actually happen here.
// Run: node tests/store.test.js
const fs = require("fs"), path = require("path"), vm = require("vm"), assert = require("assert");
const SRC = fs.readFileSync(path.join(__dirname, "..", "store.js"), "utf8");
const MIN = 60 * 1000;

function makeEnv(initial = {}) {
  const local = JSON.parse(JSON.stringify(initial));
  const delay = () => new Promise(r => setTimeout(r, Math.random() * 4));
  const area = data => ({
    get: async k => { await delay(); const ks = k == null ? Object.keys(data) : [].concat(k);
      return JSON.parse(JSON.stringify(Object.fromEntries(ks.filter(x => x in data).map(x => [x, data[x]])))); },
    set: async o => { await delay(); Object.assign(data, JSON.parse(JSON.stringify(o))); },
    remove: async k => { await delay(); for (const x of [].concat(k)) delete data[x]; }
  });
  const chrome = { storage: { local: area(local), session: area({}) } };
  const ctx = vm.createContext({ chrome, crypto, console, setTimeout });
  vm.runInContext(SRC, ctx);
  let clock = new Date(2026, 9, 16, 12, 0, 0).getTime();
  vm.runInContext("Date.now = () => __now(); const __RealDate = Date; Date = class extends __RealDate { constructor(...a) { super(...(a.length ? a : [__now()])); } static now() { return __now(); } };",
    Object.assign(ctx, { __now: () => clock }));
  const run = code => vm.runInContext(code, ctx);
  const env = { ctx, local, run, advance: ms => (clock += ms) };
  // One tick of `sec` seconds after letting that much time pass, optionally while a video plays.
  env.tick = async (sec = 10, video = null) => { env.advance(sec * 1000); return run(`recordTick(${sec}, ${JSON.stringify(video)})`); };
  env.ticks = async (n, sec = 10, video = null) => { let r; for (let i = 0; i < n; i++) r = await env.tick(sec, video); return r; };
  env.today = () => Object.values(local.usage).pop();
  return env;
}
const VIDEO = { id: "abc123", title: "Feeding a sourdough starter", channel: "Bread Co" };
const fresh = () => makeEnv({ schemaVersion: 4 });
const DEFAULTS = { homeCard: true, leisureMin: 60, graceMin: 15, totalMin: 0, purposeLimitMin: 0,
  hideShorts: true, hideRecs: true, hideFeeds: true, noAutoplay: true };

const tests = [];
const test = (name, fn) => tests.push([name, fn]);

// ---------- migrations ----------
test("migrates Waypoint 0.5 data all the way to v4", async () => {
  const env = makeEnv({
    schemaVersion: 1, level: "strict", homeCard: false, recMode: "hide",
    limits: { leisureMin: 60, totalMin: 90 },
    avoid: { "/@loud": { name: "Loud", action: "block" } },
    usage: { "2026-10-15": { leisure: 600, purposeful: 1200 } },
    session: { mode: "quick", purpose: "fix faucet", budgetMin: 15, usedSec: 120, path: [{ purpose: "fix faucet", at: 1 }], searches: ["faucet drip"] },
    sessions: [{ mode: "quick", purpose: "x", path: [] }, { mode: "explore", path: [], usedSec: 300 }],
    saved: [{ id: "abc" }], log: [{}], apiKey: "k"
  });
  await env.run("migrateStorage()");
  const d = env.local;
  assert.strictEqual(d.schemaVersion, 4);
  assert.deepStrictEqual(d.settings, { ...DEFAULTS, homeCard: false });
  assert.deepStrictEqual(d.avoid, { "/@loud": { name: "Loud", action: "hide" } });
  assert.deepStrictEqual(d.usage, { "2026-10-15": { purpose: 1800, leisure: 0, other: 0 } });
  assert.strictEqual(d.purpose.text, "fix faucet");
  assert.strictEqual(d.purpose.limitMin, null, "purposes have no timer by default");
  assert.deepStrictEqual(d.purpose.searches.map(s => s.q), ["faucet drip"]);
  assert.deepStrictEqual(d.history.map(h => h.type), ["purpose", "break"]);
  for (const k of ["session", "sessions", "level", "limits", "log", "homeCard"]) assert.ok(!(k in d), k + " should be removed");
  assert.deepStrictEqual(d.saved, [{ id: "abc" }]);
  assert.ok(!("apiKey" in d), "the personal API key is removed: Aim Free uses no AI");
  assert.deepStrictEqual(d.purpose.allowed, []);
});

test("migrates v2 (Focus/Explore) data: Explore becomes a break", async () => {
  const env = makeEnv({
    schemaVersion: 2, settings: { homeCard: true, recMode: "mark", hold: true, reminderMin: 45 },
    session: { mode: "explore", purpose: "", budgetMin: 30, usedSec: 600, startedAt: 5 },
    usage: { "2026-10-16": 900 }, sessions: [], reminderDay: "x"
  });
  await env.run("migrateStorage()");
  const d = env.local;
  assert.strictEqual(d.purpose, null);
  assert.strictEqual(d.brk.durationMin, 30);
  assert.strictEqual(d.brk.usedSec, 600);
  assert.ok(!("hold" in d.settings) && !("reminderMin" in d.settings));
  assert.ok(!("reminderDay" in d));
  await env.run("migrateStorage()"); // second run is a no-op
  assert.strictEqual(d.brk.durationMin, 30);
});

test("fresh install gets defaults", async () => {
  const env = makeEnv({});
  await env.run("migrateStorage()");
  assert.strictEqual(env.local.schemaVersion, 4);
  assert.deepStrictEqual(env.local.settings, DEFAULTS);
});

// ---------- purpose ----------
test("a purpose has no time limit by default and records searches and videos", async () => {
  const env = fresh();
  await env.run(`startPurpose({ text: "learn sourdough", search: "sourdough starter" })`);
  await env.run(`addSearch("starter feeding ratio")`);
  const st = await env.ticks(6, 10, VIDEO);
  assert.strictEqual(st.purpose.limitMin, null);
  assert.strictEqual(st.stop, null);
  assert.deepStrictEqual(st.purpose.searches.map(s => s.q), ["sourdough starter", "starter feeding ratio"]);
  assert.strictEqual(st.purpose.videos.length, 1);
  assert.strictEqual(Math.round(st.purpose.videos[0].sec), 60);
  assert.strictEqual(Math.round(env.today().purpose), 60);
});

test("pivot keeps searches, videos and remaining time", async () => {
  const env = fresh();
  await env.run(`startPurpose({ text: "learn sourdough", limitMin: 30 })`);
  await env.ticks(6, 10, VIDEO);
  const r = await env.run(`pivotPurpose("understand gluten development")`);
  assert.strictEqual(r.purpose.text, "understand gluten development");
  assert.strictEqual(r.purpose.limitMin, 30);
  assert.strictEqual(r.purpose.videos.length, 1);
  assert.deepStrictEqual(r.purpose.path.map(p => p.text), ["learn sourdough", "understand gluten development"]);
});

test("a pivot is never lost to a concurrent tick (serial queue)", async () => {
  for (let i = 0; i < 40; i++) {
    const env = fresh();
    await env.run(`startPurpose({ text: "learn sourdough" })`);
    env.advance(10000);
    await Promise.all([
      env.run(`serial(() => recordTick(10, null))`),
      env.run(`serial(() => pivotPurpose("understand gluten"))`),
      env.run(`serial(() => recordTick(10, null))`)
    ]);
    assert.strictEqual(env.local.purpose.text, "understand gluten", "iteration " + i);
  }
});

test("without the queue the same race does lose changes (sanity check)", async () => {
  let lost = 0;
  for (let i = 0; i < 40; i++) {
    const env = fresh();
    await env.run(`startPurpose({ text: "learn sourdough" })`);
    await Promise.all([env.run(`recordTick(10, null)`), env.run(`pivotPurpose("understand gluten")`)]);
    if (env.local.purpose.text !== "understand gluten") lost++;
  }
  assert.ok(lost > 0, "expected the unqueued race to lose at least one pivot");
});

test("two tabs ticking out of step count real time once", async () => {
  const env = fresh();
  await env.run(`startPurpose({ text: "learn sourdough" })`);
  env.advance(1000);
  for (let i = 0; i < 30; i++) {
    await env.run("serial(() => recordTick(10, null))"); env.advance(3000);
    await env.run("serial(() => recordTick(10, null))"); env.advance(7000);
  }
  const used = env.local.purpose.usedSec;
  assert.ok(used >= 295 && used <= 305, "usedSec " + used);
  assert.ok(env.today().purpose >= 295 && env.today().purpose <= 305);
});

test("purpose time limit: time up, grace for the playing video, add 15 clears it", async () => {
  const env = fresh();
  await env.run(`startPurpose({ text: "learn sourdough", limitMin: 1 })`);
  const st = await env.ticks(7, 10, VIDEO);
  assert.strictEqual(st.purpose.timeUp, true);
  assert.strictEqual(st.stop.kind, "purpose");
  assert.strictEqual(st.stop.videoId, VIDEO.id);
  assert.strictEqual(st.stop.graceEndsAt - st.stop.at, 15 * MIN);
  const r = await env.run(`setPurposeLimit({ add: 15 })`);
  assert.strictEqual(r.purpose.timeUp, false);
  assert.strictEqual(env.local.stop, null);
});

test("Done archives the purpose with its outcome and leaves a reflection", async () => {
  const env = fresh();
  await env.run(`startPurpose({ text: "fix a leaking faucet", search: "faucet drip fix" })`);
  await env.ticks(3, 10, VIDEO);
  const r = await env.run(`finishPurpose("yes")`);
  assert.strictEqual(env.local.purpose, null);
  assert.strictEqual(env.local.history.length, 1);
  assert.strictEqual(env.local.history[0].outcome, "yes");
  assert.strictEqual(env.local.history[0].videos[0].id, VIDEO.id);
  assert.strictEqual(env.local.reflection.id, r.record.id);
  await env.run(`ratePurpose(${JSON.stringify(r.record.id)}, "partly")`);
  assert.strictEqual(env.local.history[0].outcome, "partly");
});

// ---------- breaks ----------
test("a break suspends the purpose, counts as leisure, and resumes the purpose after", async () => {
  const env = fresh();
  await env.run(`startPurpose({ text: "learn sourdough" })`);
  await env.ticks(3);
  await env.run(`startBreak({ minutes: 15 })`);
  assert.strictEqual(env.local.purpose.suspended, true);
  await env.ticks(6, 10, VIDEO);
  assert.strictEqual(Math.round(env.local.purpose.usedSec), 30, "purpose time frozen during the break");
  assert.strictEqual(Math.round(env.today().leisure), 60);
  assert.strictEqual(env.local.brk.videos[0].id, VIDEO.id);
  await env.run(`endBreak()`);
  assert.strictEqual(env.local.brk, null);
  assert.strictEqual(env.local.purpose.suspended, false);
  assert.strictEqual(env.local.history[0].type, "break");
});

test("a break that runs out ends itself; the playing video gets the grace period", async () => {
  const env = fresh();
  await env.run(`startBreak({ minutes: 1 })`);
  const st = await env.ticks(7, 10, VIDEO);
  assert.strictEqual(st.brk, null);
  assert.strictEqual(st.stop.kind, "break");
  assert.strictEqual(st.stop.videoId, VIDEO.id);
  assert.strictEqual(st.stop.graceEndsAt - st.stop.at, 15 * MIN);
  await env.run(`clearStop()`);
  assert.strictEqual(env.local.stop, null);
});

test("no grace when nothing is playing, or when the grace period is set to 0", async () => {
  let env = fresh();
  await env.run(`startBreak({ minutes: 1 })`);
  let st = await env.ticks(7);
  assert.strictEqual(st.stop.videoId, null);
  env = makeEnv({ schemaVersion: 4, settings: { graceMin: 0 } });
  await env.run(`startBreak({ minutes: 1 })`);
  st = await env.ticks(7, 10, VIDEO);
  assert.strictEqual(st.stop.videoId, null);
});

test("the daily leisure allowance caps breaks and is a hard stop", async () => {
  const env = makeEnv({ schemaVersion: 4, settings: { leisureMin: 20 } });
  let r = await env.run(`startBreak({ minutes: 30 })`);
  assert.strictEqual(r.brk.durationMin, 20, "capped to what's left today");
  assert.strictEqual(r.capped, 20);
  await env.ticks(60, 10, VIDEO); // 10 minutes
  r = await env.run(`extendBreak(30)`);
  assert.strictEqual(r.result, "error", "the break already uses the whole allowance");
  assert.match(r.message, /No leisure time left/);
  const st = await env.ticks(70, 10, VIDEO); // past 20 minutes of leisure
  assert.strictEqual(st.brk, null);
  assert.ok(["leisure", "break"].includes(st.stop.kind));
  r = await env.run(`startBreak({ minutes: 15 })`);
  assert.strictEqual(r.result, "error");
  assert.match(r.message, /leisure time is used up/);
});

test("extending a break draws on the remaining allowance", async () => {
  const env = makeEnv({ schemaVersion: 4, settings: { leisureMin: 40 } });
  await env.run(`startBreak({ minutes: 15 })`);
  let r = await env.run(`extendBreak(15)`);
  assert.strictEqual(r.added, 15);
  r = await env.run(`extendBreak(15)`);
  assert.strictEqual(r.added, 10, "only 10 of the 40 minutes were left");
});

test("a one-video break has no timer, counts as leisure, and ends on request", async () => {
  const env = fresh();
  const r = await env.run(`startBreak({ oneVideoId: "abc123" })`);
  assert.strictEqual(r.brk.durationMin, null);
  assert.strictEqual(r.brk.oneVideoId, "abc123");
  const st = await env.ticks(30, 10, VIDEO);
  assert.ok(st.brk, "no timer to run out");
  assert.strictEqual(Math.round(env.today().leisure), 300);
  await env.run(`endBreak()`);
  assert.strictEqual(env.local.history[0].oneVideo, true);
});

test("starting a purpose ends the break", async () => {
  const env = fresh();
  await env.run(`startBreak({ minutes: 15 })`);
  await env.run(`startPurpose({ text: "learn sourdough" })`);
  assert.strictEqual(env.local.brk, null);
  assert.strictEqual(env.local.history[0].type, "break");
});

// ---------- daily total ----------
test("the daily YouTube total is a hard stop for the rest of the day", async () => {
  const env = makeEnv({ schemaVersion: 4, settings: { totalMin: 1 } });
  await env.run(`startPurpose({ text: "learn sourdough" })`);
  const st = await env.ticks(7, 10, VIDEO);
  assert.strictEqual(st.stop.kind, "total");
  assert.strictEqual(st.totalReached, true);
  await env.run(`clearStop()`);
  assert.strictEqual(env.local.stop.kind, "total", "can't be cleared today");
  assert.strictEqual((await env.run(`startBreak({ minutes: 15 })`)).result, "error");
  env.advance(24 * 60 * MIN);
  const next = await env.run(`getStatus()`);
  assert.strictEqual(next.stop, null, "a new day starts fresh");
  assert.strictEqual(next.totalReached, false);
});

test("idle time counts toward the daily total but not leisure or purpose", async () => {
  const env = fresh();
  await env.ticks(6);
  assert.deepStrictEqual(Object.values(env.today()).map(Math.round), [0, 0, 60]);
});

test("migrates v3 data: drops the API key and AI setting, gives the purpose an allowed list", async () => {
  const env = makeEnv({ schemaVersion: 3, apiKey: "sk-ant-x", model: "m", settings: { homeCard: true, recMode: "hide", leisureMin: 30 },
    purpose: { id: "p1", text: "learn sourdough", searches: [], videos: [], path: [] } });
  await env.run("migrateStorage()");
  const d = env.local;
  assert.strictEqual(d.schemaVersion, 4);
  assert.ok(!("apiKey" in d) && !("model" in d));
  assert.ok(!("recMode" in d.settings));
  assert.strictEqual(d.settings.leisureMin, 30, "other settings kept");
  assert.deepStrictEqual([d.purpose.allowed, d.purpose.allowedLists], [[], []]);
});

// ---------- what a purpose allows ----------
test("search results become what the purpose allows, without duplicates", async () => {
  const env = fresh();
  await env.run(`startPurpose({ text: "learn sourdough", search: "sourdough starter" })`);
  await env.run(`allowVideos({ query: "sourdough starter", videos: [{ id: "v1", title: "A" }, { id: "v2", title: "B" }], lists: ["PL1"] })`);
  await env.run(`allowVideos({ query: "sourdough starter", videos: [{ id: "v2", title: "B" }, { id: "v3", title: "C" }], lists: ["PL1"] })`);
  assert.deepStrictEqual(env.local.purpose.allowed.map(v => v.id), ["v1", "v2", "v3"]);
  assert.deepStrictEqual(env.local.purpose.allowedLists, ["PL1"]);
  assert.strictEqual(env.local.purpose.allowed[0].q, "sourdough starter");
});

test("a purpose set from a video, or a pivot from one, includes that video", async () => {
  const env = fresh();
  await env.run(`startPurpose({ text: "fix my faucet", video: { id: "f1", title: "Faucet fix" } })`);
  assert.deepStrictEqual(env.local.purpose.allowed.map(v => v.id), ["f1"]);
  await env.run(`pivotPurpose("replace a faucet cartridge", undefined, { id: "f2", title: "Cartridge" })`);
  assert.deepStrictEqual(env.local.purpose.allowed.map(v => v.id), ["f1", "f2"]);
});

test("word check: searches that share a meaningful word continue the purpose", async () => {
  const env = fresh();
  await env.run(`startPurpose({ text: "learn how sourdough bread works", search: "sourdough starter" })`);
  const fits = async q => (await env.run(`checkSearch(${JSON.stringify(q)})`)).fits;
  assert.strictEqual(await fits("starter feeding ratio"), true, "shares 'starter' with an earlier search");
  assert.strictEqual(await fits("Sourdough Starters"), true, "case and plurals don't matter");
  assert.strictEqual(await fits("best gaming laptop 2026"), false);
  assert.strictEqual(await fits("how to make the best"), true, "nothing but filler: nothing to judge by");
  assert.strictEqual(await fits("breads of france"), true, "plural 'breads' matches 'bread'");
  await env.run(`startPurpose({ text: "fix a leaking faucet" })`);
  assert.strictEqual(await fits("faucet leaks under sink"), true);
  assert.strictEqual(await fits("kitchen tap washer"), false, "synonyms aren't known: Aim asks");
  await env.run(`startPurpose({ text: "improve my photography" })`);
  assert.strictEqual(await fits("photographic composition"), true, "shared five-letter start");
});

// ---------- settings and channels ----------
test("settings are validated", async () => {
  const env = fresh();
  assert.strictEqual((await env.run(`setSetting("graceMin", 7)`)).result, "error");
  assert.strictEqual((await env.run(`setSetting("graceMin", 30)`)).result, "applied");
  assert.strictEqual((await env.run(`setSetting("leisureMin", 90)`)).result, "applied");
  assert.strictEqual((await env.run(`setSetting("recMode", "mark")`)).result, "error", "the AI setting is gone");
  assert.strictEqual((await env.run(`setSetting("apiKey", "x")`)).result, "error");
  assert.strictEqual((await env.run(`setSetting("hideShorts", false)`)).result, "applied");
  assert.strictEqual((await env.run(`setSetting("noAutoplay", "yes")`)).result, "error");
});

test("channel paths are normalized", async () => {
  const env = fresh();
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
