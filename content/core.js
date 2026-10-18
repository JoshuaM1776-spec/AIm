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
  // The mark (icons/mark-small.svg, written by tools/build-mark.mjs): the mountain follows the text
  // color, so it turns light in YouTube's dark theme; the north star stays coral.
  logo: [20,["path",{"d":"M2 23.33L7.88 23.33L7.88 23.33L7.86 23.3L7.84 23.26L7.81 23.21L7.77 23.15L7.72 23.09L7.67 23.03L7.61 22.96L7.54 22.88L7.47 22.81L7.4 22.73L7.32 22.65L7.24 22.56L7.16 22.47L7.07 22.38L6.98 22.29L6.89 22.2L6.8 22.11L6.7 22.01L6.61 21.91L6.51 21.81L6.42 21.71L6.32 21.61L6.22 21.5L6.13 21.39L6.03 21.29L5.94 21.17L5.84 21.06L5.75 20.95L5.66 20.83L5.57 20.7L5.48 20.58L5.4 20.45L5.32 20.31L5.24 20.17L5.16 20.02L5.09 19.87L5.03 19.71L4.97 19.53L4.93 19.36L4.9 19.21L4.88 19.07L4.87 18.92L4.86 18.78L4.85 18.64L4.85 18.5L4.86 18.37L4.87 18.23L4.89 18.1L4.91 17.97L4.94 17.84L4.96 17.71L5 17.58L5.04 17.46L5.07 17.34L5.12 17.22L5.16 17.1L5.21 16.98L5.26 16.87L5.32 16.75L5.38 16.64L5.43 16.54L5.5 16.43L5.56 16.32L5.63 16.22L5.69 16.12L5.76 16.02L5.83 15.92L5.9 15.82L5.98 15.72L6.05 15.63L6.13 15.54L6.21 15.44L6.29 15.35L6.37 15.26L6.45 15.17L6.53 15.09L6.62 15L6.7 14.92L6.79 14.83L6.9 14.73L7.02 14.63L7.14 14.53L7.26 14.44L7.39 14.36L7.51 14.28L7.64 14.2L7.77 14.13L7.9 14.05L8.03 13.98L8.16 13.92L8.29 13.85L8.43 13.79L8.56 13.72L8.7 13.66L8.83 13.6L8.96 13.54L9.1 13.48L9.23 13.43L9.36 13.37L9.49 13.31L9.62 13.26L9.75 13.2L9.88 13.15L10 13.1L10.12 13.04L10.24 12.99L10.36 12.94L10.47 12.88L10.57 12.83L10.68 12.78L10.78 12.73L10.87 12.68L10.96 12.63L11.04 12.58L11.12 12.53L11.19 12.49L11.25 12.44L11.31 12.4L11.36 12.36L11.42 12.31L11.47 12.27L11.52 12.22L11.56 12.17L11.6 12.12L11.65 12.07L11.69 12.02L11.72 11.97L11.76 11.92L11.8 11.86L11.83 11.81L11.86 11.75L11.89 11.7L11.92 11.64L11.95 11.58L11.98 11.52L12.01 11.46L12.04 11.39L12.06 11.33L12.09 11.26L12.11 11.2L12.14 11.13L12.17 11.05L12.19 10.98L12.22 10.91L12.24 10.84L12.27 10.76L12.29 10.68L12.32 10.6L12.34 10.53L12.37 10.45L12.4 10.37L12.43 10.28L12.46 10.2L12.5 10.12L12.53 10.04L12.57 9.95L12.61 9.87L12.65 9.78L12.69 9.7L12.73 9.63L12.77 9.55L12.81 9.48L12.85 9.41L12.89 9.33L12.93 9.26L12.97 9.18L13.02 9.11L13.06 9.03L13.1 8.95L13.15 8.88L13.15 8.88L12 6.67Z","fill":"currentColor"}],["path",{"d":"M11.92 23.33L11.9 23.3L11.87 23.23L11.84 23.16L11.81 23.08L11.78 23.01L11.74 22.93L11.7 22.85L11.67 22.77L11.63 22.68L11.58 22.6L11.54 22.51L11.5 22.43L11.45 22.34L11.4 22.25L11.35 22.16L11.3 22.06L11.24 21.97L11.18 21.88L11.12 21.79L11.06 21.69L10.99 21.6L10.92 21.5L10.85 21.41L10.77 21.31L10.68 21.19L10.58 21.08L10.48 20.97L10.38 20.87L10.28 20.77L10.18 20.68L10.08 20.59L9.98 20.5L9.88 20.42L9.77 20.33L9.67 20.25L9.57 20.17L9.46 20.09L9.36 20.01L9.26 19.93L9.16 19.85L9.06 19.77L8.96 19.7L8.86 19.62L8.77 19.55L8.67 19.47L8.58 19.4L8.49 19.33L8.41 19.26L8.33 19.19L8.25 19.13L8.18 19.06L8.11 19L8.05 18.94L7.99 18.89L7.94 18.84L7.89 18.79L7.85 18.74L7.82 18.7L7.79 18.67L7.77 18.65L7.75 18.63L7.74 18.63L7.74 18.63L7.74 18.64L7.73 18.62L7.72 18.6L7.71 18.57L7.7 18.54L7.69 18.51L7.68 18.48L7.68 18.45L7.67 18.41L7.67 18.38L7.67 18.34L7.67 18.29L7.67 18.25L7.68 18.2L7.68 18.16L7.69 18.1L7.7 18.05L7.71 18L7.73 17.94L7.74 17.89L7.76 17.83L7.79 17.77L7.81 17.71L7.83 17.64L7.86 17.58L7.89 17.52L7.92 17.45L7.95 17.38L7.99 17.32L8.02 17.25L8.06 17.18L8.11 17.11L8.15 17.05L8.19 16.98L8.24 16.91L8.29 16.84L8.33 16.77L8.38 16.7L8.44 16.63L8.49 16.56L8.54 16.5L8.58 16.45L8.62 16.41L8.66 16.36L8.72 16.3L8.78 16.25L8.85 16.19L8.93 16.13L9.01 16.07L9.1 16L9.19 15.94L9.29 15.87L9.39 15.81L9.49 15.74L9.6 15.67L9.71 15.6L9.83 15.53L9.94 15.46L10.06 15.39L10.18 15.32L10.3 15.25L10.43 15.18L10.55 15.11L10.68 15.04L10.8 14.97L10.92 14.89L11.05 14.82L11.17 14.74L11.3 14.67L11.42 14.59L11.54 14.52L11.66 14.44L11.78 14.36L11.89 14.28L12.01 14.19L12.12 14.11L12.23 14.02L12.33 13.93L12.44 13.84L12.54 13.74L12.63 13.64L12.72 13.54L12.8 13.45L12.88 13.35L12.95 13.25L13.02 13.16L13.08 13.06L13.14 12.96L13.19 12.86L13.24 12.76L13.29 12.66L13.34 12.57L13.38 12.47L13.42 12.38L13.45 12.28L13.48 12.19L13.52 12.1L13.54 12L13.57 11.91L13.59 11.82L13.62 11.74L13.64 11.65L13.66 11.57L13.68 11.48L13.7 11.4L13.71 11.32L13.73 11.24L13.75 11.16L13.76 11.09L13.78 11.02L13.79 10.94L13.81 10.87L13.83 10.8L13.84 10.73L13.86 10.67L13.88 10.6L13.9 10.54L13.91 10.48L13.93 10.42L13.94 10.4L20.67 23.33Z","fill":"currentColor"}],["path",{"d":"M18.67 -0.08L19.17 3.17L21.04 3.67L19.17 4.17L18.67 6.67L18.17 4.17L16.29 3.67L18.17 3.17Z","fill":"#ff5446"}],["path",{"d":"M20.04 2.29L19.16 3.6L18.74 3.17Z","fill":"#ff5446"}],["path",{"d":"M20.04 5.04L18.74 4.16L19.16 3.74Z","fill":"#ff5446"}],["path",{"d":"M17.29 5.04L18.17 3.74L18.6 4.16Z","fill":"#ff5446"}],["path",{"d":"M17.29 2.29L18.6 3.17L18.17 3.6Z","fill":"#ff5446"}]],
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
