// Aim — shared state and helpers for the youtube.com scripts.
// The content/*.js files load in order (see manifest.json) and share one scope in the
// extension's isolated world, which the page itself can't see.

// ---------------- state ----------------
// Mirrors of what the background stores (see store.js): a purpose, a break, or neither.
let purpose = null;          // { text, searches, videos, limitMin, usedSec, timeUp, suspended (during a break) }
let brk = null;              // { durationMin (null for one video), usedSec, oneVideoId }
let stop = null;             // a limit that ran out: { kind, videoId (may finish), graceEndsAt }
let status = { today: null, leisureLeftMin: null, totalReached: false, recent: [] };
let breakEndsAt = 0;         // local estimate for the break countdown, re-synced with every status
let settings = { homeCard: true, leisureMin: 60, graceMin: 15, avoid: {} };
let searchPending = null;    // a search that doesn't seem to fit the purpose, waiting for "is this part of it?"
let currentId = null;        // video on screen
let currentInfo = null;
let holding = false;         // keep the video paused until cleared
const cleared = new Set();   // videos cleared to play in this tab
const overridden = new Set();// videos from a hidden/warned channel you chose to watch anyway
let modal = null, notice = null, dropdown = null, playerCard = null;
let endingHere = false;      // this tab ended the session (vs. the popup or another tab)
let alive = true;            // false once the extension is reloaded or updated under this tab

// The product name comes from manifest.json, so renaming is a one-file change (see README).
const BRAND = chrome.runtime.getManifest().name;

// Set up by early.js at document_start; a stand-in if Aim was loaded into an already-open tab.
const early = typeof aimEarly !== "undefined" ? aimEarly : { done() {}, showFeed() {} };

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const sleep = ms => new Promise(r => setTimeout(r, ms));

// Resolves to the reply, or null if the background failed or the extension went away.
function send(msg) {
  if (!alive) return Promise.resolve(null);
  return new Promise(res => {
    try {
      chrome.runtime.sendMessage(msg, r => {
        if (chrome.runtime.lastError || !r || r.error) return res(null);
        res(r);
      });
    } catch {
      shutDown();
      res(null);
    }
  });
}

// After an extension update or reload this copy of the script is orphaned: take its UI
// down and stop holding videos, instead of throwing errors until the tab is refreshed.
function shutDown() {
  if (!alive) return;
  alive = false;
  clearInterval(tickTimer);
  clearInterval(countdownTimer);
  pageObserver.disconnect();
  holding = false;
  early.done();
  early.showFeed();
  for (const n of $$("#wp-chip, #wp-home, #wp-feed-note, #wp-results-bar, #wp-upnext, #wp-plan-panel, #wp-concepts, #wp-theme-panel, .wp-notice, .wp-scrim, .wp-dropdown, .wp-player-card")) n.remove();
  document.documentElement.classList.remove("wp-home", "wp-search-pending", "wp-focus", "wp-hide-shorts", "wp-hide-recs", "wp-hide-feeds");
}

// The popup's Resume asks the YouTube tab you're on to go there (no tabs permission needed).
chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (msg?.type !== "go" || sender.id !== chrome.runtime.id || !/^https:\/\/www\.youtube\.com\//.test(msg.url || "")) return;
  location.href = msg.url;
  reply({ ok: true });
});

