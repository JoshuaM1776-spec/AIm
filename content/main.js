// Aim — timer ticks, sync with other tabs and the popup, navigation and startup. Loads last.

// ---------------- time tracking ----------------
// Time counts while a video plays (even in a background tab or the miniplayer) or while
// you're looking at YouTube. The background credits real elapsed time, so several open
// tabs never count the same moment twice, and decides when a limit runs out.
const TICK = 10;
const tickTimer = setInterval(async () => {
  if (!chrome.runtime?.id) return shutDown();
  if (!$("#wp-chip")) renderChip(); // YouTube re-renders the top bar sometimes
  syncFocus(); // the player (and its autoplay toggle) or a feed may have appeared since
  // Grace is over: pause the video and apply the limit (once; the daily-total stop stays all day).
  if (stop?.videoId && stop.videoId === currentId && !holding && Date.now() >= stop.graceEndsAt) return endGrace();
  const id = currentId;
  const v = id ? getVideoEl() : miniplayerVideo();
  const playing = !!v && !v.paused && !holding && (!id || cleared.has(id));
  const looking = document.visibilityState === "visible" && document.hasFocus();
  if (!playing && !looking) return;
  const video = playing && id && currentInfo?.id === id ? { id, title: currentInfo.title, channel: currentInfo.channel, t: Math.floor(v.currentTime || 0), d: Math.floor(v.duration || 0) } : null;
  react(await send({ type: "tick", seconds: TICK, video }));
}, TICK * 1000);

// The break countdown in the indicator, every second.
const countdownTimer = setInterval(() => { if (alive) tickCountdown(); }, 1000);

// Apply a new status and respond to what changed: a limit running out, a break ending,
// a purpose set or finished from the popup or another tab.
function react(r) {
  if (!r) return;
  const before = { purpose, brk, stop, total: status.totalReached, plan: planKey(), offer: status.pathways?.offer?.name || "" };
  applyStatus(r);
  renderChip();
  syncFocus();
  const newStop = stop && stop.at !== before.stop?.at;
  const breakEnded = before.brk && !brk;
  const purposeEnded = before.purpose && !purpose && !endingHere;
  // Videos cleared under a break or an aim aren't cleared for the next one.
  if (before.brk?.id !== brk?.id || before.purpose?.id !== purpose?.id || (!before.total && status.totalReached)) for (const c of [...cleared]) if (c !== currentId) cleared.delete(c);
  const changed = (before.brk?.id !== brk?.id) || (before.purpose?.id !== purpose?.id) ||
    (before.purpose?.suspended !== purpose?.suspended) || (before.purpose?.timeUp !== purpose?.timeUp) ||
    (before.purpose?.text !== purpose?.text) || before.total !== status.totalReached || before.plan !== planKey() ||
    before.offer !== (status.pathways?.offer?.name || "");
  // A break that ran out (not one you ended yourself) gets a card: back to your purpose, or more break.
  if (breakEnded && newStop && ["break", "leisure"].includes(stop.kind) && !graced(currentId)) showBreakOver(stop.kind);
  if (changed || newStop) route();
  if (!currentId) return;
  if (newStop && graced(currentId)) return showGraceNotice();
  // The video on screen may no longer be allowed, or a card may be waiting on a decision
  // that was just made elsewhere: check it again.
  if (newStop || breakEnded || purposeEnded || (changed && (holding || playerCard))) regate(currentId);
}

// YouTube keeps adding to the page (more results as you scroll, the sidebar after a video
// loads). Catch up shortly after: hide hidden channels, capture new results, fill Up next.
let pageTimer = null;
// Changes inside the player (its clock and progress bar tick constantly), comments and chat never
// matter here; ignoring them keeps Aim from working several times a second while a video plays.
const QUIET = ".html5-video-player, ytd-comments, ytd-live-chat-frame, #wp-chip, .wp";
const pageObserver = new MutationObserver(records => {
  if (pageTimer) return;
  if (records.every(r => (r.target.nodeType === 1 ? r.target : r.target.parentElement)?.closest?.(QUIET))) return;
  pageTimer = setTimeout(() => {
    pageTimer = null;
    if (hiddenKeys().size || preferredKeys().size) applyHidden();
    captureResults();
    renderUpNext();
    renderConcepts();
  }, 400);
});

