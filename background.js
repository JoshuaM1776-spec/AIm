// Aim — background service worker: the single writer for stored data (see store.js).
// Aim Free uses no AI and talks to no server. Aim Plus (plus.js) talks to Aim's server only
// after the user signs in, and only when config.js names a server.

importScripts("store.js", "config.js", "plus.js", "sync.js");

// Fires on first install and on every update or reload of the extension. A new install opens the
// welcome tour; an update from before onboarding existed skips it (see setOnboarding in store.js).
chrome.runtime.onInstalled.addListener(details => serial(async () => {
  await ensureMigrated();
  const { onboarding } = await chrome.storage.local.get("onboarding");
  if (details.reason === "install" && !onboarding) {
    await setOnboarding({});
    await chrome.tabs.create({ url: chrome.runtime.getURL("welcome.html") });
  } else if (details.reason === "update" && !onboarding) await setOnboarding({ seenAll: true });
}));

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
  const d = await chrome.storage.local.get(["saved", "history", "avoid", "usage", "reasons"]);
  const status = await getStatus(), history = d.history || [];
  return { ...status, saved: d.saved || [], history, avoid: d.avoid || {}, reasons: (d.reasons || []).slice(-10).reverse(),
    week: weekSummary(d.usage || {}, history), recent: recentPurposes(history, status.purpose?.text) };
}

// What a YouTube tab needs to know.
async function tabState() {
  const { avoid = {}, history = [], paused = [], saved = [] } = await chrome.storage.local.get(["avoid", "history", "paused", "saved"]);
  const status = await getStatus();
  return { ...status, settings: { ...status.settings, avoid }, recent: recentPurposes(history, status.purpose?.text),
    // The homepage shows at most two set-aside aims; the aims page shows everything.
    paused: paused.slice(0, 2).map(p => summary(p, "paused")), pausedCount: paused.length,
    currentVideos: status.purpose ? recentVideos(status.purpose) : [],
    // "Saved for later", newest first, for the homepage and the start of a break.
    saved: saved.slice(-12).reverse(), savedCount: saved.length };
}

// A family's plan is for one day: on a new day (or after half an hour), fetch it again.
let familyAt = 0;
function familyFresh() {
  chrome.storage.local.get("homeschool").then(({ homeschool: hs }) => {
    if (hs?.family && (hs.date !== todayKey() || Date.now() - familyAt > 30 * 60_000)) { familyAt = Date.now(); studentRefresh(); }
  });
}

