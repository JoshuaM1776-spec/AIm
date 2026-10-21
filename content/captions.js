// Aim Plus — captions, read only when the librarian needs them: when it talks a session through (the
// two or three videos you watched longest) or looks at a video for "In this video". Never while you
// watch, never stored. Captions only (the creator's, or YouTube's automatic ones), from the same
// caption track YouTube's player shows you; no audio is ever captured. With none, Aim falls back to
// titles. Off unless "Let the librarian read captions" is on (Settings → The librarian): a preview
// until the legal review (docs/ROADMAP.md → Decisions).

const captionCache = new Map(); // video id → { lang, auto, lines } or null, for this page

// The player's data for a video: from this page when it's the one on screen, otherwise its watch page.
async function playerResponse(id) {
  const fromHtml = html => {
    const at = html.indexOf("ytInitialPlayerResponse = ");
    if (at < 0) return null;
    const from = at + "ytInitialPlayerResponse = ".length;
    const end = html.indexOf(";</script>", from);
    try { return JSON.parse(html.slice(from, end > 0 ? end : undefined).replace(/;\s*var meta = [\s\S]*$/, "")); } catch { return null; }
  };
  if (id === videoIdFromUrl()) {
    for (const sc of document.scripts) {
      if (!sc.textContent.includes("ytInitialPlayerResponse")) continue;
      const r = fromHtml(sc.textContent + ";</script>");
      if (r?.videoDetails?.videoId === id) return r;
    }
  }
  try {
    const res = await fetch(`/watch?v=${encodeURIComponent(id)}`, { credentials: "include" });
    return res.ok ? fromHtml(await res.text()) : null;
  } catch { return null; }
}

// The best track: the creator's in your language, then theirs in English, then automatic ones.
function pickTrack(tracks) {
  const lang = (navigator.language || "en").slice(0, 2);
  const rank = t => (t.kind === "asr" ? 2 : 0) + (t.languageCode?.startsWith(lang) ? 0 : t.languageCode?.startsWith("en") ? 1 : 3);
  return [...tracks].sort((a, b) => rank(a) - rank(b))[0] || null;
}

// json3: events with start times and text segments. XML (the older format): <text start="…">…</text>.
function parseJson3(data) {
  return (data?.events || []).filter(e => e.segs).map(e => ({ t: Math.floor((e.tStartMs || 0) / 1000), text: e.segs.map(s => s.utf8 || "").join("").replace(/\s+/g, " ").trim() }))
    .filter(l => l.text);
}
function parseXml(xml) {
  const un = s => s.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'");
  return [...String(xml).matchAll(/<text start="([\d.]+)"[^>]*>([\s\S]*?)<\/text>/g)].map(m => ({ t: Math.floor(Number(m[1])), text: un(un(m[2])).replace(/\s+/g, " ").trim() }))
    .filter(l => l.text);
}

async function captionsFor(id) {
  if (captionCache.has(id)) return captionCache.get(id);
  let out = null;
  const pr = await playerResponse(id);
  const track = pickTrack(pr?.captions?.playerCaptionsTracklistRenderer?.captionTracks || []);
  if (track?.baseUrl) {
    try {
      const url = new URL(track.baseUrl, location.origin);
      url.searchParams.set("fmt", "json3");
      let r = await fetch(url, { credentials: "include" });
      let lines = r.ok ? parseJson3(await r.json().catch(() => null)) : [];
      if (!lines.length) { r = await fetch(track.baseUrl, { credentials: "include" }); lines = r.ok ? parseXml(await r.text()) : []; }
      if (lines.length) out = { lang: track.languageCode || "", auto: track.kind === "asr", lines };
    } catch { out = null; }
  }
  captionCache.set(id, out);
  send({ type: "captions-stat", found: !!out });
  return out;
}

// What goes to the librarian: the passages most related to the aim, in the video's order, with times.
// About 45 seconds a passage; up to maxChars in all, so a long video costs no more than a short one.
const CAPTION_FILLER = new Set("the and that this with from have what when your they there were which would about into just like then than them some more also been will because really going know think".split(" "));
const capWords = text => (String(text).toLowerCase().match(/[\p{L}\p{N}]{4,}/gu) || []).filter(w => !CAPTION_FILLER.has(w));
function captionExcerpt(cap, about, maxChars = 5000) {
  const chunks = [];
  for (const l of cap.lines) {
    const last = chunks[chunks.length - 1];
    if (!last || l.t - last.t >= 45) chunks.push({ t: l.t, text: l.text });
    else last.text += ` ${l.text}`;
  }
  const want = new Set(capWords(about));
  const fmt = s => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  const scored = chunks.map((c, i) => ({ ...c, i, score: capWords(c.text).filter(w => want.has(w)).length }));
  // Everything fits: the whole thing. Otherwise the best-matching passages (and the opening, for context).
  const total = chunks.reduce((n, c) => n + c.text.length + 8, 0);
  const keep = total <= maxChars ? scored : (() => {
    const picked = [scored[0]], used = new Set([0]);
    let n = scored[0].text.length;
    for (const c of scored.slice(1).sort((a, b) => b.score - a.score || a.i - b.i)) {
      if (n + c.text.length + 8 > maxChars) continue;
      picked.push(c); used.add(c.i); n += c.text.length + 8;
    }
    return picked.sort((a, b) => a.i - b.i);
  })();
  return keep.map(c => `[${fmt(c.t)}] ${c.text}`).join("\n");
}

// For a conversation: excerpts for the videos watched longest, if captions are on (Aim Plus).
async function sessionCaptions(videos, about) {
  if (!settings.captions) return {};
  const top = videos.filter(v => v.id).slice().sort((a, b) => b.minutes - a.minutes).slice(0, 3);
  const out = {};
  await Promise.all(top.map(async v => {
    const cap = await captionsFor(v.id);
    if (cap) out[v.id] = { transcript: captionExcerpt(cap, `${about} ${v.title}`, 4500), captions: cap.auto ? "automatic" : "creator" };
  }));
  return out;
}
