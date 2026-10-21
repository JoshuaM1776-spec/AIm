// Aim — Design your YouTube. A configurator instead of a settings list, laid out like a car
// configurator: a large preview of YouTube on top that changes as you choose, one question at a time
// underneath, three stages (Home, Shorts, Watching) along the top, then a before-and-after
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

// Timing (break allowance, daily total) isn't a stage for now: it stays in More settings.
const STAGES = [
  { id: "home", name: "Home", title: "What should greet you?", q: "Choose what you see when you open YouTube." },
  { id: "shorts", name: "Shorts", title: "What about Shorts?", q: "Keep them, curate them, or remove them." },
  { id: "watching", name: "Watching", title: "How strict should Aim be?", q: `${BRAND} always asks what you're here for, then keeps the videos that fit. Choose what else steps aside.` }
];
const KEYS = ["homeCard", "learnRow", "learnTopics", "hideShorts", "learnShorts", "hideRecs", "noAutoplay", "hideFeeds", "strict"];
const greeting = d => (!d.homeCard ? "feed" : "clean");

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
// Taking turns between channels, newest first within each, like Learn something on YouTube.
function videosFor(d, n = 6) {
  const queues = topicChannels(d).map(c => (S.data.videos[c.handle] || []).map(v => ({ ...v, topic: c.topic }))).filter(q => q.length)
    .sort((a, b) => (b[0].published || 0) - (a[0].published || 0));
  const out = [], seen = new Set();
  for (let round = 0; out.length < n && queues.some(q => q[round]); round++)
    for (const q of queues) { const v = q[round]; if (v && !seen.has(v.id) && out.length < n) { seen.add(v.id); out.push(v); } }
  if (out.length) return out;
  return topicChannels(d).slice(0, n).map(c => ({ id: "", title: `New from ${c.name}`, channel: c.name, topic: c.topic }));
}
function shortsFor(d, n = 5) {
  const queues = topicChannels(d).map(c => (S.data.shorts[c.handle] || []).map(v => ({ ...v, topic: c.topic }))).filter(q => q.length);
  const out = [];
  for (let round = 0; out.length < n && queues.some(q => q[round]); round++) for (const q of queues) if (q[round] && out.length < n) out.push(q[round]);
  return out.length ? out : topicChannels(d).slice(0, n).map(c => ({ id: "", title: c.name }));
}

// ---------- pieces of the preview ----------
const ICONS = {
  play: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="2.5" y="5" width="19" height="14" rx="4"/><path d="M10 9.2v5.6l4.8-2.8z" fill="currentColor" stroke="none"/></svg>',
  search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/></svg>',
  bell: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z"/><path d="M10 20a2 2 0 0 0 4 0"/></svg>',
  home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3.5 11 12 4l8.5 7"/><path d="M6 9.5V20h12V9.5"/><path d="M10 20v-5h4v5"/></svg>',
  video: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="6" width="13" height="12" rx="3"/><path d="m16 10.5 5-3v9l-5-3z"/></svg>',
  clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l-2 3"/></svg>',
  list: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 7h11M4 12h11M4 17h7"/><path d="M17 14.5v5l4-2.5z" fill="currentColor"/></svg>',
  shorts: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="4" y="5" width="16" height="15" rx="2.5"/><path d="M4 9.5h16M8 5l2 4.5M13 5l2 4.5"/></svg>',
  shield: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 3.5 19 6v5.5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z"/><path d="m9 12 2 2 4-4"/></svg>'
};
const icon = name => { const t = document.createElement("template"); t.innerHTML = ICONS[name]; return t.content.firstChild; };

