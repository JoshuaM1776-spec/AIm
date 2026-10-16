// Aim — shared settings logic (used by background.js, options and popup)
// Rule of the app: tightening is instant, loosening waits 24 hours.
//
// Three layers of boundaries:
//   Session limits — how long am I choosing to watch right now? (see sessions below)
//   Daily limits   — a leisure allowance (Explore + watching without a session), optional
//                    leisure hours, and an optional cap on all YouTube time. Purposeful time
//                    (Focus, Quick answers) is unrestricted unless the total cap is set.
//   Channel rules  — optional: channels to Avoid (warn or block). Purpose decides everything else.

const DELAY_MS = 24 * 60 * 60 * 1000;
const LEVELS = ["lenient", "balanced", "strict"];
const DEFAULT_LIMITS = { leisureMin: 60, leisureStart: 0, leisureEnd: 24, totalMin: 0 };

function todayKey(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

async function loadState() {
  const s = await chrome.storage.local.get(["limits", "avoid", "usage", "level", "pending", "channels"]);
  const state = {
    limits: { ...DEFAULT_LIMITS, ...(s.limits || {}) },
    avoid: s.avoid || {},            // channelKey -> { name, action: "warn" | "block" }
    usage: s.usage || {},            // "YYYY-MM-DD" -> { leisure: sec, purposeful: sec }
    level: s.level || "balanced",
    pending: s.pending || []         // delayed loosening changes
  };
  // One-time migration from the old bucket system: Blocked channels become Avoid → block.
  if (!s.limits && s.channels) {
    for (const [key, c] of Object.entries(s.channels)) if (c.bucketId === "blocked") state.avoid[key] = { name: c.name, action: "block" };
    state.usage = {};
    state.pending = state.pending.filter(p => p.kind === "level" || p.kind === "setting");
    await chrome.storage.local.remove(["channels", "buckets"]);
    await saveState(state);
  }
  // Apply any loosening changes whose 24 hours are up.
  const now = Date.now();
  const due = state.pending.filter(p => p.effectiveAt <= now);
  if (due.length) {
    for (const p of due) applyChange(state, p);
    state.pending = state.pending.filter(p => p.effectiveAt > now);
    await saveState(state);
  }
  return state;
}

async function saveState(state) {
  // Keep two weeks of usage history.
  const keys = Object.keys(state.usage).sort();
  for (const k of keys.slice(0, Math.max(0, keys.length - 14))) delete state.usage[k];
  await chrome.storage.local.set({
    limits: state.limits, avoid: state.avoid, usage: state.usage,
    level: state.level, pending: state.pending, ...(state._writes || {})
  });
  delete state._writes;
}

function applyChange(state, change) {
  if (change.kind === "level") state.level = change.payload.level;
  if (change.kind === "limits") state.limits = { ...change.payload };
  if (change.kind === "setting") (state._writes ||= {})[change.payload.key] = change.payload.value;
  if (change.kind === "avoid") {
    const { key, name, action } = change.payload;
    if (action) state.avoid[key] = { name, action };
    else delete state.avoid[key];
  }
}

// ---------- rule checks ----------

function allowedHours(start, end) {
  const set = new Set();
  if (start === end || (start === 0 && end === 24)) { for (let h = 0; h < 24; h++) set.add(h); return set; }
  for (let h = 0; h < 24; h++) {
    const inside = start < end ? (h >= start && h < end) : (h >= start || h < end);
    if (inside) set.add(h);
  }
  return set;
}

function fmtHour(h) {
  const hh = h % 24;
  return `${hh % 12 === 0 ? 12 : hh % 12}${hh < 12 ? "am" : "pm"}`;
}

// kind: "leisure" | "purposeful" | "total"
function usedSec(state, kind) {
  const day = state.usage[todayKey()] || {};
  if (kind === "total") return (day.leisure || 0) + (day.purposeful || 0);
  return day[kind] || 0;
}

function leisureLeftMin(state) {
  const { leisureMin, totalMin } = state.limits;
  let left = leisureMin > 0 ? leisureMin - usedSec(state, "leisure") / 60 : Infinity;
  if (totalMin > 0) left = Math.min(left, totalMin - usedSec(state, "total") / 60);
  return Math.max(0, Math.floor(left));
}

// Can I spend time of this kind right now?
function checkDaily(state, kind, d = new Date()) {
  const L = state.limits;
  if (L.totalMin > 0 && usedSec(state, "total") >= L.totalMin * 60)
    return { status: "total", message: `You've reached today's YouTube limit of ${L.totalMin} minutes.` };
  if (kind === "leisure") {
    if (!allowedHours(L.leisureStart, L.leisureEnd).has(d.getHours()))
      return { status: "hours", message: `Leisure watching is set for ${fmtHour(L.leisureStart)}–${fmtHour(L.leisureEnd)}.` };
    if (L.leisureMin > 0 && usedSec(state, "leisure") >= L.leisureMin * 60)
      return { status: "leisure", message: `You've used today's ${L.leisureMin}-minute leisure allowance.` };
  }
  return { status: "ok" };
}

function overAnyLimit(state) {
  const L = state.limits;
  return (L.totalMin > 0 && usedSec(state, "total") >= L.totalMin * 60) ||
    (L.leisureMin > 0 && usedSec(state, "leisure") >= L.leisureMin * 60);
}

function isLooserLimits(prev, next) {
  const lim = x => (x === 0 ? Infinity : x);
  if (lim(next.leisureMin) > lim(prev.leisureMin)) return true;
  if (lim(next.totalMin) > lim(prev.totalMin)) return true;
  const a = allowedHours(prev.leisureStart, prev.leisureEnd), b = allowedHours(next.leisureStart, next.leisureEnd);
  for (const h of b) if (!a.has(h)) return true;
  return false;
}

// ---------- change requests ----------
// Returns { result: "applied" | "pending" | "error", message }

async function submitChange(state, change, loosening, reason) {
  if (!loosening) {
    applyChange(state, change);
    // A tightening change cancels any pending loosening of the same thing.
    state.pending = state.pending.filter(p => !(p.kind === change.kind && p.target === change.target));
    await saveState(state);
    return { result: "applied", message: "Saved. Tighter rules take effect right away." };
  }
  if (overAnyLimit(state))
    return { result: "error", message: "You're over a daily limit right now. Loosening is locked until tomorrow." };
  if (!reason || reason.trim().length < 10)
    return { result: "error", message: "Loosening needs a reason (at least a short sentence)." };
  state.pending = state.pending.filter(p => !(p.kind === change.kind && p.target === change.target));
  state.pending.push({ ...change, reason: reason.trim(), requestedAt: Date.now(), effectiveAt: Date.now() + DELAY_MS, id: crypto.randomUUID() });
  await saveState(state);
  return { result: "pending", message: "Loosening requested. It takes effect in 24 hours, and you can cancel it any time before then." };
}

async function requestLevel(newLevel, reason) {
  const state = await loadState();
  const from = LEVELS.indexOf(state.level), to = LEVELS.indexOf(newLevel);
  if (to < 0 || to === from) return { result: "error", message: "Nothing to change." };
  if (to < from - 1) return { result: "error", message: "You can only loosen one step at a time." };
  return submitChange(state, { kind: "level", target: "level", payload: { level: newLevel }, desc: `Strictness → ${newLevel}` }, to < from, reason);
}

async function requestLimits(next, reason) {
  const state = await loadState();
  const clean = {
    leisureMin: Math.max(0, parseInt(next.leisureMin, 10) || 0),
    totalMin: Math.max(0, parseInt(next.totalMin, 10) || 0),
    leisureStart: Math.min(24, Math.max(0, parseInt(next.leisureStart, 10) || 0)),
    leisureEnd: Math.min(24, Math.max(0, parseInt(next.leisureEnd, 10) || 0))
  };
  const loosening = state.level !== "lenient" && isLooserLimits(state.limits, clean);
  return submitChange(state, { kind: "limits", target: "limits", payload: clean, desc: "Change daily limits" }, loosening, reason);
}

// action: "warn" | "block" | null (remove). Adding or going warn → block is instant.
async function requestAvoid(key, name, action, reason) {
  const state = await loadState();
  const prev = state.avoid[key]?.action || null;
  const rank = a => ({ block: 2, warn: 1 }[a] || 0);
  const loosening = state.level !== "lenient" && rank(action) < rank(prev);
  const desc = action ? `Avoid “${name}” → ${action}` : `Stop avoiding “${name}”`;
  return submitChange(state, { kind: "avoid", target: key, payload: { key, name, action }, desc }, loosening, reason);
}

async function cancelPending(id) {
  const state = await loadState();
  state.pending = state.pending.filter(p => p.id !== id);
  await saveState(state);
}

// kind: "leisure" | "purposeful"
async function addUsage(kind, seconds) {
  const state = await loadState();
  const day = (state.usage[todayKey()] ||= {});
  day[kind] = (day[kind] || 0) + seconds;
  await saveState(state);
  return state;
}

// ---------- sessions (Focus / Explore) ----------
// session: { mode: "quick"|"focus"|"explore", purpose, searches[], vague, budgetMin, usedSec, paused, startedAt, path, timeUp }
// Purpose = what you want to accomplish. Search = what you're looking for right now. Video = what you're considering.
const QUICK_SOFT_MIN = 15;

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

function remainingSec(s) { return s ? Math.max(0, s.budgetMin * 60 - s.usedSec) : 0; }

async function startSession({ mode, purpose, budgetMin, search }) {
  const s = {
    mode, purpose: (purpose || "").trim(), budgetMin: mode === "quick" ? QUICK_SOFT_MIN : budgetMin, usedSec: 0, paused: false,
    searches: search ? [search] : [], vague: mode !== "explore" && isVague(purpose),
    startedAt: Date.now(), path: purpose ? [{ purpose: purpose.trim(), at: Date.now() }] : [],
    pivots: 0, extensions: 0, timeUp: false
  };
  return setSession(s);
}

async function addSessionTime(seconds) {
  const s = await getSession();
  if (!s || s.paused) return s;
  s.usedSec += seconds;
  if (remainingSec(s) === 0) s.timeUp = true;
  return setSession(s);
}

async function patchSession(patch) {
  const s = await getSession();
  if (!s) return null;
  return setSession({ ...s, ...patch });
}

// Extending is the deliberate decision, governed by strictness.
// lenient: instant · balanced: instant but deliberate · strict: needs a reason
async function extendSession(minutes, reason) {
  const s = await getSession();
  if (!s) return { result: "error", message: "No session running." };
  const st = await loadState();
  const level = st.level;
  // Daily limits sit above sessions: extending can't buy time the day doesn't have.
  const daily = checkDaily(st, s.mode === "explore" ? "leisure" : "purposeful");
  if (daily.status !== "ok") return { result: "error", message: daily.message, daily: true };
  if (s.mode === "explore" && leisureLeftMin(st) < minutes)
    minutes = leisureLeftMin(st);
  if (minutes <= 0) return { result: "error", message: "No leisure time left today.", daily: true };
  if (level === "strict" && (!reason || reason.trim().length < 10))
    return { result: "error", message: "Strict mode: extending needs a reason (a short sentence)." };
  s.budgetMin += minutes;
  s.extensions += 1;
  s.timeUp = remainingSec(s) === 0;
  if (reason) s.lastExtendReason = reason.trim();
  await setSession(s);
  return { result: "applied", message: `Added ${minutes} minutes.`, session: s };
}

// A pivot changes purpose. Keeping remaining time is the default; a new limit
// that adds time is treated as an extension.
async function pivotSession(newPurpose, newBudgetMin, reason) {
  const s = await getSession();
  if (!s) return { result: "error", message: "No session running." };
  const purpose = (newPurpose || "").trim();
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
  if (cur.mode === "explore") cur.mode = "focus";
  cur.purpose = purpose;
  cur.vague = isVague(purpose);
  cur.pivots += 1;
  cur.path.push({ purpose, at: Date.now() });
  await setSession(cur);
  return { result: "applied", message: "Purpose changed.", session: cur };
}

async function endSession(outcome) {
  const s = await getSession();
  if (!s) return null;
  const { sessions = [] } = await chrome.storage.local.get("sessions");
  const record = { ...s, endedAt: Date.now(), outcome: outcome || null };
  sessions.push(record);
  await chrome.storage.local.set({ sessions: sessions.slice(-100), session: null });
  return record;
}

async function rateLastSession(outcome) {
  const { sessions = [] } = await chrome.storage.local.get("sessions");
  if (!sessions.length) return;
  sessions[sessions.length - 1].outcome = outcome;
  await chrome.storage.local.set({ sessions });
}

// ---------- save for later ----------

async function saveForLater(video) {
  const { saved = [] } = await chrome.storage.local.get("saved");
  if (!saved.some(v => v.id === video.id)) saved.push({ id: video.id, title: video.title, channel: video.channel, at: Date.now() });
  await chrome.storage.local.set({ saved: saved.slice(-200) });
  return saved.length;
}

async function removeSaved(id) {
  const { saved = [] } = await chrome.storage.local.get("saved");
  await chrome.storage.local.set({ saved: saved.filter(v => v.id !== id) });
}

// A new search that continues the same purpose.
async function addSearch(query) {
  const s = await getSession();
  if (!s) return null;
  s.searches = s.searches || [];
  if (s.searches[s.searches.length - 1] !== query) s.searches.push(query);
  s.searches = s.searches.slice(-30);
  return setSession(s);
}

// Clarifying is not pivoting: same goal, said more precisely.
async function refinePurpose(purpose) {
  const s = await getSession();
  if (!s || !purpose.trim()) return s;
  s.purpose = purpose.trim();
  s.vague = isVague(s.purpose);
  if (s.path.length) s.path[s.path.length - 1].purpose = s.purpose;
  else s.path.push({ purpose: s.purpose, at: Date.now() });
  return setSession(s);
}

// A quick answer that turned into real learning.
async function convertToFocus(budgetMin) {
  const s = await getSession();
  if (!s) return null;
  s.mode = "focus";
  s.budgetMin = Math.ceil(s.usedSec / 60) + budgetMin;
  s.timeUp = false;
  return setSession(s);
}

// Feature switches (homepage card, recommendation filtering, AI key) follow the same rule:
// turning protection up is instant, turning it down waits 24 hours.
async function requestSetting(key, value, loosening, desc, reason) {
  const state = await loadState();
  return submitChange(state, { kind: "setting", target: key, payload: { key, value }, desc },
    loosening && state.level !== "lenient", reason);
}
