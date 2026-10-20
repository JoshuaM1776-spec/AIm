// Aim — Design your YouTube. A configurator instead of a settings list: four stages (Home, Shorts,
// Watching, Timing), each changing a live preview of YouTube as you choose, then a before-and-after
// and one Apply. The first time, it walks through the stages in order; afterwards any stage opens
// directly (from Settings, or design.html#shorts). The preview is a sketch drawn by Aim, filled
// with your own Learn something videos: YouTube can't be embedded in a page, and Aim doesn't copy
// its look. Choices change nothing until Apply. Settings → More settings has the rest.

const BRAND = chrome.runtime.getManifest().name;
for (const n of document.querySelectorAll("[data-brand]")) n.textContent = BRAND;
const send = msg => chrome.runtime.sendMessage(msg).catch(() => null);
const $ = id => document.getElementById(id);
const MARK = "icons/mark.svg";

function node(tag, props = {}, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === "class") n.className = v;
    else if (k.startsWith("on") && typeof v === "function") n.addEventListener(k.slice(2), v);
    else if (k === "style" || k.startsWith("data-") || k.startsWith("aria-") || k === "role") n.setAttribute(k, v);
    else n[k] = v;
  }
  n.append(...kids.flat(Infinity).filter(k => k != null && k !== false));
  return n;
}
function toast(msg) {
  const t = $("toast");
  t.textContent = msg; t.style.display = "block";
  clearTimeout(toast.timer); toast.timer = setTimeout(() => (t.style.display = "none"), 3000);
}

const STAGES = [
  { id: "home", name: "Home", title: "What should your homepage be?", q: "YouTube's homepage is built to keep you watching. Choose what greets you instead." },
  { id: "shorts", name: "Shorts", title: "What about Shorts?", q: "Shorts are the easiest place to lose an hour. Decide how much of them you want." },
  { id: "watching", name: "Watching", title: "While you watch", q: `${BRAND} always asks what you're here for, then keeps the videos that fit. Choose what else steps aside.` },
  { id: "timing", name: "Timing", title: "How much time, and for what?", q: "Time on your Target is yours. Breaks share a daily allowance; the rest are optional limits." }
];
const KEYS = ["homeCard", "learnTopics", "hideShorts", "learnShorts", "hideRecs", "noAutoplay", "hideFeeds", "strict", "leisureMin", "totalMin", "graceMin", "purposeLimitMin"];

const S = { cur: null, d: null, stage: 0, review: false, wizard: true, view: "after", data: { videos: {}, shorts: {} }, avoid: {}, readonly: false, applied: false };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const dirty = () => KEYS.some(k => !same(S.cur[k], S.d[k]));
const shortsMode = d => (!d.hideShorts ? "all" : d.learnShorts ? "topics" : "off");

// ---------- your videos, for the preview ----------
// Learn something's channel cache: the newest videos and Shorts from your topics (and channels you
// learn from). Placeholders when nothing's cached yet.
function topicChannels(d) {
  const on = new Set(d.learnTopics || []), out = [];
  for (const t of LEARN_TOPICS) if (on.has(t.id)) for (const c of t.channels) out.push({ handle: c.handle, name: c.name, topic: t.name });
  for (const [path, r] of Object.entries(S.avoid)) if (r.action === "prefer" && path.startsWith("/@")) out.push({ handle: path.slice(1), name: r.name, topic: r.topic || "Your channels" });
  return out;
}
function videosFor(d, n = 6) {
  const out = [], seen = new Set();
  for (const c of topicChannels(d)) for (const v of S.data.videos[c.handle] || []) if (!seen.has(v.id)) { seen.add(v.id); out.push({ ...v, topic: c.topic }); }
  out.sort((a, b) => (b.published || 0) - (a.published || 0));
  if (out.length) return out.slice(0, n);
  return topicChannels(d).slice(0, n).map(c => ({ id: "", title: `New from ${c.name}`, channel: c.name, topic: c.topic }));
}
function shortsFor(d, n = 5) {
  const out = [];
  for (const c of topicChannels(d)) for (const v of S.data.shorts[c.handle] || []) out.push({ ...v, topic: c.topic });
  return out.length ? out.slice(0, n) : topicChannels(d).slice(0, n).map(c => ({ id: "", title: c.name }));
}
const thumb = (v, cls = "yt-thumb") => node("div", { class: cls, style: v.id ? `background-image:url("https://i.ytimg.com/vi/${encodeURIComponent(v.id)}/mqdefault.jpg")` : "" });
const LOUD = ["You WON'T believe what happened next", "I tried it for 30 days…", "The most satisfying video ever", "Top 10 moments (gone wrong)", "Reacting to the internet's worst ideas",
  "Why everyone is talking about this", "24 hours in a box", "This changes everything", "Don't watch this at night"];
