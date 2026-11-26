// Aim — the Library (0.74): three cards, each opening its part underneath (#aims, #plans, #collections).
//   My Library: every aim as a book on the shelf: All, In progress (what you're on, set aside or
//     exploring) and Completed, with a search. Opening a book shows that aim's page (aim.html).
//   Learning Plans: your paths (an interest and the goal behind it), each with the lesson you're on and
//     progress; opening one shows the whole plan (path.html).
//   Collections: your subjects as picture tiles with how many aims each; a tile shows that subject's books.

const BRAND = chrome.runtime.getManifest().name;
for (const n of document.querySelectorAll("[data-brand]")) n.textContent = BRAND;
const send = msg => chrome.runtime.sendMessage(msg).catch(() => null);

function node(tag, props = {}, ...kids) {
  const n = Object.assign(document.createElement(tag), props);
  n.append(...kids.flat().filter(k => k != null && k !== false));
  return n;
}

function when(ts) {
  if (!ts) return "";
  const day = d => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((day(new Date()) - day(new Date(ts))) / 86400000);
  return days <= 0 ? "today" : days === 1 ? "yesterday" : days < 7 ? `${days} days ago`
    : new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

// Under each book: where it stands, in a few words.
function where(t) {
  if (t.state === "completed") return `Finished ${when(t.lastActiveAt)}`;
  const u = t.understanding;
  const lead = t.state === "active" ? (t.exploring ? "Exploring now" : "Your aim now") : t.exploring ? "Explored" : "Set aside";
  const extra = u?.solid ? "put together" : u?.parts?.length ? `${u.parts.filter(x => x.status === "explained").length} of ${u.parts.length} explained`
    : t.practice?.tried ? "you tried it" : `last active ${when(t.lastActiveAt)}`;
  return `${lead} · ${extra}`;
}

function toast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.style.display = "block";
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => (t.style.display = "none"), 3000);
}

// Make a search an aim: the goal in your words, starting from Aim's suggestion.
function goalRow(t) {
  const input = node("input", { type: "text", value: t.suggestion || t.text, maxLength: 120, ariaLabel: "Your goal" });
  const save = async () => {
    const text = input.value.trim();
    if (text.length < 3) return input.focus();
    const r = await send({ type: "aim-goal", aimId: t.id, text });
    if (r?.result === "applied") { toast(`Now an aim: ${r.text}`); data = null; render(); }
    else toast(r?.message || "Couldn't make it an aim. Try again.");
  };
  input.addEventListener("keydown", e => { if (e.key === "Enter") save(); });
  setTimeout(() => input.select(), 0);
  return node("div", { className: "qa qa-goal" }, input, node("button", { className: "btn", type: "button", textContent: "Make it an aim", onclick: save }));
}

let tab = "all", query = "", only = null; // only: a subject's id, from its tile

