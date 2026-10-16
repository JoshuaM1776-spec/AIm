// Aim — stored data and session logic.
// Loaded only by the background service worker, which is the single writer: the popup,
// settings page and YouTube tabs change data by sending it messages.
//
// Boundaries, lightest first:
//   Session timer   — how long am I choosing to watch right now? The main boundary.
//   Hold me to it   — optional switch: adding time after the limit takes a written reason.
//   Daily reminder  — optional: one heads-up a day after N minutes on YouTube. Nothing is blocked.
//   Channels        — optional: Hide a channel from your feeds, or get a Warning before watching it.

const SCHEMA_VERSION = 2;
const DEFAULT_SETTINGS = { homeCard: true, recMode: "mark", hold: false, reminderMin: 0 };
const SETTING_RULES = {
  homeCard: v => typeof v === "boolean",
  recMode: v => ["off", "mark", "hide"].includes(v),
  hold: v => typeof v === "boolean",
  reminderMin: v => Number.isInteger(v) && v >= 0 && v <= 24 * 60
};

// ---------- write queue ----------
// Every change runs one at a time, so a timer tick can't overwrite a pause or a pivot
// that happened while it was reading.
let queue = Promise.resolve();
function serial(fn) {
  const run = queue.then(fn);
  queue = run.catch(() => {});
  return run;
}

// ---------- migrations ----------
// Bump SCHEMA_VERSION when stored data changes shape, and add a step here.
async function migrateStorage() {
  const { schemaVersion = 0 } = await chrome.storage.local.get("schemaVersion");
  if (schemaVersion >= SCHEMA_VERSION) return;
  const all = await chrome.storage.local.get(null);
  // Version 1 only stamped the version, so 0 and 1 hold the same Waypoint 0.5 data.
  await migrateTo2(all);
  await chrome.storage.local.set({ schemaVersion: SCHEMA_VERSION });
}

// 2: one light rule system instead of three. Strict becomes "hold me to my time limits",
// the total daily cap becomes the reminder, Block becomes Hide, Quick answers become Focus.
// Leisure limits, leisure hours, pending loosening changes and the watch log are dropped.
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
  const session = toFocus(old.session || null);
  if (session) session.timeUp = remainingSec(session) === 0;
  await chrome.storage.local.set({
    settings: {
      ...DEFAULT_SETTINGS,
      homeCard: old.homeCard !== false,
      recMode: SETTING_RULES.recMode(old.recMode) ? old.recMode : "mark",
      hold: old.level === "strict",
      reminderMin: old.limits?.totalMin > 0 ? old.limits.totalMin : 0
    },
    avoid, usage, session,
    sessions: (old.sessions || []).map(toFocus)
  });
  await chrome.storage.local.remove(["level", "pending", "limits", "channels", "buckets", "log", "homeCard", "recMode", "pendingPurpose"]);
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

function remainingSec(s) { return s ? Math.max(0, s.budgetMin * 60 - s.usedSec) : 0; }

// Credits the wall-clock time since the last credit, at most `seconds`. Two open YouTube
// tabs ticking out of step then add up to real time instead of counting it twice.
function credit(lastAt, now, seconds) {
  return lastAt ? Math.max(0, Math.min(seconds, (now - lastAt) / 1000)) : seconds;
}

const clip = (s, n) => String(s || "").trim().slice(0, n);

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

// ---------- time tracking ----------
async function recordTick(seconds, sessionRunning) {
  const now = Date.now(), day = todayKey();
  const { usage = {}, usageLastAt = 0, reminderDay = null, session = null } =
    await chrome.storage.local.get(["usage", "usageLastAt", "reminderDay", "session"]);
  const settings = await getSettings();

  usage[day] = (usage[day] || 0) + credit(usageLastAt, now, seconds);
  for (const k of Object.keys(usage).sort().slice(0, -14)) delete usage[k]; // two weeks
  const writes = { usage, usageLastAt: now };

  let reminder = null;
  if (settings.reminderMin > 0 && usage[day] >= settings.reminderMin * 60 && reminderDay !== day) {
    writes.reminderDay = day;
    reminder = Math.floor(usage[day] / 60);
  }
  if (session && sessionRunning && !session.paused && !session.timeUp) {
    session.usedSec += credit(session.lastCountAt, now, seconds);
    session.lastCountAt = now;
    session.timeUp = remainingSec(session) === 0;
    writes.session = session;
  }
  await chrome.storage.local.set(writes);
  return { session, reminder };
}

// ---------- sessions (Focus / Explore) ----------
// session: { mode: "focus"|"explore", purpose, searches[], vague, budgetMin, usedSec, lastCountAt,
//            paused, startedAt, path[], pivots, extensions, timeUp, suggestions? }
// Purpose = what you want to accomplish. Search = what you're looking for right now.

// A bare topic ("woodworking") doesn't say what you want to accomplish.
function isVague(text) {
  const t = (text || "").trim();
  if (!t) return true;
  return t.split(/\s+/).length <= 2 && !/[?]/.test(t);
}