// A video card: its real thumbnail when Learn something has it, else a soft tile with its channel.
const TINTS = ["#e8d5b7,#c98a5b", "#cfe3d9,#5f9c82", "#d6dcf3,#7186c9", "#f3d6d6,#c97171", "#e3daf3,#9278c4", "#d8ecf0,#5aa3b3"];
const tint = s => TINTS[[...String(s)].reduce((n, c) => n + c.charCodeAt(0), 0) % TINTS.length];
function img(v, cls, size = "hqdefault") {
  if (v.id) return node("div", { class: cls, style: `background-image:url("https://i.ytimg.com/vi/${encodeURIComponent(v.id)}/${size}.jpg")` });
  return node("div", { class: `${cls} ph`, style: `--ph: linear-gradient(140deg, ${tint(v.channel || v.title)})` }, node("span", {}, v.channel || v.title));
}
const card = v => node("div", { class: "yt-card" }, img(v, "img"), node("div", { class: "t" }, v.title), node("div", { class: "m" }, v.channel ? `${v.channel}${v.topic ? ` · ${v.topic}` : ""}` : ""));
const LOUD = ["You WON'T believe what happened next", "I tried it for 30 days…", "The most satisfying video ever", "Top 10 moments (gone wrong)", "Reacting to the internet's worst ideas",
  "Why everyone is talking about this", "24 hours in a box", "This changes everything", "Don't watch this at night"];
const LOUD_TINTS = ["#ff9a3c,#e9445a", "#5a8dee,#9b5de5", "#2ec4b6,#ff9f1c", "#ff5f6d,#ffc371"];
const loudCard = i => node("div", { class: "yt-card" }, node("div", { class: "img ph", style: `--ph: linear-gradient(135deg, ${LOUD_TINTS[i % 4]})` }),
  node("div", { class: "t" }, LOUD[i % LOUD.length]), node("div", { class: "m" }, "Recommended for you · 2.1M views"));
const loudShort = i => node("div", { class: "yt-short ph", style: `--ph: linear-gradient(160deg, ${LOUD_TINTS[(i + 3) % 4]})` }, node("span", {}, LOUD[(i + 3) % LOUD.length]));

// The line under the preview: what's keeping you on your aim.
function statusLine(d) {
  const parts = [d.strict ? "Strict: a reason before bending a rule" : "Asks what you're here for", d.hideRecs ? "recommendations hidden" : "recommendations shown",
    d.noAutoplay ? "autoplay off" : "autoplay on"];
  return node("div", { class: "yt-status", "data-go": "watching" }, icon("shield"), parts.join(" · "));
}

function topBar(d, after) {
  return node("div", { class: "yt-top" }, node("div", { class: "yt-logo" }, icon("play"), "YouTube"),
    node("div", { class: "yt-tools" }, node("div", { class: "search" }, "Search"), icon("search"), icon("bell"),
      after ? node("div", { class: "yt-chip" }, node("img", { src: MARK, alt: "" }), "Set aim") : null));
}
function rail(d, after) {
  const shortsOff = after && d.hideShorts && !d.learnShorts;
  return node("div", { class: "yt-rail" }, icon("home"), (() => { const n = icon("video"); if (shortsOff) n.classList.add("off"); n.setAttribute("data-go", "shorts"); return n; })(), icon("clock"), icon("list"));
}

function homeView(d, after) {
  const main = node("div", { class: "yt-main" });
  if (after && d.homeCard) {
    main.append(node("div", { class: "aim-ask", "data-go": "home" }, node("img", { src: MARK, alt: "" }), node("b", {}, "What brings you here?"), node("span", {}, "Tell me what you're looking for…")));
    main.append(node("div", { class: "aim-explore", "data-go": "home" }, node("span", {}, "Not sure what you're looking for?"), node("b", {}, "Explore")));
  } else {
    main.append(node("div", { "data-go": "home" }, node("div", { class: "yt-head" }, node("h3", {}, "Recommended for you")),
      node("div", { class: "yt-cards" }, [0, 1].map(loudCard))));
  }
  main.append(node("hr", { class: "yt-rule" }));
  const mode = shortsMode(d);
  if (!after || mode === "all") main.append(node("div", { "data-go": "shorts" },
    node("div", { class: "yt-head" }, icon("shorts"), node("h3", {}, "Shorts"), node("small", {}, "Everything, endlessly")),
    node("div", { class: "yt-shorts" }, [0, 1, 2].map(loudShort))));
  else if (mode === "topics") main.append(node("div", { "data-go": "shorts" },
    node("div", { class: "yt-head" }, icon("shorts"), node("h3", {}, "Shorts"), node("small", {}, "Quick review, from your topics' channels")),
    node("div", { class: "yt-shorts" }, shortsFor(d, 3).map(v => img(v, "yt-short", "oar2")))));
  else main.append(node("div", { "data-go": "shorts" }, node("div", { class: "yt-head" }, icon("shorts"), node("h3", {}, "Shorts")),
    node("div", { class: "yt-gone" }, "No Shorts. (They're back on a break.)")));
  if (after) main.append(statusLine(d));
  return node("div", { class: "yt" }, topBar(d, after), node("div", { class: "yt-body" }, rail(d, after), main));
}

