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

let tab = "all", query = "";
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
  const groups = { all: [...live, ...completed], progress: live, completed };
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
render();
