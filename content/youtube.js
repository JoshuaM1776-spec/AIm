// Aim — everything that depends on YouTube's page structure: URLs, selectors, reading video details.
// When YouTube changes its markup, this is the file to fix (plus the few selectors in content.css
// and early.js, which can't read this table).

const YT = {
  navigateEvent: "yt-navigate-finish",       // fired after every in-app navigation, back/forward included
  mastheadCenter: "ytd-masthead #center",    // the search box and voice search button
  mastheadEnd: "ytd-masthead #end",          // right side of the top bar (Create, notifications, avatar)
  homeBrowse: 'ytd-browse[page-subtype="home"]',
  homePrimary: 'ytd-browse[page-subtype="home"] #primary',
  resultsList: "ytd-search ytd-section-list-renderer",
  mainVideo: "video.html5-main-video",
  player: ["#movie_player", "#shorts-player"],  // where Aim's per-video card sits
  autoplayToggle: ".ytp-autonav-toggle-button",  // aria-checked="true" when YouTube's autoplay is on
  // Feed pages (by ytd-browse page-subtype) that are hidden when you're not on a break.
  // The CSS rules for Shorts, recommendations and these feeds are in content.css.
  feedSubtypes: ["subscriptions", "trending"],
  miniplayerVideo: "ytd-miniplayer video",
  watchFlexy: "ytd-watch-flexy",             // carries the current video's ID in its video-id attribute
  watchTitle: "h1.ytd-watch-metadata yt-formatted-string",
  watchDescription: "ytd-watch-metadata #description-inline-expander",
  // YouTube's own AI. Aim never types into it or reads it; it only points the person to it.
  // The per-video Ask button sits among the buttons under the player (not every video or
  // account has it); Ask YouTube lives in the search bar.
  watchActionButtons: "ytd-watch-metadata #actions button, ytd-watch-metadata #actions yt-button-view-model button",
  searchBox: ["ytd-masthead input#search", "ytd-masthead input[name='search_query']", "yt-searchbox input", "input[name='search_query']"],
  chapterItems: "ytd-macro-markers-list-item-renderer",   // the chapters panel, when YouTube has rendered it
  chapterTitle: ["h4", "#details h4"],
  chapterTime: ["#time", "#details #time"],
  videoChannelLink: [
    "ytd-watch-metadata #channel-name a", "#owner #channel-name a",
    "ytd-reel-player-overlay-renderer #channel-name a", "yt-reel-channel-bar-view-model a"
  ],
  sidebar: ["#secondary", "#related"],
  sidebarHost: "ytd-watch-flexy #secondary",   // where "Up next from your search" goes
  results: "ytd-search",
  resultVideos: "ytd-video-renderer, yt-lockup-view-model",
  // Sponsored slots in results and feeds. Their videos aren't results, so Aim never counts them.
  ads: "ytd-ad-slot-renderer, ytd-in-feed-ad-layout-renderer, ytd-promoted-video-renderer, ytd-promoted-sparkles-web-renderer, ytd-search-pyv-renderer, ytd-display-ad-renderer",
  // What the librarian reads about each result. Missing pieces are simply left out.
  resultLength: ["ytd-thumbnail-overlay-time-status-renderer", ".yt-badge-shape__text", "badge-shape .badge-shape-wiz__text"],
  resultMeta: ["#metadata-line", ".yt-content-metadata-view-model-wiz__metadata-row", ".yt-content-metadata-view-model__metadata-row"],
  resultSnippet: [".metadata-snippet-text", "#description-text", ".metadata-snippet-container"],
  resultPlaylists: "ytd-playlist-renderer, ytd-radio-renderer, yt-lockup-view-model",
  resultChannel: ["ytd-channel-name a", "#channel-name a", 'a[href^="/@"]'],
  sidebarItems: "ytd-compact-video-renderer, yt-lockup-view-model",
  itemWatchLink: 'a[href*="/watch?v="]',
  itemTitle: ["#video-title", "h3"],
  feedItems: "ytd-rich-item-renderer, ytd-video-renderer, ytd-compact-video-renderer, ytd-grid-video-renderer, yt-lockup-view-model",
  feedItemOuter: "ytd-rich-item-renderer",   // grid cell wrapping a lockup; hide the whole cell
  channelHref: 'a[href^="/@"], a[href^="/channel/"], a[href^="/c/"], a[href^="/user/"]'
};

const first = (sels, root = document) => { for (const s of sels) { const n = $(s, root); if (n) return n; } return null; };

// ---------------- URLs ----------------
function videoIdFromUrl() {
  const u = new URL(location.href);
  if (u.pathname === "/watch") return u.searchParams.get("v");
  const m = u.pathname.match(/^\/shorts\/([^/?]+)/);
  return m ? m[1] : null;
}

