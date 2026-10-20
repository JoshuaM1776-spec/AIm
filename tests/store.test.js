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
const fresh = () => makeEnv({ schemaVersion: 5 });
const DEFAULTS = { homeCard: true, leisureMin: 60, graceMin: 15, totalMin: 0, purposeLimitMin: 0,
  hideShorts: true, hideRecs: true, hideFeeds: true, noAutoplay: true, strict: false, learnTopics: [], learnOff: [], learnShorts: false, learnRow: true, myTopics: [] };

const tests = [];
const test = (name, fn) => tests.push([name, fn]);

// ---------- migrations ----------
test("migrates Waypoint 0.5 data all the way to v5", async () => {
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
  assert.strictEqual(d.schemaVersion, 5);
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
  assert.strictEqual(env.local.schemaVersion, 5);
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

test("Change Target sets the old Target aside, with its searches and videos, and starts fresh", async () => {
  const env = fresh();
  await env.run(`startPurpose({ text: "learn sourdough", search: "sourdough starter", limitMin: 30 })`);
  await env.ticks(6, 10, { ...VIDEO, t: 95 });
  const r = await env.run(`pivotPurpose("fix my truck's AC", undefined, { id: "ac1", title: "AC recharge" })`);
  assert.strictEqual(r.purpose.text, "fix my truck's AC");
  assert.strictEqual(r.purpose.searches.length, 0, "the new Target starts fresh");
  assert.ok(r.purpose.allowed.some(v => v.id === "ac1"), "with the video that prompted it");
  assert.strictEqual(r.setAside, "learn sourdough");
  const parked = env.local.paused[0];
  assert.strictEqual(parked.text, "learn sourdough");
  assert.strictEqual(parked.videos.length, 1);
  assert.deepStrictEqual(parked.last, { id: VIDEO.id, title: VIDEO.title, t: 95, at: parked.last.at });
  assert.strictEqual(env.local.history.length, 0, "set aside, not finished");
});

test("resuming a set-aside Target restores it and returns to the video where you left off", async () => {
  const env = fresh();
  await env.run(`startPurpose({ text: "learn sourdough", search: "sourdough starter" })`);
  await env.run(`allowVideos({ query: "sourdough starter", videos: [{ id: "abc123", title: "Feeding" }, { id: "zzz" }], lists: [] })`);
  await env.ticks(3, 10, { ...VIDEO, t: 412 });
  await env.run(`pausePurpose()`);
  assert.strictEqual(env.local.purpose, null);
  await env.run(`startPurpose({ text: "fix my truck's AC", search: "truck ac recharge" })`);
  const id = env.local.paused[0].id;
  const r = await env.run(`resumePurpose(${JSON.stringify(id)})`);
  assert.strictEqual(r.purpose.text, "learn sourdough");
  assert.strictEqual(r.purpose.searches[0].q, "sourdough starter");
  assert.strictEqual(r.purpose.allowed.length, 2, "what its searches found is still watchable");
  assert.strictEqual(r.url, "https://www.youtube.com/watch?v=abc123&t=412s");
  assert.deepStrictEqual(env.local.paused.map(p => p.text), ["fix my truck's AC"], "the Target you had is set aside in turn");
  // Resuming the current Target just says where to go.
  assert.strictEqual((await env.run(`resumePurpose(${JSON.stringify(r.purpose.id)})`)).url, r.url);
});

test("resuming without a video goes back to the last search; resuming ends a break", async () => {
  const env = fresh();
  await env.run(`startPurpose({ text: "learn sourdough", search: "sourdough starter" })`);
  await env.run(`addSearch("starter feeding ratio")`);
  await env.run(`pausePurpose()`);
  await env.run(`startBreak({ minutes: 15 })`);
  const r = await env.run(`resumePurpose(${JSON.stringify(env.local.paused[0].id)})`);
  assert.strictEqual(r.url, "https://www.youtube.com/results?search_query=starter%20feeding%20ratio");
  assert.strictEqual(env.local.brk, null);
  assert.strictEqual(env.local.purpose.suspended, false);
});

test("a completed Target can be started again with its searches and watched videos", async () => {
  const env = fresh();
  await env.run(`startPurpose({ text: "learn sourdough", search: "sourdough starter" })`);
  await env.ticks(3, 10, VIDEO);
  await env.run(`finishPurpose("yes")`);
  const done = env.local.history[0];
  const r = await env.run(`resumePurpose(${JSON.stringify(done.id)})`);
  assert.notStrictEqual(r.purpose.id, done.id, "a new Target");
  assert.strictEqual(r.purpose.text, "learn sourdough");
  assert.strictEqual(r.purpose.searches[0].q, "sourdough starter");
  assert.ok(r.purpose.allowed.some(v => v.id === VIDEO.id));
  assert.strictEqual(r.url, `https://www.youtube.com/watch?v=${VIDEO.id}`);
  assert.strictEqual(env.local.history.length, 1, "the finished record stays");
  assert.strictEqual((await env.run(`resumePurpose("nope")`)).result, "error");
});

test("set-aside Targets: newest first, at most 20, removable, and searches never become Targets", async () => {
  const env = fresh();
  for (let i = 0; i < 22; i++) await env.run(`startPurpose({ text: "target ${i}" })`);
  assert.strictEqual(env.local.paused.length, 20);
  assert.strictEqual(env.local.paused[0].text, "target 20");
  assert.deepStrictEqual(env.local.history.map(h => h.text), ["target 0"], "the oldest beyond 20 moves to history");
  await env.run(`dropPaused(${JSON.stringify(env.local.paused[0].id)})`);
  assert.strictEqual(env.local.paused.length, 19);
  // More searches on the same Target stay part of it.
  await env.run(`addSearch("spark plugs")`);
  await env.run(`addSearch("ignition coils")`);
  assert.strictEqual(env.local.paused.length, 19);
  assert.strictEqual(env.local.purpose.searches.length, 2);
});

test("study sessions: a plan on the Target, topic videos become watchable, watching and checks are recorded", async () => {
  const env = fresh();
  assert.strictEqual((await env.run(`startStudy({ title: "x", topics: [] })`)).result, "error", "needs a Target");
  await env.run(`startPurpose({ text: "Cellular respiration exam Friday" })`);
  const r = await env.run(`startStudy({ title: "Cellular respiration", topics: [
    { title: "Glycolysis", brief: "In the cytoplasm.", searches: ["glycolysis explained"] },
    { title: "Krebs cycle", brief: "In the mitochondria.", searches: ["krebs cycle explained", "citric acid cycle"] },
    { title: "", searches: ["dropped"] }], notes: "Unit 3" })`);
  assert.strictEqual(r.url, "https://www.youtube.com/results?search_query=glycolysis%20explained");
  const st = env.local.purpose.study;
  assert.deepStrictEqual(st.topics.map(t => t.title), ["Glycolysis", "Krebs cycle"]);
  assert.strictEqual((await env.run(`checkSearch("citric acid cycle")`)).fits, true, "topic searches are part of the Target");
  const t1 = st.topics[0].id;
  await env.run(`updateStudy({ topicId: ${JSON.stringify(t1)}, videos: [{ id: "gly1", title: "Glycolysis in 5 minutes", reason: "Short and clear" }] })`);
  assert.ok(env.local.purpose.allowed.some(v => v.id === "gly1"), "a topic's videos are watchable");
  await env.tick(10, { id: "gly1", title: "Glycolysis in 5 minutes", t: 30 });
  assert.deepStrictEqual(env.local.purpose.study.topics[0].watched, ["gly1"]);
  await env.run(`updateStudy({ topicId: ${JSON.stringify(t1)}, current: 1, check: { assessmentId: "a1", objectives: [
    { text: "Explain where glycolysis happens", status: "demonstrated" }, { text: "Explain its products", status: "bogus", search: "glycolysis products" }] } })`);
  const after = env.local.purpose.study;
  assert.strictEqual(after.current, 1);
  assert.deepStrictEqual(after.topics[0].check.objectives.map(o => o.status), ["demonstrated", "not_assessed"]);
  await env.run(`updateStudy({ end: true })`);
  assert.ok(env.local.purpose.study.endedAt, "ended, but kept for the summary");
  await env.tick(10, { id: "gly2", title: "x" });
  assert.deepStrictEqual(env.local.purpose.study.topics[0].watched, ["gly1"], "an ended session stops recording");
});

test("migrating to v5 adds the set-aside list and when the Target was last active", async () => {
  const env = makeEnv({ schemaVersion: 4, purpose: { id: "p1", text: "learn sourdough", startedAt: 1000, usedSec: 0, searches: [], videos: [], allowed: [] } });
  await env.run(`migrateStorage()`);
  assert.strictEqual(env.local.schemaVersion, 5);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(env.local.paused)), []);
  assert.strictEqual(env.local.purpose.lastActiveAt, 1000);
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
  env = makeEnv({ schemaVersion: 5, settings: { graceMin: 0 } });
  await env.run(`startBreak({ minutes: 1 })`);
  st = await env.ticks(7, 10, VIDEO);
  assert.strictEqual(st.stop.videoId, null);
});

