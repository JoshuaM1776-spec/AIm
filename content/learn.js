// Aim — "Learn something": on YouTube's home page, when you're not working on a Target, one row of
// new videos from channels that teach the topics you picked (content/topics.js), plus channels you
// marked Prefer. Finite (six), refreshed once a day, nothing autoplays. Picking one starts a light
// Target, so it's on purpose: Up next then shows more from your topics. No AI: each channel's public
// feed on youtube.com (or its channel page when the feed fails), read here and cached by the background.

const LEARN_REFRESH_MS = 24 * 60 * 60 * 1000;
const LEARN_SHOWN = 6;
let learnState = null; // { key, videos } once loaded for the current topics
let learnLoading = null;

// The channels to draw from: your topics' channels (minus any you took out), then your preferred ones.
function learnChannels() {
  const on = new Set(settings.learnTopics || []), off = new Set(settings.learnOff || []);
  const out = new Map();
  for (const t of LEARN_TOPICS) if (on.has(t.id))
    for (const c of t.channels) if (!off.has(c.handle) && !out.has(c.handle)) out.set(c.handle, { ...c, topic: t.name });
  for (const [path, c] of channelsBy("prefer")) {
    const handle = path.startsWith("/@") ? path.slice(1) : null, id = path.match(/^\/channel\/(UC[\w-]{22})/)?.[1] || null;
    const key = handle || (id ? `@${id}` : null);
    if (key && !out.has(key)) out.set(key, { name: c.name || key, handle: handle || key, id, topic: c.topic || "Your channels" });
  }
  return [...out.values()];
}

const xmlText = s => String(s || "").replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
  .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&amp;/g, "&").trim();
