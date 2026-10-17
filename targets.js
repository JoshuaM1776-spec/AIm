// Aim — every Target: the current one, the ones set aside, and finished ones to start again.
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

function row(t, actions, lead) {
  return node("div", { className: "row-item" },
    node("div", { className: "grow" }, node("b", { textContent: t.text, title: t.text }),
      node("span", { className: "muted small", textContent: meta(t, lead) })),
    actions);
}

async function render() {
  const d = await send({ type: "targets" });
  const list = document.getElementById("list");
  if (!d) { list.replaceChildren(node("p", { className: "error", textContent: "Couldn't load your Targets. Reload this page." })); return; }
  const sections = [];
  if (d.current) sections.push(node("section", {}, node("h2", { textContent: "Current Target" }),
    row(d.current, btn("Continue", "", () => resume(d.current.id)), `Last active ${when(d.current.lastActiveAt)}`)));
  if (d.paused.length) sections.push(node("section", {}, node("h2", { textContent: "Set aside" }),
    d.paused.map(t => row(t, [
      btn("Resume", "", () => resume(t.id)),
      btn("Remove", "text", async () => {
        if (!confirm(`Remove "${t.text}"? It stays in your history as unfinished.`)) return;
        await send({ type: "paused-drop", id: t.id });
        render();
      })], `Last active ${when(t.lastActiveAt)}`))));
  if (d.completed.length) sections.push(node("section", {}, node("h2", { textContent: "Completed" }),
    d.completed.map(t => row(t, btn("Start again", "tonal", () => resume(t.id)), `Finished ${when(t.lastActiveAt)}`))));
  if (!sections.length) sections.push(node("p", { className: "muted",
    textContent: "No Targets yet. Search on YouTube and your search becomes your Target." }));
  list.replaceChildren(...sections);
}

render();