test("the daily leisure allowance caps breaks and is a hard stop", async () => {
  const env = makeEnv({ schemaVersion: 5, settings: { leisureMin: 20 } });
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
  const env = makeEnv({ schemaVersion: 5, settings: { leisureMin: 40 } });
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
  const env = makeEnv({ schemaVersion: 5, settings: { totalMin: 1 } });
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
  assert.strictEqual(d.schemaVersion, 5);
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

test("a result's length is kept, and filled in when YouTube shows it later", async () => {
  const env = fresh();
  await env.run(`startPurpose({ text: "learn sourdough", search: "sourdough starter" })`);
  await env.run(`allowVideos({ query: "sourdough starter", videos: [{ id: "v1", title: "A", length: "12:34" }, { id: "v2", title: "", length: "" }, { id: "v3", title: "C", length: "LIVE" }], lists: [] })`);
  await env.run(`allowVideos({ query: "sourdough starter", videos: [{ id: "v2", title: "B", length: "1:02:03" }, { id: "v2", title: "B", length: "1:02:03" }], lists: [] })`);
  assert.deepStrictEqual(env.local.purpose.allowed.map(v => [v.id, v.title, v.length]), [["v1", "A", "12:34"], ["v2", "B", "1:02:03"], ["v3", "C", ""]]);
});

test("relax with a theme: a break that keeps its theme and the videos its searches found", async () => {
  const env = fresh();
  await env.run(`startPurpose({ text: "Prepare for my flight review" })`);
  const r = await env.run(`startBreak({ minutes: 30, theme: { text: "Aviation engineering", note: "With your flight review in mind.", searches: ["how jet engines work", "aircraft design documentary"] } })`);
  assert.strictEqual(r.result, "applied");
  assert.strictEqual(env.local.brk.theme.text, "Aviation engineering");
  assert.strictEqual(env.local.brk.durationMin, 30);
  assert.strictEqual(env.local.purpose.suspended, true, "the Target waits, as with any break");
  await env.run(`addThemeVideos([{ id: "j1", title: "How a Jet Engine Works", length: "11:30" }, { id: "ad", title: "" }, { id: "j1", title: "How a Jet Engine Works" }])`);
  assert.deepStrictEqual(env.local.brk.theme.videos.map(v => [v.id, v.length]), [["j1", "11:30"]], "untitled (sponsored) entries and repeats are skipped");
  await env.run(`endBreak()`);
  assert.strictEqual(env.local.history.at(-1).theme, "Aviation engineering");
  const one = fresh();
  await one.run(`startBreak({ oneVideoId: "x", theme: { text: "Ignored" } })`);
  assert.strictEqual(one.local.brk.theme, null, "a one-video break has no theme");
});

test("notes stay with a Target: set aside, resumed, completed and started again", async () => {
  const env = fresh();
  await env.run(`startPurpose({ text: "Research Gated Rentals before my call" })`);
  await env.run(`setTargetNotes("- Ask about occupancy")`);
  const id = env.local.purpose.id;
  await env.run(`pausePurpose()`);
  assert.strictEqual(env.local.paused[0].notes, "- Ask about occupancy");
  await env.run(`resumePurpose("${id}")`);
  assert.strictEqual(env.local.purpose.notes, "- Ask about occupancy");
  await env.run(`finishPurpose("yes")`);
  assert.strictEqual(env.local.history.at(-1).notes, "- Ask about occupancy");
  await env.run(`resumePurpose("${id}")`);
  assert.strictEqual(env.local.purpose.notes, "- Ask about occupancy", "starting a finished Target again brings its notes");
  assert.strictEqual((await env.run(`setTargetNotes("x")`)).result, "applied");
});

test("a purpose set from a video, or a pivot from one, includes that video", async () => {
  const env = fresh();
  await env.run(`startPurpose({ text: "fix my faucet", video: { id: "f1", title: "Faucet fix" } })`);
  assert.deepStrictEqual(env.local.purpose.allowed.map(v => v.id), ["f1"]);
  await env.run(`pivotPurpose("replace a faucet cartridge", undefined, { id: "f2", title: "Cartridge" })`);
  assert.deepStrictEqual(env.local.purpose.allowed.map(v => v.id), ["f2"]);
  assert.deepStrictEqual(env.local.paused[0].allowed.map(v => v.id), ["f1"], "the first video stays with the set-aside Target");
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

// ---------- activity ----------
test("recent purposes: newest first, distinct, without the current one", async () => {
  const env = fresh();
  for (const t of ["learn sourdough", "fix my truck", "Learn Sourdough", "improve my photography"]) {
    await env.run(`startPurpose({ text: ${JSON.stringify(t)} })`);
    await env.run(`finishPurpose("yes")`);
  }
  await env.run(`startPurpose({ text: "fix my truck" })`);
  const recent = await env.run(`recentPurposes(${JSON.stringify(env.local.history)}, "fix my truck")`);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(recent)), ["improve my photography", "Learn Sourdough"]);
});

test("the week summary has 7 days of time and what came of the purposes", async () => {
  const env = fresh();
  await env.run(`startPurpose({ text: "learn sourdough" })`);
  await env.ticks(6);
  await env.run(`finishPurpose("yes")`);
  await env.run(`startPurpose({ text: "fix my truck" })`);
  await env.run(`finishPurpose("no")`);
  await env.run(`startBreak({ minutes: 15 })`);
  await env.ticks(3);
  const w = await env.run(`weekSummary(${JSON.stringify(env.local.usage)}, ${JSON.stringify(env.local.history)})`);
  assert.strictEqual(w.days.length, 7);
  const today = w.days[6];
  assert.strictEqual(Math.round(today.purpose), 60);
  assert.strictEqual(Math.round(today.leisure), 30);
  assert.deepStrictEqual([w.purposes, w.found], [2, 1]);
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

test("a Target's recent videos: the one you'd continue first, then most recently watched, with where you stopped", async () => {
  const env = fresh();
  const r = JSON.parse(env.run(`JSON.stringify(recentVideos({
    last: { id: "b", t: 120 },
    allowed: [{ id: "c", length: "10:00" }],
    videos: [
      { id: "a", title: "A", channel: "Ca", t: 30, d: 300, at: 1, lastAt: 5 },
      { id: "b", title: "B", channel: "Cb", t: 90, d: 600, at: 2, lastAt: 3 },
      { id: "c", title: "C", channel: "Cc", t: 0, at: 3, lastAt: 9 },
      { id: "", title: "no id" }
    ] }))`));
  assert.deepStrictEqual(r.map(v => v.id), ["b", "c", "a"], "the last video leads, then by when it was last watched");
  assert.strictEqual(r[0].t, 120, "the last video resumes where the Target left off");
  assert.strictEqual(r[1].d, 600, "a length YouTube showed in results fills in a missing duration");
  assert.strictEqual(r[2].t, 30);
  assert.strictEqual(env.run(`recentVideos({}).length`), 0);
});

test("a Target's path: each search once, in order, the last six", async () => {
  const env = fresh();
  const trail = JSON.parse(env.run(`JSON.stringify(searchTrail({ searches: ["truck ac recharge", "refrigerant types", "Truck AC recharge", "ac compressor", "a", "b", "c", "d"].map(q => ({ q })) }))`));
  assert.deepStrictEqual(trail, ["refrigerant types", "ac compressor", "a", "b", "c", "d"]);
  assert.strictEqual(env.run(`searchTrail({}).length`), 0);
});

test("the learning record: Targets with something to show, study sessions kept after they end, and totals", async () => {
  const env = fresh();
  await env.run(`startPurpose({ text: "Cellular respiration exam", search: "cellular respiration" })`);
  await env.tick(120, { id: "v1", title: "Glycolysis", channel: "Bio", t: 100, d: 600 });
  await env.run(`startStudy({ title: "Cellular respiration", topics: [{ title: "Glycolysis", brief: "b", searches: ["glycolysis"] }, { title: "Krebs", brief: "b", searches: ["krebs"] }] })`);
  await env.run(`(async () => { const s = await readAll(); s.purpose.study.topics[0].check = { at: 5, objectives: [{ text: "Net ATP", status: "demonstrated" }, { text: "Where", status: "partial" }] };
    s.purpose.study.apply = { title: "Trace it", task: "t", doneAt: 9, note: "drew it" }; await chrome.storage.local.set({ purpose: s.purpose }); })()`);
  await env.run(`finishPurpose("yes")`);
  await env.run(`startPurpose({ text: "nothing yet" })`);
  const r = JSON.parse(await env.run(`readAll().then(s => JSON.stringify(learningRecord(s)))`));
  assert.deepStrictEqual(r.entries.map(e => e.text), ["Cellular respiration exam"], "a Target with nothing to show is left out");
  const e = r.entries[0];
  assert.strictEqual(e.state, "completed");
  assert.strictEqual(e.study.topics[0].check.objectives[1].status, "partial", "the study session is kept after the Target ends");
  assert.strictEqual(e.study.apply.note, "drew it");
  assert.deepStrictEqual(JSON.parse(JSON.stringify(r.totals)), { targets: 1, learningSec: e.usedSec, topicsChecked: 1, demonstrated: 1, projects: 1 });
});

test("Learn something: topics and taken-out channels are validated", async () => {
  const env = fresh();
  assert.strictEqual((await env.run(`setSetting("learnTopics", ["math", "science"])`)).result, "applied");
  assert.strictEqual((await env.run(`setSetting("learnTopics", ["Math!"])`)).result, "error");
  assert.strictEqual((await env.run(`setSetting("learnOff", ["@numberphile"])`)).result, "applied");
  assert.strictEqual((await env.run(`setSetting("learnOff", ["numberphile"])`)).result, "error", "channels are @handles");
  await env.run(`saveLearnCache({ "@ok": { id: "UCYO_jab_esuFRV4b17AJtAw", at: 1, videos: [{ id: "abcdefg", title: "T", channel: "C", published: 2 }, { id: "x", title: "bad id" }] }, "bad": { id: "x" } })`);
  assert.deepStrictEqual(Object.keys(env.local.learn.channels), ["@ok"]);
  assert.strictEqual(env.local.learn.channels["@ok"].videos.length, 1);
});

test("channel paths are normalized", async () => {
  const env = fresh();
  await env.run(`setAvoid("/@caf%C3%A9/videos", "Café", "hide")`);
  assert.deepStrictEqual(Object.keys(env.local.avoid), ["/@café"]);
  await env.run(`setAvoid("/@café", "Café", null)`);
  assert.deepStrictEqual(env.local.avoid, {});
});

// ---------- your channels ----------
test("your channels: Learn from with a topic, For breaks, Keep out; topics stay with Learn from only", async () => {
  const env = fresh();
  await env.run(`setAvoid("/@woodshop/videos", "The Wood Shop", "prefer", "Woodworking")`);
  await env.run(`setAvoid("/@gamerguy", "Gamer Guy", "break", "Woodworking")`);
  assert.deepStrictEqual(env.local.avoid["/@woodshop"], { name: "The Wood Shop", action: "prefer", topic: "Woodworking" });
  assert.deepStrictEqual(env.local.avoid["/@gamerguy"], { name: "Gamer Guy", action: "break" }, "only Learn from has a topic");
  await env.run(`setAvoid("/@woodshop", "The Wood Shop", "prefer")`);
  assert.strictEqual(env.local.avoid["/@woodshop"].topic, "Woodworking", "kept when not given");
  await env.run(`setAvoid("/@woodshop", "The Wood Shop", "hide")`);
  assert.deepStrictEqual(env.local.avoid["/@woodshop"], { name: "The Wood Shop", action: "hide" });
  await env.run(`setAvoid("/@woodshop", "", null)`);
  assert.ok(!("/@woodshop" in env.local.avoid));
  assert.strictEqual((await env.run(`setSetting("myTopics", ["Woodworking", "x".repeat(41)])`)).result, "error");
});

test("your channels: subscriptions are kept by channel; a complete read replaces the list", async () => {
  const env = fresh();
  await env.run(`saveSubs([{ key: "/@a/videos", name: "A", avatar: "https://yt3.ggpht.com/x" }, { key: "/watch?v=1", name: "not a channel" }, { key: "/@b", name: "B", avatar: "https://evil.example/x" }], false)`);
  assert.deepStrictEqual(env.local.subs.channels, [{ key: "/@a", name: "A", avatar: "https://yt3.ggpht.com/x" }, { key: "/@b", name: "B", avatar: "" }]);
  await env.run(`saveSubs([{ key: "/@c", name: "C" }], false)`);
  assert.strictEqual(env.local.subs.channels.length, 3, "a partial read adds");
  await env.run(`saveSubs([{ key: "/@a", name: "A" }], true)`);
  assert.deepStrictEqual(env.local.subs.channels.map(c => c.key), ["/@a"], "a complete read replaces");
  assert.strictEqual(env.local.subs.complete, true);
  await env.run(`startPurpose({ text: "Turn a bowl" })`);
  await env.tick(10, { id: "v1", title: "Bowl", channel: "A" });
  const page = await env.run("channelsPage()");
  assert.strictEqual(page.watched.A, 1);
  assert.strictEqual(page.subs.channels.length, 1);
});

// ---------- sync across devices ----------
test("sync: another browser's changes merge in; the Target you're on stays yours", async () => {
  const env = fresh();
  await env.run(`startPurpose({ text: "Learn to solder" })`);
  const cur = env.local.purpose;
  await env.ticks(3);
  const snap = await env.run("syncSnapshot()");
  assert.ok(snap.has(`target:${cur.id}`) && snap.has("settings:all") && snap.has("avoid:all"));
  assert.ok(!("lastCountAt" in snap.get(`target:${cur.id}`).data.record), "timer state stays local");
  const rec = (id, text, extra = {}) => ({ id, text, startedAt: 1, usedSec: 50, videos: [], searches: [], ...extra });
  await env.run(`syncMerge(${JSON.stringify([
    { kind: "target", id: cur.id, rev: 2, data: { state: "paused", record: rec(cur.id, "Learn to solder", { notes: "flux first", usedSec: 5 }) } },
    { kind: "target", id: "p1", rev: 2, data: { state: "active", record: rec("p1", "Tile a backsplash") } },
    { kind: "target", id: "h1", rev: 2, data: { state: "completed", record: rec("h1", "Bake bread", { endedAt: 5, outcome: "yes" }) } },
    { kind: "settings", id: "all", rev: 2, data: { strict: true, leisureMin: -5 } },
    { kind: "avoid", id: "all", rev: 2, data: { rules: { "/@x/videos": { name: "X", action: "hide" }, "/@y": { name: "Y", action: "bogus" } } } }
  ])}, true)`);
  assert.strictEqual(env.local.purpose.id, cur.id, "still on it here");
  assert.strictEqual(env.local.purpose.notes, "flux first");
  assert.ok(env.local.purpose.usedSec >= 30, "time spent here isn't lost");
  assert.ok(env.local.paused.some(p => p.id === "p1" && p.elsewhere), "in progress elsewhere: ready to pick up");
  assert.ok(env.local.history.some(h => h.id === "h1" && h.type === "purpose" && h.outcome === "yes"));
  assert.strictEqual(env.local.settings.strict, true);
  assert.strictEqual(env.local.settings.leisureMin, 60, "invalid settings are ignored");
  assert.deepStrictEqual(Object.keys(env.local.avoid), ["/@x"]);
  // Finished elsewhere: finished here; deleted elsewhere: gone (not the current Target).
  await env.run(`syncMerge(${JSON.stringify([{ kind: "target", id: cur.id, rev: 3, data: { state: "completed", record: rec(cur.id, "Learn to solder", { endedAt: 9, outcome: "partly" }) } },
    { kind: "target", id: "p1", rev: 3, data: null }])})`);
  assert.strictEqual(env.local.purpose, null);
  assert.ok(env.local.history.some(h => h.id === cur.id && h.outcome === "partly"));
  assert.ok(!env.local.paused.some(p => p.id === "p1"));
});

test("sync: only deliberate deletions are passed on, and only while sync is on", async () => {
  const env = fresh();
  await env.run(`saveForLater({ id: "v1aaaa", title: "A" })`);
  await env.run(`removeSaved("v1aaaa")`);
  assert.strictEqual(env.local.syncDeleted, undefined, "sync off: nothing noted");
  env.local.sync = { on: true };
  await env.run(`saveForLater({ id: "v2bbbb", title: "B" })`);
  await env.run(`removeSaved("v2bbbb")`);
  await env.run(`startPurpose({ text: "Fold a fitted sheet" })`);
  await env.run(`finishPurpose("yes")`);
  await env.run(`clearHistory()`);
  assert.deepStrictEqual(env.local.syncDeleted.map(d => d.kind), ["saved", "target"]);
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
