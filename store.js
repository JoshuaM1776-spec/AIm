// Aim — stored data and the rules for purposes, breaks and time.
// Loaded only by the background service worker, which is the single writer: the popup,
// settings page and YouTube tabs change data by sending it messages.
//
// Two states, nothing in between:
//   Purpose — why you're on YouTube right now. Optional time limit. Ends with Done.
//   Break   — free browsing for a set time (or one video). Counts against today's leisure
//             allowance. A purpose you had is kept and resumes when the break ends.
// With neither, YouTube asks you to choose.
//
// Limits (all optional except the leisure allowance, which defaults to 60 minutes):
//   break length · daily leisure allowance (hard) · purpose time limit · daily YouTube total (hard).
// When one runs out mid-video, that video may finish within the grace period (default 15 min).

const SCHEMA_VERSION = 5;
const DEFAULT_SETTINGS = {
  homeCard: true, leisureMin: 60, graceMin: 15, totalMin: 0, purposeLimitMin: 0,
  // Distractions, reduced whenever you're not on a break (see content.css and content/focus.js).
  hideShorts: true, hideRecs: true, hideFeeds: true, noAutoplay: true,
  // Strict mode: bending a rule (more time, a warned channel, a search that doesn't match) asks for a reason.
  strict: false,
  // "Learn something": topics you picked (content/topics.js), and curated channels you took out.
  learnTopics: [], learnOff: [],
  // Shorts from your Learn something channels only: a few at a time, as quick reviews of what you've learned.
  learnShorts: false,
  // The Learn something row on the homepage (off: a clean page, just "What brings you here?").
  learnRow: true,
  // Your own topics for channels you learn from (the Your channels page).
  myTopics: [],
  // The librarian remembers what you explained to it (Aim Plus; kept in this browser).
  librarianMemory: true,
  // The librarian may read captions when it talks a session through (Aim Plus). A preview, off by
  // default until the legal review (docs/ROADMAP.md → Decisions).
  captions: false
};
const GRACE_CHOICES = [0, 5, 10, 15, 30];
const minutesSetting = max => v => Number.isInteger(v) && v >= 0 && v <= max;
const SETTING_RULES = {
  homeCard: v => typeof v === "boolean",
  leisureMin: minutesSetting(24 * 60),   // 0 = no daily allowance
  graceMin: v => GRACE_CHOICES.includes(v),
  totalMin: minutesSetting(24 * 60),     // 0 = no daily total
  purposeLimitMin: minutesSetting(600),  // 0 = purposes have no time limit unless you set one
  hideShorts: v => typeof v === "boolean",
  hideRecs: v => typeof v === "boolean",
  hideFeeds: v => typeof v === "boolean",
  noAutoplay: v => typeof v === "boolean",
  strict: v => typeof v === "boolean",
  learnTopics: v => Array.isArray(v) && v.length <= 20 && v.every(x => typeof x === "string" && /^[a-z]{2,20}$/.test(x)),
  learnOff: v => Array.isArray(v) && v.length <= 200 && v.every(x => typeof x === "string" && /^@[\w.-]{1,60}$/.test(x)),
  learnShorts: v => typeof v === "boolean",
  learnRow: v => typeof v === "boolean",
  myTopics: v => Array.isArray(v) && v.length <= 30 && v.every(x => typeof x === "string" && x.trim().length >= 1 && x.length <= 40),
  librarianMemory: v => typeof v === "boolean",
  captions: v => typeof v === "boolean"
};

// ---------- write queue ----------
// Every change runs one at a time, so a timer tick can't overwrite a pivot or a break
// that happened while it was reading.
let queue = Promise.resolve();
function serial(fn) {
  const run = queue.then(fn);
  queue = run.catch(() => {});
  return run;
}

