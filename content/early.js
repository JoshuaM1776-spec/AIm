// Aim — runs at document_start, before YouTube's own scripts, to stop two flashes while the
// rest of Aim loads: the homepage feed showing before the card replaces it, and a video
// starting to play before the gate can hold it. The main scripts take over in init().

const aimEarly = (() => {
  const root = document.documentElement;
  const onVideoPage = () => location.pathname === "/watch" || location.pathname.startsWith("/shorts/");
  let holding = true;
  const onPlay = e => { if (holding && onVideoPage() && e.target.tagName === "VIDEO") e.target.pause(); };
  document.addEventListener("play", onPlay, true);

  // Hide the homepage feed (see html.wp-boot in content.css) unless Aim won't replace it.
  root.classList.add("wp-boot");
  const showFeed = () => root.classList.remove("wp-boot");
  chrome.storage.local.get(["settings", "brk"])
    .then(({ settings, brk }) => { if (settings?.homeCard === false || brk) showFeed(); })
    .catch(showFeed);

  // The gate in gate.js holds videos from here on.
  const done = () => {
    if (!holding) return;
    holding = false;
    document.removeEventListener("play", onPlay, true);
  };
  // Safety net in case the main scripts never start: never leave the page stuck.
  setTimeout(() => { done(); showFeed(); }, 10000);
  return { done, showFeed };
})();