const loudTile = i => node("div", { class: "yt-tile" }, node("div", { class: `yt-thumb loud${["", "2", "3"][i % 3]}` }), node("div", { class: "yt-t" }, LOUD[i % LOUD.length]),
  node("div", { class: "yt-m" }, "Recommended for you · 2.1M views"));

// ---------- the preview ----------
function topBar(d, after, { menu } = {}) {
  return node("div", { class: "yt-top" }, node("div", { class: "yt-burger" }), node("span", { class: "yt-site" }, "YouTube"),
    node("div", { class: "yt-search" }, "Search"),
    after ? node("div", { class: "yt-chip", "data-go": "timing", title: "Timing" }, node("img", { src: MARK, alt: "" }), "Set Target", menu ? timingMenu(d) : null) : null);
}
function rail(d, after, on = "Home") {
  return node("div", { class: "yt-rail" }, node("span", { class: on === "Home" ? "on" : "" }, "Home"),
    !after || !d.hideShorts ? node("span", { "data-go": "shorts" }, "Shorts") : null,
    node("span", { "data-go": after ? "watching" : null }, after && d.hideFeeds ? "Subscriptions (quiet)" : "Subscriptions"),
    !after || !d.hideFeeds ? node("span", {}, "Trending") : null);
}
function homeView(d, after, opts = {}) {
  const main = node("div", { class: "yt-main" });
  if (after && d.homeCard) {
    main.append(node("div", { "data-go": "home" },
      node("div", { class: "aim-card" }, node("span", { class: "aim-tag" }, node("img", { src: MARK, alt: "" }), BRAND), node("h3", {}, "What brings you here?"),
        node("div", { class: "box" }, "Tell me what you're looking for…"))));
    const vids = videosFor(d);
    if (vids.length) main.append(node("div", { "data-go": "home" }, node("div", { class: "yt-label" }, "Learn something", node("small", {}, "from channels you choose")),
      node("div", { class: "yt-grid" }, vids.map(v => node("div", { class: "yt-tile" }, thumb(v), node("div", { class: "yt-t" }, v.title), node("div", { class: "yt-m" }, `${v.channel} · ${v.topic}`))))));
    else main.append(node("div", { class: "aim-note", "data-go": "home", style: "margin-top:12px" }, "Pick topics to learn about, and new videos from channels that teach them well show here. Six at a time, no feed."));
  } else {
    main.append(node("div", { "data-go": "home" }, node("div", { class: "yt-grid" }, Array.from({ length: 6 }, (_, i) => loudTile(i)))));
  }
  const mode = shortsMode(d);
  if (!after || mode === "all") main.append(node("div", { "data-go": "shorts" }, node("div", { class: "yt-label" }, "Shorts"),
    node("div", { class: "yt-shorts" }, Array.from({ length: 6 }, (_, i) => node("div", { class: "yt-short loud" }, node("span", {}, LOUD[(i + 3) % LOUD.length]))))));
  else if (mode === "topics") main.append(node("div", { "data-go": "shorts" }, node("div", { class: "yt-label" }, "Quick review", node("small", {}, "Shorts from your topics, on what you've learned")),
    node("div", { class: "yt-shorts" }, shortsFor(d).map(v => node("div", { class: "yt-short", style: v.id ? `background-image:url("https://i.ytimg.com/vi/${encodeURIComponent(v.id)}/hqdefault.jpg")` : "" }, node("span", {}, v.title))))));
  else main.append(node("div", { class: "hidden-note", "data-go": "shorts" }, "No Shorts. (They're back on a break.)"));
  if (!after || !(d.homeCard)) main.append(node("div", { "data-go": "home" }, node("div", { class: "yt-label" }, "Trending"), node("div", { class: "yt-grid" }, Array.from({ length: 3 }, (_, i) => loudTile(i + 6)))));
  return node("div", { class: "yt" }, topBar(d, after, opts), node("div", { class: "yt-body" }, rail(d, after), main));
}
function watchView(d, after) {
  const v = videosFor(d, 4);
  const lead = v[0] || { id: "", title: "How volcanoes form", channel: "A science channel" };
  const autoplay = !after || !d.noAutoplay, recs = !after || !d.hideRecs;
  const side = recs
    ? node("div", { class: "yt-side", "data-go": "watching" }, node("div", { class: "yt-label", style: "margin-top:0" }, "Recommended"),
      Array.from({ length: 6 }, (_, i) => node("div", { class: "row" }, node("div", { class: `yt-thumb loud${["", "2", "3"][i % 3]}` }), node("div", {}, node("div", { class: "yt-t" }, LOUD[(i + 2) % LOUD.length]), node("div", { class: "yt-m" }, "1.4M views")))))
    : node("div", { class: "yt-side", "data-go": "watching" }, node("div", { class: "yt-label", style: "margin-top:0" }, "Up next from your search"),
      (v.length > 1 ? v.slice(1) : [{ title: "Plate tectonics, explained" }, { title: "Inside a volcano" }]).map(x => node("div", { class: "row" }, thumb(x), node("div", {}, node("div", { class: "yt-t" }, x.title), node("div", { class: "yt-m" }, x.channel || "")))),
      node("div", { class: "aim-note" }, "Only videos your own searches found. No rabbit holes."));
  const player = node("div", { class: "yt-player", style: lead.id ? `background-image:url("https://i.ytimg.com/vi/${encodeURIComponent(lead.id)}/hqdefault.jpg")` : "", "data-go": "watching" },
    node("div", { class: "play" }, "▶"),
    autoplay ? node("div", { class: "yt-next" }, "Up next in 5…") : null,
    node("div", { class: "ctl" }, "0:42 / 12:10", node("span", { style: "margin-left:auto", class: `yt-toggle${autoplay ? " on" : ""}` }, "Autoplay", node("i"))));
  return node("div", { class: "yt" }, topBar(d, after), node("div", { class: "yt-body" }, rail(d, after, ""),
    node("div", { class: "yt-main" }, node("div", { class: "yt-watch" },
      node("div", {}, player, node("div", { class: "yt-t", style: "margin-top:10px;font-size:15px" }, lead.title), node("div", { class: "yt-m" }, lead.channel),
        after ? node("div", { class: "aim-note", style: "margin-top:10px", "data-go": "watching" },
          d.strict ? "Strict: want more time, a warned channel or an off-Target search? Aim asks for a short reason first." : "Off your Target? Aim asks first, and you can always say yes.") : null),
      side))));
}
const minutes = m => (m >= 60 ? `${m / 60} h` : `${m} min`);
function timingMenu(d) {
  return node("div", { class: "aim-menu", "data-go": "timing" },
    node("div", {}, node("span", {}, "Breaks today"), node("b", {}, d.leisureMin ? `${minutes(d.leisureMin)} left` : "No limit")),
    node("div", {}, node("span", {}, "YouTube today"), node("b", {}, d.totalMin ? `${minutes(d.totalMin)} max` : "No limit")),
    node("div", {}, node("span", {}, "A video playing when time's up"), node("b", {}, d.graceMin ? `may finish (${d.graceMin} min)` : "stops")),
    node("div", {}, node("span", {}, "Target time limit"), node("b", {}, d.purposeLimitMin ? minutes(d.purposeLimitMin) : "None")));
}