// Subjects with a picture (scenes/subjects/, as on YouTube's homepage); the rest show their emblem.
const SUBJECT_ART = ["history", "science", "math", "space", "engineering", "craft", "health", "arts", "people", "faith", "general"];
const BOOK_ICON = () => {
  const NS = "http://www.w3.org/2000/svg", svg = document.createElementNS(NS, "svg"), path = document.createElementNS(NS, "path");
  svg.setAttribute("viewBox", "0 0 24 24"); svg.setAttribute("aria-hidden", "true");
  for (const [k, v] of Object.entries({ d: "M12 6.5C10 5 7 4.8 4 5.5v13c3-.7 6-.5 8 1 2-1.5 5-1.7 8-1v-13c-3-.7-6-.5-8 1zM12 6.5v13", fill: "none", stroke: "currentColor", "stroke-width": "1.8", "stroke-linejoin": "round" })) path.setAttribute(k, v);
  svg.append(path);
  return svg;
};
function tiles(books) {
  const by = new Map();
  for (const t of books) {
    const s = t.subject || { id: "general", name: "Learning" };
    const e = by.get(s.id) || { ...s, n: 0 };
    e.n++;
    by.set(s.id, e);
  }
  const list = [...by.values()].sort((a, b) => b.n - a.n || a.name.localeCompare(b.name));
  document.getElementById("tiles").replaceChildren(...list.map(s => {
    const art = SUBJECT_ART.includes(s.id);
    const b = node("button", { type: "button", className: `tile${art ? "" : " drawn"}`, title: only === s.id ? "Show every subject" : `Only ${s.name}`,
      onclick: () => { only = s.id; showSec("aims"); render(); } },
      art ? null : (() => { const e = coverEmblem(s.id); e.setAttribute("class", "book-emblem big"); return e; })(),
      node("span", { className: "tile-row" }, coverEmblem(s.id), node("span", { className: "tile-name", textContent: s.name }),
        node("span", { className: "tile-n" }, BOOK_ICON(), String(s.n))));
    if (art) b.style.backgroundImage = `url("scenes/subjects/${s.id}.jpg")`;
    b.setAttribute("aria-pressed", String(only === s.id));
    return b;
  }));
  document.getElementById("nCollections").textContent = list.length ? `${list.length} subject${list.length === 1 ? "" : "s"}` : "";
  document.getElementById("tiles").replaceChildren(...(list.length ? [...document.getElementById("tiles").childNodes]
    : [node("p", { className: "plans-empty", textContent: "Your subjects collect here as you add aims." })]));
}

// The three parts of the Library, one at a time.
const SECS = ["aims", "plans", "collections"];
function showSec(sec) {
  if (!SECS.includes(sec)) sec = "aims";
  for (const k of SECS) document.getElementById(`sec-${k}`).hidden = k !== sec;
  for (const b of document.querySelectorAll(".hub-card")) b.setAttribute("aria-selected", String(b.dataset.sec === sec));
  history.replaceState(null, "", sec === "aims" ? location.pathname : `#${sec}`);
}
for (const b of document.querySelectorAll(".hub-card")) b.addEventListener("click", () => { showSec(b.dataset.sec); if (b.dataset.sec === "aims") { only = null; render(); } });

// Learning Plans: each path, where it stands, and a way into the whole plan.
const nextText = pr => !pr ? "No plan yet: pick it up on YouTube's homepage and Aim lays it out"
  : pr.next ? (pr.next.outside ? `Next checkpoint: ${pr.next.title} (outside Aim)` : `${pr.next.left} lesson${pr.next.left === 1 ? "" : "s"} to: ${pr.next.title}`) : "Every unit done";
