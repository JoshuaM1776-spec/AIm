// Aim — "Learn something": on YouTube's home page, when you're not working on a Target, one row of
// new videos from channels that teach the topics you picked (content/topics.js), plus channels you
// marked Prefer. Finite (six), refreshed once a day, nothing autoplays. Picking one starts a light
// Target, so it's on purpose: Up next then shows more from your topics. No AI: each channel's public
// feed on youtube.com, read here and cached by the background.

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
    if (key && !out.has(key)) out.set(key, { name: c.name || key, handle: handle || key, id, topic: "Your channels" });
  }
  return [...out.values()];
}

const xmlText = s => String(s || "").replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
  .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&amp;/g, "&").trim();
// A channel's feed (Atom), read with plain patterns: YouTube's Trusted Types rules can block parsers.
function parseFeed(xml, channelName) {
  return xml.split("<entry>").slice(1, 9).map(e => {
    const link = e.match(/<link[^>]*rel="alternate"[^>]*href="([^"]+)"/)?.[1] || "";
    return { id: e.match(/<yt:videoId>([\w-]{6,20})<\/yt:videoId>/)?.[1] || "", title: xmlText(e.match(/<title>([\s\S]*?)<\/title>/)?.[1]),
      channel: xmlText(e.match(/<author>\s*<name>([\s\S]*?)<\/name>/)?.[1]) || channelName,
      published: Date.parse(e.match(/<published>([^<]+)<\/published>/)?.[1] || "") || 0, short: /\/shorts\//.test(link) };
  }).filter(v => v.id && v.title && !v.short && !/#shorts\b/i.test(v.title)).map(({ short, ...v }) => v);
}

async function fetchFeed(id) {
  try {
    const r = await fetch(`/feeds/videos.xml?channel_id=${encodeURIComponent(id)}`, { credentials: "omit" });
    const t = r.ok ? await r.text() : "";
    return t.includes("<feed") ? t : null;
  } catch { return null; }
}
async function resolveHandle(handle) {
  try {
    const r = await fetch(`/${encodeURIComponent(handle).replace(/^%40/, "@")}`, { credentials: "omit" });
    const t = r.ok ? await r.text() : "";
    return t.match(/"(?:externalId|channelId)":"(UC[\w-]{22})"/)?.[1] || t.match(/\/channel\/(UC[\w-]{22})/)?.[1] || null;
  } catch { return null; }
}
// One channel, fresh: the known id first, then the handle looked up again if that fails.
async function refreshChannel(c, cached) {
  let id = cached?.id || c.id || null, xml = id ? await fetchFeed(id) : null;
  if (!xml && c.handle && !/^@UC[\w-]{22}$/.test(c.handle)) {
    const found = await resolveHandle(c.handle);
    if (found && found !== id) { id = found; xml = await fetchFeed(id); }
  }
  return xml ? { id, at: Date.now(), videos: parseFeed(xml, c.name) } : { id: null, at: Date.now(), failed: true, videos: [] };
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
  const channels = learnChannels();
  const key = channels.map(c => c.handle).join(",");
  if (!channels.length) return (learnState = { key, videos: [] });
  if (learnState?.key === key) return learnState;
  if (learnLoading?.key === key) return learnLoading.promise;
  const promise = (async () => {
    const { learn = {} } = await chrome.storage.local.get("learn");
    const cache = { ...(learn.channels || {}) }, fresh = {};
    const stale = channels.filter(c => !cache[c.handle] || Date.now() - (cache[c.handle].at || 0) > LEARN_REFRESH_MS);
    for (let i = 0; i < stale.length; i += 3) // a few at a time
      await Promise.all(stale.slice(i, i + 3).map(async c => { fresh[c.handle] = cache[c.handle] = await refreshChannel(c, cache[c.handle]); }));
    if (Object.keys(fresh).length) send({ type: "learn-cache", channels: fresh });
    const seen = new Set((await send({ type: "learn-seen" })) || []);
    learnState = { key, videos: pickLearn(channels, cache, seen) };
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
  loadLearn().then(({ videos }) => {
    if (!box.isConnected) return;
    box.querySelector(".wp-learn-loading")?.remove();
    if (!videos.length) return box.append(el("div", { class: "wp-muted" }, "Nothing new from your topics right now. Check back tomorrow."));
    box.append(el("div", { class: "wp-home-minis wp-learn-row" }, ...videos.map(v => el("button", { class: "wp-mini wp-learn-item", title: v.title, onclick: () => startLearning(v, videos) },
      thumb(v, "wp-thumb-sm"), el("span", { class: "wp-mini-title" }, v.title), el("span", { class: "wp-learn-meta" }, `${v.channel} · ${v.topic}`)))));
  });
  return box;
}