function preview() {
  const box = $("preview"), id = STAGES[S.stage].id;
  if (S.review) {
    box.replaceChildren(node("div", { class: "split" },
      node("div", {}, node("p", { class: "cap" }, "Before"), homeView(S.d, false)),
      node("div", {}, node("p", { class: "cap" }, `With ${BRAND}`), homeView(S.d, true))));
  } else {
    const after = S.view === "after";
    box.replaceChildren(id === "watching" ? watchView(S.d, after) : homeView(S.d, after, { menu: id === "timing" && after }));
  }
  // Click a part to change it.
  for (const n of box.querySelectorAll("[data-go]")) n.addEventListener("click", e => {
    e.stopPropagation();
    if (S.review || S.view === "before") return;
    go(STAGES.findIndex(s => s.id === n.dataset.go));
  });
  for (const n of box.querySelectorAll(`[data-go="${id}"]`)) n.classList.add("changed");
}

// ---------- the panel ----------
function opt(label, sub, on, pick) {
  return node("button", { class: "opt", type: "button", "aria-pressed": String(!!on), disabled: S.readonly, onclick: pick }, node("b", {}, label), sub ? node("span", {}, sub) : null);
}
function seg(label, values, key) {
  return [node("div", { class: "group-label" }, label), node("div", { class: "seg", role: "group", "aria-label": label },
    values.map(([v, text]) => node("button", { type: "button", "aria-pressed": String(S.d[key] === v), disabled: S.readonly, onclick: () => set(key, v) }, text)))];
}
function set(key, value) {
  S.d = { ...S.d, [key]: value };
  draw();
}
function stagePanel(id) {
  const d = S.d;
  if (id === "home") {
    const on = new Set(d.learnTopics || []);
    const learnFrom = Object.values(S.avoid).filter(r => r.action === "prefer").length;
    return [
      opt("Ask what brings me here", "Aim's card, and new videos from topics you pick. The feed only on a break.", d.homeCard, () => set("homeCard", true)),
      opt("YouTube's usual feed", "Recommendations, as YouTube chooses them.", !d.homeCard, () => set("homeCard", false)),
      node("div", { class: "group-label" }, "Learn something about…"),
      node("div", { class: "seg", role: "group", "aria-label": "Topics" }, LEARN_TOPICS.map(t => node("button", { type: "button", "aria-pressed": String(on.has(t.id)), disabled: S.readonly,
        onclick: () => set("learnTopics", on.has(t.id) ? [...on].filter(x => x !== t.id) : [...on, t.id]) }, t.name))),
      node("p", { class: "muted small", style: "margin:8px 0 0" }, learnFrom ? `Plus ${learnFrom} channel${learnFrom === 1 ? "" : "s"} you learn from. ` : "",
        node("a", { href: "channels.html", target: "_blank" }, learnFrom ? "Sort your channels" : "Add the channels you subscribe to"))];
  }
  if (id === "shorts") {
    const mode = shortsMode(d), topics = (d.learnTopics || []).length > 0;
    return [
      opt("No Shorts", "Gone from the homepage, results and the menu. A Short you open asks first.", mode === "off", () => { S.d = { ...S.d, hideShorts: true, learnShorts: false }; draw(); }),
      opt("Only from my topics", topics ? "A few from your Learn something channels, as a Quick review of what you've learned. Any other Short waits." : "Pick topics on Home first: these come from their channels.",
        mode === "topics", () => { S.d = { ...S.d, hideShorts: true, learnShorts: true }; draw(); }),
      opt("As usual", "YouTube's Shorts everywhere.", mode === "all", () => { S.d = { ...S.d, hideShorts: false, learnShorts: false }; draw(); }),
      node("p", { class: "muted small", style: "margin:10px 0 0" }, "On a break, Shorts are back either way.")];
  }
  if (id === "watching") return [
    node("div", { class: "group-label", style: "margin-top:0" }, "Beside the video"),
    opt("Only what my search found", "No recommendations; Up next lists videos from your own searches.", d.hideRecs, () => set("hideRecs", true)),
    opt("YouTube's recommendations", null, !d.hideRecs, () => set("hideRecs", false)),
    node("div", { class: "group-label" }, "When a video ends"),
    opt("Stop", "Autoplay off. You choose what's next.", d.noAutoplay, () => set("noAutoplay", true)),
    opt("Play the next one", "Autoplay on.", !d.noAutoplay, () => set("noAutoplay", false)),
    node("div", { class: "group-label" }, "Subscriptions and trending"),
    opt("Quiet", "A short note instead of the feed, until a break.", d.hideFeeds, () => set("hideFeeds", true)),
    opt("As usual", null, !d.hideFeeds, () => set("hideFeeds", false)),
    node("div", { class: "group-label" }, "Bending a rule"),
    opt("Just ask me", "More time, a warned channel, an off-Target search: Aim checks once.", !d.strict, () => set("strict", false)),
    opt("Make me give a reason", "Strict: a short reason first, kept in this browser. Easy to read back later.", d.strict, () => set("strict", true))];
  return [
    ...seg("Breaks each day", [[30, "30 min"], [60, "1 hour"], [120, "2 hours"], [0, "No limit"]], "leisureMin"),
    node("p", { class: "muted small", style: "margin:6px 0 0" }, "All your breaks share this. Time on your Target doesn't count."),
    ...seg("YouTube each day, in all", [[0, "No limit"], [60, "1 hour"], [120, "2 hours"], [180, "3 hours"]], "totalMin"),
    ...seg("When time's up mid-video", [[0, "Stop"], [5, "5 min"], [15, "15 min"], [30, "30 min"]], "graceMin"),
    node("p", { class: "muted small", style: "margin:6px 0 0" }, "How long that video may keep playing."),
    ...seg("Each Target, by default", [[0, "No limit"], [30, "30 min"], [60, "1 hour"]], "purposeLimitMin")];
}