async function getSession() {
  const { session = null } = await chrome.storage.local.get("session");
  return session;
}

async function setSession(session) {
  await chrome.storage.local.set({ session });
  return session;
}

async function startSession({ mode, purpose, budgetMin, search }) {
  mode = mode === "explore" ? "explore" : "focus";
  purpose = mode === "focus" ? clip(purpose, 300) : "";
  const s = {
    mode, purpose, budgetMin: Math.max(1, Math.min(600, parseInt(budgetMin, 10) || 15)),
    usedSec: 0, lastCountAt: 0, paused: false,
    searches: search ? [clip(search, 200)] : [], vague: mode === "focus" && isVague(purpose),
    startedAt: Date.now(), path: purpose ? [{ purpose, at: Date.now() }] : [],
    pivots: 0, extensions: 0, timeUp: false
  };
  return setSession(s);
}

// Only these fields may be changed directly; time and purpose have their own rules.
async function patchSession(patch) {
  const s = await getSession();
  if (!s) return null;
  if ("paused" in patch) {
    s.paused = !!patch.paused;
    if (!s.paused) s.lastCountAt = Date.now(); // the break itself isn't session time
  }
  if ("suggestions" in patch) s.suggestions = patch.suggestions;
  return setSession(s);
}

// Adding time is the deliberate decision. With "hold me to my time limits" on, it takes a reason.
async function extendSession(minutes, reason) {
  const s = await getSession();
  if (!s) return { result: "error", message: "No session running." };
  minutes = parseInt(minutes, 10);
  if (!(minutes > 0)) return { result: "error", message: "Nothing to add." };
  const { hold } = await getSettings();
  if (hold && clip(reason, 500).length < 10)
    return { result: "error", message: "You asked Aim to hold you to your limits, so adding time takes a short reason." };
  s.budgetMin += minutes;
  s.extensions += 1;
  s.timeUp = remainingSec(s) === 0;
  if (reason) s.lastExtendReason = clip(reason, 500);
  await setSession(s);
  return { result: "applied", message: `Added ${minutes} minutes.`, session: s };
}

// A pivot changes purpose. Keeping the remaining time is the default; a new limit
// that adds time counts as an extension.
async function pivotSession(newPurpose, newBudgetMin, reason) {
  const s = await getSession();
  if (!s) return { result: "error", message: "No session running." };
  const purpose = clip(newPurpose, 300);
  if (!purpose) return { result: "error", message: "Write your new purpose." };
  if (newBudgetMin != null) {
    const usedMin = Math.ceil(s.usedSec / 60);
    const extra = newBudgetMin - Math.max(0, s.budgetMin - usedMin);
    if (extra > 0) {
      const r = await extendSession(extra, reason);
      if (r.result === "error") return r;
    } else {
      // Less time is always allowed.
      const fresh = await getSession();
      fresh.budgetMin = usedMin + newBudgetMin;
      await setSession(fresh);
    }
  }
  const cur = await getSession();
  cur.mode = "focus";
  cur.purpose = purpose;
  cur.vague = isVague(purpose);
  cur.pivots += 1;
  cur.path.push({ purpose, at: Date.now() });
  cur.timeUp = remainingSec(cur) === 0;
  await setSession(cur);
  return { result: "applied", message: "Purpose changed.", session: cur };
}

// The finished session is also left as a reflection for the next YouTube page to show.
async function endSession(outcome) {
  const s = await getSession();
  if (!s) return null;
  const { sessions = [] } = await chrome.storage.local.get("sessions");
  const record = { ...s, endedAt: Date.now(), outcome: ["yes", "partly", "no"].includes(outcome) ? outcome : null };
  delete record.suggestions;
  sessions.push(record);
  await chrome.storage.local.set({ sessions: sessions.slice(-100), session: null, reflection: record });
  return record;
}

async function rateLastSession(outcome) {
  if (!["yes", "partly", "no"].includes(outcome)) return null;
  const { sessions = [] } = await chrome.storage.local.get("sessions");
  if (!sessions.length) return null;
  sessions[sessions.length - 1].outcome = outcome;
  await chrome.storage.local.set({ sessions });
  return { result: "applied" };
}

// A new search that continues the same purpose.
async function addSearch(query) {
  const s = await getSession();
  if (!s) return null;
  query = clip(query, 200);
  s.searches = s.searches || [];
  if (query && s.searches[s.searches.length - 1] !== query) s.searches.push(query);
  s.searches = s.searches.slice(-30);
  return setSession(s);
}

// Clarifying is not pivoting: same goal, said more precisely.
async function refinePurpose(purpose) {
  const s = await getSession();
  purpose = clip(purpose, 300);
  if (!s || !purpose) return s;
  s.purpose = purpose;
  s.vague = isVague(purpose);
  if (s.path.length) s.path[s.path.length - 1].purpose = purpose;
  else s.path.push({ purpose, at: Date.now() });
  return setSession(s);
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
  await chrome.storage.local.set({ sessions: [] });
  return { result: "applied" };
}