// Icons are built with DOM calls rather than HTML strings, so YouTube's Trusted Types
// policy can't block them. Each entry: [size, [tag, attributes], ...].
const ICON = {
  // The mark (icons/mark-small.svg, written by tools/build-mark.mjs): forest green, light in
  // YouTube's dark theme (--wp-mark); the arrowhead stays coral.
  logo: [20,["path",{"d":"M5.15 21.88L5.1 21.83L4.9 21.63L4.71 21.4L4.54 21.17L4.42 20.98L4.32 20.81L4.23 20.64L4.14 20.46L4.07 20.29L4 20.11L3.93 19.93L3.87 19.75L3.82 19.57L3.78 19.39L3.74 19.21L3.7 19.02L3.67 18.84L3.65 18.66L3.63 18.47L3.63 18.29L3.62 18.1L3.62 17.92L3.63 17.73L3.64 17.55L3.66 17.37L3.69 17.18L3.72 17L3.75 16.82L3.8 16.64L3.85 16.46L3.9 16.28L3.96 16.1L4.03 15.92L4.1 15.75L4.18 15.58L4.27 15.4L4.36 15.24L4.46 15.07L4.57 14.91L4.68 14.75L4.79 14.59L4.92 14.44L5.05 14.28L5.2 14.13L5.37 13.96L5.55 13.8L5.73 13.66L5.92 13.53L6.1 13.41L6.29 13.3L6.47 13.2L6.65 13.11L6.83 13.02L7.01 12.94L7.19 12.86L7.38 12.78L7.56 12.71L7.74 12.64L7.92 12.57L8.1 12.51L8.28 12.44L8.46 12.38L8.64 12.33L8.82 12.27L8.99 12.21L9.17 12.15L9.34 12.1L9.52 12.04L9.68 11.99L9.85 11.94L10.02 11.89L10.18 11.84L10.33 11.78L10.49 11.73L10.64 11.68L10.78 11.63L10.92 11.58L11.05 11.53L11.17 11.48L11.29 11.44L11.41 11.39L11.51 11.34L11.6 11.3L11.69 11.26L11.8 11.2L11.91 11.14L12.03 11.08L12.14 11.02L12.26 10.95L12.37 10.89L12.48 10.83L12.59 10.76L12.7 10.7L12.81 10.63L12.92 10.57L13.02 10.5L13.13 10.43L13.24 10.36L13.34 10.29L13.45 10.23L13.55 10.16L13.65 10.09L13.75 10.02L13.86 9.95L13.96 9.88L14.06 9.81L14.16 9.74L14.26 9.67L14.35 9.6L14.45 9.53L14.55 9.46L14.64 9.39L14.74 9.31L14.83 9.24L14.92 9.17L15.02 9.1L15.11 9.03L15.2 8.96L15.29 8.88L15.38 8.82L15.46 8.74L15.55 8.67L15.64 8.6L15.72 8.53L15.78 8.49L4.75 2.97L4.29 2.79L3.81 2.69L3.32 2.67L2.83 2.73L2.35 2.88L1.91 3.1L1.52 3.4L1.17 3.75L0.9 4.16L0.7 4.61L0.57 5.09L0.53 5.58L0.53 19.48L0.57 19.97L0.7 20.45L0.9 20.9L1.17 21.31L1.52 21.66L1.91 21.96L2.35 22.18L2.83 22.33L3.32 22.39L3.81 22.37L4.29 22.27L4.75 22.08Z","style":"fill: var(--wp-mark, #163126)"}],["path",{"d":"M11.01 18.95L10.97 18.94L10.79 18.87L10.61 18.8L10.44 18.73L10.27 18.67L10.11 18.61L9.95 18.55L9.8 18.5L9.65 18.44L9.51 18.39L9.37 18.34L9.25 18.29L9.13 18.24L9.02 18.2L8.92 18.16L8.83 18.12L8.75 18.09L8.69 18.06L8.64 18.03L8.61 18.02L8.59 18.01L8.58 18.02L8.6 18.04L8.63 18.08L8.68 18.14L8.72 18.2L8.72 18.22L8.71 18.21L8.7 18.2L8.69 18.19L8.67 18.18L8.66 18.16L8.65 18.15L8.63 18.13L8.62 18.11L8.61 18.09L8.6 18.06L8.58 18.04L8.57 18.01L8.56 17.99L8.55 17.96L8.54 17.93L8.54 17.9L8.53 17.87L8.52 17.85L8.52 17.82L8.52 17.78L8.51 17.76L8.51 17.73L8.51 17.7L8.51 17.67L8.51 17.64L8.51 17.61L8.51 17.58L8.52 17.55L8.52 17.52L8.52 17.5L8.53 17.47L8.54 17.45L8.54 17.42L8.55 17.4L8.56 17.37L8.57 17.35L8.58 17.33L8.59 17.3L8.59 17.29L8.58 17.29L8.57 17.29L8.58 17.28L8.6 17.26L8.63 17.23L8.68 17.19L8.74 17.15L8.81 17.1L8.89 17.05L8.98 17L9.08 16.95L9.19 16.89L9.31 16.83L9.44 16.77L9.57 16.71L9.71 16.65L9.85 16.59L10 16.53L10.15 16.47L10.31 16.4L10.46 16.34L10.63 16.28L10.8 16.21L10.97 16.15L11.14 16.08L11.31 16.01L11.48 15.94L11.66 15.87L11.83 15.8L12.01 15.73L12.19 15.65L12.36 15.58L12.54 15.5L12.72 15.41L12.89 15.33L13.07 15.24L13.25 15.15L13.42 15.06L13.59 14.96L13.76 14.86L13.9 14.77L14.04 14.69L14.17 14.6L14.3 14.51L14.43 14.42L14.56 14.33L14.69 14.24L14.82 14.15L14.94 14.06L15.06 13.97L15.19 13.88L15.31 13.79L15.43 13.7L15.55 13.61L15.66 13.52L15.78 13.42L15.9 13.33L16.01 13.24L16.12 13.15L16.23 13.05L16.34 12.96L16.45 12.87L16.56 12.78L16.67 12.68L16.77 12.59L16.88 12.5L16.98 12.41L17.08 12.31L17.18 12.22L17.28 12.13L17.38 12.04L17.48 11.95L17.57 11.86L17.67 11.76L17.76 11.67L17.85 11.58L17.95 11.49L18.04 11.4L18.12 11.32L18.21 11.22L18.31 11.12L18.41 11.02L18.51 10.92L18.6 10.81L18.7 10.71L18.79 10.6L18.88 10.49L18.97 10.39L19.05 10.28L19.11 10.21L19.5 10.57L19.82 11L20.06 11.48L20.21 11.99L20.26 12.53L20.21 13.07L20.06 13.58L19.82 14.06L19.5 14.49L19.1 14.85L18.64 15.14Z","style":"fill: var(--wp-mark, #163126)"}],["path",{"d":"M23.47 1.61L20.74 11.58L19.48 6.73L14.47 6.7Z","fill":"#ff5446","stroke":"#ff5446","stroke-width":0.53,"stroke-linejoin":"round"}]],
  chevron: [18, ["path", {"d": "M7 10l5 5 5-5", "fill": "none", "stroke": "currentColor", "stroke-width": "2", "stroke-linecap": "round", "stroke-linejoin": "round"}]],
  right: [18, ["path", {"d": "M10 7l5 5-5 5", "fill": "none", "stroke": "currentColor", "stroke-width": "2", "stroke-linecap": "round", "stroke-linejoin": "round"}]],
  pivot: [20, ["path", {"d": "M4 12a8 8 0 0 1 13.7-5.6M20 12a8 8 0 0 1-13.7 5.6M18 3v4h-4M6 21v-4h4", "fill": "none", "stroke": "currentColor", "stroke-width": "1.8", "stroke-linecap": "round", "stroke-linejoin": "round"}]],
  pause: [20, ["circle", {"cx": "12", "cy": "12", "r": "9", "fill": "none", "stroke": "currentColor", "stroke-width": "1.8"}], ["path", {"d": "M10 9v6M14 9v6", "stroke": "currentColor", "stroke-width": "1.8", "stroke-linecap": "round"}]],
  play: [20, ["circle", {"cx": "12", "cy": "12", "r": "9", "fill": "none", "stroke": "currentColor", "stroke-width": "1.8"}], ["path", {"d": "M10.5 8.8l4.5 3.2-4.5 3.2z", "fill": "currentColor"}]],
  save: [20, ["path", {"d": "M7 4h10v16l-5-3.5L7 20z", "fill": "none", "stroke": "currentColor", "stroke-width": "1.8", "stroke-linejoin": "round"}]],
  clock: [20, ["circle", {"cx": "12", "cy": "12", "r": "9", "fill": "none", "stroke": "currentColor", "stroke-width": "1.8"}], ["path", {"d": "M12 7v5l3 2", "fill": "none", "stroke": "currentColor", "stroke-width": "1.8", "stroke-linecap": "round"}]],
  end: [20, ["circle", {"cx": "12", "cy": "12", "r": "9", "fill": "none", "stroke": "currentColor", "stroke-width": "1.8"}], ["rect", {"x": "9", "y": "9", "width": "6", "height": "6", "rx": "1", "fill": "currentColor"}]],
  check2: [20, ["circle", {"cx": "12", "cy": "12", "r": "9", "fill": "none", "stroke": "currentColor", "stroke-width": "1.8"}], ["path", {"d": "M8 12.5l2.7 2.7L16 9.8", "fill": "none", "stroke": "currentColor", "stroke-width": "1.8", "stroke-linecap": "round", "stroke-linejoin": "round"}]],
  search: [20, ["circle", {"cx": "10.5", "cy": "10.5", "r": "6.5", "fill": "none", "stroke": "currentColor", "stroke-width": "1.8"}], ["path", {"d": "M15.5 15.5L20 20", "stroke": "currentColor", "stroke-width": "1.8", "stroke-linecap": "round"}]],
  check: [22, ["circle", {"cx": "12", "cy": "12", "r": "10", "fill": "currentColor"}], ["path", {"d": "M7.5 12.5l3 3 6-6.5", "fill": "none", "stroke": "#fff", "stroke-width": "2.2", "stroke-linecap": "round", "stroke-linejoin": "round"}]],
  avoid: [20, ["circle", {"cx": "12", "cy": "12", "r": "9", "fill": "none", "stroke": "currentColor", "stroke-width": "1.8"}], ["path", {"d": "M5.6 5.6l12.8 12.8", "stroke": "currentColor", "stroke-width": "1.8"}]],
  coffee: [20, ["path", {"d": "M5 9.5h11v4.5a4.5 4.5 0 0 1-4.5 4.5h-2A4.5 4.5 0 0 1 5 14z", "fill": "none", "stroke": "currentColor", "stroke-width": "1.8", "stroke-linejoin": "round"}], ["path", {"d": "M16 11h1.5a2.5 2.5 0 0 1 0 5H16", "fill": "none", "stroke": "currentColor", "stroke-width": "1.8"}], ["path", {"d": "M8.5 3.5c-.9 1 .9 2 0 3.2M11.5 3.5c-.9 1 .9 2 0 3.2", "fill": "none", "stroke": "currentColor", "stroke-width": "1.5", "stroke-linecap": "round"}]],
  calendar: [20, ["rect", {"x": "4", "y": "5.5", "width": "16", "height": "14.5", "rx": "2", "fill": "none", "stroke": "currentColor", "stroke-width": "1.8"}], ["path", {"d": "M4 10h16M8.5 3.5v4M15.5 3.5v4", "fill": "none", "stroke": "currentColor", "stroke-width": "1.8", "stroke-linecap": "round"}]],
  book: [20, ["path", {"d": "M12 6.5C10 5 7 4.8 4 5.5v13c3-.7 6-.5 8 1 2-1.5 5-1.7 8-1v-13c-3-.7-6-.5-8 1zM12 6.5v13", "fill": "none", "stroke": "currentColor", "stroke-width": "1.8", "stroke-linejoin": "round"}]],
  tool: [20, ["path", {"d": "M14.5 5.5a4 4 0 0 0 4.7 5.2l-8.9 8.9a2 2 0 0 1-2.9-2.9l8.9-8.9a4 4 0 0 0-1.8-2.3z", "fill": "none", "stroke": "currentColor", "stroke-width": "1.8", "stroke-linejoin": "round"}]],
  star: [20, ["path", {"d": "M12 4l2.4 5 5.4.6-4 3.7 1.1 5.4L12 16l-4.9 2.7 1.1-5.4-4-3.7 5.4-.6z", "fill": "none", "stroke": "currentColor", "stroke-width": "1.8", "stroke-linejoin": "round"}]],
  pin: [20, ["path", {"d": "M12 21s-6.5-6.2-6.5-11a6.5 6.5 0 0 1 13 0c0 4.8-6.5 11-6.5 11z", "fill": "none", "stroke": "currentColor", "stroke-width": "1.8", "stroke-linejoin": "round"}], ["circle", {"cx": "12", "cy": "10", "r": "2.3", "fill": "none", "stroke": "currentColor", "stroke-width": "1.8"}]],
  chart: [20, ["path", {"d": "M6 19V12M12 19V6M18 19v-9", "fill": "none", "stroke": "currentColor", "stroke-width": "2.4", "stroke-linecap": "round"}]],
  flask: [20, ["path", {"d": "M9.5 4h5M10.5 4v5.5L5.5 18a1.5 1.5 0 0 0 1.3 2h10.4a1.5 1.5 0 0 0 1.3-2l-5-8.5V4", "fill": "none", "stroke": "currentColor", "stroke-width": "1.8", "stroke-linejoin": "round"}]],
  ruler: [20, ["path", {"d": "M4 16.5L16.5 4l3.5 3.5L7.5 20zM8 12.5l1.8 1.8M11 9.5l1.8 1.8M14 6.5l1.8 1.8", "fill": "none", "stroke": "currentColor", "stroke-width": "1.8", "stroke-linejoin": "round", "stroke-linecap": "round"}]],
  globe: [20, ["circle", {"cx": "12", "cy": "12", "r": "8.5", "fill": "none", "stroke": "currentColor", "stroke-width": "1.8"}], ["path", {"d": "M3.5 12h17M12 3.5c2.5 2.6 2.5 14.4 0 17M12 3.5c-2.5 2.6-2.5 14.4 0 17", "fill": "none", "stroke": "currentColor", "stroke-width": "1.5"}]],
  ask: [20, ["path", {"d": "M5 5.5h14v9.5h-8l-4 3.5v-3.5H5z", "fill": "none", "stroke": "currentColor", "stroke-width": "1.8", "stroke-linejoin": "round"}]],
  close: [18, ["path", {"d": "M6 6l12 12M18 6L6 18", "stroke": "currentColor", "stroke-width": "2", "stroke-linecap": "round"}]]
};