const LABELS = {
  homeCard: d => (d.homeCard ? "Asks what brings you here" : "YouTube's feed"),
  learnTopics: d => ((d.learnTopics || []).length ? LEARN_TOPICS.filter(t => d.learnTopics.includes(t.id)).map(t => t.name).join(", ") : "No topics"),
  shorts: d => ({ off: "No Shorts", topics: "Only from your topics", all: "As usual" }[shortsMode(d)]),
  watching: d => [d.hideRecs ? "Only your search's videos" : "Recommendations", d.noAutoplay ? "autoplay off" : "autoplay on", d.strict ? "strict" : null].filter(Boolean).join(", "),
  timing: d => [`Breaks ${d.leisureMin ? minutes(d.leisureMin) : "no limit"}`, d.totalMin ? `${minutes(d.totalMin)} a day` : null].filter(Boolean).join(", ")
};
function reviewPanel() {
  const rows = [["Homepage", LABELS.homeCard, 0], ["Learn something", LABELS.learnTopics, 0], ["Shorts", LABELS.shorts, 1], ["Watching", LABELS.watching, 2], ["Timing", LABELS.timing, 3]];
  return [node("div", { class: "count" }, "Your design"), node("h2", {}, S.applied ? "It's on" : "Ready?"),
    node("p", { class: "q" }, S.applied ? "Open YouTube to see it. Change anything here any time." : "Here's YouTube before, and with your choices. Apply it, and that's how YouTube looks from now on."),
    node("ul", { class: "summary" }, rows.map(([label, fn, i]) => node("li", {}, node("span", {}, node("b", {}, label), node("br"), fn(S.d)),
      node("button", { type: "button", onclick: () => { S.review = false; S.applied = false; go(i); } }, "Change")))),
    node("div", { class: "nav-row" }, node("button", { class: "btn text", type: "button", onclick: () => { S.review = false; go(STAGES.length - 1); } }, "Back"),
      S.applied ? node("a", { class: "btn", href: "https://www.youtube.com/", target: "_blank", id: "openYouTube" }, "Open YouTube")
        : node("button", { class: "btn", type: "button", id: "apply", disabled: S.readonly, onclick: apply }, "Apply to YouTube"))];
}