const TICK_FIELDS = new Set(["usedSec", "lastCountAt", "lastActiveAt", "last", "videos"]);
function onlyTicked(a, b) {
  if (!a || !b || a.id !== b.id) return false;
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) if (!TICK_FIELDS.has(k) && JSON.stringify(a[k]) !== JSON.stringify(b[k])) return false;
  // A new video counted for the aim is worth a redraw (the homepage lists them); more seconds on one isn't.
  return (a.videos || []).length === (b.videos || []).length;
}

// Keep in sync with changes made from the popup, settings or another tab.
let syncTimer = null;
chrome.storage.onChanged.addListener((ch, area) => {
  if (area !== "local" || !alive) return;
  if (ch.avoid) { settings.avoid = ch.avoid.newValue || {}; applyHidden(); }
  if (!(ch.purpose || ch.brk || ch.stop || ch.settings || ch.homeschool || ch.pathways)) return;
  // Every 10 seconds a tick updates the aim's clock and where you are in the video; nothing a tab
  // needs to redraw for. Only a change beyond that is worth asking for the whole status again.
  if (Object.keys(ch).every(k => k === "purpose" || k === "usage" || k === "usageLastAt") && ch.purpose && onlyTicked(ch.purpose.oldValue, ch.purpose.newValue)) return;
  // Several keys change together; read the whole status once they've settled.
  clearTimeout(syncTimer);
  syncTimer = setTimeout(async () => react(await send({ type: "status" })), 50);
});

// ---------------- navigation ----------------
function route() {
  closeCoach();
  if (location.pathname === "/") renderHome(); else removeHome();
  if (location.pathname === "/results") onSearch(searchQuery());
  else { $("#wp-results-bar")?.remove(); setSearchPending(null); }
  renderUpNext();
  renderConcepts();
  renderSubsBar();
}

let historyNav = false;
addEventListener("popstate", () => { historyNav = true; });
// yt-navigate-finish fires for every in-app navigation, back and forward included.
function onNavigate() {
  if (!alive) return;
  // A search you run is handled afresh; going Back or Forward to one isn't a new search.
  if (!historyNav) lastHandledSearch = null;
  historyNav = false;
  const id = videoIdFromUrl();
  renderChip();
  closeDropdown();
  route();
  applyHidden();
  syncFocus();
  if (id === currentId) return;
  currentId = id;
  currentInfo = null;
  closeModal();
  closePlayerCard();
  if (notice && !notice.dataset.keep) closeNotice();
  if (!id) { holding = false; return; }
  if (cleared.has(id)) {
    holding = false;
    // It may have been paused while the page changed; a video you paused yourself stays paused.
    const v = getVideoEl();
    if (v?.paused && (pausedByAim.has(v) || v.dataset.aimHeld)) resume(id);
    readVideoInfo(id).then(info => { if (currentId === id) currentInfo = info; });
    return;
  }
  hold();
  setTimeout(() => { if (currentId === id) gate(id); }, 600);
}

async function init() {
  // The background may be waking up: ask again rather than start as if there were no aim.
  let st = null;
  for (let i = 0; i < 4 && !st; i++) { st = await send({ type: "status" }); if (!st) await sleep(250 * (i + 1)); }
  applyStatus(st);
  renderChip();
  syncFocus();
  showReflection();
  pageObserver.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ["href"] });
  window.addEventListener(YT.navigateEvent, onNavigate);
  onNavigate(); // holds a new video itself, so the early hold can stop
  early.done();
  let resizeTimer = null;
  addEventListener("resize", () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(renderChip, 150); });
  const scheme = matchMedia("(prefers-color-scheme: dark)");
  send({ type: "theme", dark: scheme.matches });
  scheme.addEventListener("change", () => send({ type: "theme", dark: scheme.matches }));
}
init();