// ---------- helpers ----------
function todayKey(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// "/@name/videos" and "/@name" are the same channel.
function channelPath(p) {
  let path = String(p || "");
  try { path = decodeURIComponent(path); } catch {}
  const m = path.match(/^\/(@[^/?#]+|channel\/[^/?#]+|c\/[^/?#]+|user\/[^/?#]+)/);
  return m ? "/" + m[1] : path;
}

// Credits the wall-clock time since the last credit, at most `seconds`. Two open YouTube
// tabs ticking out of step then add up to real time instead of counting it twice.
function credit(lastAt, now, seconds) {
  return lastAt ? Math.max(0, Math.min(seconds, (now - lastAt) / 1000)) : seconds;
}

const clip = (s, n) => String(s || "").trim().slice(0, n);
const uid = () => crypto.randomUUID();
const emptyDay = () => ({ purpose: 0, leisure: 0, other: 0 });
const dayTotal = u => (u ? u.purpose + u.leisure + u.other : 0);

// A bare topic ("woodworking") doesn't say what you want to accomplish.
function isVague(text) {
  const t = (text || "").trim();
  if (!t) return true;
  return t.split(/\s+/).length <= 2 && !/[?]/.test(t);
}

// ---------- migrations ----------
// Bump SCHEMA_VERSION when stored data changes shape, and add a step here.
async function migrateStorage() {
  const { schemaVersion = 0 } = await chrome.storage.local.get("schemaVersion");
  if (schemaVersion >= SCHEMA_VERSION) return;
  // Version 1 only stamped the version, so 0 and 1 hold the same Waypoint 0.5 data.
  if (schemaVersion < 2) await migrateTo2(await chrome.storage.local.get(null));
  if (schemaVersion < 3) await migrateTo3(await chrome.storage.local.get(null));
  if (schemaVersion < 4) await migrateTo4(await chrome.storage.local.get(null));
  if (schemaVersion < 5) await migrateTo5(await chrome.storage.local.get(null));
  await chrome.storage.local.set({ schemaVersion: SCHEMA_VERSION });
}

// 2: one light rule system instead of three. Block became Hide, Quick answers became Focus.
async function migrateTo2(old) {
  const avoid = {};
  for (const [key, c] of Object.entries(old.avoid || {}))
    avoid[channelPath(key)] = { name: c.name || key, action: c.action === "block" ? "hide" : "warn" };
  for (const [key, c] of Object.entries(old.channels || {}))
    if (c.bucketId === "blocked" && !avoid[channelPath(key)]) avoid[channelPath(key)] = { name: c.name || key, action: "hide" };
  const usage = {};
  for (const [day, u] of Object.entries(old.usage || {}))
    usage[day] = typeof u === "number" ? u : (u.leisure || 0) + (u.purposeful || 0);
  const toFocus = s => (s && s.mode === "quick" ? { ...s, mode: "focus" } : s);
  await chrome.storage.local.set({
    settings: { homeCard: old.homeCard !== false },
    avoid, usage, session: toFocus(old.session || null),
    sessions: (old.sessions || []).map(toFocus)
  });
  await chrome.storage.local.remove(["level", "pending", "limits", "channels", "buckets", "log", "homeCard", "recMode", "pendingPurpose"]);
}

// 3: one purpose mode plus Take a Break. A Focus session becomes the purpose (without its
// timer: purposes have no limit by default); an Explore session becomes a break. The
// "hold me to my limits" switch and the daily reminder are replaced by the leisure
// allowance and grace period. Usage is split into purpose / leisure / other.
async function migrateTo3(old) {
  const s2 = old.settings || {};
  const settings = { ...DEFAULT_SETTINGS, homeCard: s2.homeCard !== false };
  const s = old.session;
  let purpose = null, brk = null;
  if (s && s.mode !== "explore" && s.purpose) {
    purpose = {
      id: uid(), text: clip(s.purpose, 300), vague: isVague(s.purpose), startedAt: s.startedAt || Date.now(),
      limitMin: null, usedSec: s.usedSec || 0, lastCountAt: 0, timeUp: false, suspended: false,
      searches: (s.searches || []).map(q => ({ q, at: s.startedAt || Date.now() })),
      path: (s.path || []).map(p => ({ text: p.purpose, at: p.at })), pivots: s.pivots || 0, videos: []
    };
  } else if (s && s.mode === "explore" && s.usedSec < s.budgetMin * 60) {
    brk = { id: uid(), startedAt: s.startedAt || Date.now(), durationMin: s.budgetMin, usedSec: s.usedSec || 0, lastCountAt: 0, oneVideoId: null, videos: [] };
  }
  const usage = {};
  for (const [day, u] of Object.entries(old.usage || {}))
    usage[day] = typeof u === "number" ? { ...emptyDay(), purpose: u } : { ...emptyDay(), ...u };
  const history = (old.sessions || []).map(r => r.mode === "explore"
    ? { type: "break", id: uid(), startedAt: r.startedAt, endedAt: r.endedAt, usedSec: r.usedSec || 0, videos: [] }
    : { type: "purpose", id: uid(), text: r.purpose, startedAt: r.startedAt, endedAt: r.endedAt, usedSec: r.usedSec || 0,
        outcome: r.outcome || null, path: (r.path || []).map(p => ({ text: p.purpose, at: p.at })),
        searches: (r.searches || []).map(q => ({ q, at: r.startedAt })), videos: [] });
  await chrome.storage.local.set({ settings, purpose, brk, stop: null, usage, history });
  await chrome.storage.local.remove(["session", "sessions", "reminderDay"]);
}

// 4: Aim Free uses no AI. Purposes are kept by what your own searches found (purpose.allowed),
// so the personal API key, its model and the AI recommendation setting are removed.
async function migrateTo4(old) {
  const settings = { ...DEFAULT_SETTINGS, ...(old.settings || {}) };
  delete settings.recMode;
  const purpose = old.purpose ? { allowed: [], allowedLists: [], ...old.purpose } : null;
  await chrome.storage.local.set({ settings, purpose });
  await chrome.storage.local.remove(["apiKey", "model"]);
}

// 5: Aims can be set aside and resumed (the `paused` list), and remember when they were last
// active and the last video watched, so resuming picks up where you left off.
async function migrateTo5(old) {
  const purpose = old.purpose ? { lastActiveAt: old.purpose.startedAt || Date.now(), last: null, ...old.purpose } : null;
  await chrome.storage.local.set({ purpose, paused: Array.isArray(old.paused) ? old.paused : [] });
}

// ---------- settings ----------
async function getSettings() {
  const { settings } = await chrome.storage.local.get("settings");
  return { ...DEFAULT_SETTINGS, ...(settings || {}) };
}

async function setSetting(key, value) {
  if (!SETTING_RULES[key]?.(value)) return { result: "error", message: "Invalid setting." };
  const settings = await getSettings();
  settings[key] = value;
  await chrome.storage.local.set({ settings });
  return { result: "applied", settings };
}

// ---------- reading the current state ----------
async function readAll() {
  const d = await chrome.storage.local.get(["purpose", "brk", "stop", "usage", "usageLastAt", "history", "paused"]);
  const day = todayKey();
  const usage = d.usage || {};
  usage[day] ||= emptyDay();
  // Limits are per day: yesterday's stop doesn't carry over.
  const stop = d.stop && d.stop.day === day ? d.stop : null;
  return { purpose: d.purpose || null, brk: d.brk || null, stop, usage, usageLastAt: d.usageLastAt || 0, history: d.history || [],
    paused: d.paused || [], day };
}

function leisureLeftSec(settings, today) {
  return settings.leisureMin > 0 ? Math.max(0, settings.leisureMin * 60 - today.leisure) : Infinity;
}
function totalReached(settings, today) {
  return settings.totalMin > 0 && dayTotal(today) >= settings.totalMin * 60;
}

// What every page needs to draw itself. Infinity can't cross a message, so "no limit" is null.
async function getStatus() {
  const s = await readAll(), settings = await getSettings();
  const { homeschool = null, onboarding = null, pathways = null } = await chrome.storage.local.get(["homeschool", "onboarding", "pathways"]);
  const today = s.usage[s.day];
  const left = leisureLeftSec(settings, today);
  return {
    purpose: s.purpose, brk: s.brk, stop: s.stop, today,
    leisureLeftMin: left === Infinity ? null : Math.floor(left / 60),
    totalReached: totalReached(settings, today), settings, homeschool, onboarding,
    // YouTube tabs only need whether Pathways is on, the stage, and the one theme to offer.
    pathways: pathways?.on ? { on: true, stage: pathways.stage, offer: pathwayOffer(pathways) } : null
  };
}

// ---------- activity ----------
// The last few distinct purposes, newest first, for "Recent purposes".
function recentPurposes(history, current, n = 5) {
  const seen = new Set(current ? [current.toLowerCase()] : []), out = [];
  for (const h of history.slice().reverse()) {
    if (h.type !== "purpose" || !h.text || seen.has(h.text.toLowerCase())) continue;
    seen.add(h.text.toLowerCase());
    out.push(h.text);
    if (out.length === n) break;
  }
  return out;
}

// The last 7 days: time per day, and what came of the purposes finished in them.
function weekSummary(usage, history, now = new Date()) {
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    days.push({ day: todayKey(d), label: d.toLocaleDateString(undefined, { weekday: "narrow" }), ...emptyDay(), ...(usage[todayKey(d)] || {}) });
  }
  const since = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6).getTime();
  const done = history.filter(h => h.type === "purpose" && (h.endedAt || 0) >= since);
  return { days, purposes: done.length, found: done.filter(h => h.outcome === "yes").length,
    breaks: history.filter(h => h.type === "break" && (h.endedAt || 0) >= since).length };
}

// ---------- Aims you can pick up again ----------
// The home screen shows the current aim and at most two others; the aims page shows all.
// Set-aside aims come first (they're unfinished), then recently completed ones.
function resumable(s) {
  const pausedList = s.paused.map(p => summary(p, "paused"));
  const done = s.history.filter(h => h.type === "purpose" && h.text).slice().reverse().map(h => summary(h, "completed"));
  return { current: s.purpose ? summary(s.purpose, "active") : null, paused: pausedList, completed: done.slice(0, 100) };
}
function summary(p, state) {
  return { id: p.id, text: p.text, state, lastActiveAt: p.lastActiveAt || p.pausedAt || p.endedAt || p.startedAt,
    usedSec: Math.round(p.usedSec || 0), videos: (p.videos || []).length, searches: (p.searches || []).length,
    outcome: p.outcome || null, last: p.last || null, study: studyProgress(p), notes: p.notes || "", elsewhere: !!p.elsewhere, recent: recentVideos(p), trail: searchTrail(p),
    exploring: !!p.learn, subject: aimSubject(p),
    practice: p.practice ? { title: p.practice.title, tried: !!p.practice.triedAt } : null,
    understanding: p.map?.parts?.length ? { parts: p.map.parts.map(x => ({ title: x.title, status: x.status })), ready: mapReady(p.map), solid: p.map.synthesis?.verdict === "solid" } : null };
}

// The way an aim went, from its searches: "truck ac recharge → refrigerant types → ac compressor".
// Each search once, in order; the last six.
function searchTrail(p) {
  const seen = new Set(), out = [];
  for (const s of p.searches || []) { const q = String(s.q || "").trim(); if (q && !seen.has(q.toLowerCase())) { seen.add(q.toLowerCase()); out.push(q); } }
  return out.slice(-6);
}

// The videos watched for an aim, most recently watched first (the one you'd continue leads),
// with where you stopped in each and its length in seconds when known: the thumbnails on
// "Pick up where you left off" and the aims page. Only videos you chose; never suggestions.
function recentVideos(p, n = 7) {
  const lengths = new Map((p.allowed || []).map(v => [v.id, v.length]));
  const toSec = l => (l ? String(l).split(":").reduce((s, x) => s * 60 + Number(x), 0) : 0);
  const order = (p.videos || []).filter(v => v.id).slice().sort((a, b) => (b.lastAt || b.at || 0) - (a.lastAt || a.at || 0));
  if (p.last?.id) order.sort((a, b) => (b.id === p.last.id) - (a.id === p.last.id));
  const seen = new Set(), out = [];
  for (const v of order) {
    if (seen.has(v.id)) continue;
    seen.add(v.id);
    out.push({ id: v.id, title: v.title || "", channel: v.channel || "", t: p.last?.id === v.id ? Math.floor(p.last.t || 0) : v.t || 0,
      d: v.d || toSec(lengths.get(v.id)) });
    if (out.length >= n) break;
  }
  return out;
}

// Where a study session stands, for "Pick up where you left off": topic 2 of 3, 1 checked.
function studyProgress(p) {
  const st = p.study;
  if (!st || st.endedAt || !st.topics?.length) return null;
  // The next step: a topic a check said needs work, else the next one not checked yet.
  const review = st.topics.find(t => t.check?.objectives?.some(o => o.status !== "demonstrated"));
  const cur = st.topics[st.current || 0], todo = cur && !cur.check ? cur : st.topics.find(t => !t.check);
  const next = review ? { kind: "review", title: review.title } : todo ? { kind: "topic", title: todo.title } : { kind: "apply", title: st.title };
  return { topic: Math.min(st.topics.length, (st.current || 0) + 1), of: st.topics.length, checked: st.topics.filter(t => t.check).length, next };
}

// Where to land when an aim is resumed: the last video, at the moment you left it; otherwise
// the last search; otherwise the homepage, which shows the aim.
function resumeUrl(p) {
  if (p.last?.id) return `https://www.youtube.com/watch?v=${encodeURIComponent(p.last.id)}${p.last.t > 5 ? `&t=${Math.floor(p.last.t)}s` : ""}`;
  const q = p.searches?.[p.searches.length - 1]?.q;
  return q ? `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}` : "https://www.youtube.com/";
}

// ---------- history ----------
function archive(history, record) {
  history.push(record);
  return history.slice(-200);
}
function purposeRecord(p, outcome) {
  return { type: "purpose", id: p.id, text: p.text, startedAt: p.startedAt, endedAt: Date.now(), usedSec: Math.round(p.usedSec),
    outcome: outcome || null, path: p.path, searches: p.searches, videos: p.videos, notes: p.notes || "",
    kind: p.librarian?.kind || null, study: studySnapshot(p.study), map: p.map || null, practice: p.practice || null };
}

// What a study session showed, kept when its aim ends, for the learning record.
function studySnapshot(st) {
  if (!st?.topics?.length) return null;
  return { title: st.title, startedAt: st.startedAt || null, endedAt: st.endedAt || null,
    topics: st.topics.map(t => ({ title: t.title, watched: (t.watched || []).length, videos: (t.videos || []).length,
      check: t.check ? { at: t.check.at, objectives: t.check.objectives.map(o => ({ text: o.text, status: o.status })) } : null })),
    apply: st.apply ? { title: st.apply.title, task: st.apply.task, doneAt: st.apply.doneAt || null, note: st.apply.note || "" } : null };
}

// ---------- the learning record ----------
// Every aim with something to show (time spent or videos watched), newest first: the current one,
// those set aside, and finished ones, with study sessions' checks and projects. All from this browser.
function learningRecord(s) {
  const entry = (p, state) => {
    const study = p.type === "purpose" ? p.study : studySnapshot(p.study);
    const videos = (p.videos || []).slice().sort((a, b) => (b.sec || 0) - (a.sec || 0));
    return { id: p.id, text: p.text, state, kind: p.kind || p.librarian?.kind || null, outcome: p.outcome || null,
      startedAt: p.startedAt, endedAt: p.endedAt || null, lastAt: p.endedAt || p.lastActiveAt || p.pausedAt || p.startedAt,
      usedSec: Math.round(p.usedSec || 0), videoCount: videos.length, videos: videos.slice(0, 5).map(v => ({ id: v.id, title: v.title, channel: v.channel })),
      study, notes: p.notes || "" };
  };
  const all = [
    ...(s.purpose ? [entry(s.purpose, "active")] : []),
    ...s.paused.map(p => entry(p, "paused")),
    ...s.history.filter(h => h.type === "purpose" && h.text).map(h => entry(h, "completed"))
  ].filter(e => e.usedSec >= 60 || e.videoCount || e.study).sort((a, b) => (b.lastAt || 0) - (a.lastAt || 0));
  const checks = all.flatMap(e => e.study?.topics || []).filter(t => t.check);
  return {
    entries: all.slice(0, 300),
    totals: { targets: all.filter(e => e.state === "completed").length, learningSec: all.reduce((n, e) => n + e.usedSec, 0),
      topicsChecked: checks.length, demonstrated: checks.reduce((n, t) => n + t.check.objectives.filter(o => o.status === "demonstrated").length, 0),
      projects: all.filter(e => e.study?.apply?.doneAt).length }
  };
}
function breakRecord(b) {
  return { type: "break", id: b.id, startedAt: b.startedAt, endedAt: Date.now(), usedSec: Math.round(b.usedSec),
    oneVideo: !!b.oneVideoId, videos: b.videos, theme: b.theme?.text || null };
}

// ---------- purpose ----------
function newPurpose(text, search, limitMin) {
  const now = Date.now();
  return {
    id: uid(), text, vague: isVague(text), startedAt: now, limitMin: limitMin > 0 ? limitMin : null,
    usedSec: 0, lastCountAt: 0, timeUp: false, suspended: false, lastActiveAt: now, last: null,
    searches: search ? [{ q: clip(search, 200), at: now }] : [], path: [{ text, at: now }], pivots: 0, videos: [],
    allowed: [], allowedLists: []
  };
}

// Starting an aim ends any break (the break is what you were doing instead), and sets aside
// the aim you had, so you can pick it up again later.
async function startPurpose({ text, search, limitMin, video, learn }) {
  text = clip(text, 300);
  if (text.length < 2) return { result: "error", message: "Write what you're here for." };
  const s = await readAll(), settings = await getSettings();
  const writes = {};
  if (s.brk) { s.history = archive(s.history, breakRecord(s.brk)); writes.brk = null; }
  const setAside = s.purpose ? park(s, s.purpose) : null;
  const limit = limitMin === undefined ? settings.purposeLimitMin : parseInt(limitMin, 10) || 0;
  const purpose = newPurpose(text, search, limit);
  if (video?.id) allow(purpose, [video], [], search || "");
  // From "Learn something": the topic, and its other new videos for Up next.
  if (learn?.topic) {
    purpose.learn = clip(learn.topic, 60);
    allow(purpose, (Array.isArray(learn.videos) ? learn.videos : []).slice(0, 24), [], `From your topics: ${purpose.learn}`);
  }
  await chrome.storage.local.set({ ...writes, purpose, paused: s.paused, history: s.history, stop: s.stop?.kind === "total" ? s.stop : null });
  return { result: "applied", purpose, setAside: setAside ? setAside.text : null };
}

// Changing aim is a deliberate change of objective: the old aim is set aside (resumable,
// with its searches and videos) and the new one starts fresh, with the video that prompted it.
async function pivotPurpose(text, limitMin, video) {
  text = clip(text, 300);
  if (text.length < 2) return { result: "error", message: "Write your new aim." };
  return startPurpose({ text, limitMin: limitMin ?? undefined, video });
}

// Set-aside aims: newest first, at most 20. The oldest beyond that become history, unfinished.
const MAX_PAUSED = 20;
function park(s, p) {
  const parked = { ...p, suspended: false, lastCountAt: 0, pausedAt: Date.now(), lastActiveAt: p.lastActiveAt || Date.now() };
  s.paused = [parked, ...s.paused.filter(x => x.id !== p.id)];
  for (const old of s.paused.splice(MAX_PAUSED)) s.history = archive(s.history, purposeRecord(old, null));
  return parked;
}

// Set the current aim aside on purpose, without starting another.
async function pausePurpose() {
  const s = await readAll();
  if (!s.purpose) return { result: "error", message: "No aim set." };
  const parked = park(s, s.purpose);
  const stop = s.stop?.kind === "purpose" ? null : s.stop;
  await chrome.storage.local.set({ purpose: null, paused: s.paused, history: s.history, stop });
  return { result: "applied", setAside: parked.text };
}

// Pick an aim up again: a set-aside one comes back as it was; a completed one starts again
// with its searches and the videos you watched for it. The current aim, if any, is set aside.
// Returns where to go: the last video at the moment you left it, or the last search.
async function resumePurpose(id) {
  const s = await readAll();
  if (s.purpose?.id === id) return { result: "applied", purpose: s.purpose, url: resumeUrl(s.purpose) };
  let next = s.paused.find(p => p.id === id);
  if (next) {
    s.paused = s.paused.filter(p => p.id !== id);
    next = { ...next, suspended: false, lastCountAt: 0, lastActiveAt: Date.now() };
    delete next.pausedAt;
    delete next.elsewhere;
    if (next.last?.id) allow(next, [next.last], [], "");
  } else {
    const done = s.history.find(h => h.type === "purpose" && h.id === id);
    if (!done) return { result: "error", message: "That aim isn't available any more." };
    next = newPurpose(done.text, null, 0);
    next.searches = (done.searches || []).slice(-50);
    allow(next, done.videos || [], [], "");
    const lastVideo = (done.videos || []).slice().sort((a, b) => (b.at || 0) - (a.at || 0))[0];
    next.last = lastVideo ? { id: lastVideo.id, title: lastVideo.title, t: 0, at: lastVideo.at } : null;
    next.restartedFrom = done.id;
    next.notes = done.notes || "";
  }
  const writes = {};
  if (s.brk) { s.history = archive(s.history, breakRecord(s.brk)); writes.brk = null; }
  if (s.purpose) park(s, s.purpose);
  await chrome.storage.local.set({ ...writes, purpose: next, paused: s.paused, history: s.history,
    stop: s.stop?.kind === "total" ? s.stop : null });
  return { result: "applied", purpose: next, url: resumeUrl(next) };
}

// Remove a set-aside aim you don't want to come back to. It stays in history, unfinished.
async function dropPaused(id) {
  const s = await readAll();
  const p = s.paused.find(x => x.id === id);
  if (!p) return { result: "error", message: "Not found." };
  s.paused = s.paused.filter(x => x.id !== id);
  await chrome.storage.local.set({ paused: s.paused, history: archive(s.history, purposeRecord(p, null)) });
  return { result: "applied" };
}

function setLimitFromNow(p, minutes) {
  p.limitMin = minutes > 0 ? Math.ceil(p.usedSec / 60) + minutes : null;
}

// Set, change or remove a purpose's time limit, or add time after it ran out.
async function setPurposeLimit({ minutes, add }) {
  const s = await readAll();
  const p = s.purpose;
  if (!p) return { result: "error", message: "No aim set." };
  if (add) setLimitFromNow(p, Math.max(0, p.limitMin ? p.limitMin - Math.ceil(p.usedSec / 60) : 0) + parseInt(add, 10));
  else setLimitFromNow(p, parseInt(minutes, 10) || 0);
  p.timeUp = !!p.limitMin && p.usedSec >= p.limitMin * 60;
  const stop = s.stop?.kind === "purpose" && !p.timeUp ? null : s.stop;
  await chrome.storage.local.set({ purpose: p, stop });
  return { result: "applied", purpose: p };
}

// Clarifying is not pivoting: same goal, said more precisely.
// With deeper, exploring becomes an aim: same videos and time, no longer marked as exploring.
async function refinePurpose(text, deeper = false) {
  const s = await readAll();
  text = clip(text, 300);
  if (!s.purpose || !text) return { result: "error", message: "Nothing to change." };
  if (deeper) delete s.purpose.learn;
  s.purpose.text = text;
  s.purpose.vague = isVague(text);
  s.purpose.path[s.purpose.path.length - 1].text = text;
  await chrome.storage.local.set({ purpose: s.purpose });
  return { result: "applied", purpose: s.purpose };
}

// A new search that continues the same purpose.
async function addSearch(query) {
  const s = await readAll();
  query = clip(query, 200);
  if (!s.purpose || !query) return { result: "error", message: "No aim set." };
  const last = s.purpose.searches[s.purpose.searches.length - 1];
  if (last?.q !== query) s.purpose.searches.push({ q: query, at: Date.now() });
  s.purpose.searches = s.purpose.searches.slice(-50);
  await chrome.storage.local.set({ purpose: s.purpose });
  return { result: "applied", purpose: s.purpose };
}

// ---------- what a purpose allows ----------
// During a purpose you watch what your own searches for it found: their results, playlists
// among them, and the video you set the purpose from. No AI decides; you chose the searches.
const MAX_ALLOWED = 500;
// "12:34" or "1:02:03", as YouTube shows a video's length on its thumbnail; anything else is dropped.
const videoLength = s => (/^\d{1,2}(:\d{2}){1,2}$/.test(String(s || "").trim()) ? String(s).trim() : "");

function allow(p, videos, lists, query) {
  p.allowed ||= [];
  p.allowedLists ||= [];
  const known = new Map(p.allowed.map(v => [v.id, v]));
  for (const v of videos) {
    const id = clip(v.id, 20);
    if (!id) continue;
    // YouTube fills in a result's length (and sometimes its title) a moment after showing it.
    const old = known.get(id);
    if (old) { old.length ||= videoLength(v.length); old.title ||= clip(v.title, 300); old.channel ||= clip(v.channel, 200); continue; }
    const entry = { id, title: clip(v.title, 300), channel: clip(v.channel, 200), length: videoLength(v.length), q: clip(query, 200), at: Date.now() };
    known.set(id, entry);
    p.allowed.push(entry);
  }
  p.allowed = p.allowed.slice(-MAX_ALLOWED);
  for (const l of lists) { const id = clip(l, 64); if (id && !p.allowedLists.includes(id)) p.allowedLists.push(id); }
  p.allowedLists = p.allowedLists.slice(-50);
}

async function allowVideos({ query, videos, lists }) {
  const s = await readAll();
  if (!s.purpose) return { result: "error", message: "No aim set." };
  allow(s.purpose, Array.isArray(videos) ? videos.slice(0, 100) : [], Array.isArray(lists) ? lists.slice(0, 20) : [], query);
  await chrome.storage.local.set({ purpose: s.purpose });
  return { result: "applied", count: s.purpose.allowed.length };
}

// ---------- does a new search continue the purpose? ----------
// A word check, no AI: the search continues your purpose if it shares a meaningful word with
// the purpose or an earlier search for it ("sourdough starter" → "starter feeding ratio").
// Otherwise Aim asks once. Filler words don't count, and simple word endings are ignored.
const FILLER = new Set(("a an the and or but of to in on for with by at from as is are was were be been how what why when where which who whom " +
  "do does did i me my mine you your it its this that these those can could should would will vs versus about into onto than then there their " +
  "best top easy simple quick guide tutorial tutorials video videos full complete step steps learn learning make making understand understanding " +
  "find get way ways tips tricks basics basic beginner beginners new explained explain introduction intro part review using use").split(" "));

function stem(w) {
  if (w.length > 5 && w.endsWith("ing")) return w.slice(0, -3);
  if (w.length > 4 && w.endsWith("ies")) return w.slice(0, -3) + "y";
  if (w.length > 4 && /(s|x|z|ch|sh)es$/.test(w)) return w.slice(0, -2);
  if (w.length > 4 && w.endsWith("ed")) return w.slice(0, -2);
  if (w.length > 3 && w.endsWith("s") && !w.endsWith("ss")) return w.slice(0, -1);
  return w;
}
function meaningfulWords(text) {
  return (String(text || "").toLowerCase().match(/[\p{L}\p{N}]+/gu) || [])
    .filter(w => w.length > 1 && !FILLER.has(w)).map(stem);
}
function searchFits(purpose, query) {
  const q = meaningfulWords(query);
  if (!q.length) return true; // nothing to judge by
  // Searches the librarian suggested for this aim count as part of it too.
  // So do the titles of videos you've watched for it: they're how the topic actually reads.
  const known = [purpose.text, ...(purpose.searches || []).map(s => s.q), ...(purpose.librarian?.searches || []),
    ...(purpose.videos || []).filter(v => (v.sec || 0) >= 30).map(v => v.title),
    ...(purpose.map?.parts || []).flatMap(x => [x.title, x.search]),
    ...(purpose.practice ? [purpose.practice.title, purpose.practice.search] : []),
    ...(purpose.study?.topics || []).flatMap(t => [t.title, ...t.searches])].flatMap(meaningfulWords);
  const same = (a, b) => a === b || (a.length >= 5 && b.length >= 5 && a.slice(0, 5) === b.slice(0, 5));
  return q.some(w => known.some(k => same(w, k)));
}
async function checkSearch(query) {
  const s = await readAll();
  return { fits: !s.purpose || searchFits(s.purpose, clip(query, 200)) };
}

// A video your searches didn't find still continues the aim, without asking, when it's from a
// channel you've already watched for it or its title shares a meaningful word with it. It's then
// allowed like a result. Strict mode skips this: there, only what your searches found plays.
async function checkVideo(video) {
  const s = await readAll();
  const p = s.purpose, v = video || {};
  if (!p || !v.id || (await getSettings()).strict) return { fits: false };
  const channel = clip(v.channel, 200);
  // Exploring, the channels behind your picks count too: you came to look around them.
  const sameChannel = !!channel && [...(p.videos || []), ...(p.learn ? p.allowed || [] : [])].some(w => w.channel === channel);
  const fits = sameChannel || (meaningfulWords(v.title).length > 0 && searchFits(p, clip(v.title, 300)));
  if (!fits) return { fits: false };
  allow(p, [{ id: v.id, title: v.title, channel }], [], "");
  await chrome.storage.local.set({ purpose: p });
  return { fits: true };
}

// ---------- the librarian's memory of an aim ----------
// What the librarian said, kept with the aim in this browser (never on Aim's server), so a
// follow-up like "explain that last part more clearly" has context, and resuming keeps it.
// answer: { target, kind, note, searches, refine, sameTarget } from the librarian-ask task.
async function applyLibrarian({ request, answer, newTarget }) {
  request = clip(request, 500);
  const a = answer || {};
  const searches = (Array.isArray(a.searches) ? a.searches : []).map(q => clip(q, 150)).filter(Boolean).slice(0, 3);
  if (!request || !searches.length) return { result: "error", message: "Nothing to apply." };
  let s = await readAll();
  let setAside = null;
  if (!s.purpose || newTarget) {
    const r = await startPurpose({ text: clip(a.target, 80) || request, search: null });
    if (r.result !== "applied") return r;
    setAside = r.setAside;
    s = await readAll();
  }
  const p = s.purpose;
  // A learning goal's map of what understanding it takes, the first time the librarian gives one.
  if (!p.map && Array.isArray(a.parts) && a.parts.length >= 2) p.map = newMap(a.parts);
  const prev = p.librarian || { thread: [], picks: {} };
  p.librarian = {
    kind: ["lookup", "learn", "project"].includes(a.kind) ? a.kind : "lookup",
    note: clip(a.note, 260),
    searches,
    refine: a.refine?.options?.length >= 2 ? { question: clip(a.refine.question, 160), options: a.refine.options.slice(0, 4).map(o => clip(o, 60)) } : null,
    thread: [...(prev.thread || []), { role: "person", text: request, at: Date.now() }, { role: "aim", text: clip(a.note, 260), at: Date.now() }].slice(-20),
    picks: prev.picks || {}
  };
  await chrome.storage.local.set({ purpose: p });
  return { result: "applied", purpose: p, setAside, url: `https://www.youtube.com/results?search_query=${encodeURIComponent(searches[0])}` };
}

// The librarian's picks for one search, so returning to it doesn't ask the AI again.
async function savePicks({ query, groups }) {
  const s = await readAll();
  if (!s.purpose?.librarian) return { result: "error", message: "No librarian for this aim." };
  query = clip(query, 150);
  const picks = s.purpose.librarian.picks || {};
  picks[query] = (Array.isArray(groups) ? groups : []).slice(0, 3).map(g => ({
    label: clip(g.label, 40),
    videos: (Array.isArray(g.videos) ? g.videos : []).slice(0, 4).map(v => ({ id: clip(v.id, 20), reason: clip(v.reason, 120), title: clip(v.title, 200), channel: clip(v.channel, 100) }))
  }));
  const keys = Object.keys(picks);
  for (const k of keys.slice(0, Math.max(0, keys.length - 10))) delete picks[k]; // the last ten searches
  s.purpose.librarian.picks = picks;
  await chrome.storage.local.set({ purpose: s.purpose });
  return { result: "applied" };
}

// ---------- study sessions (Aim Plus) ----------
// A study session is a plan attached to the aim: ordered topics, each with a short brief, its
// searches, the videos picked for it, which of them you watched, and a TeachBack check. It lives
// with the aim in this browser; sessions are temporary and goal-oriented.
async function startStudy({ title, scopeNote, topics, notes }) {
  const s = await readAll();
  if (!s.purpose) return { result: "error", message: "No aim set." };
  const list = (Array.isArray(topics) ? topics : []).slice(0, 6).map(t => ({
    id: uid(), title: clip(t.title, 80), brief: clip(t.brief, 500),
    searches: (Array.isArray(t.searches) ? t.searches : []).map(q => clip(q, 150)).filter(Boolean).slice(0, 2),
    videos: [], watched: [], check: null
  })).filter(t => t.title && t.searches.length);
  if (!list.length) return { result: "error", message: "That plan was empty." };
  s.purpose.study = { id: uid(), title: clip(title, 80) || s.purpose.text, scopeNote: clip(scopeNote, 300), notes: clip(notes, 6000),
    topics: list, current: 0, startedAt: Date.now(), endedAt: null };
  await chrome.storage.local.set({ purpose: s.purpose });
  return { result: "applied", study: s.purpose.study, url: `https://www.youtube.com/results?search_query=${encodeURIComponent(list[0].searches[0])}` };
}

// videos: the librarian's picks for a topic; current: move to a topic; check: a TeachBack result.
async function updateStudy({ topicId, videos, current, check, end, apply, applyDone }) {
  const s = await readAll();
  const st = s.purpose?.study;
  if (!st) return { result: "error", message: "No study session." };
  if (end) st.endedAt = Date.now();
  // "Put it into practice": the suggested project, and whether (and how) the student did it.
  if (apply && typeof apply === "object") st.apply = { title: clip(apply.title, 80), task: clip(apply.task, 500),
    steps: (Array.isArray(apply.steps) ? apply.steps : []).map(x => clip(x, 200)).filter(Boolean).slice(0, 5), shows: clip(apply.shows, 200),
    minutes: Number(apply.minutes) || 30, safety: clip(apply.safety, 300), at: Date.now(), doneAt: null, note: "" };
  if (applyDone && st.apply) { st.apply.doneAt = Date.now(); st.apply.note = clip(applyDone.note, 500); }
  if (Number.isInteger(current) && current >= 0 && current < st.topics.length) st.current = current;
  const t = st.topics.find(x => x.id === topicId);
  if (t && Array.isArray(videos)) t.videos = videos.slice(0, 4).map(v => ({ id: clip(v.id, 20), title: clip(v.title, 200), channel: clip(v.channel, 100), length: videoLength(v.length), reason: clip(v.reason, 120) })).filter(v => v.id);
  if (t && check && typeof check === "object") {
    t.check = { assessmentId: clip(check.assessmentId, 64), at: Date.now(), endedEarly: !!check.endedEarly,
      objectives: (Array.isArray(check.objectives) ? check.objectives : []).slice(0, 4).map(o => ({
        text: clip(o.text, 200), status: ["demonstrated", "partial", "needs_review", "not_assessed"].includes(o.status) ? o.status : "not_assessed",
        search: clip(o.search, 120) })) };
  }
  if (t && Array.isArray(videos)) allow(s.purpose, t.videos, [], t.searches[0]);
  await chrome.storage.local.set({ purpose: s.purpose });
  return { result: "applied", study: st };
}

// Done. The record is also left as a reflection for the next YouTube page to show.
async function finishPurpose(outcome) {
  const s = await readAll();
  if (!s.purpose) return { result: "error", message: "No aim set." };
  outcome = ["yes", "partly", "no"].includes(outcome) ? outcome : null;
  const record = purposeRecord(s.purpose, outcome);
  const stop = s.stop?.kind === "purpose" ? null : s.stop;
  await chrome.storage.local.set({ purpose: null, stop, history: archive(s.history, record), reflection: record });
  return { result: "applied", record };
}

async function ratePurpose(id, outcome) {
  if (!["yes", "partly", "no"].includes(outcome)) return { result: "error", message: "Unknown answer." };
  const { history = [] } = await chrome.storage.local.get("history");
  const rec = history.find(r => r.id === id);
  if (!rec) return { result: "error", message: "Not found." };
  rec.outcome = outcome;
  await chrome.storage.local.set({ history });
  return { result: "applied" };
}

// ---------- breaks ----------
// minutes: a timed break. oneVideoId: a break for just that video, ending when it ends.
// A break can carry a theme ("Relax with a theme"): what you'd enjoy watching, the librarian's
// searches for it and the videos those found, so Aim can keep a few on-theme picks beside you.
// It's still a break: it counts against today's leisure time and YouTube is as usual.
function breakTheme(t) {
  if (!t || typeof t !== "object" || !clip(t.text, 80)) return null;
  return { text: clip(t.text, 80), note: clip(t.note, 260), searches: (Array.isArray(t.searches) ? t.searches : []).map(q => clip(q, 150)).filter(Boolean).slice(0, 3), videos: [] };
}

async function startBreak({ minutes, oneVideoId, theme }) {
  const s = await readAll(), settings = await getSettings();
  const today = s.usage[s.day];
  if (totalReached(settings, today)) return { result: "error", message: "You've reached today's YouTube limit." };
  const left = leisureLeftSec(settings, today);
  if (left < 60) return { result: "error", message: "Today's leisure time is used up." };
  let durationMin = null;
  if (!oneVideoId) {
    durationMin = Math.min(600, Math.max(1, parseInt(minutes, 10) || 15));
    if (left !== Infinity) durationMin = Math.min(durationMin, Math.floor(left / 60));
  }
  const writes = {};
  if (s.brk) s.history = archive(s.history, breakRecord(s.brk));
  if (s.purpose) { s.purpose.suspended = true; writes.purpose = s.purpose; }
  const brk = { id: uid(), startedAt: Date.now(), durationMin, usedSec: 0, lastCountAt: 0, oneVideoId: clip(oneVideoId, 20) || null, videos: [],
    theme: oneVideoId ? null : breakTheme(theme) };
  const stop = s.stop && ["break", "leisure"].includes(s.stop.kind) ? null : s.stop;
  await chrome.storage.local.set({ ...writes, brk, stop, history: s.history });
  return { result: "applied", brk, capped: minutes && durationMin < minutes ? durationMin : null };
}

// Videos the theme's searches found (YouTube's own results, ads left out), for "More on your theme".
async function addThemeVideos(videos) {
  const s = await readAll();
  const t = s.brk?.theme;
  if (!t) return { result: "error", message: "No themed break." };
  const known = new Map(t.videos.map(v => [v.id, v]));
  for (const v of Array.isArray(videos) ? videos : []) {
    const id = clip(v.id, 20);
    if (!id || !clip(v.title, 300)) continue;
    const old = known.get(id);
    if (old) { old.length ||= videoLength(v.length); continue; }
    const entry = { id, title: clip(v.title, 300), channel: clip(v.channel, 200), length: videoLength(v.length) };
    known.set(id, entry);
    t.videos.push(entry);
  }
  t.videos = t.videos.slice(-30);
  await chrome.storage.local.set({ brk: s.brk });
  return { result: "applied" };
}

// Notes on an aim: questions for a call, things to remember. They stay with the aim when it's
// set aside, completed or resumed.
async function setTargetNotes(text) {
  const s = await readAll();
  if (!s.purpose) return { result: "error", message: "No aim set." };
  s.purpose.notes = String(text || "").slice(0, 4000);
  await chrome.storage.local.set({ purpose: s.purpose });
  return { result: "applied", notes: s.purpose.notes };
}

async function extendBreak(minutes) {
  const s = await readAll(), settings = await getSettings();
  if (!s.brk || !s.brk.durationMin) return { result: "error", message: "No timed break running." };
  const left = leisureLeftSec(settings, s.usage[s.day]) - (s.brk.durationMin * 60 - s.brk.usedSec);
  const add = Math.min(parseInt(minutes, 10) || 15, left === Infinity ? Infinity : Math.floor(left / 60));
  if (!(add >= 1)) return { result: "error", message: "No leisure time left today." };
  s.brk.durationMin += add;
  await chrome.storage.local.set({ brk: s.brk });
  return { result: "applied", brk: s.brk, added: add };
}

// Ending a break resumes the purpose you had, if any.
async function endBreak() {
  const s = await readAll();
  if (!s.brk) return { result: "applied", purpose: s.purpose };
  const writes = { brk: null, history: archive(s.history, breakRecord(s.brk)) };
  if (s.purpose) {
    s.purpose.suspended = false;
    s.purpose.lastCountAt = Date.now();
    writes.purpose = s.purpose;
  }
  await chrome.storage.local.set(writes);
  return { result: "applied", purpose: s.purpose };
}

// The grace video ended or its time is up: the stop takes full effect. Daily-total stops
// stay for the rest of the day.
async function clearStop() {
  const s = await readAll();
  if (s.stop && s.stop.kind !== "total") await chrome.storage.local.set({ stop: null });
  return { result: "applied" };
}

// ---------- time tracking ----------
// video: { id, title, channel } of the video playing in the reporting tab, if any.
async function recordTick(seconds, video) {
  const now = Date.now();
  const s = await readAll(), settings = await getSettings();
  const today = s.usage[s.day];
  const add = credit(s.usageLastAt, now, seconds);
  let { purpose, brk, stop } = s;
  const activity = brk || (purpose && !purpose.suspended ? purpose : null);
  today[brk ? "leisure" : activity ? "purpose" : "other"] += add;
  for (const k of Object.keys(s.usage).sort().slice(0, -14)) delete s.usage[k]; // two weeks

  if (activity) {
    activity.usedSec += credit(activity.lastCountAt, now, seconds);
    activity.lastCountAt = now;
    activity.lastActiveAt = now;
    // Where you are in the video, so resuming the aim can return to it.
    if (activity === purpose && video?.id) purpose.last = { id: clip(video.id, 20), title: clip(video.title, 300), t: Math.max(0, Number(video.t) || 0), at: now };
    // In a study session, a topic's video counts as watched once it has played a little.
    if (activity === purpose && video?.id && purpose.study && !purpose.study.endedAt) {
      for (const t of purpose.study.topics)
        if (t.videos.some(v => v.id === video.id) && !t.watched.includes(video.id)) t.watched.push(video.id);
    }
    if (activity === purpose && video?.id && purpose.plan) await notePlanVideo(purpose.plan, video);
    if (video?.id) {
      let v = activity.videos.find(x => x.id === video.id);
      if (!v) {
        v = { id: clip(video.id, 20), title: clip(video.title, 300), channel: clip(video.channel, 200), sec: 0, at: now };
        activity.videos.push(v);
        activity.videos = activity.videos.slice(-200);
      }
      v.sec += add;
      // Where you stopped and how long it is, for the thumbnails on "Pick up where you left off".
      v.t = Math.max(0, Math.floor(Number(video.t) || 0));
      if (Number(video.d) > 0) v.d = Math.floor(Number(video.d));
      v.lastAt = now;
      if (activity === purpose && purpose.map && v.sec >= 60) mapExplored(purpose, v);
    }
  }

  // A saved video you've now watched (most of the way) leaves "Saved for later".
  if (video?.id && Number(video.d) > 0 && Number(video.t) >= Number(video.d) * 0.9) await removeSaved(video.id);

  // Which limit, if any, ran out with this tick? The most serious one wins.
  let kind = null;
  if (totalReached(settings, today)) kind = "total";
  else if (brk && leisureLeftSec(settings, today) <= 0) kind = "leisure";
  else if (brk && brk.durationMin && brk.usedSec >= brk.durationMin * 60) kind = "break";
  else if (purpose && !brk && !purpose.timeUp && purpose.limitMin && purpose.usedSec >= purpose.limitMin * 60) kind = "purpose";

  const history = s.history;
  if (kind && stop?.kind !== kind) {
    // The video playing right now may finish, within the grace period.
    const graceMs = video?.id ? settings.graceMin * 60 * 1000 : 0;
    stop = { kind, day: s.day, at: now, videoId: graceMs ? video.id : null, graceEndsAt: now + graceMs };
    if (brk && kind !== "purpose") {
      history.push(breakRecord(brk));
      brk = null;
      if (purpose) { purpose.suspended = false; purpose.lastCountAt = now; }
    }
    if (kind === "purpose") purpose.timeUp = true;
  }
  await chrome.storage.local.set({ usage: s.usage, usageLastAt: now, purpose, brk, stop, history: history.slice(-200) });
  return getStatus();
}

// ---------- onboarding ----------
// What the welcome tour and the one-time tips on YouTube have already shown. Missing means a new
// install: everything is still to show. An update from a version without onboarding marks it all
// seen, so people who already use Aim aren't walked through it again.
const ONBOARDING_TIPS = ["home", "chip", "results", "learn"];
// "learn" is an invitation to a feature, not a first-run tip: people updating still see it once.
const onboardingSeen = () => ({ welcomed: true, tips: Object.fromEntries(ONBOARDING_TIPS.filter(k => k !== "learn").map(k => [k, true])), hsTour: true });

async function setOnboarding({ welcomed, tip, hsTour, reset, seenAll }) {
  const { onboarding: cur } = await chrome.storage.local.get("onboarding");
  let o = cur || { welcomed: false, tips: {}, hsTour: false };
  if (reset) o = { welcomed: false, tips: {}, hsTour: false };
  if (seenAll) o = onboardingSeen();
  if (welcomed === true) o.welcomed = true;
  if (ONBOARDING_TIPS.includes(tip)) o.tips = { ...o.tips, [tip]: true };
  if (typeof hsTour === "boolean") o.hsTour = hsTour;
  await chrome.storage.local.set({ onboarding: o });
  return { result: "applied", onboarding: o };
}

// ---------- Pathways ----------
// What interests me → what could I do with it → what would it take. See docs/HOMESCHOOL.md →
// "Pathways". Kept in this browser:
//   interests  — the student's own answers to "Want more of this?" (and what they said), newest last;
//   pathways   — { on, stage, themes, themesBasis, explorations }. Off by default; turning it off
//                deletes all of it, interests included.
const PATHWAY_STAGES = ["middle", "high", "college", "working", "other"];
const PATHWAY_STEPS = ["overview", "see", "try", "meet", "prepare"];
const emptyPathways = () => ({ on: false, stage: null, themes: [], themesBasis: 0, explorations: [] });

async function readPathways() {
  const { pathways, interests = [] } = await chrome.storage.local.get(["pathways", "interests"]);
  return { pathways: { ...emptyPathways(), ...(pathways || {}) }, interests };
}

// "Want more of this?" Yes / Maybe / Not really, about something the student finished. One answer
// per thing (answering again changes it). `ref` ties it to a plan item, which then shows the answer.
async function recordInterest({ topic, subject, source, answer, note, ref }) {
  topic = clip(topic, 160);
  if (topic.length < 2 || !["yes", "maybe", "no"].includes(answer)) return { result: "error", message: "Unknown answer." };
  const { pathways, interests } = await readPathways();
  source = ["teachback", "study", "plan", "target", "path"].includes(source) ? source : "other";
  const key = `${source}|${topic.toLowerCase()}`;
  const old = interests.find(x => `${x.source}|${x.topic.toLowerCase()}` === key);
  const it = old || { id: uid(), topic, source };
  Object.assign(it, { subject: clip(subject, 60) || it.subject || "", answer, note: clip(note, 300) || it.note || "", at: Date.now() });
  const list = [...interests.filter(x => x !== it), it].slice(-300);
  const writes = { interests: list };
  if (ref) {
    const { homeschool: hs } = await chrome.storage.local.get("homeschool");
    const item = hs?.items.find(i => i.id === ref);
    if (item) { item.interest = answer; writes.homeschool = hs; }
  }
  await chrome.storage.local.set(writes);
  // Enough new "yes" and "maybe" answers since themes were last looked for: look again.
  const keen = list.filter(x => x.answer !== "no").length;
  return { result: "applied", interest: it, refreshThemes: pathways.on && keen >= 2 && keen - pathways.themesBasis >= 2 };
}

async function setPathways({ on, stage, erase }) {
  const { pathways } = await readPathways();
  if (erase) {
    await chrome.storage.local.remove(["pathways", "interests"]);
    return { result: "applied", pathways: emptyPathways() };
  }
  if (typeof on === "boolean") pathways.on = on;
  if (PATHWAY_STAGES.includes(stage)) pathways.stage = stage;
  await chrome.storage.local.set({ pathways });
  return { result: "applied", pathways };
}

// Themes from the server name interests by their place in the list that was sent (`basis`).
async function savePathwayThemes(themes, sentIds) {
  const { pathways, interests } = await readPathways();
  if (!pathways.on) return { result: "applied", pathways };
  const old = new Map(pathways.themes.map(t => [t.name.toLowerCase(), t]));
  pathways.themes = (Array.isArray(themes) ? themes : []).slice(0, 3).map(t => {
    const prev = old.get(String(t.name).toLowerCase());
    return { name: clip(t.name, 40), offer: clip(t.offer, 200), evidence: (t.evidence || []).map(i => sentIds[i]).filter(Boolean),
      offeredAt: prev?.offeredAt || null, dismissed: !!prev?.dismissed, at: prev?.at || Date.now() };
  }).concat([...old.values()].filter(t => t.dismissed && !themes.some(n => String(n.name).toLowerCase() === t.name.toLowerCase())));
  pathways.themesBasis = interests.filter(x => x.answer !== "no").length;
  pathways.themesAt = Date.now();
  await chrome.storage.local.set({ pathways });
  return { result: "applied", pathways };
}

// A theme was offered ("Not now" keeps it on the Pathways page) or dismissed ("Don't suggest this").
async function pathwayThemeSeen(name, dismiss) {
  const { pathways } = await readPathways();
  const t = pathways.themes.find(x => x.name.toLowerCase() === String(name).toLowerCase());
  if (!t) return { result: "error", message: "Unknown theme." };
  t.offeredAt ||= Date.now();
  if (dismiss) t.dismissed = true;
  await chrome.storage.local.set({ pathways });
  return { result: "applied" };
}

// The theme Aim may offer next: one not offered yet. Offers happen once per theme.
const pathwayOffer = p => (p?.on ? p.themes.find(t => !t.offeredAt && !t.dismissed) || null : null);

// Exploring a path: the career (or kind of work), what each step said, which steps are done, and
// the student's reflection in their own words. "Not for me" is a result like any other.
async function explorationStart({ career, theme, kind, what, related }) {
  career = clip(career, 80);
  if (career.length < 2) return { result: "error", message: "Say which work to explore." };
  const { pathways } = await readPathways();
  let x = pathways.explorations.find(e => e.career.toLowerCase() === career.toLowerCase() && !e.endedAt);
  if (!x) {
    x = { id: uid(), career, theme: clip(theme, 80), kind: kind === "work" ? "work" : "careers", what: clip(what, 300),
      related: (Array.isArray(related) ? related : []).slice(0, 6).map(r => ({ title: clip(r.title, 80), what: clip(r.what, 300) })).filter(r => r.title && r.title !== career),
      startedAt: Date.now(), steps: {}, done: {}, saved: false, reflection: null, outcome: null, endedAt: null };
    pathways.explorations = [x, ...pathways.explorations].slice(0, 40);
    await chrome.storage.local.set({ pathways });
  }
  return { result: "applied", exploration: x };
}

async function explorationUpdate({ id, step, content, done, saved, reflection, end }) {
  const { pathways } = await readPathways();
  const x = pathways.explorations.find(e => e.id === id);
  if (!x) return { result: "error", message: "Unknown path." };
  if (PATHWAY_STEPS.includes(step) && content && typeof content === "object") x.steps[step] = content;
  if (PATHWAY_STEPS.includes(step) && typeof done === "boolean") x.done[step] = done;
  if (typeof saved === "boolean") x.saved = saved;
  if (reflection && typeof reflection === "object") {
    const further = ["yes", "maybe", "no"].includes(reflection.further) ? reflection.further : null;
    x.reflection = { enjoyed: clip(reflection.enjoyed, 600), harder: clip(reflection.harder, 600), further, at: Date.now() };
    x.outcome = further;
  }
  if (end) x.endedAt = Date.now();
  await chrome.storage.local.set({ pathways });
  // The reflection is the student's own record of interest, too.
  if (x.reflection?.further) await recordInterest({ topic: x.career, subject: x.theme, source: "path", answer: x.reflection.further, note: x.reflection.enjoyed });
  return { result: "applied", exploration: x };
}

// ---------- "In this video" ----------
// The concepts Aim found for a video (from its title, description and chapters), kept so a video is
// only looked at once. The 40 most recent videos.
async function getVideoConcepts(id) {
  const { videoConcepts = {} } = await chrome.storage.local.get("videoConcepts");
  return { data: videoConcepts[id]?.data || null };
}

async function saveVideoConcepts(id, data) {
  id = clip(id, 20);
  if (!id || !data || typeof data !== "object") return { result: "error", message: "Nothing to save." };
  const { videoConcepts = {} } = await chrome.storage.local.get("videoConcepts");
  videoConcepts[id] = { at: Date.now(), data };
  const keep = Object.entries(videoConcepts).sort((a, b) => b[1].at - a[1].at).slice(0, 40);
  await chrome.storage.local.set({ videoConcepts: Object.fromEntries(keep) });
  return { result: "applied" };
}

// ---------- Aim Homeschool preview ----------
// A sample day's plan, so the student's Today screen can be tried on real YouTube before the
// parent website exists. A real plan comes from the parent's approved week and names specific
// videos; the sample's video lessons use a YouTube search, and the first video watched for a
// lesson becomes its video. See docs/HOMESCHOOL.md → "Student home on YouTube".
function samplePlan() {
  const item = (id, kind, subject, title, desc, minutes, extra = {}) => ({ id, kind, subject, title, desc, minutes, doneAt: null, video: null, ...extra });
  return {
    preview: true, student: "Alex", createdAt: Date.now(),
    unit: { subject: "Science", title: "Earth Systems", summary: "Volcanoes, earthquakes, and plate tectonics" },
    items: [
      item("sci1", "video", "Science", "How Volcanoes Form", "Learn how magma, pressure, and plate movement create volcanoes.", 15, { search: "how volcanoes form" }),
      item("math1", "video", "Math", "Area and Volume Review", "Practice finding the area and volume of different shapes.", 15, { search: "area and volume of 3d shapes" }),
      item("hist1", "video", "History", "Exploration and Trade", "See how exploration changed the world and led to new trade routes.", 15, { search: "age of exploration trade routes" }),
      item("proj1", "project", "Project", "Build a Volcano Model", "Use simple materials to create a model and show how it works.", 45, { together: true, guide: {
        materials: ["Modeling clay or salt dough", "A small plastic bottle", "Baking soda", "Vinegar", "Dish soap and red food coloring", "A tray or baking sheet"],
        steps: ["Stand the bottle on the tray and build the volcano's cone around it with clay.", "Put 2 spoonfuls of baking soda, a squirt of dish soap and a few drops of coloring in the bottle.",
          "Pour in a little vinegar and watch it erupt.", "Explain what the reaction stands for: pressure building under the surface until it escapes through a vent."],
        show: "Take a photo of your model for Friday's check-in." } }),
      item("read1", "reading", "English", "Reading Time", "Read for 20 minutes: chapter 4 of your class book, or anything you enjoy.", 20),
      item("tb1", "teachback", "TeachBack", "Show What You Learned", "Explain how volcanoes form in your own words.", 10, { topic: "How volcanoes form" })
    ],
    upcoming: [
      { kind: "trip", title: "Field Trip (Virtual)", desc: "Explore a live volcano cam", when: "Thursday" },
      { kind: "check", title: "Project Check-In", desc: "Share a photo of your model", when: "Friday" },
      { kind: "reflect", title: "Unit Reflection", desc: "What did you learn about the Earth this month?", when: "Next Monday" }
    ],
    deeper: ["how supervolcanoes work", "plate tectonics explained", "famous volcanic eruptions in history"]
  };
}

async function setHomeschoolPreview(on) {
  if (on) await chrome.storage.local.set({ homeschool: samplePlan() });
  else await chrome.storage.local.remove("homeschool");
  return { result: "applied" };
}

function planUrl(item) {
  if (item.video?.id) return `https://www.youtube.com/watch?v=${encodeURIComponent(item.video.id)}${!item.doneAt && item.video.t > 5 ? `&t=${Math.floor(item.video.t)}s` : ""}`;
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(item.search || item.title)}`;
}

// Start (or continue) a video lesson: it becomes the aim. A plan lesson you were on is simply
// archived (the plan is what you pick up again), any other aim is set aside as usual.
async function planStart(id) {
  const { homeschool: hs } = await chrome.storage.local.get("homeschool");
  const item = hs?.items.find(i => i.id === id);
  if (!item) return { result: "error", message: "That isn't in today's plan." };
  if (item.kind !== "video") return { result: "error", message: "Only video lessons start an aim." };
  const s = await readAll();
  if (s.purpose?.plan === id && !s.brk) return { result: "applied", url: planUrl(item) };
  const writes = {};
  if (s.brk) { s.history = archive(s.history, breakRecord(s.brk)); writes.brk = null; }
  if (s.purpose?.plan) s.history = archive(s.history, purposeRecord(s.purpose, null));
  else if (s.purpose) park(s, s.purpose);
  const purpose = newPurpose(`${item.subject}: ${item.title}`, item.search, 0);
  purpose.plan = id;
  if (item.video?.id) allow(purpose, [item.video], [], item.search || "");
  await chrome.storage.local.set({ ...writes, purpose, paused: s.paused, history: s.history, stop: s.stop?.kind === "total" ? s.stop : null });
  return { result: "applied", url: planUrl(item) };
}

async function planDone(id, done = true) {
  const { homeschool: hs } = await chrome.storage.local.get("homeschool");
  const item = hs?.items.find(i => i.id === id);
  if (!item) return { result: "error", message: "That isn't in today's plan." };
  item.doneAt = done ? Date.now() : null;
  if (done) await queueFamilyReport(item, "done");
  // The whole day done: the last lesson stops being the aim, so YouTube is just YouTube again.
  const writes = { homeschool: hs };
  if (hs.items.every(i => i.doneAt)) {
    const s = await readAll();
    if (s.purpose?.plan) Object.assign(writes, { purpose: null, history: archive(s.history, purposeRecord(s.purpose, "yes")) });
  }
  await chrome.storage.local.set(writes);
  return { result: "applied", homeschool: hs };
}

// While a lesson plays: the first video watched for it becomes its video, with where you are in
// it; playing to about 90% counts the lesson as done.
// A family's plan (Aim Homeschool, from the parent's approved week; plus.js fetches it): today's
// lessons in Today's shape. What this browser already knows (a lesson's video, done) is kept.
async function saveFamilyPlan(r) {
  const { homeschool: old, avoid = {} } = await chrome.storage.local.get(["homeschool", "avoid"]);
  const was = new Map((old?.family ? old.items : []).map(i => [i.id, i]));
  const item = it => ({ id: clip(it.id, 12), kind: ["video", "reading", "activity", "teachback", "project"].includes(it.kind) ? it.kind : "activity",
    subject: clip(it.subject, 40), title: clip(it.title, 120), desc: clip(it.detail || it.objective, 600), minutes: Number(it.minutes) || 20,
    search: clip(it.search, 120) || null, objectiveId: clip(it.objectiveId, 12), topic: it.kind === "teachback" ? clip(it.objective || it.title, 200) : undefined,
    together: !!it.together, video: was.get(it.id)?.video || (it.video?.id ? { id: clip(it.video.id, 20), title: clip(it.video.title, 300), channel: clip(it.video.channel, 200), t: 0 } : null),
    doneAt: it.done ? (was.get(it.id)?.doneAt || Date.now()) : was.get(it.id)?.doneAt || null });
  const items = (Array.isArray(r.items) ? r.items : []).map(item);
  const p = r.project;
  if (p?.today) items.push({ ...item({ ...p, kind: "project", detail: p.objective, done: p.done }),
    guide: { materials: (p.materials || []).map(m => `${m.name}${m.qty ? ` (${m.qty})` : ""}`), steps: p.prep || [], show: (p.deliverables || []).length ? `Show: ${p.deliverables.join("; ")}` : "" } });
  const unit = r.units?.[0];
  const hs = { family: true, student: clip(r.student, 40) || "there", date: clip(r.today, 10), weekStart: clip(r.weekStart, 10), createdAt: Date.now(),
    unit: unit ? { subject: clip(unit.subject, 40), title: clip(unit.title, 120), summary: clip(unit.summary, 200) } : { subject: "", title: "This week", summary: "" },
    items,
    upcoming: [...(p && !p.today ? [{ kind: "check", title: `Project: ${clip(p.title, 80)}`, desc: clip(p.objective, 120), when: clip(p.day, 10) }] : []),
      ...(r.upcoming || []).map(u => ({ kind: "reflect", title: clip(u.titles?.[0], 80), desc: (u.titles || []).slice(1).map(t => clip(t, 60)).join(", "), when: clip(u.day, 10) }))].slice(0, 4),
    deeper: [] };
  // The family's preferred channels: "Your channel" in results, and first in the librarian's picks.
  for (const c of r.channels || []) {
    const key = c.handle ? channelPath("/" + c.handle) : c.id ? `/channel/${c.id}` : "";
    if (key && (!avoid[key] || avoid[key].family)) avoid[key] = { name: clip(c.name, 200) || key, action: "prefer", topic: clip(c.subject, 40), family: true };
  }
  await chrome.storage.local.set({ homeschool: items.length || r.planned ? hs : null, avoid });
  return { result: "applied", items: items.length };
}
async function clearFamilyPlan() {
  const { homeschool, avoid = {} } = await chrome.storage.local.get(["homeschool", "avoid"]);
  for (const [k, c] of Object.entries(avoid)) if (c.family) delete avoid[k];
  await chrome.storage.local.set({ avoid, ...(homeschool?.family ? { homeschool: null } : {}) });
  return { result: "applied" };
}
// What to tell the parent's side: a lesson done, or a lesson's video watched (sent by plus.js).
async function queueFamilyReport(item, kind) {
  const { homeschool: hs, hsOutbox = [] } = await chrome.storage.local.get(["homeschool", "hsOutbox"]);
  if (!hs?.family) return;
  hsOutbox.push({ itemId: item.id, kind, video: item.video ? { id: item.video.id, title: item.video.title, channel: item.video.channel } : null });
  await chrome.storage.local.set({ hsOutbox: hsOutbox.slice(-100) });
}

async function notePlanVideo(id, video) {
  const { homeschool: hs } = await chrome.storage.local.get("homeschool");
  const item = hs?.items.find(i => i.id === id);
  if (!item || item.kind !== "video") return;
  if (!item.video || item.video.id === video.id) {
    item.video = { id: clip(video.id, 20), title: clip(video.title, 300), channel: clip(video.channel, 200), t: Math.max(0, Number(video.t) || 0) };
    const d = Number(video.d) || 0;
    if (!item.doneAt && d > 30 && item.video.t >= d * 0.9) { item.doneAt = Date.now(); await chrome.storage.local.set({ homeschool: hs }); return queueFamilyReport(item, "done"); }
    await chrome.storage.local.set({ homeschool: hs });
  }
}

// ---------- channels ----------
// action: "prefer" (Learn from: a channel you learn from, optionally under a topic of yours) |
// "break" (For breaks: free on a break; on an aim, Aim asks first) | "hide" | "warn" (Keep out:
// hidden, or asked about) | null (remove: not sorted).
const CHANNEL_ACTIONS = ["prefer", "break", "hide", "warn"];
async function setAvoid(key, name, action, topic) {
  key = channelPath(key);
  if (!key) return { result: "error", message: "Unknown channel." };
  const { avoid = {} } = await chrome.storage.local.get("avoid");
  if (CHANNEL_ACTIONS.includes(action)) {
    const was = avoid[key];
    const t = action === "prefer" ? clip(topic === undefined ? was?.topic : topic, 40) : "";
    avoid[key] = { name: clip(name, 200) || was?.name || key, action, ...(t ? { topic: t } : {}) };
  } else delete avoid[key];
  await chrome.storage.local.set({ avoid });
  return { result: "applied", avoid };
}

// Your YouTube subscriptions, as read from youtube.com/feed/channels (content/subs.js), for the
// Your channels page. complete: the whole list was read, so channels no longer in it are dropped.
async function saveSubs(channels, complete) {
  const { subs = {} } = await chrome.storage.local.get("subs");
  const byKey = new Map(complete ? [] : (subs.channels || []).map(c => [c.key, c]));
  for (const c of (Array.isArray(channels) ? channels : []).slice(0, 3000)) {
    const key = channelPath(c?.key);
    if (!/^\/(@|channel\/)/.test(key)) continue;
    const avatar = /^https:\/\/yt\d\.(ggpht|googleusercontent)\.com\//.test(c.avatar || "") ? clip(c.avatar, 400) : byKey.get(key)?.avatar || "";
    byKey.set(key, { key, name: clip(c.name, 200) || key.slice(1), avatar });
  }
  const list = [...byKey.values()].slice(0, 3000);
  await chrome.storage.local.set({ subs: { at: Date.now(), complete: !!complete || !!subs.complete, channels: list } });
  return { result: "applied", count: list.length };
}

// What the Your channels page needs: subscriptions, your rules, your topics, and which channels
// you've watched for aims (to suggest Learn from).
async function channelsPage() {
  const { subs = {}, avoid = {}, history = [], paused = [], purpose = null } = await chrome.storage.local.get(["subs", "avoid", "history", "paused", "purpose"]);
  const watched = {};
  for (const p of [purpose, ...paused, ...history.filter(h => h.type === "purpose")]) {
    const seen = new Set();
    for (const v of p?.videos || []) if (v.channel && !seen.has(v.channel)) { seen.add(v.channel); watched[v.channel] = (watched[v.channel] || 0) + 1; }
  }
  return { subs, avoid, watched, settings: await getSettings() };
}

// ---------- strict mode: the reasons you gave ----------
// Kept in this browser (the last 100), with the aim they were for; the popup shows them.
const REASON_KINDS = ["more-time", "channel", "search", "video"];
async function addReason({ kind, text, detail }) {
  if (!REASON_KINDS.includes(kind)) return { result: "error", message: "Unknown reason." };
  text = clip(String(text || "").replace(/\s+/g, " ").trim(), 300);
  if (text.length < 8) return { result: "error", message: "Write a short sentence." };
  const { reasons = [], purpose = null } = await chrome.storage.local.get(["reasons", "purpose"]);
  reasons.push({ kind, text, detail: clip(detail, 200), target: purpose?.text || null, at: Date.now() });
  await chrome.storage.local.set({ reasons: reasons.slice(-100) });
  return { result: "applied" };
}

// ---------- "Learn something": the channel feed cache ----------
// Per channel (by handle): its id once known, when it was fetched, and its newest videos. Written
// here (the one writer); fetched by YouTube pages, since only they can read youtube.com's feeds.
async function saveLearnCache(channels) {
  const { learn = {} } = await chrome.storage.local.get("learn");
  const cache = learn.channels || {};
  for (const [handle, c] of Object.entries(channels || {}).slice(0, 80)) {
    if (!/^@[\w.-]{1,60}$/.test(handle) || !c || typeof c !== "object") continue;
    const list = a => (Array.isArray(a) ? a : []).slice(0, 8).map(v => ({ id: clip(v.id, 20), title: clip(v.title, 200), channel: clip(v.channel, 100),
      published: Number(v.published) || 0 })).filter(v => /^[\w-]{6,20}$/.test(v.id) && v.title);
    cache[handle] = { id: /^UC[\w-]{22}$/.test(c.id) ? c.id : null, at: Number(c.at) || Date.now(), failed: !!c.failed,
      videos: list(c.videos), ...(Array.isArray(c.shorts) ? { shorts: list(c.shorts) } : {}) };
  }
  await chrome.storage.local.set({ learn: { channels: cache } });
  return { result: "applied" };
}
// Videos you've already watched (lately), so "Learn something" doesn't offer them again.
async function learnSeen() {
  const { history = [], paused = [], purpose = null } = await chrome.storage.local.get(["history", "paused", "purpose"]);
  const ids = new Set();
  for (const r of [purpose, ...paused, ...history.slice(-200)]) for (const v of r?.videos || []) ids.add(v.id);
  return [...ids].slice(-1000);
}

// ---------- quick review with Shorts ----------
// What you've learned, as things to review: study topics (those a TeachBack check said need work
// count most), then each aim and its searches. Each Short from your topics' channels is matched to
// the one it shares the most meaningful words with. No AI.
function reviewConcepts(s) {
  const out = [];
  const add = (label, text, weight) => {
    const words = [...new Set(meaningfulWords(text).filter(w => w.length >= 4))];
    if (words.length) out.push({ label: clip(label, 80), words, weight });
  };
  for (const p of [s.purpose, ...s.paused, ...s.history.filter(h => h.type === "purpose")].filter(Boolean)) {
    for (const t of p.study?.topics || []) {
      const weak = (t.check?.objectives || []).some(o => o.status === "needs_review" || o.status === "partial");
      add(t.title, [t.title, ...(t.check?.objectives || []).map(o => o.text)].join(" "), weak ? 3 : 2);
    }
    const text = String(p.text || "").replace(/^(Exploring|Quick review):\s*/, "");
    if (!/^Quick review/.test(p.text || "")) add(text, [text, ...(p.searches || []).map(x => x.q)].join(" "), 1);
  }
  return out;
}
// shorts: [{ id, title, channel, topic, published }] → the same, ranked: reviews of things you've
// learned first (best match first), then the newest. Each gets `review`: what it reviews, or null.
async function rankReviewShorts(shorts) {
  const concepts = reviewConcepts(await readAll());
  const ranked = (Array.isArray(shorts) ? shorts : []).slice(0, 80).map(v => {
    const words = new Set(meaningfulWords(v.title));
    let best = null, score = 0;
    for (const c of concepts) {
      const n = c.words.filter(w => words.has(w)).length * c.weight;
      if (n > score) { score = n; best = c.label; }
    }
    return { id: clip(v.id, 20), title: clip(v.title, 200), channel: clip(v.channel, 100), topic: clip(v.topic, 60),
      published: Number(v.published) || 0, review: best, score };
  }).filter(v => /^[\w-]{6,20}$/.test(v.id));
  return ranked.sort((a, b) => b.score - a.score || b.published - a.published).map(({ score, ...v }) => v);
}

// ---------- Design your YouTube (design.html) ----------
// When the person last applied a design: the first time, the page walks through the four stages;
// afterwards any stage opens directly.
async function markDesigned() {
  await chrome.storage.local.set({ design: { appliedAt: Date.now() } });
  return { result: "applied" };
}

// ---------- save for later ----------
async function saveForLater(video) {
  const { saved = [] } = await chrome.storage.local.get("saved");
  if (!saved.some(v => v.id === video.id))
    saved.push({ id: clip(video.id, 20), title: clip(video.title, 300), channel: clip(video.channel, 200), at: Date.now() });
  await chrome.storage.local.set({ saved: saved.slice(-200) });
  return { count: saved.length };
}

async function removeSaved(id) {
  const { saved = [] } = await chrome.storage.local.get("saved");
  if (!saved.some(v => v.id === id)) return { result: "applied" };
  await chrome.storage.local.set({ saved: saved.filter(v => v.id !== id) });
  await noteDeleted("saved", [id]);
  return { result: "applied" };
}

async function clearHistory() {
  const { history = [] } = await chrome.storage.local.get("history");
  await chrome.storage.local.set({ history: [] });
  await noteDeleted("target", history.filter(h => h.type === "purpose").map(h => h.id));
  return { result: "applied" };
}

// ---------- sync across devices (Aim Plus, sync.js) ----------
// What sync carries, as items: each aim (current, set aside or finished, with its study session),
// each Saved for later video, settings, and channel rules. Usage, breaks, reasons and Pathways stay
// in this browser. Something you delete on purpose (Clear history, removing a saved video) is noted,
// so it's deleted in your other browsers too; things that only age out of the lists aren't.
async function noteDeleted(kind, ids) {
  const { sync } = await chrome.storage.local.get("sync");
  if (!sync?.on || !ids.length) return;
  const { syncDeleted = [] } = await chrome.storage.local.get("syncDeleted");
  await chrome.storage.local.set({ syncDeleted: [...syncDeleted, ...ids.map(id => ({ kind, id }))].slice(-1000) });
}

// An aim as synced: without what only this browser's timer uses, and with its longest lists cut short.
function syncTarget(p, state) {
  const { lastCountAt, suspended, elsewhere, ...rec } = p;
  if (rec.allowed?.length > 150) rec.allowed = rec.allowed.slice(-150);
  if (rec.allowedLists?.length > 50) rec.allowedLists = rec.allowedLists.slice(-50);
  if (JSON.stringify(rec).length > 60_000) { rec.videos = (rec.videos || []).slice(-80); rec.searches = (rec.searches || []).slice(-40); rec.allowed = []; }
  return { state, record: rec };
}

// Every item, keyed "kind:id".
async function syncSnapshot() {
  const d = await chrome.storage.local.get(["purpose", "paused", "history", "saved", "avoid"]);
  const items = new Map(), put = (kind, id, data) => { if (/^[\w-]{1,64}$/.test(String(id))) items.set(`${kind}:${id}`, { kind, id: String(id), data }); };
  for (const h of d.history || []) if (h.type === "purpose" && h.id) put("target", h.id, syncTarget(h, "completed"));
  for (const p of d.paused || []) put("target", p.id, syncTarget(p, "paused"));
  if (d.purpose) put("target", d.purpose.id, syncTarget(d.purpose, "active"));
  for (const v of d.saved || []) put("saved", v.id, v);
  put("settings", "all", await getSettings());
  put("avoid", "all", { rules: d.avoid || {} });
  return items;
}

// Applies other browsers' changes. first: this browser's first sync, where channel rules from both
// sides are kept (afterwards the newest set wins, so removing a rule syncs too).
async function syncMerge(items, first = false) {
  const d = await chrome.storage.local.get(["purpose", "paused", "history", "saved", "avoid", "stop"]);
  let purpose = d.purpose || null, paused = d.paused || [], history = d.history || [], saved = d.saved || [], avoid = d.avoid || {};
  let stop = d.stop || null, settings = null;
  const byTime = h => h.endedAt || h.startedAt || 0;
  for (const it of items || []) {
    const data = it.data && typeof it.data === "object" ? it.data : null;
    if (it.kind === "target") {
      const rec = data?.record && typeof data.record === "object" ? { ...data.record, id: it.id } : null;
      if (!rec || typeof rec.text !== "string") {  // deleted elsewhere (not the aim you're on here)
        paused = paused.filter(p => p.id !== it.id);
        history = history.filter(h => h.id !== it.id);
        continue;
      }
      if (purpose?.id === it.id) {
        if (data.state === "completed") {  // finished in another browser
          history = [...history.filter(h => h.id !== it.id), { ...rec, type: "purpose" }];
          purpose = null;
          if (stop?.kind === "purpose") stop = null;
        } else {
          const allowed = [...(purpose.allowed || []), ...(rec.allowed || [])].filter((v, i, a) => a.findIndex(x => x.id === v.id) === i).slice(-MAX_ALLOWED);
          purpose = { ...rec, allowed, usedSec: Math.max(rec.usedSec || 0, purpose.usedSec || 0), lastCountAt: purpose.lastCountAt || 0, suspended: !!purpose.suspended };
          delete purpose.pausedAt;
        }
        continue;
      }
      paused = paused.filter(p => p.id !== it.id);
      history = history.filter(h => h.id !== it.id);
      if (data.state === "completed") history.push({ ...rec, type: "purpose" });
      else paused.push({ ...rec, type: undefined, pausedAt: rec.pausedAt || rec.lastActiveAt || Date.now(), lastCountAt: 0, suspended: false, elsewhere: data.state === "active" });
    } else if (it.kind === "saved") {
      saved = saved.filter(v => v.id !== it.id);
      if (data?.id === it.id) saved.push({ id: clip(data.id, 20), title: clip(data.title, 300), channel: clip(data.channel, 200), at: Number(data.at) || Date.now() });
    } else if (it.kind === "settings" && data) {
      settings ||= await getSettings();
      for (const [k, v] of Object.entries(data)) if (SETTING_RULES[k]?.(v)) settings[k] = v;
    } else if (it.kind === "avoid" && data?.rules && typeof data.rules === "object") {
      const rules = {};
      for (const [k, c] of Object.entries(data.rules))
        if (CHANNEL_ACTIONS.includes(c?.action)) rules[channelPath(k)] = { name: clip(c.name, 200) || k, action: c.action, ...(c.action === "prefer" && c.topic ? { topic: clip(c.topic, 40) } : {}) };
      avoid = first ? { ...rules, ...avoid } : rules;
    }
  }
  paused.sort((a, b) => (b.lastActiveAt || b.pausedAt || 0) - (a.lastActiveAt || a.pausedAt || 0));
  for (const old of paused.splice(MAX_PAUSED)) history.push(purposeRecord(old, null));
  history.sort((a, b) => byTime(a) - byTime(b));
  saved.sort((a, b) => (a.at || 0) - (b.at || 0));
  await chrome.storage.local.set({ purpose, paused, history: history.slice(-200), saved: saved.slice(-200), avoid, stop, ...(settings ? { settings } : {}) });
  return { result: "applied" };
}

// ---------- talking a session through (the librarian, content/talk.js) ----------
// What the librarian may know about an aim: the aim, searches, the videos' titles and how long you
// watched each, your notes, and a study session's topics. Never anything from inside a video.
async function findAim(id) {
  const { purpose = null, paused = [], history = [] } = await chrome.storage.local.get(["purpose", "paused", "history"]);
  if (!id) return purpose; // the aim you're on
  if (purpose?.id === id) return purpose;
  return paused.find(p => p.id === id) || history.find(h => h.type === "purpose" && h.id === id) || null;
}

async function talkSession(id) {
  const p = await findAim(id);
  if (!p) return { result: "error", message: "Nothing to talk about yet." };
  const videos = (p.videos || []).filter(v => v.title && (v.sec || 0) >= 20).slice(-12).map(v => ({ id: v.id, title: v.title, channel: v.channel || "",
    minutes: Math.max(1, Math.round((v.sec || 0) / 60)), finished: v.d > 0 && v.t >= v.d * 0.9 }));
  const topics = (p.study?.topics || []).map(t => ({ title: t.title }));
  const map = p.map?.parts?.length ? { parts: p.map.parts.map(x => ({ title: x.title, status: x.status })) } : null;
  const practice = p.practice ? { title: p.practice.title, tried: !!p.practice.triedAt, note: p.practice.note || "" } : null;
  return { result: "applied", id: p.id, mode: p.learn ? "explore" : "focus", plan: !!p.plan, ready: mapReady(p.map),
    session: { aim: p.learn ? `Exploring ${p.learn}` : p.text, minutes: Math.round((p.usedSec || 0) / 60), searches: (p.searches || []).map(x => x.q).slice(-12),
      videos, notes: p.notes || "", kind: p.librarian?.kind || "", ...(topics.length ? { study: { topics } } : {}), ...(map ? { map } : {}),
      ...(practice ? { practice } : {}) } };
}

// The librarian's memory: ideas you explained in your own words, with what they were about. In this
// browser only; Settings lists them, and each can be forgotten.
const MEMORY_MAX = 300;
async function memoryAdd(items, aimId) {
  if ((await getSettings()).librarianMemory === false) return { result: "applied", added: 0 };
  const { memory = [] } = await chrome.storage.local.get("memory");
  const now = Date.now(), out = memory.slice();
  for (const it of (Array.isArray(items) ? items : []).slice(0, 3)) {
    const subject = clip(it?.subject, 60), idea = clip(it?.idea, 160);
    if (!subject || !idea) continue;
    const same = out.find(m => m.subject.toLowerCase() === subject.toLowerCase() && m.idea.toLowerCase() === idea.toLowerCase());
    if (same) { same.at = now; same.understood = it.understood === "shaky" ? "shaky" : "solid"; continue; }
    out.push({ id: `m${now.toString(36)}${Math.random().toString(36).slice(2, 6)}`, subject, idea, understood: it.understood === "shaky" ? "shaky" : "solid",
      aim: clip(aimId, 64) || null, at: now });
  }
  await chrome.storage.local.set({ memory: out.slice(-MEMORY_MAX) });
  return { result: "applied", added: out.length - memory.length };
}
async function memoryList() {
  const { memory = [] } = await chrome.storage.local.get("memory");
  return memory.slice().reverse();
}
async function memoryForget(id) {
  const { memory = [] } = await chrome.storage.local.get("memory");
  await chrome.storage.local.set({ memory: id === "all" ? [] : memory.filter(m => m.id !== id) });
  return { result: "applied" };
}
// The few memories most related to this session, for the librarian's context. No AI: shared words.
async function memoryFor(id) {
  const [{ memory = [] }, p] = await Promise.all([chrome.storage.local.get("memory"), findAim(id)]);
  if (!memory.length || !p) return [];
  const words = new Set([p.text, p.learn, ...(p.searches || []).map(x => x.q), ...(p.videos || []).map(v => v.title)].flatMap(meaningfulWords));
  const score = m => meaningfulWords(`${m.subject} ${m.idea}`).filter(w => words.has(w)).length;
  return memory.map(m => [m, score(m)]).filter(([m, n]) => n > 0 && m.aim !== p.id).sort((a, b) => b[1] - a[1]).slice(0, 5)
    .map(([m]) => ({ subject: m.subject, idea: m.idea, understood: m.understood, daysAgo: Math.round((Date.now() - m.at) / 864e5) }));
}
// "This reminds me of…": a memory from at least three days ago that shares a distinctive word of its
// subject, or two words, with this video's title. Offered at most once a day, the same one once a month.
async function memoryMatch(title) {
  const { memory = [], talk = {} } = await chrome.storage.local.get(["memory", "talk"]);
  const now = Date.now();
  if (!memory.length || now - (talk.connectAt || 0) < 864e5) return null;
  const words = new Set(meaningfulWords(title));
  const pick = memory.filter(m => now - m.at > 3 * 864e5 && now - (m.offeredAt || 0) > 30 * 864e5).find(m => {
    // One distinctive word of its subject ("concrete") is enough; otherwise two shared words.
    return meaningfulWords(m.subject).some(w => w.length >= 5 && words.has(w)) || meaningfulWords(`${m.subject} ${m.idea}`).filter(w => words.has(w)).length >= 2;
  });
  return pick ? { id: pick.id, subject: pick.subject, idea: pick.idea, daysAgo: Math.round((now - pick.at) / 864e5) } : null;
}
async function memoryOffered(id) {
  const { memory = [], talk = {} } = await chrome.storage.local.get(["memory", "talk"]);
  const m = memory.find(x => x.id === id);
  if (m) m.offeredAt = Date.now();
  await chrome.storage.local.set({ memory, talk: { ...talk, connectAt: Date.now() } });
  return { result: "applied" };
}

// When an Explore session may be invited to talk: three videos or half an hour into it, back on the
// homepage, once per session, and never sooner than a day after the last offer. Each "Maybe later"
// doubles the wait (up to a week); answering puts it back to a day.
const TALK_WAIT = 864e5;
async function talkOffer(aimId) {
  const [{ talk = {} }, p] = await Promise.all([chrome.storage.local.get("talk"), findAim(aimId)]);
  if (!p?.learn || talk.offeredFor === p.id) return { offer: false };
  if (Date.now() - (talk.offeredAt || 0) < (talk.wait || TALK_WAIT)) return { offer: false };
  const watched = (p.videos || []).filter(v => (v.sec || 0) >= 60).length;
  return { offer: watched >= 3 || (p.usedSec || 0) >= 30 * 60 };
}
async function talkOffered({ aimId, answer }) {
  const { talk = {} } = await chrome.storage.local.get("talk");
  const next = { ...talk };
  if (answer === "shown") Object.assign(next, { offeredAt: Date.now(), offeredFor: clip(aimId, 64) });
  if (answer === "later") next.wait = Math.min(7 * TALK_WAIT, (talk.wait || TALK_WAIT) * 2);
  if (answer === "replied") next.wait = TALK_WAIT;
  await chrome.storage.local.set({ talk: next });
  return { result: "applied" };
}

// What a conversation showed about a study session's topics, as their check (the same shape TeachBack
// leaves), so Review today, Quick review and the homepage's next step follow from it.
async function talkMarks(aimId, marks) {
  const d = await chrome.storage.local.get(["purpose", "paused", "history"]);
  const list = Array.isArray(marks) ? marks : [];
  let changed = false;
  const mark = topics => {
    for (const m of list) {
      const t = topics?.find(x => x.title === m.topic);
      if (!t || !["demonstrated", "partial", "needs_review"].includes(m.status)) continue;
      t.check = { assessmentId: "talk", at: Date.now(), endedEarly: false, objectives: [{ text: `Talked through ${t.title}`, status: m.status, search: "" }] };
      changed = true;
    }
  };
  // Without a study session, marks are for the map's parts: what you said moves a part forward, and a
  // part you couldn't explain after all goes back to partly.
  const markMap = map => {
    for (const m of list) {
      const part = map?.parts?.find(x => x.title === m.topic);
      if (!part) continue;
      const to = m.status === "demonstrated" ? "explained" : m.status === "partial" ? "partial" : part.status === "explained" ? "partial" : part.status;
      if (to !== part.status) { part.status = to; part.at = Date.now(); changed = true; }
    }
  };
  for (const r of [d.purpose, ...(d.paused || []), ...(d.history || [])]) {
    if (r?.id !== aimId) continue;
    if (r.study?.topics?.length) mark(r.study.topics); else markMap(r.map);
  }
  if (changed) await chrome.storage.local.set({ purpose: d.purpose || null, paused: d.paused || [], history: d.history || [] });
  return { result: "applied", changed };
}

// ---------- Your understanding: what a learning aim takes ----------
// The librarian's parts of a good answer (no order, not a curriculum), each with how far you've got:
// new → explored (you watched something on it; no AI, shared words) → partial / explained (only from
// what you said to the librarian). "How it fits together" is explained by putting it all together.
const MAP_RANK = { new: 0, explored: 1, partial: 2, explained: 3 };
function newMap(parts) {
  const now = Date.now();
  return { createdAt: now, links: "new", synthesis: null, removed: [],
    parts: parts.slice(0, 6).map((x, i) => ({ id: `p${i + 1}`, title: clip(x.title, 60), brief: clip(x.brief, 160), search: clip(x.search, 150), status: "new" }))
      .filter(x => x.title && x.search) };
}
// A video watched for a minute or more counts toward a part it's plainly about: found by that part's
// search, or its title shares a distinctive word (or two words) with the part.
function mapExplored(p, v) {
  const q = (p.allowed || []).find(a => a.id === v.id)?.q?.toLowerCase() || "";
  const words = new Set(meaningfulWords(`${v.title} ${q}`));
  for (const part of p.map.parts) {
    if (part.status !== "new") continue;
    const own = meaningfulWords(`${part.title} ${part.search}`);
    if ((q && q === part.search.toLowerCase()) || own.some(w => w.length >= 6 && words.has(w)) || own.filter(w => words.has(w)).length >= 2) {
      part.status = "explored";
      part.at = Date.now();
    }
  }
}
// Ready to put it together: at least two parts explained and most of them at least partly.
function mapReady(map) {
  if (!map?.parts?.length || map.synthesis?.verdict === "solid") return false;
  const explained = map.parts.filter(x => x.status === "explained").length, partly = map.parts.filter(x => MAP_RANK[x.status] >= 2).length;
  return explained >= 2 && partly >= Math.ceil(map.parts.length * 0.6);
}
async function mapRemove(partId) {
  const { purpose } = await chrome.storage.local.get("purpose");
  const part = purpose?.map?.parts.find(x => x.id === partId);
  if (!part) return { result: "error", message: "That part isn't there." };
  purpose.map.parts = purpose.map.parts.filter(x => x !== part);
  purpose.map.removed = [...(purpose.map.removed || []), part.title].slice(-10);
  await chrome.storage.local.set({ purpose });
  return { result: "applied" };
}
// What putting it together showed. "solid" is a finish line: the aim can end, or go on to the debates.
async function talkVerdict(aimId, verdict) {
  if (!["solid", "getting_there"].includes(verdict)) return { result: "error", message: "Unknown verdict." };
  const d = await chrome.storage.local.get(["purpose", "paused", "history"]);
  const rec = [d.purpose, ...(d.paused || []), ...(d.history || [])].find(r => r?.id === aimId && r.map);
  if (!rec) return { result: "error", message: "No map for that aim." };
  rec.map.synthesis = { at: Date.now(), verdict };
  if (verdict === "solid") rec.map.links = "explained";
  await chrome.storage.local.set({ purpose: d.purpose || null, paused: d.paused || [], history: d.history || [] });
  return { result: "applied" };
}

// How often captions were there when the librarian looked: the last 50 tries, for Settings.
async function captionsStat(found) {
  const { captionStats = [] } = await chrome.storage.local.get("captionStats");
  await chrome.storage.local.set({ captionStats: [...captionStats, found ? 1 : 0].slice(-50) });
  return { result: "applied" };
}
async function captionsStats() {
  const { captionStats = [] } = await chrome.storage.local.get("captionStats");
  return { tried: captionStats.length, found: captionStats.filter(Boolean).length };
}

// ---------- Put it into practice ----------
// One small way to use what an aim taught, suggested by the librarian when it closes a conversation.
// Kept with the aim; "I tried it" is your word for it (no proof asked), with an optional note that
// the next conversation asks about.
async function practiceSet(aimId, { practice, tried, note } = {}) {
  const d = await chrome.storage.local.get(["purpose", "paused", "history"]);
  const rec = [d.purpose, ...(d.paused || []), ...(d.history || [])].find(r => r?.id === aimId);
  if (!rec) return { result: "error", message: "That aim isn't here." };
  if (practice) {
    const title = clip(practice.title, 80), search = clip(practice.search, 150);
    if (!title || !search) return { result: "error", message: "Nothing to save." };
    if (rec.practice?.title !== title) rec.practice = { title, why: clip(practice.why, 160), search, savedAt: Date.now() };
  }
  if (tried && rec.practice) { rec.practice.triedAt = Date.now(); rec.practice.note = clip(note, 500); }
  await chrome.storage.local.set({ purpose: d.purpose || null, paused: d.paused || [], history: d.history || [] });
  return { result: "applied", practice: rec.practice || null };
}

// ---------- the library: one aim, whole ----------
// Each aim is a book on the shelf. Its subject (for the cover) is a guess from its words, no AI: a
// learning topic's channels it was watched from, else words in its name, searches and video titles.
const SUBJECTS = [
  ["history", "History", /\b(history|historical|rome|roman|empire|war\b|ancient|medieval|revolution|dynasty|civili[sz]ation|republic|pharaoh|viking)/],
  ["science", "Science", /\b(science|physics|chemistry|biology|cells?\b|cellular|photosynthesis|atom|molecule|evolution|respiration|genetics|quantum|climate|weather)/],
  ["math", "Math", /\b(math|algebra|calculus|geometry|statistics|equation|derivative|integral|probability|trigonometry|fraction)/],
  ["space", "Space", /\b(space|planet|nasa|rocket|astronomy|galaxy|orbit|stars?\b|moon\b|mars|telescope)/],
  ["engineering", "Engineering", /\b(engineer|engine|bridge|mechanical|electrical|circuit|battery|batteries|motor|robot|electronics)/],
  ["craft", "Craft", /\b(wood|joinery|joints?\b|cabinet|carpentry|chisel|sharpen|weld|sew\b|sewing|knit|pottery|furniture|faucet|plumbing|repair|fix\b|fixing|alternator|truck|car\b|cars\b)/],
  ["coding", "Technology", /\b(code|coding|program|python|javascript|software|computer|web\b|apps?\b|ai\b|data\b)/],
  ["money", "Personal finance", /\b(money|budget|invest|finance|tax\b|taxes|stock|saving|retire|debt)/],
  ["aviation", "Aviation", /\b(aviation|pilot|plane|aircraft|flight|airline|checkride|faa\b)/],
  ["health", "Health", /\b(health|fitness|exercise|nutrition|sleep|habit|workout|diet|medical|anatomy|emt\b|ems\b|paramedic|medication|pharmacolog|nursing|patient|cardiac|trauma|first aid|anaphyla|epinephrine|naloxone|overdose|stroke|asthma|diabet|seizure|cpr\b|vital signs)/],
  ["language", "Language", /\b(spanish|french|german|japanese|chinese|language|grammar|vocabulary|english)/],
  ["arts", "Arts", /\b(music|guitar|piano|drawing|painting|photography|photo|design|art\b|artist|writing|poetry)/],
  ["cooking", "Cooking", /\b(cook|cooking|bake|baking|bread|sourdough|recipe|kitchen|food)/],
  ["people", "Leadership", /\b(leader|leadership|negotiat|communication|manage|team|career|interview|speaking)/],
  ["faith", "Personal", /\b(bible|faith|religion|philosophy|meditation|ethic|psychology|mind\b)/]
];
function aimSubject(p) {
  if (p.learn) { const t = SUBJECTS.find(([, name]) => name.toLowerCase() === String(p.learn).toLowerCase()); if (t) return { id: t[0], name: t[1] }; }
  const text = [p.text, ...(p.searches || []).map(x => x.q), ...(p.videos || []).slice(-10).map(v => v.title)].join(" ").toLowerCase();
  const hit = SUBJECTS.find(([, , re]) => re.test(String(p.text || "").toLowerCase())) || SUBJECTS.find(([, , re]) => re.test(text));
  return hit ? { id: hit[0], name: hit[1] } : { id: "general", name: p.librarian?.kind === "project" ? "Project" : "Learning" };
}

// One aim with everything the aim page shows: its map, practice, notes, videos, path, study session,
// what you explained to the librarian about it, and the aims most like it.
async function aimGet(id) {
  const d = await chrome.storage.local.get(["purpose", "paused", "history", "memory"]);
  const all = [...(d.purpose ? [[d.purpose, "active"]] : []), ...(d.paused || []).map(p => [p, "paused"]),
    ...(d.history || []).filter(h => h.type === "purpose" && h.text).map(h => [h, "completed"])];
  const found = all.find(([p]) => p.id === id);
  if (!found) return { result: "error", message: "That aim isn't here any more." };
  const [p, state] = found;
  const words = new Set(meaningfulWords(`${p.text} ${(p.searches || []).map(x => x.q).join(" ")}`));
  const subject = aimSubject(p);
  const related = all.filter(([o]) => o.id !== id).map(([o, st]) => {
    const shared = meaningfulWords(`${o.text} ${(o.searches || []).map(x => x.q).join(" ")}`).filter(w => words.has(w)).length;
    return [o, st, shared + (aimSubject(o).id === subject.id && subject.id !== "general" ? 1 : 0)];
  }).filter(([, , n]) => n > 0).sort((a, b) => b[2] - a[2]).slice(0, 4)
    .map(([o, st]) => ({ id: o.id, text: o.text, state: st, subject: aimSubject(o) }));
  return { result: "applied", aim: { ...summary(p, state), subject, kind: p.librarian?.kind || (p.learn ? "explore" : null),
    map: p.map || null, practice: p.practice || null, study: p.study ? studySnapshot(p.study) : null, librarianNote: p.librarian?.note || "",
    learned: (d.memory || []).filter(m => m.aim === id).map(m => ({ subject: m.subject, idea: m.idea, understood: m.understood, at: m.at })),
    startedAt: p.startedAt || null, endedAt: p.endedAt || null }, related };
}

// Notes for any aim, from its page (the menu's Notes covers the one you're on).
async function setAimNotes(id, text) {
  const d = await chrome.storage.local.get(["purpose", "paused", "history"]);
  const rec = [d.purpose, ...(d.paused || []), ...(d.history || [])].find(r => r?.id === id);
  if (!rec) return { result: "error", message: "That aim isn't here any more." };
  rec.notes = String(text || "").slice(0, 4000);
  await chrome.storage.local.set({ purpose: d.purpose || null, paused: d.paused || [], history: d.history || [] });
  return { result: "applied", notes: rec.notes };
}

// ---------- References: your protocols and course texts ----------
// Documents you add (an agency's EMS protocols, a course textbook chapter), read in your browser and
// kept here: the list under "references", each one's text under "ref:<id>". Scenarios and checks use
// only the passages that matter, with a citation like [R1.12] (document 1, passage 12). Never synced,
// and sent to Aim's server only as those passages, when a scenario needs them.
const REF_KINDS = ["protocol", "course", "other"];
const REF_LEVELS = ["", "EMR", "EMT", "AEMT", "Paramedic", "Nursing", "Other"];
const REF_MAX = 3_000_000; // characters of text per document

async function refList() {
  const { references = [] } = await chrome.storage.local.get("references");
  return references;
}
async function refAdd({ name, kind, level, region, text }) {
  text = String(text || "").replace(/\r/g, "").replace(/[ \t]+\n/g, "\n").trim();
  if (text.length < 200) return { result: "error", message: "That document has too little text to use. If it's a scan, copy its text and paste it." };
  const { references = [] } = await chrome.storage.local.get("references");
  const id = `r${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
  const ref = { id, name: clip(name, 120) || "Untitled", kind: REF_KINDS.includes(kind) ? kind : "protocol", level: REF_LEVELS.includes(level) ? level : "",
    region: clip(region, 120), addedAt: Date.now(), chars: Math.min(text.length, REF_MAX), passages: refPassages(text.slice(0, REF_MAX)).length };
  await chrome.storage.local.set({ references: [...references, ref], [`ref:${id}`]: text.slice(0, REF_MAX) });
  return { result: "applied", reference: ref };
}
async function refUpdate(id, fields = {}) {
  const { references = [] } = await chrome.storage.local.get("references");
  const ref = references.find(r => r.id === id);
  if (!ref) return { result: "error", message: "That document isn't here." };
  if (fields.name !== undefined) ref.name = clip(fields.name, 120) || ref.name;
  if (REF_KINDS.includes(fields.kind)) ref.kind = fields.kind;
  if (REF_LEVELS.includes(fields.level)) ref.level = fields.level;
  if (fields.region !== undefined) ref.region = clip(fields.region, 120);
  await chrome.storage.local.set({ references });
  return { result: "applied", reference: ref };
}
async function refRemove(id) {
  const { references = [] } = await chrome.storage.local.get("references");
  await chrome.storage.local.set({ references: references.filter(r => r.id !== id) });
  await chrome.storage.local.remove(`ref:${id}`);
  return { result: "applied" };
}

// A document as passages: split at headings and blank lines, then joined up to about 1,200 characters,
// each keeping the nearest heading above it, so a passage still says what it's about.
function refPassages(text) {
  const blocks = text.split(/\n\s*\n/).map(b => b.trim()).filter(Boolean);
  const isHeading = b => b.length < 90 && !/[.:;,]$/.test(b) && /^[\p{Lu}\d]/u.test(b) && b.split(/\s+/).length <= 10;
  const out = [];
  let heading = "", cur = "";
  const flush = () => { if (cur.trim()) out.push({ heading, text: cur.trim() }); cur = ""; };
  for (const b of blocks) {
    if (isHeading(b)) { flush(); heading = b; continue; }
    if (cur.length + b.length > 1200) flush();
    cur += (cur ? "\n" : "") + b;
    while (cur.length > 1800) { out.push({ heading, text: cur.slice(0, 1200) }); cur = cur.slice(1200); }
  }
  flush();
  return out;
}

// The passages most related to what a scenario is about, labelled [R1.12], within maxChars. No AI:
// shared words, with the passage's heading counting double. Medication names always match exactly.
async function refExcerpts(ids, about, maxChars = 12000) {
  const refs = (await refList()).filter(r => ids.includes(r.id));
  const want = new Set(meaningfulWords(about));
  const scored = [];
  for (const [n, r] of refs.entries()) {
    const text = (await chrome.storage.local.get(`ref:${r.id}`))[`ref:${r.id}`] || "";
    refPassages(text).forEach((p, i) => {
      const words = meaningfulWords(p.text), head = meaningfulWords(p.heading);
      const score = words.filter(w => want.has(w)).length + 2 * head.filter(w => want.has(w)).length;
      if (score) scored.push({ cite: `R${n + 1}.${i + 1}`, ref: r.name, heading: p.heading, text: p.text, score });
    });
  }
  const picked = [];
  let used = 0;
  for (const p of scored.sort((a, b) => b.score - a.score)) {
    const block = `[${p.cite}] ${p.heading ? `${p.heading}: ` : ""}${p.text}`;
    if (used + block.length > maxChars) continue;
    picked.push({ ...p, block });
    used += block.length;
  }
  return { refs: refs.map((r, n) => ({ cite: `R${n + 1}`, id: r.id, name: r.name, level: r.level, region: r.region })), passages: picked };
}
