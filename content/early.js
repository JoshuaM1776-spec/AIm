// Aim — runs at document_start, before YouTube's own scripts, to stop two flashes while the
// rest of Aim loads: the homepage feed showing before the card replaces it, and a video
// starting to play before the gate can hold it. The main scripts take over in init().

const aimEarly = (() => {
  const root = document.documentElement;
  const onVideoPage = () => location.pathname === "/watch" || location.pathname.startsWith("/shorts/");
  let holding = true;
  // Pause only once the video is really playing ("playing"), never on "play": pausing while
  // YouTube's player is still starting up interrupts it, and it can fail with "An error occurred".
  // Videos paused here are marked, so the gate resumes them once a video is allowed (gate.js).
  const onPlay = e => { if (holding && onVideoPage() && e.target.tagName === "VIDEO") { e.target.dataset.aimHeld = "1"; e.target.pause(); } };
  document.addEventListener("playing", onPlay, true);

  // Hide the homepage feed (see html.wp-boot in content.css) unless Aim won't replace it,
  // and hide Shorts, recommendations and feeds unless you're on a break (see focus.js).
  const FOCUS = { hideShorts: "wp-hide-shorts", hideRecs: "wp-hide-recs", hideFeeds: "wp-hide-feeds" };
  root.classList.add("wp-boot", "wp-focus", ...Object.values(FOCUS));
  const showFeed = () => root.classList.remove("wp-boot");
  chrome.storage.local.get(["settings", "brk"])
    .then(({ settings = {}, brk }) => {
      if (settings.homeCard === false || brk) showFeed();
      if (brk) root.classList.remove("wp-focus");
      for (const [k, cls] of Object.entries(FOCUS)) if (settings[k] === false) root.classList.remove(cls);
    })
    .catch(() => { showFeed(); root.classList.remove("wp-focus"); });

  // The gate in gate.js holds videos from here on.
  const done = () => {
    if (!holding) return;
    holding = false;
    document.removeEventListener("playing", onPlay, true);
  };
  // Safety net in case the main scripts never start: never leave the page stuck.
  setTimeout(() => { done(); showFeed(); }, 10000);
  return { done, showFeed };
})();
