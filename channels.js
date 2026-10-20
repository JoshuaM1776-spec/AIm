// Aim — Your channels: the channels you subscribe to (read from YouTube by content/subs.js) and the
// ones you've sorted from YouTube's menu, in four columns. Learn from: new videos in Learn something
// and its Quick review, a "Your channel" badge, first in the librarian's picks; under a topic of
// yours if you like. For breaks: free on a break; on an aim, Aim asks first. Keep out: hidden, or
// asked about. Not sorted: as before. Tap a button or drag a card; suggestions come from Learn
// something's hand-picked channels and the channels you've watched for aims.

const BRAND = chrome.runtime.getManifest().name;
for (const n of document.querySelectorAll("[data-brand]")) n.textContent = BRAND;
const send = msg => chrome.runtime.sendMessage(msg).catch(() => null);
const $ = id => document.getElementById(id);

function node(tag, props = {}, ...kids) {
  const n = Object.assign(document.createElement(tag), props);
  n.append(...kids.flat().filter(k => k != null && k !== false));
  return n;
}
function toast(msg) {
  const t = $("toast");
  t.textContent = msg;
  t.style.display = "block";
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => (t.style.display = "none"), 3000);
}

const COLS = [
  { cat: "none", title: "Not sorted", text: "As YouTube shows them. Sort the ones that matter; the rest can wait." },
  { cat: "learn", title: "Learn from", text: "Their new videos show in Learn something (and Quick review Shorts), with a “Your channel” badge in results." },
  { cat: "break", title: "For breaks", text: "Watch freely on a break. On an aim, it asks first." },
  { cat: "out", title: "Keep out", text: "Hidden from your homepage, results and sidebar, or Aim asks before you watch." }
];
const catOf = rule => !rule ? "none" : rule.action === "prefer" ? "learn" : rule.action === "break" ? "break" : "out";

let state = null, dragging = null;

// Every channel: subscriptions first, then any you've sorted that aren't among them.
function channels() {
  const out = new Map();
  for (const c of state.subs.channels || []) out.set(c.key, { ...c });
  for (const [key, r] of Object.entries(state.avoid)) if (!out.has(key)) out.set(key, { key, name: r.name || key.slice(1), avatar: "" });
  return [...out.values()].sort((a, b) => a.name.localeCompare(b.name));
}

// Where a channel probably belongs: Learn something's hand-picked channels (under their topic), or a
// channel you've watched for two or more aims.
const CURATED = new Map(LEARN_TOPICS.flatMap(t => t.channels.map(c => [c.handle.toLowerCase(), t.name])));
function suggestion(c) {
  const topic = CURATED.get(c.key.slice(1).toLowerCase());
  if (topic) return { cat: "learn", topic, why: `Teaches ${topic}` };
  if ((state.watched[c.name] || 0) >= 2) return { cat: "learn", topic: "", why: `You watched it for ${state.watched[c.name]} aims` };
  return null;
}

async function place(c, cat, topic) {
  const rule = state.avoid[c.key];
  const action = cat === "learn" ? "prefer" : cat === "break" ? "break" : cat === "out" ? (rule?.action === "warn" ? "warn" : "hide") : null;
  if (cat === "learn" && topic && !state.settings.myTopics.includes(topic)) await addTopic(topic);
  const r = await send({ type: "avoid", key: c.key, name: c.name, action, topic: cat === "learn" ? topic || "" : undefined });
  if (!r || r.result !== "applied") return toast("Couldn't save that. Try again.");
  state.avoid = r.avoid;
  render();
}
async function addTopic(name) {
  name = name.trim().slice(0, 40);
  if (!name || state.settings.myTopics.some(t => t.toLowerCase() === name.toLowerCase())) return;
  const r = await send({ type: "setting", key: "myTopics", value: [...state.settings.myTopics, name] });
  if (r?.settings) state.settings = r.settings;
}

