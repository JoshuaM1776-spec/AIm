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
  hideShorts: true, hideRecs: true, hideFeeds: true, noAutoplay: true
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
  noAutoplay: v => typeof v === "boolean"
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

// 5: Targets can be set aside and resumed (the `paused` list), and remember when they were last
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
  const today = s.usage[s.day];
  const left = leisureLeftSec(settings, today);
  return {
    purpose: s.purpose, brk: s.brk, stop: s.stop, today,
    leisureLeftMin: left === Infinity ? null : Math.floor(left / 60),
    totalReached: totalReached(settings, today), settings
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

// ---------- Targets you can pick up again ----------
// The home screen shows the current Target and at most two others; the Targets page shows all.
// Set-aside Targets come first (they're unfinished), then recently completed ones.
function resumable(s) {
  const pausedList = s.paused.map(p => summary(p, "paused"));
  const done = s.history.filter(h => h.type === "purpose" && h.text).slice().reverse().map(h => summary(h, "completed"));
  return { current: s.purpose ? summary(s.purpose, "active") : null, paused: pausedList, completed: done.slice(0, 100) };
}
function summary(p, state) {
  return { id: p.id, text: p.text, state, lastActiveAt: p.lastActiveAt || p.pausedAt || p.endedAt || p.startedAt,
    usedSec: Math.round(p.usedSec || 0), videos: (p.videos || []).length, searches: (p.searches || []).length,
    outcome: p.outcome || null, last: p.last || null };
}

// Where to land when a Target is resumed: the last video, at the moment you left it; otherwise
// the last search; otherwise the homepage, which shows the Target.
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
    outcome: outcome || null, path: p.path, searches: p.searches, videos: p.videos };
}
function breakRecord(b) {
  return { type: "break", id: b.id, startedAt: b.startedAt, endedAt: Date.now(), usedSec: Math.round(b.usedSec),
    oneVideo: !!b.oneVideoId, videos: b.videos };
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

// Starting a Target ends any break (the break is what you were doing instead), and sets aside
// the Target you had, so you can pick it up again later.
async function startPurpose({ text, search, limitMin, video }) {
  text = clip(text, 300);
  if (text.length < 2) return { result: "error", message: "Write what you're here for." };
  const s = await readAll(), settings = await getSettings();
  const writes = {};
  if (s.brk) { s.history = archive(s.history, breakRecord(s.brk)); writes.brk = null; }
  const setAside = s.purpose ? park(s, s.purpose) : null;
  const limit = limitMin === undefined ? settings.purposeLimitMin : parseInt(limitMin, 10) || 0;
  const purpose = newPurpose(text, search, limit);
  if (video?.id) allow(purpose, [video], [], search || "");
  await chrome.storage.local.set({ ...writes, purpose, paused: s.paused, history: s.history, stop: s.stop?.kind === "total" ? s.stop : null });
  return { result: "applied", purpose, setAside: setAside ? setAside.text : null };
}

// Changing Target is a deliberate change of objective: the old Target is set aside (resumable,
// with its searches and videos) and the new one starts fresh, with the video that prompted it.
async function pivotPurpose(text, limitMin, video) {
  text = clip(text, 300);
  if (text.length < 2) return { result: "error", message: "Write your new Target." };
  return startPurpose({ text, limitMin: limitMin ?? undefined, video });
}

// Set-aside Targets: newest first, at most 20. The oldest beyond that become history, unfinished.
const MAX_PAUSED = 20;
function park(s, p) {
  const parked = { ...p, suspended: false, lastCountAt: 0, pausedAt: Date.now(), lastActiveAt: p.lastActiveAt || Date.now() };
  s.paused = [parked, ...s.paused.filter(x => x.id !== p.id)];
  for (const old of s.paused.splice(MAX_PAUSED)) s.history = archive(s.history, purposeRecord(old, null));
  return parked;
}

// Set the current Target aside on purpose, without starting another.
async function pausePurpose() {
  const s = await readAll();
  if (!s.purpose) return { result: "error", message: "No Target set." };
  const parked = park(s, s.purpose);
  const stop = s.stop?.kind === "purpose" ? null : s.stop;
  await chrome.storage.local.set({ purpose: null, paused: s.paused, history: s.history, stop });
  return { result: "applied", setAside: parked.text };
}

// Pick a Target up again: a set-aside one comes back as it was; a completed one starts again
// with its searches and the videos you watched for it. The current Target, if any, is set aside.
// Returns where to go: the last video at the moment you left it, or the last search.
async function resumePurpose(id) {
  const s = await readAll();
  if (s.purpose?.id === id) return { result: "applied", purpose: s.purpose, url: resumeUrl(s.purpose) };
  let next = s.paused.find(p => p.id === id);
  if (next) {
    s.paused = s.paused.filter(p => p.id !== id);
    next = { ...next, suspended: false, lastCountAt: 0, lastActiveAt: Date.now() };
    delete next.pausedAt;
    if (next.last?.id) allow(next, [next.last], [], "");
  } else {
    const done = s.history.find(h => h.type === "purpose" && h.id === id);
    if (!done) return { result: "error", message: "That Target isn't available any more." };
    next = newPurpose(done.text, null, 0);
    next.searches = (done.searches || []).slice(-50);
    allow(next, done.videos || [], [], "");
    const lastVideo = (done.videos || []).slice().sort((a, b) => (b.at || 0) - (a.at || 0))[0];
    next.last = lastVideo ? { id: lastVideo.id, title: lastVideo.title, t: 0, at: lastVideo.at } : null;
    next.restartedFrom = done.id;
  }
  const writes = {};
  if (s.brk) { s.history = archive(s.history, breakRecord(s.brk)); writes.brk = null; }
  if (s.purpose) park(s, s.purpose);
  await chrome.storage.local.set({ ...writes, purpose: next, paused: s.paused, history: s.history,
    stop: s.stop?.kind === "total" ? s.stop : null });
  return { result: "applied", purpose: next, url: resumeUrl(next) };
}

// Remove a set-aside Target you don't want to come back to. It stays in history, unfinished.
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
  if (!p) return { result: "error", message: "No Target set." };
  if (add) setLimitFromNow(p, Math.max(0, p.limitMin ? p.limitMin - Math.ceil(p.usedSec / 60) : 0) + parseInt(add, 10));
  else setLimitFromNow(p, parseInt(minutes, 10) || 0);
  p.timeUp = !!p.limitMin && p.usedSec >= p.limitMin * 60;
  const stop = s.stop?.kind === "purpose" && !p.timeUp ? null : s.stop;
  await chrome.storage.local.set({ purpose: p, stop });
  return { result: "applied", purpose: p };
}

