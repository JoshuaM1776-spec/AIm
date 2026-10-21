// Aim — "Learn something": on YouTube's home page, when you're not working on an aim, one row of
// new videos from channels that teach the topics you picked (content/topics.js), plus channels you
// marked Prefer. Finite (six), refreshed once a day, nothing autoplays. Picking one starts a light
// Aim, so it's on purpose: Up next then shows more from your topics. No AI: each channel's public
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

// The cache for these channels, fetching the stale ones a few at a time. With onFresh, it's called
// with what's cached right away, so a page can show something before the fetching is done.
async function channelCache(channels, shorts, onFresh) {
  const { learn = {} } = await chrome.storage.local.get("learn");
  const cache = { ...(learn.channels || {}) }, fresh = {};
  const stale = channels.filter(c => !cache[c.handle] || Date.now() - (cache[c.handle].at || 0) > LEARN_REFRESH_MS || (shorts && !cache[c.handle].shorts));
  if (onFresh && stale.length < channels.length) onFresh(cache);
  for (let i = 0; i < stale.length; i += 3) // a few at a time
    await Promise.all(stale.slice(i, i + 3).map(async c => { fresh[c.handle] = cache[c.handle] = await refreshChannel(c, cache[c.handle], shorts); }));
  if (Object.keys(fresh).length) send({ type: "learn-cache", channels: fresh });
  return { cache, changed: Object.keys(fresh).length > 0 };
}

// ---------------- Explore ----------------
// "Not sure what you're looking for?" A finite set of picks worth learning from: about twelve, from
// your interests (or, with none chosen, a bit of everything), four of them from subjects you haven't
// picked. Curated channels only, newest first, nothing you've watched. When they run out, that's it
// for today: Refresh shows ones you haven't seen, never the same ones again, and never more.
const EXPLORE_SHOWN = 12, EXPLORE_DIFFERENT = 4;
let exploreOpen = false;
const exploreSkip = new Set(); // shown on this page already; Refresh moves past them

// Today's channels. The rotation moves daily, so the mix moves too.
function exploreChannels() {
  const on = new Set(settings.learnTopics || []), off = new Set(settings.learnOff || []);
  const day = Math.floor(Date.now() / 864e5);
  const one = t => { const cs = t.channels.filter(c => !off.has(c.handle)); return cs.length ? { ...cs[day % cs.length], topic: t.name } : null; };
  const mine = learnChannels();
  const others = LEARN_TOPICS.filter(t => !on.has(t.id));
  if (!mine.length) return { mine: others.map(one).filter(Boolean), different: [] }; // a bit of everything: one channel per subject
  const have = new Set(mine.map(c => c.handle));
  const different = Array.from({ length: Math.min(EXPLORE_DIFFERENT, others.length) }, (_, i) => others[(day + i) % others.length])
    .map(one).filter(c => c && !have.has(c.handle));
  return { mine, different };
}

function explorePicks(chs, cache, seen) {
  const skip = new Set([...seen, ...exploreSkip]);
  const different = pickLearn(chs.different, cache, skip, EXPLORE_DIFFERENT).map(v => ({ ...v, different: true }));
  for (const v of different) skip.add(v.id);
  const mine = pickLearn(chs.mine, cache, skip, EXPLORE_SHOWN - different.length);
  return { mine, different };
}

function exploreCard(v, all) {
  return el("button", { class: "wp-mini wp-learn-item", title: v.title, onclick: () => startLearning(v, all) },
    thumb(v, "wp-thumb-sm"), el("span", { class: "wp-mini-title" }, v.title), el("span", { class: "wp-learn-meta" }, `${v.channel} · ${v.topic}`));
}

// Your interests, as chips that save the moment you tap them.
function interestPicker(onChange) {
  const on = new Set(settings.learnTopics || []);
  return el("div", { class: "wp-explore-interests", role: "group", "aria-label": "Your interests" },
    ...LEARN_TOPICS.map(t => el("button", { class: `wp-chip${on.has(t.id) ? " wp-chip-on" : ""}`, "aria-pressed": String(on.has(t.id)),
      onclick: async () => {
        const next = on.has(t.id) ? [...on].filter(x => x !== t.id) : [...on, t.id];
        const r = await send({ type: "setting", key: "learnTopics", value: next });
        if (r?.result === "applied") { settings.learnTopics = next; onChange(); }
      } }, t.name)));
}