function panel() {
  const p = $("panel");
  if (S.review) return p.replaceChildren(...reviewPanel());
  const st = STAGES[S.stage];
  fill(p,
    S.readonly ? node("div", { class: "note readonly" }, "Your parent set up Aim for you, so these are shown, not changed here.") : null,
    node("div", { class: "count" }, S.wizard ? `Step ${S.stage + 1} of ${STAGES.length}` : st.name),
    node("h2", {}, st.title), node("p", { class: "q" }, st.q),
    ...stagePanel(st.id),
    S.wizard ? node("div", { class: "nav-row" },
      S.stage ? node("button", { class: "btn text", type: "button", onclick: () => go(S.stage - 1) }, "Back") : node("span"),
      node("button", { class: "btn", type: "button", id: "next", onclick: () => (S.stage < STAGES.length - 1 ? go(S.stage + 1) : (S.review = true, draw())) },
        S.stage < STAGES.length - 1 ? "Next" : "See the before and after"))
      : dirty() && !S.readonly ? node("div", { class: "applybar" }, node("span", {}, "Changes not applied yet"),
        node("span", {}, node("button", { class: "btn text", type: "button", onclick: () => { S.d = { ...S.cur }; draw(); } }, "Undo"),
          node("button", { class: "btn", type: "button", id: "apply", onclick: () => { S.review = true; draw(); } }, "Review and apply"))) : null);
}