// Changes to stored data run one at a time (see serial in store.js).
const writes = {
  "tick": m => recordTick(Math.min(30, Math.max(0, Number(m.seconds) || 0)), m.video?.id ? m.video : null),
  "purpose-start": m => startPurpose({ text: m.text, search: m.search, limitMin: m.limitMin, video: m.video, learn: m.learn }),
  "learn-cache": m => saveLearnCache(m.channels),
  "learn-seen": () => learnSeen(),
  "purpose-pivot": m => pivotPurpose(m.text, m.limitMin, m.video),
  "purpose-limit": m => setPurposeLimit({ minutes: m.minutes, add: m.add }),
  "purpose-refine": m => refinePurpose(m.text, !!m.deeper),
  "purpose-search": m => addSearch(m.query),
  "purpose-allow": m => allowVideos({ query: m.query, videos: m.videos, lists: m.lists }),
  "video-check": m => checkVideo(m.video),
  "memory-add": m => memoryAdd(m.items, m.aimId),
  "memory-forget": m => memoryForget(m.id),
  "memory-offered": m => memoryOffered(m.id),
  "talk-offered": m => talkOffered({ aimId: m.aimId, answer: m.answer }),
  "talk-marks": m => talkMarks(m.aimId, m.marks),
  "purpose-done": m => finishPurpose(m.outcome),
  "purpose-pause": () => pausePurpose(),
  "study-start": m => startStudy({ title: m.title, scopeNote: m.scopeNote, topics: m.topics, notes: m.notes }),
  "study-update": m => updateStudy({ topicId: m.topicId, videos: m.videos, current: m.current, check: m.check, end: !!m.end, apply: m.apply, applyDone: m.applyDone }),
  "librarian-apply": m => applyLibrarian({ request: m.request, answer: m.answer, newTarget: !!m.newTarget }),
  "librarian-picks": m => savePicks({ query: m.query, groups: m.groups }),
  "purpose-resume": m => resumePurpose(String(m.id || "")),
  "paused-drop": m => dropPaused(String(m.id || "")),
  "purpose-rate": m => ratePurpose(m.id, m.outcome),
  "break-start": m => startBreak({ minutes: m.minutes, oneVideoId: m.oneVideoId, theme: m.theme }),
  "theme-videos": m => addThemeVideos(m.videos),
  "target-notes": m => setTargetNotes(m.text),
  "break-extend": m => extendBreak(m.minutes),
  "break-end": () => endBreak(),
  "stop-clear": () => clearStop(),
  "reflection-clear": () => chrome.storage.local.remove("reflection").then(() => ({ result: "applied" })),
  "avoid": m => setAvoid(m.key, m.name, m.action, m.topic),
  "subs-save": m => saveSubs(m.channels, !!m.complete),
  "design-applied": () => markDesigned(),
  "save": m => saveForLater(m.video || {}),
  "saved-remove": m => removeSaved(m.id),
  "reason": m => addReason({ kind: m.kind, text: m.text, detail: m.detail }),
  "history-clear": () => clearHistory(),
  "setting": m => setSetting(m.key, m.value),
  "homeschool-preview": m => setHomeschoolPreview(!!m.on),
  "interest": m => recordInterest({ topic: m.topic, subject: m.subject, source: m.source, answer: m.answer, note: m.note, ref: m.ref })
    .then(r => { if (r.refreshThemes) refreshThemes(); return r; }),
  "pathways-set": m => setPathways({ on: m.on, stage: m.stage, erase: !!m.erase }).then(r => { if (m.on) refreshThemes(); return r; }),
  "video-concepts-save": m => saveVideoConcepts(String(m.id || ""), m.data),
  "pathways-theme-seen": m => pathwayThemeSeen(m.name, !!m.dismiss),
  "exploration-start": m => explorationStart({ career: m.career, theme: m.theme, kind: m.kind, what: m.what, related: m.related }),
  "exploration-update": m => explorationUpdate({ id: m.id, step: m.step, content: m.content, done: m.done, saved: m.saved, reflection: m.reflection, end: !!m.end }),
  "onboarding": m => setOnboarding({ welcomed: m.welcomed, tip: m.tip, hsTour: m.hsTour, reset: !!m.reset }),
  "plan-start": m => planStart(String(m.id || "")),
  "plan-done": m => planDone(String(m.id || ""), m.done !== false)
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
  "open-options": m => chrome.tabs.create({ url: chrome.runtime.getURL("options.html" + ({ advanced: "#advanced", account: "#plus", learn: "#learn" }[m.section] || "")) }).then(() => ({ result: "applied" })),
  "theme": m => setToolbarTheme(!!m.dark),
  "status": () => { familyFresh(); return tabState(); },
  "state": () => fullState(),
  "search-check": m => checkSearch(m.query),
  "talk-session": m => talkSession(m.id || null),
  "talk-offer": m => talkOffer(m.aimId),
  "memory-for": m => memoryFor(m.id || null),
  "memory-match": m => memoryMatch(m.title),
  "memory-list": () => memoryList(),
  "targets": () => readAll().then(resumable),
  "record": () => readAll().then(learningRecord),
  "channels-page": () => channelsPage(),
  "open-design": m => chrome.tabs.create({ url: chrome.runtime.getURL("design.html" + (/^(home|shorts|watching)$/.test(m.stage || "") ? `#${m.stage}` : "")) }).then(() => ({ result: "applied" })),
  "open-channels": () => chrome.tabs.create({ url: chrome.runtime.getURL("channels.html") }).then(() => ({ result: "applied" })),
  "review-shorts": m => rankReviewShorts(m.shorts),
  "open-study": () => chrome.tabs.create({ url: chrome.runtime.getURL("study.html") }).then(() => ({ result: "applied" })),
  "open-welcome": () => chrome.tabs.create({ url: chrome.runtime.getURL("welcome.html") }).then(() => ({ result: "applied" })),
  "pathways": () => readPathways(),
  "video-concepts-get": m => getVideoConcepts(String(m.id || "")),
  "pathways-refresh": () => refreshThemes(true),
  "open-pathways": m => {
    const q = new URLSearchParams();
    if (typeof m.theme === "string" && m.theme.trim()) q.set("theme", m.theme.trim().slice(0, 80));
    return chrome.tabs.create({ url: chrome.runtime.getURL("pathways.html" + (q.size ? "?" + q : "")) }).then(() => ({ result: "applied" }));
  },
  "open-targets": () => chrome.tabs.create({ url: chrome.runtime.getURL("targets.html") }).then(() => ({ result: "applied" })),
  "open-record": () => chrome.tabs.create({ url: chrome.runtime.getURL("record.html") }).then(() => ({ result: "applied" })),
  // YouTube tabs may only learn whether to offer Plus features, and open TeachBack for a topic.
  "plus-brief": () => plusBrief(),
  // The librarian's two tasks, which YouTube tabs may call for a signed-in account (see plus.js).
  "librarian": m => plusLibrarian(m.task, m.input),
  "open-teachback": m => {
    const q = new URLSearchParams();
    if (typeof m.topic === "string" && m.topic.trim()) q.set("topic", m.topic.trim().slice(0, 200));
    if (typeof m.notes === "string" && m.notes.trim()) q.set("notes", m.notes.trim().slice(0, 3000));
    if (typeof m.study === "string" && /^[\w-]{8,64}$/.test(m.study)) q.set("study", m.study); // a study topic to report back to
    if (typeof m.plan === "string" && /^[\w-]{1,64}$/.test(m.plan)) q.set("plan", m.plan); // a plan item to mark done
    if (typeof m.objective === "string" && /^[\w-]{1,12}$/.test(m.objective)) q.set("objective", m.objective); // its curriculum objective
    if (typeof m.video === "string" && /^[\w-]{6,20}$/.test(m.video)) q.set("video", m.video); // "Test me on this video"
    const url = chrome.runtime.getURL("teachback.html" + (q.size ? "?" + q : ""));
    return chrome.tabs.create({ url }).then(() => ({ result: "applied" }));
  }
};