// Clarifying is not pivoting: same goal, said more precisely.
async function refinePurpose(text) {
  const s = await readAll();
  text = clip(text, 300);
  if (!s.purpose || !text) return { result: "error", message: "Nothing to change." };
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
  if (!s.purpose || !query) return { result: "error", message: "No Target set." };
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
function allow(p, videos, lists, query) {
  p.allowed ||= [];
  p.allowedLists ||= [];
  const known = new Set(p.allowed.map(v => v.id));
  for (const v of videos) {
    const id = clip(v.id, 20);
    if (!id || known.has(id)) continue;
    known.add(id);
    p.allowed.push({ id, title: clip(v.title, 300), channel: clip(v.channel, 200), q: clip(query, 200), at: Date.now() });
  }
  p.allowed = p.allowed.slice(-MAX_ALLOWED);
  for (const l of lists) { const id = clip(l, 64); if (id && !p.allowedLists.includes(id)) p.allowedLists.push(id); }
  p.allowedLists = p.allowedLists.slice(-50);
}

async function allowVideos({ query, videos, lists }) {
  const s = await readAll();
  if (!s.purpose) return { result: "error", message: "No Target set." };
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
  const known = [purpose.text, ...(purpose.searches || []).map(s => s.q)].flatMap(meaningfulWords);
  const same = (a, b) => a === b || (a.length >= 5 && b.length >= 5 && a.slice(0, 5) === b.slice(0, 5));
  return q.some(w => known.some(k => same(w, k)));
}
async function checkSearch(query) {
  const s = await readAll();
  return { fits: !s.purpose || searchFits(s.purpose, clip(query, 200)) };
}

// Done. The record is also left as a reflection for the next YouTube page to show.
async function finishPurpose(outcome) {
  const s = await readAll();
  if (!s.purpose) return { result: "error", message: "No Target set." };
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
async function startBreak({ minutes, oneVideoId }) {
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
  const brk = { id: uid(), startedAt: Date.now(), durationMin, usedSec: 0, lastCountAt: 0, oneVideoId: clip(oneVideoId, 20) || null, videos: [] };
  const stop = s.stop && ["break", "leisure"].includes(s.stop.kind) ? null : s.stop;
  await chrome.storage.local.set({ ...writes, brk, stop, history: s.history });
  return { result: "applied", brk, capped: minutes && durationMin < minutes ? durationMin : null };
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
    // Where you are in the video, so resuming the Target can return to it.
    if (activity === purpose && video?.id) purpose.last = { id: clip(video.id, 20), title: clip(video.title, 300), t: Math.max(0, Number(video.t) || 0), at: now };
    if (video?.id) {
      let v = activity.videos.find(x => x.id === video.id);
      if (!v) {
        v = { id: clip(video.id, 20), title: clip(video.title, 300), channel: clip(video.channel, 200), sec: 0, at: now };
        activity.videos.push(v);
        activity.videos = activity.videos.slice(-200);
      }
      v.sec += add;
    }
  }

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

// ---------- channels ----------
// action: "hide" | "warn" | null (remove)
async function setAvoid(key, name, action) {
  key = channelPath(key);
  if (!key) return { result: "error", message: "Unknown channel." };
  const { avoid = {} } = await chrome.storage.local.get("avoid");
  if (action === "hide" || action === "warn") avoid[key] = { name: clip(name, 200) || key, action };
  else delete avoid[key];
  await chrome.storage.local.set({ avoid });
  return { result: "applied", avoid };
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
  await chrome.storage.local.set({ saved: saved.filter(v => v.id !== id) });
  return { result: "applied" };
}

async function clearHistory() {
  await chrome.storage.local.set({ history: [] });
  return { result: "applied" };
}