function watchView(d, after) {
  const v = videosFor(d, 3);
  const lead = v[0] || { id: "", title: "How volcanoes form", channel: "A science channel" };
  const autoplay = !after || !d.noAutoplay, recs = !after || !d.hideRecs;
  const player = node("div", { class: "yt-player", style: lead.id ? `background-image:url("https://i.ytimg.com/vi/${encodeURIComponent(lead.id)}/hqdefault.jpg")` : `background-image:linear-gradient(140deg, ${tint(lead.channel)})`, "data-go": "watching" },
    node("div", { class: "play" }, node("i", {}, "▶")),
    autoplay ? node("div", { class: "yt-next" }, "Up next in 5…") : null,
    node("div", { class: "ctl" }, "0:42 / 12:10", node("span", { class: `yt-toggle${autoplay ? " on" : ""}` }, "Autoplay", node("i"))));
  const next = recs
    ? node("div", { "data-go": "watching" }, node("div", { class: "yt-head" }, node("h3", {}, "Recommended")), node("div", { class: "yt-cards" }, [2, 3].map(loudCard)))
    : node("div", { "data-go": "watching" }, node("div", { class: "yt-head" }, node("h3", {}, "Up next from your search"), node("small", {}, "Only what you searched for")),
      node("div", { class: "yt-cards" }, (v.length > 1 ? v.slice(1, 3) : [{ title: "Plate tectonics, explained", channel: "A science channel" }, { title: "Inside a volcano", channel: "A geology channel" }]).map(card)));
  return node("div", { class: "yt" }, topBar(d, after), node("div", { class: "yt-body" }, rail(d, after),
    node("div", { class: "yt-main" }, player, node("div", { class: "yt-title" }, lead.title), node("div", { class: "yt-card" }, node("div", { class: "m" }, lead.channel)),
      node("hr", { class: "yt-rule" }), next, after ? statusLine(d) : null)));
}

function preview() {
  const box = $("preview"), id = STAGES[S.stage].id;
  if (S.review) {
    box.replaceChildren(node("div", { class: "split" },
      node("div", {}, node("p", { class: "cap" }, "Before"), homeView(S.d, false)),
      node("div", {}, node("p", { class: "cap" }, `With ${BRAND}`), homeView(S.d, true))));
  } else {
    const after = S.view === "after";
    box.replaceChildren(id === "watching" ? watchView(S.d, after) : homeView(S.d, after));
  }
  // Click a part to change it.
  for (const n of box.querySelectorAll("[data-go]")) n.addEventListener("click", e => {
    e.stopPropagation();
    if (S.review || S.view === "before") return;
    go(STAGES.findIndex(s => s.id === n.dataset.go));
  });
  for (const n of box.querySelectorAll(`[data-go="${id}"]`)) n.classList.add("changed");
}