// Pathways: look for themes in the student's "Want more of this?" answers (Aim Plus, and only once
// Pathways is on). Runs outside the write queue, since it waits on the network.
let themesRunning = null;
function refreshThemes(force = false) {
  themesRunning ||= (async () => {
    const { pathways, interests } = await readPathways();
    if (!pathways.on || !plusConfigured()) return { result: "skipped" };
    const recent = interests.slice(-60);
    const r = await plusCall("pathways-themes", { stage: pathways.stage || "other",
      items: recent.map(x => ({ topic: x.topic, answer: x.answer, note: x.note })) }).catch(e => ({ error: String(e.message || e) }));
    if (r.error) return { result: "error", message: r.error };
    await serial(() => savePathwayThemes(r.themes, recent.map(x => x.id)));
    return { result: "applied", themes: r.themes.length };
  })().finally(() => { themesRunning = null; });
  return force ? themesRunning : (themesRunning.catch(() => {}), { result: "started" });
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id || !msg) return;
  // Account messages come only from Aim's own pages, never from YouTube tabs.
  const p = plusHandlers[msg.type];
  if (p) {
    if (!sender.url?.startsWith(chrome.runtime.getURL(""))) return;
    if (msg.type !== "plus-status" && !plusConfigured()) { sendResponse({ error: "Aim Plus isn't available yet." }); return; }
    p(msg).then(res => sendResponse(res ?? null), e => sendResponse({ error: String(e.message || e), code: e.code || "" }));
    return true;
  }
  const w = writes[msg.type], r = reads[msg.type];
  if (!w && !r) return;
  // Make sure stored data is current before anything reads or changes it.
  const run = w ? serial(async () => { await ensureMigrated(); return w(msg); })
    : serial(ensureMigrated).then(() => r(msg));
  run.then(res => sendResponse(res ?? null), e => sendResponse({ error: String(e.message || e) }));
  if (SYNC_AFTER.has(msg.type)) run.then(syncSoon, () => {});
  // A student's lesson done (or watched to the end): tell the family's side soon.
  if (msg.type === "plan-done" || msg.type === "tick") run.then(() => chrome.storage.local.get("hsOutbox")).then(d => d.hsOutbox?.length && studentRefresh(), () => {});
  return true;
});