// A channel's feed (Atom), read with plain patterns: YouTube's Trusted Types rules can block parsers.
// shorts: true keeps only Shorts, false leaves them out, "all" keeps everything (a Shorts-only playlist).
function parseFeed(xml, channelName, shorts = false) {
  return xml.split("<entry>").slice(1, 16).map(e => {
    const link = e.match(/<link[^>]*rel="alternate"[^>]*href="([^"]+)"/)?.[1] || "";
    return { id: e.match(/<yt:videoId>([\w-]{6,20})<\/yt:videoId>/)?.[1] || "", title: xmlText(e.match(/<title>([\s\S]*?)<\/title>/)?.[1]),
      channel: xmlText(e.match(/<author>\s*<name>([\s\S]*?)<\/name>/)?.[1]) || channelName,
      published: Date.parse(e.match(/<published>([^<]+)<\/published>/)?.[1] || "") || 0, short: /\/shorts\//.test(link) };
  }).filter(v => v.id && v.title && (shorts === "all" || (v.short || /#shorts\b/i.test(v.title)) === shorts)).slice(0, 8)
    .map(({ short, ...v }) => ({ ...v, title: v.title.replace(/\s*#shorts\b/gi, "").trim() || v.title }));
}

// A channel's feed, or (playlist) one of its playlists' feeds.
async function fetchFeed(id, playlist = false) {
  try {
    const r = await fetch(`/feeds/videos.xml?${playlist ? "playlist_id" : "channel_id"}=${encodeURIComponent(id)}`, { credentials: "omit" });
    const t = r.ok ? await r.text() : "";
    return t.includes("<feed") ? t : null;
  } catch { return null; }
}
// The channel's own page, when its feed doesn't answer (YouTube's feeds have failed for weeks at a
// time): the Videos or Shorts tab carries its list in the page's data (ytInitialData), read as JSON.
async function fetchTab(path, tab) {
  try {
    const r = await fetch(`${path}/${tab}`, { credentials: "omit" });
    const html = r.ok ? await r.text() : "", at = html.indexOf("var ytInitialData = ");
    if (at < 0) return null;
    const from = at + "var ytInitialData = ".length;
    return JSON.parse(html.slice(from, html.indexOf(";</script>", from)));
  } catch { return null; }
}
// Every object under `key`, anywhere in the page data.
function findAll(o, key, out = []) {
  if (Array.isArray(o)) for (const v of o) findAll(v, key, out);
  else if (o && typeof o === "object") for (const [k, v] of Object.entries(o)) { if (k === key) out.push(v); else findAll(v, key, out); }
  return out;
}
// "2d ago", "3 weeks ago", "1 month ago" → about when (English pages; otherwise the page's order).
const AGO = { s: 1e3, sec: 1e3, second: 1e3, min: 6e4, minute: 6e4, h: 36e5, hr: 36e5, hour: 36e5, d: 864e5, day: 864e5,
  w: 6048e5, wk: 6048e5, week: 6048e5, mo: 2592e6, month: 2592e6, y: 31536e6, yr: 31536e6, year: 31536e6 };
function agoTime(text, i) {
  const m = String(text || "").match(/(\d+)\s*([a-z]+?)s?\s+ago/i), unit = m && AGO[m[2].toLowerCase()];
  return unit ? Date.now() - Number(m[1]) * unit : Date.now() - (i + 1) * 864e5;
}
function tabVideos(data, name) {
  return findAll(data, "lockupViewModel").filter(l => l.contentType === "LOCKUP_CONTENT_TYPE_VIDEO").slice(0, 8).map((l, i) => {
    const meta = l.metadata?.lockupMetadataViewModel;
    const parts = findAll(meta?.metadata, "metadataParts").flat().map(x => x?.text?.content || "");
    return { id: l.contentId, title: meta?.title?.content || "", channel: name, published: agoTime(parts.find(x => /ago/i.test(x)), i) };
  }).filter(v => /^[\w-]{6,20}$/.test(v.id || "") && v.title);
}
function tabShorts(data, name) {
  return findAll(data, "shortsLockupViewModel").slice(0, 8).map((l, i) => ({
    id: l.onTap?.innertubeCommand?.reelWatchEndpoint?.videoId, title: l.overlayMetadata?.primaryText?.content || "", channel: name,
    published: Date.now() - (i + 1) * 36e5 // newest first on the tab
  })).filter(v => /^[\w-]{6,20}$/.test(v.id || "") && v.title);
}

// One channel, fresh. Its feed when it answers (light); otherwise its Videos tab, by handle and then by
// id, which also tells its id. With shorts, its Shorts too: the Shorts-only playlist's feed (UUSH plus
// the rest of its id), or else the Shorts tab.
async function refreshChannel(c, cached, shorts = false) {
  let id = cached?.id || c.id || null, videos = null, base = null;
  const xml = id ? await fetchFeed(id) : null;
  if (xml) videos = parseFeed(xml, c.name);
  else {
    const paths = [...new Set([c.handle && !/^@UC[\w-]{22}$/.test(c.handle) ? `/${c.handle}` : null, id ? `/channel/${id}` : null].filter(Boolean))];
    for (const path of paths) {
      const data = await fetchTab(path, "videos");
      const found = data && findAll(data, "channelMetadataRenderer")[0]?.externalId;
      if (!data || !/^UC[\w-]{22}$/.test(found || "")) continue;
      id = found; base = path; videos = tabVideos(data, c.name);
      break;
    }
  }
  if (!videos) return { id: null, at: Date.now(), failed: true, videos: [], ...(shorts ? { shorts: [] } : {}) };
  const out = { id, at: Date.now(), videos };
  if (shorts) {
    const list = await fetchFeed("UUSH" + id.slice(2), true);
    out.shorts = list ? parseFeed(list, c.name, "all") : xml ? parseFeed(xml, c.name, true) : [];
    if (!list) { const data = await fetchTab(base || `/channel/${id}`, "shorts"); if (data) out.shorts = tabShorts(data, c.name); }
  }
  return out;
}

// Newest first, taking turns between channels (at most two from one), skipping what you've seen.
function pickLearn(channels, cache, seen, n = LEARN_SHOWN) {
  const queues = channels.map(c => (cache[c.handle]?.videos || []).filter(v => !seen.has(v.id)).map(v => ({ ...v, topic: c.topic, handle: c.handle })))
    .filter(q => q.length).sort((a, b) => b[0].published - a[0].published);
  const out = [], used = new Set();
  for (let round = 0; round < 2 && out.length < n; round++)
    for (const q of queues) { const v = q[round]; if (v && !used.has(v.id) && out.length < n) { used.add(v.id); out.push(v); } }
  return out;
}

async function loadLearn() {
  const channels = learnChannels(), shorts = !!settings.learnShorts;
  const key = channels.map(c => c.handle).join(",") + (shorts ? "+shorts" : "");
  if (!channels.length) return (learnState = { key, videos: [], shorts: [] });
  if (learnState?.key === key) return learnState;
  if (learnLoading?.key === key) return learnLoading.promise;
  const promise = (async () => {
    const { learn = {} } = await chrome.storage.local.get("learn");
    const cache = { ...(learn.channels || {}) }, fresh = {};
    const stale = channels.filter(c => !cache[c.handle] || Date.now() - (cache[c.handle].at || 0) > LEARN_REFRESH_MS || (shorts && !cache[c.handle].shorts));
    for (let i = 0; i < stale.length; i += 3) // a few at a time
      await Promise.all(stale.slice(i, i + 3).map(async c => { fresh[c.handle] = cache[c.handle] = await refreshChannel(c, cache[c.handle], shorts); }));
    if (Object.keys(fresh).length) send({ type: "learn-cache", channels: fresh });
    const seen = new Set((await send({ type: "learn-seen" })) || []);
    learnState = { key, videos: pickLearn(channels, cache, seen),
      shorts: shorts ? channels.flatMap(c => (cache[c.handle]?.shorts || []).filter(v => !seen.has(v.id)).map(v => ({ ...v, topic: c.topic }))) : [] };
    learnLoading = null;
    return learnState;
  })();
  learnLoading = { key, promise };
  return promise;
}

// Start a light Target from a video you picked, with the rest of the row for Up next.
async function startLearning(v, row) {
  const r = await send({ type: "purpose-start", text: `Exploring: ${v.title}`.slice(0, 300),
    video: { id: v.id, title: v.title, channel: v.channel }, learn: { topic: v.topic, videos: row.filter(x => x.id !== v.id).map(x => ({ id: x.id, title: x.title, channel: x.channel })) } });
  if (!r || r.result !== "applied") return toast(r?.message || "Couldn't start that. Try again.");
  location.href = `/watch?v=${encodeURIComponent(v.id)}`;
}

// The home card's block: the row once loaded (filled in when the feeds arrive), or the invitation.
function learnBlock() {
  if (activePurpose() || status.totalReached) return null;
  if (!(settings.learnTopics || []).length && !channelsBy("prefer").length) {
    if (status.onboarding?.tips?.learn) return null;
    return el("div", { class: "wp-learn wp-learn-invite" },
      el("div", { class: "wp-strong" }, "Learn something new?"),
      el("div", { class: "wp-muted" }, `Pick topics you'd like to learn about, and ${BRAND} shows new videos from channels that teach them well. Six at a time, no feed.`),
      el("div", { class: "wp-row" },
        el("button", { class: "wp-btn wp-btn-tonal", onclick: () => send({ type: "open-options", section: "learn" }) }, "Choose topics"),
        el("button", { class: "wp-btn wp-btn-text", onclick: e => { send({ type: "onboarding", tip: "learn" }); e.currentTarget.closest(".wp-learn").remove(); } }, "No thanks")));
  }
  const box = el("div", { class: "wp-learn" },
    el("div", { class: "wp-row-between" },
      el("div", { class: "wp-label" }, "Learn something"),
      el("button", { class: "wp-link wp-learn-edit", onclick: () => send({ type: "open-options", section: "learn" }) }, "Your topics")),
    el("div", { class: "wp-muted wp-learn-loading" }, "Finding new videos from your topics…"));
  loadLearn().then(({ videos, shorts }) => {
    if (!box.isConnected) return;
    box.querySelector(".wp-learn-loading")?.remove();
    fillReview(box, shorts);
    if (!videos.length) return box.append(el("div", { class: "wp-muted" }, "Nothing new from your topics right now. Check back tomorrow."));
    box.append(el("div", { class: "wp-home-minis wp-learn-row" }, ...videos.map(v => el("button", { class: "wp-mini wp-learn-item", title: v.title, onclick: () => startLearning(v, videos) },
      thumb(v, "wp-thumb-sm"), el("span", { class: "wp-mini-title" }, v.title), el("span", { class: "wp-learn-meta" }, `${v.channel} · ${v.topic}`)))));
  });
  return box;
}