// ---------- the question ----------
function opt(label, sub, on, pick) {
  return node("button", { class: "opt", type: "button", "aria-pressed": String(!!on), disabled: S.readonly, onclick: pick }, node("div", {}, node("b", {}, label), sub ? node("span", {}, sub) : null));
}
function seg(label, values, key) {
  return [node("div", { class: "group-label" }, label), node("div", { class: "seg", role: "group", "aria-label": label },
    values.map(([v, text]) => node("button", { type: "button", "aria-pressed": String(S.d[key] === v), disabled: S.readonly, onclick: () => set(key, v) }, text)))];
}
function set(key, value) {
  S.d = { ...S.d, [key]: value };
  draw();
}
// Topic picks and the way to your channels: under "Only Shorts from selected channels" while none
// are chosen. (Your interests are otherwise picked in Explore, on YouTube.)
function channelPicks(d) {
  const on = new Set(d.learnTopics || []);
  const learnFrom = Object.values(S.avoid).filter(r => r.action === "prefer").length;
  return node("div", { class: "under" }, node("div", { class: "group-label", style: "margin-top:4px" }, "Your interests"),
    node("div", { class: "seg", role: "group", "aria-label": "Topics" }, LEARN_TOPICS.map(t => node("button", { type: "button", "aria-pressed": String(on.has(t.id)), disabled: S.readonly,
      onclick: () => set("learnTopics", on.has(t.id) ? [...on].filter(x => x !== t.id) : [...on, t.id]) }, t.name))),
    node("p", { class: "hint" }, learnFrom ? `Plus ${learnFrom} channel${learnFrom === 1 ? "" : "s"} you learn from. ` : "",
      node("a", { href: "channels.html", target: "_blank" }, learnFrom ? "Sort your channels" : "Add the channels you subscribe to")));
}
const hasChannels = d => (d.learnTopics || []).length > 0 || Object.values(S.avoid).some(r => r.action === "prefer");
function stagePanel(id) {
  const d = S.d;
  if (id === "home") {
    const g = greeting(d);
    return [
      opt("A clean page with my aim", "Just \u201cWhat brings you here?\u201d, with Explore one tap away for when you're not sure.", g === "clean", () => { S.d = { ...S.d, homeCard: true }; draw(); }),
      opt("The regular YouTube feed", "Recommendations, as YouTube chooses them.", g === "feed", () => { S.d = { ...S.d, homeCard: false }; draw(); })].flat();
  }
  if (id === "shorts") {
    const mode = shortsMode(d);
    return [
      opt("Hide Shorts", "A Short you open asks first. They're back on a break.", mode === "off", () => { S.d = { ...S.d, hideShorts: true, learnShorts: false }; draw(); }),
      opt("Only Shorts from selected channels", "A quick review of what you've learned. Any other Short waits.", mode === "topics", () => { S.d = { ...S.d, hideShorts: true, learnShorts: true }; draw(); }),
      mode === "topics" && !hasChannels(d) ? [node("p", { class: "hint" }, "Choose channels first: pick a topic, or add your own."), channelPicks(d)] : null,
      opt("Show all Shorts", null, mode === "all", () => { S.d = { ...S.d, hideShorts: false, learnShorts: false }; draw(); })].flat(2);
  }
  return [
    opt("Ask once, then trust me", "Off your aim? Aim checks once, and you can always say yes.", !d.strict, () => set("strict", false)),
    opt("Keep me strictly on my aim", "Bending a rule (more time, a warned channel, an off-aim search) needs a short reason first.", d.strict, () => set("strict", true)),
    node("div", { class: "group-label" }, "Beside the video"),
    opt("Only what my search found", "No recommendations; Up next lists videos from your own searches.", d.hideRecs, () => set("hideRecs", true)),
    opt("YouTube's recommendations", null, !d.hideRecs, () => set("hideRecs", false)),
    node("div", { class: "group-label" }, "When a video ends"),
    opt("Stop", "Autoplay off. You choose what's next.", d.noAutoplay, () => set("noAutoplay", true)),
    opt("Play the next one", "Autoplay on.", !d.noAutoplay, () => set("noAutoplay", false)),
    node("div", { class: "group-label" }, "Subscriptions and trending"),
    opt("Quiet until a break", "A short note instead of the feed.", d.hideFeeds, () => set("hideFeeds", true)),
    opt("As usual", null, !d.hideFeeds, () => set("hideFeeds", false))];
}

