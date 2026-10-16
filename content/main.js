// Aim — timer ticks, sync with other tabs and the popup, navigation and startup. Loads last.

// ---------------- time tracking ----------------
// Time counts while a video plays (even in a background tab or the miniplayer) or while
// you're looking at YouTube. The background credits real elapsed time, so several open
// tabs never count the same moment twice.
const TICK = 10;
const tickTimer = setInterval(async () => {
  if (!chrome.runtime?.id) return shutDown();
  if (!$("#wp-chip")) renderChip(); // YouTube re-renders the top bar sometimes
  const id = currentId;
  const v = id ? getVideoEl() : miniplayerVideo();
  const playing = !!v && !v.paused && !holding && (!id || cleared.has(id));
  const looking = document.visibilityState === "visible" && document.hasFocus();
  if (!playing && !looking) return;
  const sessionRunning = !!session && !session.paused && !session.timeUp;
  const r = await send({ type: "tick", seconds: TICK, sessionRunning });
  if (!r) return;
  session = r.session;
  renderChip();
  if (r.reminder) showReminder(r.reminder);
  if (session?.timeUp && !timeUpShown) showTimeUp();
}, TICK * 1000);

// Keep in sync with changes made from the popup, settings or another tab.
chrome.storage.onChanged.addListener((ch, area) => {
  if (area !== "local" || !alive) return;
  if (ch.session) {
    const ended = ch.session.oldValue && !ch.session.newValue;
    session = ch.session.newValue || null;
    if (!session?.timeUp) timeUpShown = false;
    // Time added or session resumed from another tab or the popup: lift this tab's hold too.
    const lifted = (notice?.dataset.kind === "timeup" && session && !session.timeUp) ||
      (notice?.dataset.kind === "paused" && session && !session.paused);
    if (lifted) {
      closeNotice();
      if (currentInfo && holding) evaluateVideo(currentInfo);
    }
    renderChip();
    if (ended && !endingHere && videoIdFromUrl()) { hold(); location.href = "https://www.youtube.com/"; }
    if (location.pathname === "/") renderHome();
    if (location.pathname === "/results") renderResultsBar();
  }
  if (ch.settings) {
    const homeChanged = (ch.settings.newValue?.homeCard !== false) !== settings.homeCard;
    settings = { ...settings, ...(ch.settings.newValue || {}) };
    if (homeChanged) route();
  }
  if (ch.avoid) { settings.avoid = ch.avoid.newValue || {}; applyHidden(); }
  if (ch.apiKey) settings.hasKey = !!(ch.apiKey.newValue || "").trim();
});

// ---------------- navigation ----------------
function route() {
  if (session?.timeUp && !timeUpShown) showTimeUp();
  if (location.pathname === "/") renderHome(); else removeHome();
  if (location.pathname === "/results") onSearch(new URL(location.href).searchParams.get("search_query") || "");
  else $("#wp-results-bar")?.remove();
}

// yt-navigate-finish fires for every in-app navigation, back and forward included.
function onNavigate() {
  const id = videoIdFromUrl();
  renderChip();
  closeDropdown();
  route();
  applyHidden();
  if (id === currentId) return;
  currentId = id;
  currentInfo = null;
  clearRecLabels();
  closeModal();
  if (notice && !notice.dataset.keep) closeNotice();
  if (!id) { holding = false; return; }
  if (cleared.has(id)) {
    holding = false;
    readVideoInfo(id).then(info => { if (currentId === id) currentInfo = info; });
    return;
  }
  hold();
  setTimeout(() => { if (currentId === id) gate(id); }, 600);
}

async function init() {
  const r = await send({ type: "session-get" });
  session = r?.session || null;
  settings = (await send({ type: "settings" })) || settings;
  renderChip();
  showReflection();
  hideObserver.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ["href"] });
  window.addEventListener(YT.navigateEvent, onNavigate);
  onNavigate(); // holds a new video itself, so the early hold can stop
  early.done();
  const scheme = matchMedia("(prefers-color-scheme: dark)");
  send({ type: "theme", dark: scheme.matches });
  scheme.addEventListener("change", () => send({ type: "theme", dark: scheme.matches }));
}
init();