// "/@name/videos" and "/@name" are the same channel. (Same rule as channelPath in store.js.)
function channelPath(p) {
  let path = String(p || "");
  try { path = decodeURIComponent(path); } catch {}
  const m = path.match(/^\/(@[^/?#]+|channel\/[^/?#]+|c\/[^/?#]+|user\/[^/?#]+)/);
  return m ? "/" + m[1] : path;
}
const hrefChannel = a => { try { return a ? channelPath(new URL(a.href).pathname) : ""; } catch { return ""; } };
const squash = s => (s || "").replace(/\s+/g, " ").trim();

// ---------------- page parts ----------------
const getVideoEl = () => $(YT.mainVideo) || $("video");
const miniplayerVideo = () => $(YT.miniplayerVideo);
const mastheadHost = () => $(YT.mastheadEnd);
const mastheadCenter = () => $(YT.mastheadCenter);
const homeHost = () => $(YT.homePrimary) || $(YT.homeBrowse);
const resultsAnchor = () => $(YT.resultsList);
const channelLink = () => first(YT.videoChannelLink);
// YouTube's per-video Ask button, if this video and account have it.
const youTubeAskButton = () => $$(YT.watchActionButtons).find(b => /^ask\b/i.test(squash(b.getAttribute("aria-label") || b.textContent))) || null;
const playerHost = () => first(YT.player);
const autoplayToggle = () => $(YT.autoplayToggle);
const isShortsPage = () => location.pathname.startsWith("/shorts/");
const feedBrowse = () => {
  for (const t of YT.feedSubtypes) { const n = $(`ytd-browse[page-subtype="${t}"]:not([hidden])`); if (n) return n; }
  return null;
};

// ---------------- the video on screen ----------------
// YouTube swaps videos without reloading, so for a moment the page can still show the
// previous video's details. oEmbed gives the right title and channel for this ID, and the
// description is only read once the page has caught up to the same video.
async function readVideoInfo(id) {
  const info = { id, title: "", channel: "", channelKey: "", description: "" };
  try {
    const r = await fetch("/oembed?format=json&url=" + encodeURIComponent("https://www.youtube.com/watch?v=" + id));
    if (r.ok) {
      const o = await r.json();
      info.title = squash(o.title);
      info.channel = squash(o.author_name);
      try { info.channelKey = channelPath(new URL(o.author_url).pathname); } catch {}
    }
  } catch {}
  const isWatch = location.pathname === "/watch";
  for (let i = 0; i < 15 && currentId === id; i++) {
    const pageTitle = squash($(YT.watchTitle)?.textContent);
    const caughtUp = isWatch
      ? $(YT.watchFlexy)?.getAttribute("video-id") === id && !!pageTitle && (!info.title || pageTitle === info.title)
      : !!channelLink();
    if (caughtUp) {
      const link = channelLink();
      info.title ||= pageTitle;
      info.channel ||= squash(link?.textContent);
      info.channelKey ||= hrefChannel(link);
      if (isWatch) { const d = $(YT.watchDescription); info.description = (d?.innerText || d?.textContent || "").trim(); }
      break;
    }
    await sleep(200);
  }
  info.title ||= document.title.replace(/ - YouTube$/, "").trim();
  info.channelKey ||= info.channel;
  return info;
}

// ---------------- lists of videos ----------------
// Sidebar recommendations on a watch page: [{ node, title }], at most 15.
function sidebarItems() {
  const root = first(YT.sidebar);
  if (!root) return [];
  const seen = new Set(), items = [];
  for (const r of $$(YT.sidebarItems, root)) {
    const a = $(YT.itemWatchLink, r);
    const title = (first(YT.itemTitle, r)?.textContent || a?.title || "").trim();
    if (!a || !title || seen.has(a.href)) continue;
    seen.add(a.href);
    items.push({ node: r, title });
    if (items.length >= 15) break;
  }
  return items;
}

// Videos and playlists on a search results page: { videos: [{ id, title, channel }], lists: [id] }.
// Shorts in results are left out (they link to /shorts/, not /watch).
function searchResults() {
  const root = $(YT.results);
  const videos = [], lists = new Set(), seen = new Set();
  if (!root) return { videos, lists: [] };
  for (const n of $$(YT.resultVideos, root)) {
    if (n.closest(YT.ads)) continue;
    const a = $(YT.itemWatchLink, n);
    if (!a) continue;
    let id = null, list = null;
    try { const u = new URL(a.href); id = u.searchParams.get("v"); list = u.searchParams.get("list"); } catch {}
    if (list) lists.add(list);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    videos.push({ id, title: squash(first(YT.itemTitle, n)?.textContent || a.title || a.getAttribute("aria-label")), channel: squash(first(YT.resultChannel, n)?.textContent),
      length: squash(first(YT.resultLength, n)?.textContent).slice(0, 12), meta: squash(first(YT.resultMeta, n)?.textContent).slice(0, 80),
      snippet: squash(first(YT.resultSnippet, n)?.textContent).slice(0, 200) });
  }
  // Anything else on the results page that links to a video counts too: an AI answer (Ask YouTube)
  // or a module Aim doesn't know the markup of. Ads and Shorts aren't results.
  for (const a of $$(YT.itemWatchLink, root)) {
    if (a.closest(YT.ads)) continue;
    let id = null;
    try { id = new URL(a.href).searchParams.get("v"); } catch {}
    if (!id || seen.has(id)) continue;
    seen.add(id);
    videos.push({ id, title: squash(a.getAttribute("aria-label") || a.title || a.textContent).slice(0, 300), channel: "", length: "", meta: "", snippet: "" });
  }
  for (const n of $$(YT.resultPlaylists, root)) {
    try { const l = new URL($('a[href*="list="]', n)?.href).searchParams.get("list"); if (l) lists.add(l); } catch {}
  }
  return { videos, lists: [...lists] };
}
const searchQuery = () => (new URL(location.href).searchParams.get("search_query") || "").trim();
const sidebarHost = () => $(YT.sidebarHost);

// Every video tile on the page (feed, results, sidebar): [{ box, channelKey }], where box is
// the element to hide. A lockup inside a grid cell is skipped; the cell itself is listed.
function videoTiles() {
  const tiles = [];
  for (const n of $$(YT.feedItems)) {
    const box = n.closest(YT.feedItemOuter) || n;
    if (box !== n && box.matches(YT.feedItems)) continue;
    tiles.push({ box, channelKey: hrefChannel($(YT.channelHref, n)) });
  }
  return tiles;
}