const LABELS = {
  homeCard: d => ({ clean: "A clean page with your aim, and Explore", feed: "The regular feed" }[greeting(d)]),
  learnTopics: d => ((d.learnTopics || []).length ? LEARN_TOPICS.filter(t => d.learnTopics.includes(t.id)).map(t => t.name).join(", ") : "No topics"),
  shorts: d => ({ off: "Hidden", topics: "Only from selected channels", all: "All Shorts" }[shortsMode(d)]),
  watching: d => [d.strict ? "Strictly on my aim" : "Asks once", d.hideRecs ? "only your search's videos" : "recommendations", d.noAutoplay ? "autoplay off" : "autoplay on"].join(", "),
};
// replaceChildren, leaving out the parts that aren't there (null).
const fill = (el, ...kids) => el.replaceChildren(...kids.flat().filter(k => k != null && k !== false));

function reviewPanel() {
  const rows = [["Homepage", LABELS.homeCard, 0], ...(shortsMode(S.d) === "topics" ? [["Your interests", LABELS.learnTopics, 1]] : []), ["Shorts", LABELS.shorts, 1], ["Watching", LABELS.watching, 2]];
  return [node("div", { class: "count" }, "Your design"), node("h2", {}, S.applied ? "It's on" : "Here's your YouTube"),
    node("p", { class: "q" }, S.applied ? "Open YouTube to see it. Change anything here any time." : "Before, and with your choices. Apply it, and that's how YouTube looks from now on."),
    node("ul", { class: "summary" }, rows.map(([label, fn, i]) => node("li", {}, node("span", {}, node("b", {}, label), fn(S.d)),
      node("button", { type: "button", onclick: () => { S.review = false; S.applied = false; go(i); } }, "Change")))),
    node("div", { class: "nav-row" }, node("button", { class: "back", type: "button", onclick: () => { S.review = false; go(STAGES.length - 1); } }, "← Back"),
      S.applied ? node("a", { class: "go", href: "https://www.youtube.com/", target: "_blank", id: "openYouTube" }, "Open YouTube →")
        : node("button", { class: "go", type: "button", id: "apply", disabled: S.readonly, onclick: apply }, "Apply to YouTube"))];
}

function panel() {
  const p = $("panel");
  if (S.review) return fill(p, ...reviewPanel());
  const st = STAGES[S.stage];
  fill(p,
    S.readonly ? node("div", { class: "note readonly" }, "Your parent set up Aim for you, so these are shown, not changed here.") : null,
    node("div", { class: "count" }, S.wizard ? `Step ${S.stage + 1} of ${STAGES.length}` : st.name),
    node("h2", {}, st.title), node("p", { class: "q" }, st.q),
    ...stagePanel(st.id),
    S.wizard ? node("div", { class: "nav-row" },
      S.stage ? node("button", { class: "back", type: "button", onclick: () => go(S.stage - 1) }, "← Back") : null,
      node("button", { class: "go", type: "button", id: "next", onclick: () => (S.stage < STAGES.length - 1 ? go(S.stage + 1) : (S.review = true, draw())) },
        S.stage < STAGES.length - 1 ? "Next →" : "See the before and after →"))
      : dirty() && !S.readonly ? node("div", { class: "applybar" }, node("span", {}, "Changes not applied yet"),
        node("span", {}, node("button", { class: "btn text", type: "button", onclick: () => { S.d = { ...S.cur }; draw(); } }, "Undo"),
          node("button", { class: "btn", type: "button", id: "apply", onclick: () => { S.review = true; draw(); } }, "Review and apply"))) : null);
}

function tabs() {
  fill($("tabs"), ...STAGES.map((s, i) => node("button", { type: "button", class: S.review || (S.wizard ? i <= S.stage : true) ? "done" : "",
    "aria-current": !S.review && i === S.stage ? "step" : null, onclick: () => { S.review = false; S.applied = false; go(i); } }, node("i"), s.name)));
  fill($("ba"), S.review ? null : node("span", { class: "ba", role: "group", "aria-label": "Before or after" },
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