async function plans() {
  const list = (await send({ type: "paths" })) || [];
  document.getElementById("nPlans").textContent = list.length ? `${list.length} plan${list.length === 1 ? "" : "s"}` : "";
  document.getElementById("plans").replaceChildren(...(list.length ? list.map(x => {
    const art = SUBJECT_ART.includes(x.subject), pct = x.progress?.percent || 0;
    const pic = node("span", { className: `pic${art ? "" : " drawn"}` }, art ? null : coverEmblem(x.subject || "general"));
    if (art) pic.style.backgroundImage = `url("scenes/subjects/${x.subject}.jpg")`;
    return node("a", { className: "plan", href: `path.html?id=${encodeURIComponent(x.id)}` }, pic,
      node("span", { className: "txt" },
        node("span", { className: "name", textContent: x.interest }),
        node("span", { className: "goal", textContent: x.goal }),
        node("span", { className: "at", textContent: x.lesson ? `Lesson ${x.lesson.n} · ${x.lesson.title}` : "" }),
        x.progress ? node("span", { className: "bar" }, node("i", {}, Object.assign(node("b"), { style: `width:${pct}%` })), `${pct}%`) : null,
        node("span", { className: "next", textContent: nextText(x.progress) })),
      node("span", { className: "open", textContent: "See the plan" }));
  }) : [node("p", { className: "plans-empty" }, "No learning plans yet. Add what you're curious about, and the goal behind it, under Start a challenge on ",
    node("a", { href: "https://www.youtube.com/", textContent: "YouTube's homepage" }), ".")]));
}
let data = null;
async function render() {
  data ||= await send({ type: "targets" });
  const list = document.getElementById("list");
  if (!data) { list.replaceChildren(node("p", { className: "error", textContent: "Couldn't load your library. Reload this page." })); return; }
  // Only goals become books (0.67): searches and quick answers ("how do I change a tire", "roman
  // empire") stay off the shelf until you make one an aim (docs/SPEC.md §3; isAim in store.js).
  const book = t => t.goal;
  const quick = [data.current, ...data.paused, ...data.completed].filter(t => t && !book(t));
  const live = [data.current, ...data.paused].filter(t => t && book(t));
  const completed = data.completed.filter(book);
  tiles([...live, ...completed]);
  document.getElementById("nAims").textContent = `${live.length + completed.length} aim${live.length + completed.length === 1 ? "" : "s"}`;
  const inSubject = t => !only || (t.subject?.id || "general") === only;
  const filter = document.getElementById("filter"), named = [...live, ...completed].find(t => (t.subject?.id || "general") === only)?.subject?.name;
  filter.hidden = !only;
  filter.replaceChildren(...(only ? [node("span", { textContent: `Only ${named || "this subject"}` }), node("button", { type: "button", textContent: "Show everything", onclick: () => { only = null; render(); } })] : []));
  const groups = { all: [...live, ...completed].filter(inSubject), progress: live.filter(inSubject), completed: completed.filter(inSubject) };
  const q = query.trim().toLowerCase();
  const shown = groups[tab].filter(t => !q || t.text.toLowerCase().includes(q) || t.subject?.name.toLowerCase().includes(q));
  list.replaceChildren(...[
    ...shown.map(t => node("div", { className: "slot" },
      node("button", { type: "button", title: `Open “${t.text}”`, onclick: () => (location.href = `aim.html?id=${encodeURIComponent(t.id)}`) }, cover(t)),
      node("div", { className: "plank" }),
      node("span", { className: "where", textContent: where(t) }))),
    q || tab === "completed" ? null : node("div", { className: "slot" },
      node("a", { className: "new-book", href: "https://www.youtube.com/" }, node("b", { textContent: "+ New aim" }), "Start something new on YouTube"),
      node("div", { className: "plank" })),
    shown.length ? null : node("p", { className: "empty-tab", textContent: q ? `Nothing in your library matches “${query}”.`
      : { all: "Your library is empty. Search on YouTube, and your search becomes your first aim.", progress: "Nothing in progress.", completed: "Finished aims show up here." }[tab] })].filter(Boolean));
  // Quick answers, kept off the shelf: listed, with a way to put any of them in the library.
  const qa = document.getElementById("quick");
  qa.hidden = !quick.length || !!q;
  qa.replaceChildren(node("summary", { textContent: `Searches and quick answers · ${quick.length}` }),
    node("p", { className: "muted", textContent: "What you searched for without a goal stays off the shelf. Working toward one of them? Make it an aim: it becomes a book." }),
    ...quick.slice(0, 20).map(t => {
      const row = node("div", { className: "qa" },
        node("a", { href: `aim.html?id=${encodeURIComponent(t.id)}`, textContent: t.text }),
        node("button", { className: "btn tonal", type: "button", textContent: "Make it an aim", onclick: () => row.replaceWith(goalRow(t)) }));
      return row;
    }));
  document.getElementById("tabs").replaceChildren(...[["all", "All"], ["progress", "In progress"], ["completed", "Completed"]].map(([key, label]) =>
    node("button", { type: "button", role: "tab", ariaSelected: String(tab === key), onclick: () => { tab = key; render(); } },
      label, node("span", { className: "n", textContent: String(groups[key].length) }))));
}

document.getElementById("search").addEventListener("input", e => { query = e.target.value; render(); });
showSec(location.hash.slice(1));
render();
plans();