function card(c) {
  const rule = state.avoid[c.key], cat = catOf(rule);
  const initial = (c.name.replace(/^@/, "")[0] || "?").toUpperCase();
  const av = node("span", { className: "av", textContent: c.avatar ? "" : initial });
  if (c.avatar) av.append(node("img", { src: c.avatar, alt: "", referrerPolicy: "no-referrer", loading: "lazy", onerror: e => { e.target.remove(); av.textContent = initial; } }));
  const acts = node("div", { className: "acts" });
  const go = (label, to) => node("button", { type: "button", textContent: label, title: `Move to ${COLS.find(x => x.cat === to).title}`,
    "aria-label": `Move ${c.name} to ${COLS.find(x => x.cat === to).title}`, onclick: () => place(c, to, rule?.topic) });
  if (cat !== "learn") acts.append(go("Learn", "learn"));
  if (cat !== "break") acts.append(go("Break", "break"));
  if (cat !== "out") acts.append(go("Out", "out"));
  if (cat === "learn") {
    const sel = node("select", { "aria-label": `Topic for ${c.name}` });
    sel.append(new Option("No topic", ""), ...state.settings.myTopics.map(t => new Option(t, t, false, t === rule.topic)));
    sel.onchange = () => place(c, "learn", sel.value);
    acts.prepend(sel);
  }
  if (cat === "out") {
    const sel = node("select", { "aria-label": `How to keep out ${c.name}` });
    sel.append(new Option("Hide", "hide", false, rule.action === "hide"), new Option("Ask first", "warn", false, rule.action === "warn"));
    sel.onchange = async () => { const r = await send({ type: "avoid", key: c.key, name: c.name, action: sel.value }); if (r?.avoid) { state.avoid = r.avoid; render(); } };
    acts.prepend(sel);
  }
  const href = `https://www.youtube.com${c.key}`;
  const unsort = cat !== "none" ? node("button", { type: "button", className: "x", textContent: "×", title: "Unsort", "aria-label": `Unsort ${c.name}`, onclick: () => place(c, "none") }) : null;
  const el = node("div", { className: "ch", draggable: true },
    av, node("div", { className: "top" }, node("a", { className: "name", href, target: "_blank", rel: "noopener", textContent: c.name, title: c.name }), unsort), acts);
  el.dataset.key = c.key;
  const s = cat === "none" ? suggestion(c) : null;
  if (s) el.append(node("div", { className: "sugg" }, `Suggested: Learn from${s.topic ? ` · ${s.topic}` : ""} (${s.why})`,
    node("button", { type: "button", textContent: "OK", "aria-label": `Put ${c.name} under Learn from`, onclick: () => place(c, s.cat, s.topic) })));
  el.addEventListener("dragstart", e => { dragging = c; el.classList.add("dragging"); e.dataTransfer.setData("text/plain", c.key); e.dataTransfer.effectAllowed = "move"; });
  el.addEventListener("dragend", () => { dragging = null; el.classList.remove("dragging"); });
  return el;
}

// A place to drop a card: a column, or a topic inside Learn from.
function dropZone(cat, topic, cards) {
  const z = node("div", { className: "drop" }, cards);
  z.dataset.cat = cat;
  z.addEventListener("dragover", e => { if (!dragging) return; e.preventDefault(); z.classList.add("over"); });
  z.addEventListener("dragleave", () => z.classList.remove("over"));
  z.addEventListener("drop", e => { e.preventDefault(); z.classList.remove("over"); if (dragging) place(dragging, cat, topic); });
  return z;
}

