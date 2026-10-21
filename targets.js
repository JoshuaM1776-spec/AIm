// Aim — Your library: every aim as a book. All, In progress (what you're on, set aside or exploring)
// and Completed, with a search. Opening a book shows that aim's page (aim.html).

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

let tab = "all", query = "";
let data = null;
async function render() {
  data ||= await send({ type: "targets" });
  const list = document.getElementById("list");
  if (!data) { list.replaceChildren(node("p", { className: "error", textContent: "Couldn't load your library. Reload this page." })); return; }
  const live = [data.current, ...data.paused].filter(Boolean);
  const groups = { all: [...live, ...data.completed], progress: live, completed: data.completed };
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
  document.getElementById("tabs").replaceChildren(...[["all", "All"], ["progress", "In progress"], ["completed", "Completed"]].map(([key, label]) =>
    node("button", { type: "button", role: "tab", ariaSelected: String(tab === key), onclick: () => { tab = key; render(); } },
      label, node("span", { className: "n", textContent: String(groups[key].length) }))));
}

document.getElementById("search").addEventListener("input", e => { query = e.target.value; render(); });
render();
