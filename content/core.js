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
  if (sender.id !== chrome.runtime.id) return;
  // The popup's session tools, on the YouTube tab you're on.
  if (msg?.type === "tab-talk") { openTalk(); reply({ ok: true }); return; }
  if (msg?.type === "tab-save") { if (!currentId || !currentInfo) return reply({ ok: false }); saveCurrent(false).then(() => reply({ ok: true })); return true; }
  if (msg?.type !== "go" || !/^https:\/\/www\.youtube\.com\//.test(msg.url || "")) return;
  // Same page, new #: YouTube won't reload for it, so act on it here (Explore from the popup).
  if (location.pathname === "/" && msg.url === "https://www.youtube.com/#aim-explore") { exploreOpen = true; renderHome(); reply({ ok: true }); return; }
  location.href = msg.url;
  reply({ ok: true });
});

// Icons are built with DOM calls rather than HTML strings, so YouTube's Trusted Types
// policy can't block them. Each entry: [size, [tag, attributes], ...].
const ICON = {
  // The mark (traced from the approved artwork; written by tools/build-mark.mjs): forest green, light in
  // YouTube's dark theme (--wp-mark); the arrowhead stays coral.
  logo: [20,["path",{"d":"M3.12 22.32C2.88 22.29 2.42 22.19 2.31 22.13C2.25 22.1 2.17 22.06 2.12 22.05C2.08 22.03 1.99 21.99 1.93 21.95C1.5 21.66 1.47 21.64 1.26 21.41C0.93 21.08 0.78 20.84 0.61 20.43C0.55 20.27 0.41 19.8 0.37 19.57C0.34 19.42 0.33 18.71 0.34 12.18C0.34 7.57 0.35 4.89 0.36 4.79C0.4 4.46 0.6 3.92 0.8 3.59C1.27 2.82 2.08 2.32 3.03 2.22C3.22 2.2 3.77 2.23 3.91 2.26C4.29 2.36 4.81 2.55 4.95 2.65C5.01 2.68 5.18 2.78 5.56 2.98C5.69 3.04 5.91 3.16 6.04 3.24C6.18 3.32 6.38 3.42 6.49 3.48C6.59 3.53 6.72 3.61 6.77 3.64C6.82 3.67 7.03 3.78 7.24 3.88C7.45 3.99 7.71 4.13 7.83 4.2C7.95 4.26 8.17 4.38 8.32 4.46C8.47 4.54 8.64 4.64 8.7 4.67C8.76 4.71 8.99 4.83 9.21 4.93C9.42 5.04 9.61 5.14 9.62 5.15C9.63 5.16 9.75 5.22 9.89 5.29C10.03 5.36 10.18 5.44 10.22 5.46C10.26 5.49 10.43 5.58 10.59 5.66C11.26 6.01 11.44 6.1 11.49 6.14C11.52 6.16 11.59 6.2 11.65 6.23C11.71 6.25 11.84 6.32 11.94 6.37C12.04 6.43 12.26 6.54 12.42 6.63C12.59 6.71 12.75 6.79 12.78 6.81C12.8 6.83 12.87 6.86 12.93 6.89C13.04 6.95 13.28 7.06 13.61 7.24C13.75 7.31 13.95 7.42 14.06 7.48C14.31 7.61 14.52 7.73 14.71 7.84C14.79 7.89 14.91 7.95 14.97 7.98C15.03 8.01 15.12 8.06 15.17 8.09C15.21 8.12 15.29 8.16 15.33 8.18C15.38 8.2 15.45 8.23 15.48 8.25C15.5 8.27 15.58 8.31 15.63 8.33C15.82 8.41 15.83 8.49 15.66 8.83C15.55 9.06 15.53 9.09 15.27 9.34C15.12 9.49 14.97 9.64 14.93 9.67C14.69 9.88 14.64 9.92 14.34 10.12C14.09 10.29 13.94 10.39 13.87 10.42C13.83 10.44 13.76 10.48 13.73 10.5C13.69 10.53 13.61 10.57 13.56 10.59C13.5 10.62 13.43 10.65 13.4 10.67C13.37 10.7 13.3 10.74 13.23 10.77C13.16 10.8 13.09 10.84 13.06 10.86C12.96 10.92 12.63 11.07 12.61 11.07C12.59 11.07 12.51 11.11 12.42 11.15C12.22 11.25 11.92 11.39 11.85 11.41C11.82 11.41 11.75 11.44 11.7 11.48C11.64 11.51 11.55 11.55 11.49 11.57C11.43 11.59 11.33 11.63 11.26 11.66C11.2 11.69 11.1 11.73 11.04 11.75C10.98 11.77 10.89 11.81 10.84 11.83C10.79 11.86 10.71 11.88 10.67 11.89C10.62 11.9 10.53 11.93 10.46 11.96C10.39 11.99 10.2 12.07 10.03 12.13C9.87 12.19 9.68 12.27 9.6 12.3C9.27 12.44 9.19 12.47 9.05 12.52C8.96 12.55 8.86 12.59 8.83 12.61C8.75 12.66 8.55 12.74 8.29 12.84C8.19 12.88 8.09 12.93 8.06 12.94C8.04 12.96 7.96 12.99 7.88 13.02C7.57 13.14 6.83 13.54 6.46 13.79C5.97 14.13 5.47 14.59 5.11 15.04C4.99 15.2 4.71 15.65 4.63 15.81C4.45 16.18 4.39 16.31 4.35 16.45C4.33 16.52 4.29 16.65 4.27 16.73C4.23 16.85 4.17 17.23 4.11 17.68C4.07 17.96 4.08 18.45 4.14 18.78C4.22 19.3 4.25 19.42 4.29 19.5C4.31 19.54 4.34 19.63 4.36 19.69C4.41 19.87 4.7 20.44 4.81 20.58C4.83 20.61 4.85 20.65 4.85 20.66C4.85 20.67 4.89 20.72 4.93 20.78C4.97 20.84 5.02 20.9 5.04 20.92C5.11 21.03 5.32 21.27 5.43 21.39C5.55 21.5 5.56 21.52 5.56 21.58C5.55 21.64 5.54 21.65 5.42 21.69C5.36 21.72 5.26 21.76 5.22 21.79C5.18 21.82 5.09 21.86 5.03 21.88C4.97 21.9 4.9 21.94 4.87 21.96C4.82 22 4.66 22.07 4.34 22.18C4.28 22.2 4.22 22.22 4.2 22.22C4.18 22.22 4.06 22.25 3.94 22.27C3.69 22.33 3.35 22.35 3.12 22.32ZM9.82 19.18C9.4 19.13 9.09 19.01 8.68 18.74C8.53 18.64 8.3 18.4 8.21 18.27C8.09 18.08 8.01 17.79 8.01 17.56C8.01 17.22 8.15 16.84 8.36 16.55C8.59 16.24 8.85 16.04 9.34 15.78C9.48 15.71 9.73 15.57 9.89 15.48C10.2 15.29 10.27 15.26 10.44 15.24C10.59 15.22 10.79 15.16 10.92 15.1C11.5 14.83 11.76 14.71 11.88 14.66C11.96 14.63 12.09 14.57 12.18 14.53C12.62 14.33 12.69 14.29 12.76 14.26C12.79 14.24 13.01 14.13 13.23 14.02C13.81 13.72 14.28 13.46 14.69 13.2C14.78 13.15 14.88 13.09 14.92 13.07C14.97 13.04 15.04 13 15.08 12.97C15.17 12.91 15.29 12.82 15.45 12.72C15.58 12.64 16 12.33 16.39 12.03C16.75 11.75 16.99 11.54 17.54 10.98C18.06 10.45 18.2 10.28 18.4 9.97C18.52 9.79 18.64 9.75 18.75 9.84C18.78 9.87 18.85 9.91 18.92 9.94C19.27 10.1 19.49 10.29 19.68 10.59C19.9 10.93 19.95 11.04 19.98 11.21C20.02 11.43 20.07 11.59 20.13 11.7C20.18 11.78 20.18 11.79 20.16 11.91C20.14 11.99 20.14 12.13 20.15 12.32C20.17 12.79 20.1 13.1 19.84 13.73C19.65 14.16 19.18 14.76 18.74 15.11C18.53 15.27 18.17 15.5 17.95 15.59C17.83 15.64 17.67 15.72 17.59 15.77C17.51 15.81 17.34 15.89 17.22 15.94C17.1 15.99 16.96 16.06 16.92 16.08C16.88 16.11 16.78 16.15 16.71 16.18C16.63 16.21 16.25 16.4 15.86 16.59C15.47 16.79 15.02 17 14.87 17.07C14.61 17.19 13.69 17.64 13.58 17.69C13.39 17.79 13.28 17.85 12.96 18C12.9 18.02 12.82 18.06 12.78 18.09C12.62 18.18 12.09 18.43 11.98 18.47C11.91 18.5 11.84 18.53 11.81 18.55C11.78 18.57 11.71 18.61 11.65 18.63C11.6 18.65 11.52 18.69 11.48 18.72C11.45 18.75 11.37 18.79 11.3 18.81C11.24 18.82 11.17 18.86 11.14 18.88C11.11 18.9 11.04 18.93 10.98 18.95C10.92 18.97 10.82 19.01 10.76 19.05C10.5 19.18 10.2 19.22 9.82 19.18Z","fill-rule":"evenodd","style":"fill: var(--wp-mark, #193d31)"}],["path",{"d":"M4.98 15.23C5.31 14.75 5.89 14.18 6.46 13.79C6.83 13.54 7.57 13.14 7.88 13.02C7.96 12.99 8.04 12.96 8.06 12.94C8.09 12.93 8.19 12.88 8.29 12.84C8.55 12.74 8.75 12.66 8.83 12.61C8.86 12.59 8.96 12.55 9.05 12.52C9.19 12.47 9.27 12.44 9.6 12.3C9.68 12.27 9.87 12.19 10.03 12.13C10.2 12.07 10.39 11.99 10.46 11.96C10.53 11.93 10.61 11.9 10.63 11.9C10.65 11.9 10.63 11.91 10.59 11.93C10.55 11.94 10.48 11.97 10.44 11.99C10.41 12.01 10.32 12.04 10.25 12.07C10.18 12.1 10.02 12.16 9.89 12.21C9.77 12.26 9.57 12.34 9.45 12.38C9.34 12.43 9.23 12.47 9.22 12.48C9.21 12.49 9.14 12.52 9.06 12.54C8.99 12.57 8.89 12.6 8.84 12.63C8.75 12.67 8.57 12.75 8.33 12.85C8.25 12.88 8.12 12.94 8.05 12.98C7.97 13.01 7.89 13.05 7.86 13.06C7.76 13.09 7.1 13.42 6.9 13.54C6.36 13.86 5.82 14.28 5.48 14.64C5.33 14.8 5.08 15.11 5.02 15.21C4.99 15.25 4.96 15.29 4.94 15.31C4.93 15.32 4.95 15.29 4.98 15.23ZM0.32 9.89C0.32 6.64 0.33 4.89 0.34 4.78C0.36 4.61 0.52 4.06 0.56 4.01C0.57 3.99 0.61 3.92 0.64 3.85C0.77 3.55 1.15 3.04 1.38 2.88C1.41 2.86 1.36 2.92 1.26 3.02C0.97 3.3 0.8 3.55 0.63 3.91C0.55 4.08 0.5 4.23 0.38 4.61C0.35 4.73 0.35 5 0.34 9.78L0.33 14.83L0.32 9.89ZM19.31 14.54C19.54 14.27 19.74 13.94 19.84 13.73C20.1 13.1 20.17 12.79 20.15 12.32C20.14 12.13 20.14 11.99 20.16 11.91C20.18 11.79 20.18 11.78 20.13 11.7C20.07 11.59 20.02 11.43 19.98 11.21C19.95 11.04 19.9 10.93 19.68 10.59C19.49 10.29 19.27 10.1 18.92 9.94C18.85 9.91 18.78 9.87 18.75 9.84C18.64 9.75 18.52 9.79 18.4 9.97C18.2 10.28 18.06 10.45 17.54 10.98C17.04 11.48 16.75 11.75 16.48 11.96L16.39 12.03L16.47 11.96C16.51 11.92 16.6 11.84 16.67 11.79C16.83 11.67 17.95 10.55 18.09 10.38C18.19 10.26 18.34 10.04 18.43 9.91C18.52 9.76 18.66 9.73 18.78 9.84C18.82 9.87 18.88 9.9 18.93 9.92C19.16 10.01 19.44 10.23 19.62 10.46C19.69 10.56 19.79 10.68 19.84 10.73C19.93 10.82 19.94 10.82 19.96 10.78C20 10.74 19.99 10.68 19.91 10.45C19.88 10.36 19.85 10.24 19.84 10.18C19.83 10.12 19.82 10.02 19.8 9.94C19.79 9.87 19.76 9.69 19.73 9.53C19.71 9.38 19.68 9.2 19.66 9.14C19.64 9.08 19.61 8.92 19.59 8.79C19.57 8.66 19.54 8.5 19.52 8.45C19.51 8.39 19.47 8.25 19.45 8.14C19.42 8.03 19.39 7.9 19.38 7.85C19.36 7.8 19.33 7.65 19.31 7.52C19.26 7.21 19.21 7 19.17 6.94C19.12 6.83 19.19 6.83 16.86 6.83C14.46 6.83 14.62 6.84 14.71 6.69C14.74 6.64 14.8 6.6 14.9 6.55C15.18 6.41 15.27 6.36 15.9 5.97C16.03 5.89 16.15 5.81 16.35 5.68C16.41 5.65 16.61 5.53 16.81 5.42C17 5.31 17.22 5.18 17.29 5.14C17.36 5.09 17.49 5.02 17.57 4.98C17.79 4.87 18.5 4.46 18.96 4.18C19.06 4.12 19.21 4.03 19.29 3.98C19.38 3.94 19.49 3.87 19.53 3.85C19.7 3.74 20.31 3.41 20.74 3.19C21.28 2.91 21.69 2.68 21.92 2.53C22.02 2.47 22.14 2.4 22.19 2.37C22.25 2.35 22.36 2.28 22.46 2.22C22.71 2.05 23.33 1.73 23.49 1.68C23.53 1.67 23.58 1.66 23.6 1.67C23.69 1.7 23.7 1.93 23.63 2.08C23.59 2.15 23.47 2.53 23.37 2.86C23.35 2.93 23.31 3.05 23.28 3.13C23.15 3.46 23.06 3.73 23.05 3.8C23.04 3.84 23.01 3.93 22.97 4.02C22.91 4.16 22.82 4.42 22.7 4.85C22.59 5.22 22.55 5.33 22.49 5.5C22.45 5.6 22.41 5.71 22.4 5.75C22.39 5.79 22.37 5.86 22.34 5.91C22.31 5.97 22.24 6.18 22.17 6.39C22.1 6.6 22.02 6.84 21.99 6.93C21.96 7.02 21.89 7.24 21.83 7.43C21.77 7.61 21.7 7.79 21.68 7.83C21.65 7.9 21.51 8.27 21.27 8.96C21.23 9.06 21.18 9.22 21.16 9.3C21.1 9.55 20.78 10.47 20.7 10.66C20.59 10.91 20.53 11.05 20.48 11.22C20.41 11.41 20.28 11.76 20.22 11.91C20.18 11.99 20.17 12.04 20.17 12.33C20.17 12.5 20.17 12.71 20.15 12.79C20.12 13.02 19.98 13.48 19.9 13.63C19.87 13.68 19.83 13.78 19.8 13.83C19.7 14.05 19.48 14.37 19.32 14.55L19.22 14.65L19.31 14.54ZM13.38 10.69C13.42 10.66 13.51 10.61 13.56 10.59C13.61 10.57 13.69 10.53 13.73 10.5C13.76 10.48 13.83 10.44 13.87 10.42C13.94 10.39 14.09 10.29 14.34 10.12C14.64 9.92 14.69 9.88 14.93 9.67C14.97 9.64 15.12 9.49 15.27 9.34C15.53 9.09 15.55 9.06 15.66 8.83C15.83 8.49 15.82 8.41 15.63 8.33C15.58 8.31 15.5 8.27 15.48 8.25C15.45 8.23 15.38 8.2 15.33 8.18C15.24 8.14 15.03 8.01 15.07 8.01C15.08 8.01 15.12 8.04 15.17 8.07C15.21 8.1 15.29 8.14 15.34 8.16C15.39 8.18 15.46 8.21 15.5 8.24C15.54 8.26 15.62 8.3 15.67 8.33C15.79 8.38 15.83 8.45 15.81 8.54C15.81 8.57 15.75 8.7 15.69 8.82C15.61 8.99 15.54 9.09 15.44 9.2C15.29 9.37 14.96 9.68 14.8 9.81C14.51 10.04 14.07 10.34 13.88 10.44C13.82 10.47 13.75 10.52 13.71 10.54C13.68 10.56 13.61 10.6 13.56 10.62C13.51 10.63 13.43 10.67 13.39 10.7C13.36 10.73 13.32 10.75 13.31 10.75C13.3 10.75 13.33 10.72 13.38 10.69ZM11.06 5.91C10.96 5.85 10.74 5.74 10.59 5.66C10.43 5.58 10.26 5.49 10.22 5.46C10.18 5.44 10.03 5.36 9.89 5.29C9.75 5.22 9.63 5.16 9.62 5.15C9.61 5.14 9.42 5.04 9.21 4.93C8.99 4.83 8.76 4.71 8.7 4.67C8.64 4.64 8.47 4.54 8.32 4.46C8.17 4.38 7.95 4.26 7.83 4.2C7.71 4.13 7.45 3.99 7.24 3.88C7.03 3.78 6.82 3.67 6.77 3.64C6.72 3.61 6.59 3.53 6.49 3.48C6.38 3.42 6.18 3.32 6.04 3.24C5.91 3.16 5.69 3.04 5.56 2.98C5.18 2.78 5.01 2.68 4.95 2.65C4.81 2.55 4.29 2.36 3.91 2.26C3.77 2.23 3.22 2.2 3.03 2.22C2.56 2.27 2.1 2.43 1.71 2.67C1.64 2.71 1.64 2.71 1.69 2.67C1.86 2.52 2.42 2.3 2.8 2.23C3.14 2.17 3.79 2.19 4.08 2.28C4.14 2.3 4.28 2.34 4.37 2.37C4.47 2.4 4.64 2.47 4.75 2.52C5.07 2.69 5.29 2.8 5.32 2.82C5.34 2.83 5.45 2.9 5.58 2.96C5.97 3.17 6.51 3.47 6.75 3.6C6.81 3.64 7.03 3.75 7.23 3.86C7.44 3.96 7.7 4.09 7.81 4.16C8.5 4.54 8.9 4.75 9.49 5.06C10.65 5.66 11.26 5.99 11.26 6C11.26 6.02 11.28 6.02 11.06 5.91Z","fill-rule":"evenodd","fill":"#ff5446"}]],
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
  mic: [20, ["path", {"d": "M12 3.5a3 3 0 0 1 3 3v5a3 3 0 0 1-6 0v-5a3 3 0 0 1 3-3z", "fill": "none", "stroke": "currentColor", "stroke-width": "1.8"}], ["path", {"d": "M6 11.5a6 6 0 0 0 12 0M12 17.5v3", "fill": "none", "stroke": "currentColor", "stroke-width": "1.8", "stroke-linecap": "round"}]],
  compass: [20, ["circle", {"cx": "12", "cy": "12", "r": "9", "fill": "none", "stroke": "currentColor", "stroke-width": "1.8"}], ["path", {"d": "M15.5 8.5l-2 5-5 2 2-5z", "fill": "none", "stroke": "currentColor", "stroke-width": "1.8", "stroke-linejoin": "round"}]],
  back: [18, ["path", {"d": "M15 6l-6 6 6 6", "fill": "none", "stroke": "currentColor", "stroke-width": "2", "stroke-linecap": "round", "stroke-linejoin": "round"}]],
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
    currentVideos: "currentVideos" in r ? r.currentVideos : status.currentVideos || [],
    saved: "saved" in r ? r.saved : status.saved || [], savedCount: r.savedCount ?? status.savedCount ?? 0,
    homeschool: "homeschool" in r ? r.homeschool : status.homeschool || null,
    onboarding: "onboarding" in r ? r.onboarding : status.onboarding || null,
    pathways: "pathways" in r ? r.pathways : status.pathways || null };
  if (r.settings) settings = { ...settings, ...r.settings };
  breakEndsAt = brk?.durationMin ? Date.now() + breakLeft(brk) * 1000 : 0;
}

const minLabel = m => (m >= 60 ? `${m / 60}h` : `${m}m`);
const BREAK_CHOICES = [15, 30, 60];
