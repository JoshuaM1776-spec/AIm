// Aim — shared state and helpers for the youtube.com scripts.
// The content/*.js files load in order (see manifest.json) and share one scope in the
// extension's isolated world, which the page itself can't see.

// ---------------- state ----------------
let session = null;          // current Focus/Explore session (from storage)
let settings = { recMode: "mark", hasKey: false, homeCard: true, hold: false, reminderMin: 0, avoid: {} };
let currentId = null;        // video on screen
let currentInfo = null;
let notNow = false;          // "Not now" on the start prompt: don't ask again in this tab
let holding = false;         // keep the video paused until cleared
const cleared = new Set();   // videos cleared to play in this tab
const overridden = new Set();// videos from a hidden/warned channel you chose to watch anyway
let timeUpShown = false;
let modal = null, notice = null, dropdown = null;
let endingHere = false;      // this tab ended the session (vs. the popup or another tab)
let alive = true;            // false once the extension is reloaded or updated under this tab

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
  hideObserver.disconnect();
  holding = false;
  early.done();
  early.showFeed();
  for (const n of $$("#wp-chip, #wp-home, #wp-results-bar, .wp-notice, .wp-scrim, .wp-dropdown")) n.remove();
  document.documentElement.classList.remove("wp-home");
}

// Icons are built with DOM calls rather than HTML strings, so YouTube's Trusted Types
// policy can't block them. Each entry: [size, [tag, attributes], ...].
const ICON = {
  // The Aim mark: rings follow the text color (so they turn light in YouTube's dark theme), the play button and dart stay red.
  logo: [20, ["path", {"d": "M19.26 8.93A9.26 9.26 0 1 1 14.57 4.24", "fill": "none", "stroke": "currentColor", "stroke-width": "2.6"}], ["path", {"d": "M15.43 10.44A5.15 5.15 0 1 1 13.53 8.33", "fill": "none", "stroke": "currentColor", "stroke-width": "2"}], ["path", {"d": "M8.91 10.49L13.34 12.7L8.91 15.23Z", "fill": "#f2131f", "stroke": "#f2131f", "stroke-width": "0.7", "stroke-linejoin": "round"}], ["path", {"d": "M13.65 9.86L17.29 6.23", "stroke": "#e00d1b", "stroke-width": "1.1"}], ["path", {"d": "M16.34 5.12L19.66 1.17Q20.6 .85 20.67 1.49L20.67 4.01L23.61 4.01Q23.92 4.49 23.45 4.96L21.08 6.86Q20.45 7.33 19.66 7.33L17.44 7.33L16.5 6.86Z", "fill": "#f2131f"}]],
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

const fmtMin = sec => `${Math.max(0, Math.ceil(sec / 60))} min`;
const remaining = s => (s ? Math.max(0, s.budgetMin * 60 - s.usedSec) : 0);

const minLabel = m => (m >= 60 ? `${m / 60}h` : `${m}m`);