// The Explore view, in place of the homepage card's usual contents.
function exploreView(card) {
  const body = el("div", { class: "wp-explore-body" }, el("div", { class: "wp-muted wp-learn-loading" }, "Finding picks worth learning from…"));
  let editing = false;
  const names = () => LEARN_TOPICS.filter(t => (settings.learnTopics || []).includes(t.id)).map(t => t.name).join(", ");
  const head = el("div", { class: "wp-explore-head" });
  const drawHead = () => head.replaceChildren(...[
    el("div", { class: "wp-muted" }, (settings.learnTopics || []).length ? `Your interests: ${names()}` : "A bit of everything. Pick interests to shape it."),
    el("button", { class: "wp-link", onclick: () => { editing = !editing; drawHead(); } }, editing ? "Done" : (settings.learnTopics || []).length ? "Change" : "Pick interests"),
    editing ? interestPicker(() => { drawHead(); exploreSkip.clear(); fill(); }) : null].filter(Boolean));
  drawHead();

  let picks = { mine: [], different: [] }, only = null; // only: a subject chip, or null for All
  const draw = (seenAll = false) => {
    const all = [...picks.mine, ...picks.different];
    const subjects = [...new Set(all.map(v => v.topic))];
    if (only && !subjects.includes(only)) only = null;
    const keep = v => !only || v.topic === only;
    const chips = subjects.length > 1 ? el("div", { class: "wp-explore-chips", role: "group", "aria-label": "Subjects" },
      ...[null, ...subjects].map(t => el("button", { class: `wp-chip${only === t ? " wp-chip-on" : ""}`, "aria-pressed": String(only === t),
        onclick: () => { only = t; draw(seenAll); } }, t || "All"))) : null;
    if (!all.length) return body.replaceChildren(el("div", { class: "wp-muted wp-explore-end" },
      seenAll ? "That's everything new for today. Come back tomorrow for more." : "Nothing new from these channels right now. Come back tomorrow."));
    const mixed = !(settings.learnTopics || []).length && !channelsBy("prefer").length;
    const mine = picks.mine.filter(keep), different = picks.different.filter(keep);
    body.replaceChildren(...[
      chips,
      mine.length ? el("div", { class: "wp-label" }, mixed ? "Worth a look" : "From your interests") : null,
      mine.length ? el("div", { class: "wp-home-minis wp-explore-grid" }, ...mine.map(v => exploreCard(v, all))) : null,
      different.length ? el("div", { class: "wp-label" }, "Something different") : null,
      different.length ? el("div", { class: "wp-home-minis wp-explore-grid" }, ...different.map(v => exploreCard(v, all))) : null,
      el("div", { class: "wp-explore-end" },
        el("span", { class: "wp-muted" }, "That's today's picks."),
        el("button", { class: "wp-link", onclick: () => { for (const v of all) exploreSkip.add(v.id); fill(true); } }, "Show others"))].filter(Boolean));
    if (settings.learnShorts) fillReview(body, reviewShorts);
  };
  let reviewShorts = [];
  const fill = async (refresh = false) => {
    const chs = exploreChannels(), all = [...chs.mine, ...chs.different];
    const seen = new Set((await send({ type: "learn-seen" })) || []);
    const show = cache => { picks = explorePicks(chs, cache, seen); if (body.isConnected) draw(refresh); };
    const { cache, changed } = await channelCache(all, !!settings.learnShorts, refresh ? null : show);
    reviewShorts = settings.learnShorts ? chs.mine.flatMap(c => (cache[c.handle]?.shorts || []).filter(v => !seen.has(v.id)).map(v => ({ ...v, topic: c.topic }))) : [];
    // Fresh videos arrived, or there was nothing to show yet: draw once more. Otherwise leave what's on screen.
    if (refresh || changed || !body.querySelector(".wp-explore-grid, .wp-explore-end")) show(cache);
    else if (settings.learnShorts && !body.querySelector(".wp-review")) fillReview(body, reviewShorts);
  };
  card.append(
    brandLine(),
    el("div", { class: "wp-explore-top" },
      el("button", { class: "wp-link wp-explore-back", onclick: () => { exploreOpen = false; renderHome(); } }, icon("back"), "What brings you here?")),
    el("div", { class: "wp-label wp-explore-kicker" }, "Explore"),
    el("h1", { class: "wp-home-title" }, `${greeting()}.`), // greeting(): plan.js
    el("div", { class: "wp-muted wp-explore-lede" }, "What would you like to explore today? A few videos worth learning from, from channels that teach well."),
    head, body);
  fill();
}

// Start exploring from a pick: a light aim, "Exploring History", with all of today's picks to watch.
// Already exploring, another pick just joins it.
async function startLearning(v, row) {
  const videos = row.map(x => ({ id: x.id, title: x.title, channel: x.channel }));
  const p = activePurpose();
  if (p?.learn) await send({ type: "purpose-allow", query: `Explore: ${p.learn}`, videos, lists: [] });
  else {
    const r = await send({ type: "purpose-start", text: `Exploring ${v.topic}`.slice(0, 300),
      video: { id: v.id, title: v.title, channel: v.channel }, learn: { topic: v.topic, videos: videos.filter(x => x.id !== v.id) } });
    if (!r || r.result !== "applied") return toast(r?.message || "Couldn't start that. Try again.");
  }
  exploreOpen = false;
  location.href = `/watch?v=${encodeURIComponent(v.id)}`;
}

// The homepage's one line about Explore.
function exploreLine(p) {
  if (status.totalReached) return null;
  return el("div", { class: "wp-explore-line" },
    el("span", { class: "wp-muted" }, p ? "Or find something new?" : "Not sure what you're looking for?"),
    el("button", { class: "wp-btn wp-btn-tonal wp-explore-open", onclick: () => { exploreOpen = true; renderHome(); } }, icon("compass"), "Explore"));
}

// "Go deeper": on a video you're exploring, one quiet line turns it into an aim.
const deeperText = title => String(title || "").replace(/#\S+/g, "").replace(/\s+[|｜•·-]\s+[^|｜•·]*$/, "").replace(/[!?.…]+$/, "").replace(/\s+/g, " ").trim().slice(0, 120);
function goDeeperRow(p) {
  if (!p?.learn || !currentId) return null;
  const title = p.allowed?.find(v => v.id === currentId)?.title || (currentInfo?.id === currentId ? currentInfo.title : "");
  const text = deeperText(title);
  if (text.length < 4) return null;
  return el("div", { class: "wp-deeper" },
    el("span", { class: "wp-muted" }, "Go deeper on this?"),
    el("button", { class: "wp-link", onclick: async () => {
      const r = await send({ type: "purpose-refine", text, deeper: true });
      if (!r || r.result !== "applied") return toast(r?.message || "Couldn't change that. Try again.");
      applyStatus(await send({ type: "status" }));
      renderChip(); renderUpNext();
      toast(`Your aim: ${text}. ${BRAND} keeps YouTube on it.`);
    } }, "Make it my aim"));
}