function el(tag, attrs = {}, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === "class") n.className = v;
    else if (k.startsWith("on")) n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v === true ? "" : v);
  }
  for (const k of kids) if (k != null && k !== false) n.append(k);
  return n;
}
const SVG_NS = "http://www.w3.org/2000/svg";
function svgIcon(name) {
  const [size, ...parts] = ICON[name];
  const svg = document.createElementNS(SVG_NS, "svg");
  for (const [k, v] of Object.entries({ viewBox: "0 0 24 24", width: size, height: size, "aria-hidden": "true" })) svg.setAttribute(k, v);
  for (const [tag, attrs] of parts) {
    const n = document.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
    svg.append(n);
  }
  return svg;
}
const icon = name => el("span", { class: "wp-icon" }, svgIcon(name));
// The small "mark + name" line at the top of Aim's cards and dialogs.
const brandLine = () => el("div", { class: "wp-dialog-brand" }, icon("logo"), BRAND);

const fmtMin = sec => `${Math.max(0, Math.ceil(sec / 60))} min`;
// 24:36, or 1:02:05 past an hour.
function fmtClock(sec) {
  sec = Math.max(0, Math.round(sec));
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = String(sec % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
}

// The purpose in effect right now (a purpose waits, suspended, while you're on a break).
const activePurpose = () => (purpose && !purpose.suspended ? purpose : null);
// Seconds left, or null when there's no limit.
const purposeLeft = p => (p?.limitMin ? Math.max(0, p.limitMin * 60 - p.usedSec) : null);
const breakLeft = b => (b?.durationMin ? Math.max(0, b.durationMin * 60 - b.usedSec) : null);
// The video playing when a limit ran out may finish, within the grace period.
const graced = id => !!(stop && id && stop.videoId === id && Date.now() < stop.graceEndsAt);
const leisureUsedUp = () => status.leisureLeftMin !== null && status.leisureLeftMin < 1;

// During a purpose you watch what your searches for it found (see allow in store.js).
function isAllowed(id) {
  const p = activePurpose();
  if (!p || !id) return false;
  if (p.allowed?.some(v => v.id === id)) return true;
  const list = new URL(location.href).searchParams.get("list");
  return !!list && !!p.allowedLists?.includes(list);
}
// Mirror an allow locally right away, so a click on a result is never judged before the
// background has stored it.
function allowLocal(videos, lists, query) {
  const p = activePurpose();
  if (!p) return;
  p.allowed ||= [];
  p.allowedLists ||= [];
  for (const v of videos) {
    const old = p.allowed.find(x => x.id === v.id);
    if (old) { old.length ||= v.length; old.title ||= v.title; }
    else p.allowed.push({ ...v, q: query, at: Date.now() });
  }
  for (const l of lists) if (!p.allowedLists.includes(l)) p.allowedLists.push(l);
}

// Take in a status reply from the background (see getStatus in store.js).
function applyStatus(r) {
  if (!r) return;
  purpose = r.purpose || null;
  brk = r.brk || null;
  stop = r.stop || null;
  status = { today: r.today, leisureLeftMin: r.leisureLeftMin, totalReached: !!r.totalReached, recent: r.recent || status.recent,
    paused: r.paused || status.paused || [], pausedCount: r.pausedCount ?? status.pausedCount ?? 0,
    homeschool: "homeschool" in r ? r.homeschool : status.homeschool || null,
    onboarding: "onboarding" in r ? r.onboarding : status.onboarding || null,
    pathways: "pathways" in r ? r.pathways : status.pathways || null };
  if (r.settings) settings = { ...settings, ...r.settings };
  breakEndsAt = brk?.durationMin ? Date.now() + breakLeft(brk) * 1000 : 0;
}

const minLabel = m => (m >= 60 ? `${m / 60}h` : `${m}m`);
const BREAK_CHOICES = [15, 30, 60];
