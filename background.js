// Aim — background service worker: the single writer for stored data (see store.js).
// Aim Free uses no AI and talks to no server. Aim Plus (plus.js) talks to Aim's server only
// after the user signs in, and only when config.js names a server.

importScripts("store.js", "config.js", "plus.js");

// Fires on first install and on every update or reload of the extension.
chrome.runtime.onInstalled.addListener(() => serial(ensureMigrated));

// Also checked before the first message after the worker starts, in case an update
// left a YouTube tab talking to the new worker before onInstalled finished.
let migrated = false;
async function ensureMigrated() {
  if (migrated) return;
  await migrateStorage();
  migrated = true;
}

// What the popup and settings page show.
async function fullState() {
  const d = await chrome.storage.local.get(["saved", "history", "avoid", "usage"]);
  const status = await getStatus(), history = d.history || [];
  return { ...status, saved: d.saved || [], history, avoid: d.avoid || {},
    week: weekSummary(d.usage || {}, history), recent: recentPurposes(history, status.purpose?.text) };
}

// What a YouTube tab needs to know.
async function tabState() {
  const { avoid = {}, history = [] } = await chrome.storage.local.get(["avoid", "history"]);
  const status = await getStatus();
  return { ...status, settings: { ...status.settings, avoid }, recent: recentPurposes(history, status.purpose?.text) };
}

// Changes to stored data run one at a time (see serial in store.js).
const writes = {
  "tick": m => recordTick(Math.min(30, Math.max(0, Number(m.seconds) || 0)), m.video?.id ? m.video : null),
  "purpose-start": m => startPurpose({ text: m.text, search: m.search, limitMin: m.limitMin, video: m.video }),
  "purpose-pivot": m => pivotPurpose(m.text, m.limitMin, m.video),
  "purpose-limit": m => setPurposeLimit({ minutes: m.minutes, add: m.add }),
  "purpose-refine": m => refinePurpose(m.text),
  "purpose-search": m => addSearch(m.query),
  "purpose-allow": m => allowVideos({ query: m.query, videos: m.videos, lists: m.lists }),
  "purpose-done": m => finishPurpose(m.outcome),
  "purpose-rate": m => ratePurpose(m.id, m.outcome),
  "break-start": m => startBreak({ minutes: m.minutes, oneVideoId: m.oneVideoId }),
  "break-extend": m => extendBreak(m.minutes),
  "break-end": () => endBreak(),
  "stop-clear": () => clearStop(),
  "reflection-clear": () => chrome.storage.local.remove("reflection").then(() => ({ result: "applied" })),
  "avoid": m => setAvoid(m.key, m.name, m.action),
  "save": m => saveForLater(m.video || {}),
  "saved-remove": m => removeSaved(m.id),
  "history-clear": () => clearHistory(),
  "setting": m => setSetting(m.key, m.value)
};

// Chrome's dark toolbar hides the dark rings of the default icon, so pages that can see the
// color scheme (YouTube tabs, the popup) report it and the toolbar icon follows.
const ICONS = { light: "icons", dark: "icons/light" };
async function setToolbarTheme(dark) {
  const dir = dark ? ICONS.dark : ICONS.light;
  await chrome.action.setIcon({ path: { 16: `${dir}/16.png`, 32: `${dir}/32.png`, 48: `${dir}/48.png` } });
  return { result: "applied" };
}

const reads = {
  "open-options": m => chrome.tabs.create({ url: chrome.runtime.getURL("options.html" + (m.section === "advanced" ? "#advanced" : "")) }).then(() => ({ result: "applied" })),
  "theme": m => setToolbarTheme(!!m.dark),
  "status": () => tabState(),
  "state": () => fullState(),
  "search-check": m => checkSearch(m.query)
};

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id || !msg) return;
  // Account messages come only from Aim's own pages, never from YouTube tabs.
  const p = plusHandlers[msg.type];
  if (p) {
    if (!sender.url?.startsWith(chrome.runtime.getURL(""))) return;
    if (msg.type !== "plus-status" && !plusConfigured()) { sendResponse({ error: "Aim Plus isn't available yet." }); return; }
    p(msg).then(res => sendResponse(res ?? null), e => sendResponse({ error: String(e.message || e) }));
    return true;
  }
  const w = writes[msg.type], r = reads[msg.type];
  if (!w && !r) return;
  // Make sure stored data is current before anything reads or changes it.
  const run = w ? serial(async () => { await ensureMigrated(); return w(msg); })
    : serial(ensureMigrated).then(() => r(msg));
  run.then(res => sendResponse(res ?? null), e => sendResponse({ error: String(e.message || e) }));
  return true;
});
