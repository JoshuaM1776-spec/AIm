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
  logo: [20,["path",{"d":"M15.1 9.77L15.16 9.73L15.2 9.7L15.23 9.66L15.24 9.63L15.23 9.59L15.2 9.56L15.16 9.52L15.1 9.49L3.74 3.81L3.38 3.66L3 3.58L2.61 3.57L2.23 3.62L1.85 3.73L1.51 3.91L1.19 4.14L0.92 4.42L0.71 4.74L0.55 5.1L0.45 5.47L0.42 5.86L0.42 18.43L0.44 18.73L0.49 19.02L0.59 19.31L0.72 19.58L0.89 19.83L1.09 20.05L1.32 20.25L1.56 20.41L1.8 20.47L2.01 20.48L2.2 20.45L2.36 20.39L2.5 20.28L2.62 20.12L2.72 19.93L2.79 19.7L2.8 19.63L2.81 19.55L2.83 19.46L2.84 19.38L2.86 19.3L2.87 19.21L2.89 19.12L2.91 19.04L2.92 18.95L2.94 18.86L2.96 18.77L2.98 18.68L3 18.59L3.02 18.5L3.05 18.41L3.07 18.31L3.1 18.22L3.13 18.13L3.15 18.03L3.19 17.94L3.22 17.84L3.25 17.75L3.29 17.65L3.33 17.56L3.37 17.48L3.4 17.4L3.44 17.32L3.48 17.24L3.52 17.16L3.56 17.09L3.6 17.01L3.64 16.93L3.68 16.86L3.72 16.78L3.77 16.7L3.81 16.63L3.85 16.56L3.9 16.48L3.95 16.41L3.99 16.34L4.04 16.26L4.09 16.19L4.14 16.12L4.19 16.05L4.25 15.98L4.3 15.91L4.35 15.84L4.41 15.77L4.47 15.7L4.53 15.63L4.59 15.57L4.65 15.5L4.71 15.43L4.77 15.37L4.83 15.3L4.9 15.24L4.96 15.17L5.03 15.11L5.1 15.05L5.17 14.98L5.24 14.92L5.31 14.86L5.38 14.8L5.45 14.74L5.53 14.68L5.62 14.61L5.7 14.55L5.79 14.48L5.88 14.42L5.96 14.36L6.05 14.31L6.14 14.25L6.23 14.19L6.32 14.14L6.41 14.08L6.5 14.03L6.6 13.98L6.69 13.92L6.78 13.87L6.87 13.82L6.97 13.77L7.06 13.72L7.15 13.68L7.25 13.63L7.34 13.58L7.44 13.53L7.53 13.48L7.62 13.44L7.72 13.39L7.81 13.35L7.9 13.3L7.99 13.26L8.08 13.21L8.17 13.17L8.26 13.12L8.35 13.08L8.44 13.04L8.53 12.99L8.61 12.95L8.7 12.91L8.78 12.87L8.86 12.83L8.94 12.78L9.02 12.74L9.11 12.7L9.2 12.65L9.28 12.61L9.37 12.57L9.45 12.52L9.54 12.48L9.63 12.44L9.71 12.39L9.8 12.35L9.88 12.31L9.97 12.26L10.05 12.22L10.14 12.18L10.22 12.14L10.31 12.1L10.39 12.06L10.48 12.01L10.56 11.97L10.65 11.93L10.73 11.89L10.82 11.85L10.9 11.81L10.99 11.77L11.07 11.73L11.15 11.69L11.24 11.65L11.32 11.61L11.41 11.57L11.49 11.53L11.57 11.49L11.66 11.45L11.74 11.41L11.82 11.37L11.91 11.33L11.99 11.29L12.07 11.25L12.15 11.21L12.24 11.17L12.32 11.13L12.4 11.09L12.49 11.05L12.57 11L12.65 10.96L12.74 10.92L12.82 10.88L12.91 10.84L13 10.79L13.08 10.75L13.17 10.71L13.25 10.67L13.34 10.63L13.42 10.59L13.51 10.54L13.59 10.5L13.68 10.46L13.76 10.42L13.85 10.38L13.93 10.34L14.02 10.29L14.11 10.25L14.19 10.21L14.27 10.17L14.36 10.13L14.44 10.09L14.53 10.04L14.61 10L14.7 9.96L14.78 9.92L14.86 9.88L14.95 9.84L15.03 9.8Z","style":"fill: var(--wp-mark, #193d31)"}],["path",{"d":"M7.78 16.2L7.85 16.16L7.93 16.11L8 16.07L8.08 16.02L8.16 15.98L8.24 15.94L8.33 15.89L8.41 15.85L8.49 15.8L8.58 15.76L8.66 15.71L8.75 15.67L8.84 15.62L8.93 15.58L9.02 15.53L9.1 15.49L9.19 15.44L9.28 15.4L9.37 15.35L9.47 15.3L9.55 15.26L9.64 15.21L9.73 15.17L9.83 15.12L9.92 15.07L10.01 15.02L10.1 14.98L10.18 14.93L10.26 14.89L10.34 14.84L10.43 14.8L10.51 14.76L10.59 14.71L10.67 14.67L10.75 14.63L10.83 14.59L10.91 14.54L10.99 14.5L11.07 14.46L11.16 14.42L11.24 14.38L11.32 14.34L11.4 14.29L11.48 14.25L11.57 14.21L11.65 14.17L11.73 14.13L11.81 14.08L11.89 14.04L11.98 14L12.06 13.96L12.14 13.92L12.23 13.88L12.31 13.84L12.39 13.79L12.48 13.75L12.56 13.71L12.64 13.67L12.73 13.63L12.81 13.59L12.89 13.54L12.98 13.5L13.06 13.46L13.15 13.42L13.23 13.38L13.31 13.33L13.4 13.29L13.48 13.25L13.57 13.2L13.65 13.16L13.73 13.12L13.82 13.08L13.9 13.03L13.99 12.99L14.07 12.95L14.16 12.9L14.24 12.86L14.32 12.82L14.41 12.77L14.49 12.73L14.58 12.69L14.66 12.64L14.75 12.6L14.83 12.56L14.92 12.52L15 12.47L15.09 12.43L15.17 12.39L15.26 12.34L15.34 12.3L15.42 12.26L15.51 12.21L15.59 12.17L15.68 12.13L15.76 12.09L15.84 12.04L15.93 12L16.01 11.96L16.09 11.92L16.17 11.88L16.25 11.83L16.33 11.79L16.41 11.75L16.49 11.71L16.57 11.67L16.65 11.63L16.73 11.59L16.81 11.55L16.89 11.51L16.97 11.47L17.05 11.43L17.13 11.39L17.21 11.34L17.3 11.3L17.38 11.26L17.46 11.22L17.55 11.17L17.64 11.13L17.72 11.09L17.8 11.04L17.8 11.04L18.3 10.87L18.83 10.83L19.34 10.93L19.82 11.16L20.21 11.51L20.51 11.94L20.68 12.44L20.72 12.96L20.62 13.48L20.39 13.95L20.04 14.35L19.61 14.65L19.61 14.65L19.52 14.69L19.44 14.74L19.35 14.78L19.27 14.83L19.19 14.87L19.11 14.92L19.02 14.96L18.94 15.01L18.86 15.05L18.78 15.09L18.7 15.13L18.62 15.18L18.55 15.22L18.47 15.26L18.39 15.3L18.31 15.35L18.23 15.39L18.15 15.43L18.07 15.48L17.99 15.52L17.91 15.56L17.83 15.61L17.75 15.65L17.67 15.69L17.59 15.74L17.5 15.78L17.42 15.83L17.34 15.87L17.26 15.92L17.17 15.96L17.09 16.01L17.01 16.05L16.92 16.1L16.84 16.14L16.75 16.19L16.67 16.23L16.59 16.28L16.5 16.32L16.42 16.37L16.34 16.41L16.25 16.46L16.17 16.5L16.08 16.55L16 16.6L15.92 16.64L15.83 16.69L15.75 16.73L15.67 16.78L15.58 16.82L15.5 16.87L15.42 16.91L15.34 16.96L15.25 17L15.16 17.05L15.07 17.1L14.99 17.14L14.9 17.19L14.82 17.23L14.73 17.28L14.65 17.32L14.56 17.37L14.48 17.41L14.39 17.46L14.31 17.5L14.23 17.54L14.15 17.59L14.06 17.63L13.98 17.67L13.9 17.72L13.82 17.76L13.74 17.8L13.66 17.84L13.58 17.89L13.51 17.93L13.43 17.97L13.35 18.01L13.27 18.05L13.2 18.1L13.12 18.14L13.05 18.18L12.97 18.22L12.89 18.26L12.82 18.3L12.75 18.34L12.67 18.38L12.6 18.42L12.53 18.46L12.45 18.51L12.38 18.55L12.31 18.59L12.24 18.63L12.16 18.67L12.06 18.73L11.96 18.79L11.86 18.84L11.76 18.9L11.65 18.95L11.56 19.01L11.46 19.06L11.37 19.11L11.27 19.16L11.18 19.21L11.09 19.25L11.01 19.3L10.92 19.35L10.84 19.39L10.76 19.44L10.68 19.48L10.6 19.52L10.53 19.56L10.46 19.6L10.39 19.64L10.32 19.68L10.26 19.72L10.2 19.75L10.15 19.78L10.09 19.82L10.04 19.85L10 19.88L9.96 19.91L9.96 19.91L9.44 20.12L8.88 20.2L8.33 20.13L7.81 19.92L7.36 19.58L7.02 19.14L6.8 18.62L6.72 18.07L6.79 17.51L7 16.99L7.34 16.54L7.78 16.2Z","style":"fill: var(--wp-mark, #193d31)"}],["path",{"d":"M23.58 3.52L19.67 11.28L19.16 7.13L15.19 5.78Z","fill":"#ff5446","stroke":"#ff5446","stroke-width":0.42,"stroke-linejoin":"round"}]],
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