function render() {
  if (dragging) return;
  const q = $("filter").value.trim().toLowerCase();
  const all = channels(), shown = all.filter(c => !q || c.name.toLowerCase().includes(q));
  const by = cat => shown.filter(c => catOf(state.avoid[c.key]) === cat);

  // Getting your subscriptions from YouTube.
  const subs = state.subs, n = (subs.channels || []).length;
  const get = node("button", { className: `btn ${n ? "tonal" : ""}`.trim(), type: "button", id: "readSubs", textContent: n ? "Read them again" : "Get my subscriptions from YouTube",
    onclick: () => chrome.tabs.create({ url: "https://www.youtube.com/feed/channels?aim=import" }) });
  $("import").replaceChildren(
    node("div", { className: "spread" },
      node("div", {}, node("b", { textContent: n ? `${n} subscriptions` : "Bring in the channels you subscribe to" }),
        node("div", { className: "muted small", textContent: n ? `Read from YouTube ${new Date(subs.at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}. New subscriptions show up when you read them again.`
          : "You'll need to be signed in to YouTube in this browser. Aim reads the list in a YouTube tab and keeps it here; it never leaves this browser." })),
      get));

  const sugg = all.filter(c => catOf(state.avoid[c.key]) === "none" && suggestion(c));
  $("acceptAll").hidden = !sugg.length;
  $("acceptAll").textContent = `Accept ${sugg.length} suggestion${sugg.length === 1 ? "" : "s"}`;
  $("acceptAll").onclick = async () => {
    for (const c of sugg) { const s = suggestion(c); if (s.topic && !state.settings.myTopics.includes(s.topic)) await addTopic(s.topic); }
    for (const c of sugg) { const s = suggestion(c); const r = await send({ type: "avoid", key: c.key, name: c.name, action: "prefer", topic: s.topic }); if (r?.avoid) state.avoid = r.avoid; }
    toast(`${sugg.length} sorted into Learn from.`);
    render();
  };

  $("board").replaceChildren(...COLS.map(col => {
    const list = by(col.cat);
    const head = [node("h2", {}, col.title, node("span", { className: "count", textContent: String(list.length) })), node("p", { textContent: col.text })];
    if (col.cat !== "learn") return node("section", { className: "col", "aria-label": col.title }, head, dropZone(col.cat, "", list.map(card)));
    // Learn from: grouped by your topics, then those without one.
    const topics = state.settings.myTopics;
    const groups = [...topics, ""].map(t => {
      const inT = list.filter(c => (topics.includes(state.avoid[c.key].topic) ? state.avoid[c.key].topic : "") === t);
      const remove = t ? node("button", { type: "button", textContent: "Remove", "aria-label": `Remove topic ${t}`, onclick: () => removeTopic(t) }) : null;
      return node("div", { className: "group" }, node("h3", {}, t || (topics.length ? "No topic" : "Channels"), remove), dropZone("learn", t, inT.map(card)));
    });
    const input = node("input", { type: "text", placeholder: "Add a topic, like Woodworking", maxLength: 40, "aria-label": "New topic" });
    const add = node("form", { className: "addtopic" }, input, node("button", { className: "btn tonal", type: "submit", textContent: "Add" }));
    add.onsubmit = async e => { e.preventDefault(); await addTopic(input.value); render(); };
    return node("section", { className: "col", "aria-label": col.title }, head, groups, add);
  }));
}

// A topic you remove: its channels stay under Learn from, without a topic.
async function removeTopic(t) {
  for (const [key, r] of Object.entries(state.avoid)) if (r.action === "prefer" && r.topic === t) await send({ type: "avoid", key, name: r.name, action: "prefer", topic: "" });
  const r = await send({ type: "setting", key: "myTopics", value: state.settings.myTopics.filter(x => x !== t) });
  if (r?.settings) state.settings = r.settings;
  await load();
}

async function load() {
  const s = await send({ type: "channels-page" });
  if (!s) return;
  state = { ...s, subs: s.subs || {}, avoid: s.avoid || {}, watched: s.watched || {} };
  render();
}
$("filter").oninput = render;
// Subscriptions arrive from the YouTube tab; changes made on YouTube show up here too.
let reloadTimer = null;
chrome.storage.onChanged.addListener((ch, area) => {
  if (area === "local" && (ch.subs || ch.avoid || ch.settings)) { clearTimeout(reloadTimer); reloadTimer = setTimeout(load, 300); }
});
load();
