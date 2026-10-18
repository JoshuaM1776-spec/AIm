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
  logo: [20,["path",{"d":"M4.86 22.24L4.85 22.22L4.74 22.09L4.63 21.95L4.51 21.81L4.4 21.66L4.29 21.51L4.17 21.34L4.06 21.16L3.95 20.97L3.84 20.77L3.74 20.55L3.64 20.32L3.56 20.06L3.49 19.79L3.43 19.51L3.4 19.23L3.38 18.99L3.38 18.78L3.39 18.58L3.41 18.37L3.43 18.17L3.46 17.98L3.5 17.79L3.55 17.6L3.59 17.42L3.65 17.25L3.71 17.07L3.77 16.91L3.83 16.74L3.9 16.58L3.98 16.42L4.06 16.26L4.14 16.11L4.22 15.96L4.3 15.82L4.39 15.67L4.48 15.53L4.57 15.39L4.67 15.26L4.76 15.13L4.86 14.99L4.96 14.87L5.06 14.74L5.17 14.61L5.27 14.49L5.38 14.37L5.48 14.25L5.59 14.14L5.7 14.03L5.81 13.92L5.93 13.81L6.04 13.7L6.16 13.6L6.27 13.49L6.39 13.39L6.52 13.29L6.67 13.17L6.83 13.04L6.99 12.93L7.16 12.83L7.32 12.73L7.48 12.64L7.64 12.55L7.8 12.47L7.96 12.39L8.12 12.32L8.28 12.25L8.44 12.18L8.59 12.12L8.75 12.06L8.9 12L9.06 11.94L9.21 11.88L9.36 11.83L9.51 11.78L9.66 11.73L9.81 11.68L9.95 11.63L10.09 11.59L10.23 11.54L10.37 11.49L10.5 11.45L10.63 11.41L10.76 11.36L10.89 11.32L11.01 11.28L11.13 11.24L11.24 11.2L11.34 11.16L11.45 11.12L11.55 11.09L11.64 11.05L11.72 11.01L11.8 10.98L11.88 10.95L11.95 10.91L12.04 10.86L12.13 10.82L12.23 10.77L12.32 10.72L12.41 10.67L12.5 10.62L12.59 10.57L12.67 10.52L12.76 10.47L12.84 10.42L12.92 10.38L13 10.33L13.08 10.28L13.17 10.23L13.24 10.18L13.32 10.13L13.4 10.08L13.47 10.03L13.55 9.98L13.63 9.93L13.7 9.88L13.78 9.83L13.85 9.77L13.93 9.72L14 9.67L14.08 9.62L14.15 9.56L14.22 9.51L14.3 9.45L14.37 9.4L14.44 9.34L14.52 9.28L14.59 9.22L14.67 9.16L14.74 9.1L14.82 9.04L14.9 8.98L14.97 8.92L15.05 8.85L15.1 8.81L4.66 3.59L4.21 3.41L3.74 3.31L3.25 3.29L2.77 3.35L2.31 3.5L1.88 3.71L1.49 4L1.15 4.35L0.88 4.75L0.68 5.2L0.56 5.66L0.52 6.15L0.52 19.78L0.56 20.26L0.68 20.73L0.88 21.17L1.15 21.57L1.49 21.93L1.88 22.21L2.31 22.43L2.77 22.58L3.25 22.64L3.74 22.62L4.21 22.52L4.66 22.34Z","style":"fill: var(--wp-mark, #1e3a32)"}],["path",{"d":"M10.01 19.66L9.98 19.63L9.86 19.51L9.74 19.4L9.63 19.29L9.52 19.19L9.41 19.09L9.31 19L9.21 18.91L9.11 18.82L9.02 18.75L8.94 18.67L8.87 18.6L8.79 18.54L8.73 18.47L8.67 18.42L8.62 18.37L8.58 18.33L8.55 18.3L8.52 18.28L8.51 18.27L8.5 18.27L8.5 18.28L8.51 18.31L8.52 18.35L8.53 18.41L8.55 18.49L8.56 18.58L8.57 18.67L8.57 18.71L8.56 18.72L8.55 18.73L8.55 18.73L8.54 18.72L8.53 18.72L8.53 18.7L8.53 18.68L8.53 18.65L8.53 18.62L8.53 18.59L8.54 18.55L8.55 18.51L8.56 18.46L8.57 18.41L8.59 18.36L8.61 18.3L8.63 18.25L8.65 18.19L8.68 18.13L8.71 18.06L8.74 18L8.78 17.93L8.81 17.86L8.85 17.79L8.89 17.73L8.94 17.66L8.98 17.59L9.03 17.52L9.08 17.45L9.13 17.38L9.18 17.31L9.23 17.24L9.28 17.18L9.34 17.11L9.39 17.04L9.45 16.98L9.51 16.92L9.56 16.86L9.61 16.8L9.64 16.77L9.67 16.74L9.7 16.71L9.74 16.67L9.79 16.63L9.85 16.59L9.92 16.54L9.99 16.49L10.06 16.44L10.15 16.39L10.24 16.34L10.33 16.29L10.43 16.24L10.54 16.18L10.65 16.13L10.76 16.08L10.88 16.02L11 15.97L11.12 15.91L11.25 15.86L11.38 15.8L11.51 15.74L11.64 15.69L11.78 15.63L11.91 15.57L12.05 15.51L12.19 15.45L12.33 15.39L12.48 15.32L12.62 15.26L12.76 15.19L12.91 15.13L13.05 15.06L13.2 14.99L13.34 14.91L13.49 14.83L13.63 14.76L13.78 14.67L13.92 14.58L14.06 14.5L14.18 14.42L14.29 14.35L14.4 14.27L14.5 14.2L14.61 14.13L14.71 14.05L14.81 13.98L14.91 13.91L15.01 13.83L15.11 13.76L15.2 13.68L15.3 13.61L15.39 13.53L15.49 13.46L15.58 13.39L15.67 13.31L15.76 13.23L15.85 13.16L15.94 13.08L16.03 13.01L16.11 12.93L16.2 12.85L16.28 12.78L16.37 12.7L16.45 12.62L16.54 12.55L16.62 12.47L16.7 12.39L16.78 12.31L16.86 12.23L16.94 12.15L17.02 12.07L17.1 11.99L17.18 11.91L17.26 11.83L17.33 11.75L17.41 11.67L17.49 11.58L17.57 11.5L17.65 11.41L17.74 11.32L17.83 11.22L17.92 11.12L18.01 11.02L18.09 10.92L18.18 10.81L18.27 10.71L18.36 10.6L18.44 10.5L18.74 10.68L19.13 11.04L19.45 11.46L19.68 11.93L19.83 12.44L19.87 12.96L19.83 13.49L19.68 14L19.45 14.47L19.13 14.89L18.74 15.25L18.29 15.52Z","style":"fill: var(--wp-mark, #1e3a32)"}],["path",{"d":"M23.48 1.36L20.62 11.1L19.48 6.31L14.56 6.19Z","fill":"#ff5446","stroke":"#ff5446","stroke-width":0.52,"stroke-linejoin":"round"}]],
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
