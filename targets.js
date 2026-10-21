// Aim — Your aims: Active, Exploring and Completed, each with how far along it is.
// Resuming returns to the last video at the moment you left it, or else to the last search.

const BRAND = chrome.runtime.getManifest().name;
for (const n of document.querySelectorAll("[data-brand]")) n.textContent = BRAND;
const send = msg => chrome.runtime.sendMessage(msg).catch(() => null);
const OUTCOME = { yes: "Found what you needed", partly: "Partly found it", no: "Didn't find it" };

function node(tag, props = {}, ...kids) {
  const n = Object.assign(document.createElement(tag), props);
  n.append(...kids.flat().filter(k => k != null && k !== false));
  return n;
}
const btn = (label, cls, onclick) => node("button", { className: `btn ${cls}`.trim(), type: "button", textContent: label, onclick });

function toast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.style.display = "block";
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => (t.style.display = "none"), 3000);
}

function when(ts) {
  if (!ts) return "";
  const day = d => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((day(new Date()) - day(new Date(ts))) / 86400000);
  return days <= 0 ? "today" : days === 1 ? "yesterday" : days < 7 ? `${days} days ago`
    : new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function meta(t, lead) {
  const mins = Math.round(t.usedSec / 60);
  return [lead, mins ? `${mins} min` : null, t.videos ? `${t.videos} video${t.videos > 1 ? "s" : ""}` : null,
    t.state === "completed" && t.outcome ? OUTCOME[t.outcome] : null].filter(Boolean).join(" · ");
}

async function resume(id) {
  const r = await send({ type: "purpose-resume", id });
  if (!r || r.result !== "applied") return toast(r?.message || "Couldn't do that. Try again.");
  location.href = r.url;
}

// Thumbnails of what you watched for an aim, as on YouTube's home screen: only videos you chose.
const fmt = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
function thumb(v, cls) {
  const pct = v.d > 0 && v.t > 0 ? Math.min(100, Math.round((v.t / v.d) * 100)) : 0;
  const n = node("span", { className: `thumb ${cls}` },
    v.d ? node("span", { className: "thumb-len", textContent: fmt(v.d) }) : null,
    pct ? node("span", { className: "thumb-progress" }, node("i", { style: `width: ${pct}%` })) : null);
  n.style.backgroundImage = `url("https://i.ytimg.com/vi/${encodeURIComponent(v.id)}/mqdefault.jpg")`;
  return n;
}
// Pick the aim back up, then play this video from where you stopped.
async function playVideo(t, v) {
  const r = await send({ type: "purpose-resume", id: t.id });
  if (!r || r.result !== "applied") return toast(r?.message || "Couldn't do that. Try again.");
  await send({ type: "purpose-allow", query: "", videos: [{ id: v.id, title: v.title, channel: v.channel }], lists: [] });
  const from = v.t > 5 && !(v.d && v.t > v.d - 15) ? `&t=${Math.floor(v.t)}s` : "";
  location.href = `https://www.youtube.com/watch?v=${encodeURIComponent(v.id)}${from}`;
}
function videos(t) {
  const more = (t.recent || []).slice(1);
  if (!more.length) return null;
  return node("details", { className: "videos" }, node("summary", { textContent: `See more videos (${more.length})` }),
    node("div", { className: "minis" }, more.map(v => node("button", { className: "mini", type: "button", title: v.title, onclick: () => playVideo(t, v) },
      thumb(v, "thumb-sm"), node("span", { className: "mini-title", textContent: v.title })))));
}

// How far along: understanding for a learning aim with a map, topics checked for a study session.
function progress(t) {
  const u = t.understanding, st = t.study;
  const [done, of, label] = u?.parts?.length ? [u.parts.filter(x => x.status === "explained").length + (u.solid ? 1 : 0), u.parts.length + 1,
    u.solid ? "Put together" : u.ready ? "Ready to put together" : `${u.parts.filter(x => x.status === "explained").length} of ${u.parts.length} explained`]
    : st ? [st.checked, st.of, `${st.checked} of ${st.of} topics checked`] : [0, 0, null];
  if (!label) return t.practice?.tried ? node("div", { className: "progress" }, node("span", { textContent: `You tried it: ${t.practice.title}` })) : null;
  return node("div", { className: "progress" }, node("span", { className: "track" }, node("i", { style: `width:${Math.round((done / of) * 100)}%` })), node("span", { textContent: label }));
}

function row(t, actions, lead) {
  const v = t.recent?.[0];
  return node("div", { className: "item" },
    v ? node("button", { className: "lead-thumb", type: "button", title: `Continue “${v.title}”`, onclick: () => playVideo(t, v) }, thumb(v, "thumb-md")) : null,
    node("div", { className: "grow" }, node("b", { textContent: t.text, title: t.text }),
      node("span", { className: "sub", textContent: meta(t, lead) }),
      progress(t),
      v ? node("span", { className: "sub", textContent: `Last video: ${v.title}` }) : null,
      t.trail?.length > 1 ? node("span", { className: "sub trail", title: t.trail.join(" → "), textContent: `Your path: ${t.trail.join(" → ")}` }) : null,
      videos(t),
      t.notes ? node("details", { className: "notes" }, node("summary", { textContent: "Notes" }), node("div", { textContent: t.notes })) : null),
    actions);
}

// Three tabs, like the rest of Aim's pages: what you're working on, what you're exploring, what you finished.
let tab = "active";
async function render() {
  const d = await send({ type: "targets" });
  const list = document.getElementById("list");
  if (!d) { list.replaceChildren(node("p", { className: "error", textContent: "Couldn't load your aims. Reload this page." })); return; }
  const live = [d.current, ...d.paused].filter(Boolean);
  const groups = { active: live.filter(t => !t.exploring), exploring: live.filter(t => t.exploring), completed: d.completed };
  const pausedRow = t => row(t, [
    btn("Resume", "", () => resume(t.id)),
    btn("Remove", "text", async () => {
      if (!confirm(`Remove "${t.text}"? It stays in your history as unfinished.`)) return;
      await send({ type: "paused-drop", id: t.id });
      render();
    })], `${t.elsewhere ? "In progress in another browser · " : ""}Last active ${when(t.lastActiveAt)}`);
  const currentRow = t => row(t, btn("Continue", "", () => resume(t.id)), `Last active ${when(t.lastActiveAt)}`);
  const panel = (key, ...sections) => node("div", { role: "tabpanel", id: `tab-${key}`, hidden: tab !== key },
    ...(sections.flat().filter(Boolean).length ? sections : [node("p", { className: "empty-tab", textContent: {
      active: "Nothing in progress. Search on YouTube and your search becomes your aim.",
      exploring: "Nothing you're exploring right now. Try Explore on YouTube's homepage.",
      completed: "Finished aims show up here." }[key] })]));
  const section = (title, items, make) => items.length ? node("section", { className: "card" }, node("h2", { textContent: title }), items.map(make)) : null;
  const cur = t => d.current && t.id === d.current.id;
  list.replaceChildren(
    panel("active", section("Your aim", groups.active.filter(cur), currentRow), section("Set aside", groups.active.filter(t => !cur(t)), pausedRow)),
    panel("exploring", section("Exploring now", groups.exploring.filter(cur), currentRow), section("Set aside", groups.exploring.filter(t => !cur(t)), pausedRow)),
    panel("completed", section("Completed", groups.completed, t => row(t, btn("Start again", "tonal", () => resume(t.id)), `Finished ${when(t.lastActiveAt)}`))));
  document.getElementById("tabs").replaceChildren(...[["active", "Active"], ["exploring", "Exploring"], ["completed", "Completed"]].map(([key, label]) =>
    node("button", { type: "button", role: "tab", ariaSelected: String(tab === key), onclick: () => { tab = key; render(); } },
      label, node("span", { className: "n", textContent: String(groups[key].length) }))));
}

render();