// replaceChildren, leaving out the parts that aren't there (null).
const fill = (el, ...kids) => el.replaceChildren(...kids.flat().filter(k => k != null && k !== false));
function tabs() {
  fill($("tabs"),
    ...STAGES.map((s, i) => node("button", { type: "button", "aria-current": !S.review && i === S.stage ? "step" : null, onclick: () => { S.review = false; S.applied = false; go(i); } }, s.name)),
    node("span", { class: "spacer" }),
    S.review ? null : node("div", { class: "ba", role: "group", "aria-label": "Before or after" },
      ...[["before", "Before"], ["after", `With ${BRAND}`]].map(([v, t]) => node("button", { type: "button", "aria-pressed": String(S.view === v), onclick: () => { S.view = v; draw(); } }, t))));
}

function go(i) {
  if (i < 0) return;
  S.stage = i; S.view = "after";
  history.replaceState(null, "", `#${STAGES[i].id}`);
  draw();
}
// A link to a stage (Settings: "Jump to …") opens it directly.
window.addEventListener("hashchange", () => {
  const at = STAGES.findIndex(s => s.id === location.hash.slice(1));
  if (at < 0 || !S.cur) return;
  S.review = false; S.applied = false; S.wizard = false;
  go(at);
});
function draw() { tabs(); preview(); panel(); }

async function apply() {
  for (const k of KEYS) if (!same(S.cur[k], S.d[k])) {
    const r = await send({ type: "setting", key: k, value: S.d[k] });
    if (r?.result !== "applied") return toast("Couldn't save that. Try again.");
  }
  await send({ type: "design-applied" });
  S.cur = { ...S.d }; S.applied = true; S.wizard = false;
  toast("Applied. Your YouTube is ready.");
  draw();
}

(async () => {
  const st = await send({ type: "state" });
  const { learn = {}, avoid = {}, design = null } = await chrome.storage.local.get(["learn", "avoid", "design"]);
  for (const [h, c] of Object.entries(learn.channels || {})) { S.data.videos[h] = c.videos || []; S.data.shorts[h] = c.shorts || []; }
  S.avoid = avoid;
  S.cur = Object.fromEntries(KEYS.map(k => [k, st.settings[k]]));
  S.d = { ...S.cur };
  S.readonly = !!st.homeschool?.family;
  S.wizard = !design?.appliedAt && !S.readonly;
  const at = STAGES.findIndex(s => s.id === location.hash.slice(1));
  if (at >= 0) { S.stage = at; S.wizard = false; }
  draw();
})();
