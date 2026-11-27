// Aim — a path (0.72): an interest and the goal behind it, laid out in order. Progress is lessons
// demonstrated (a percent of the whole path, and what's left to the next checkpoint). The unit you're
// on shows its detailed lessons; steps outside Aim (a medical, a written test) sit where they fall,
// marked done by you. Without ?id: every path you have.

const BRAND = chrome.runtime.getManifest().name;
for (const n of document.querySelectorAll("[data-brand]")) n.textContent = BRAND;
const send = msg => chrome.runtime.sendMessage(msg).catch(() => null);
const $ = id => document.getElementById(id);
const id = new URLSearchParams(location.search).get("id");
function node(tag, props = {}, ...kids) {
  const n = Object.assign(document.createElement(tag), props);
  n.append(...kids.flat().filter(k => k != null && k !== false));
  return n;
}
function toast(msg) {
  const t = $("toast"); t.textContent = msg; t.style.display = "block";
  clearTimeout(toast.timer); toast.timer = setTimeout(() => (t.style.display = "none"), 3000);
}
const btn = (label, cls, onclick) => node("button", { className: `btn ${cls}`.trim(), type: "button", textContent: label, onclick });
const progressLine = pr => !pr ? "No plan yet" : [`${pr.percent}% of the path${pr.measure ? ` · ${pr.measure}` : ""}`,
  pr.next ? (pr.next.outside ? `Next checkpoint: ${pr.next.title} (outside Aim)` : `${pr.next.left} lesson${pr.next.left === 1 ? "" : "s"} to the end of: ${pr.next.title}`) : "Every unit done"];

async function begin(lesson) {
  const r = await send({ type: "path-lesson-begin", id, lessonId: lesson.id });
  if (!r || r.result !== "applied") return toast(r?.message || "Couldn't start that. Try again.");
  location.href = r.url;
}
async function resume(aimId) {
  const r = await send({ type: "purpose-resume", id: aimId });
  if (!r || r.result !== "applied") return toast(r?.message || "Couldn't pick that up. Try again.");
  location.href = r.url;
}
// Draft the plan, or the next lessons, on Aim's server (signed in).
async function draft(label) {
  $("page").append(node("p", { className: "muted", textContent: label }));
  const ctx = await send({ type: "path-context", id });
  let r;
  try { r = await chrome.runtime.sendMessage({ type: "plus-call", task: "path-plan", input: ctx }); } catch { r = null; }
  if (!r || r.error) { toast(r?.error || "Couldn't draft that just now. Try again."); return render(); }
  await send({ type: "path-plan-save", id, plan: r });
  render();
}

async function render() {
  const page = $("page");
  if (!id) return renderList(page);
  const r = await send({ type: "path-get", id });
  if (!r || r.result !== "applied") return page.replaceChildren(node("p", { className: "error", textContent: r?.message || "Couldn't load this path." }), node("a", { href: "path.html", textContent: "Your paths" }));
  const { path, progress: pr } = r;
  document.title = `${path.plan?.title || path.goal} · ${BRAND}`;
  const head = node("section", { className: "path-head" },
    node("div", { className: "eyebrow", textContent: path.interest }),
    node("h1", { textContent: path.plan?.title || path.goal }),
    path.plan?.scope ? node("p", { className: "lede", textContent: path.plan.scope }) : null,
    node("div", { className: "progress" }, node("div", { className: "bar", ariaHidden: "true" }, node("i", { style: `width:${pr?.percent || 0}%` })),
      node("div", { className: "line" }, ...[].concat(progressLine(pr)).map(t => node("span", { textContent: t })))),
    path.plan?.confirm ? node("p", { className: "confirm", textContent: path.plan.confirm }) : null);
  if (!path.plan) return page.replaceChildren(...[head, node("p", { className: "muted", textContent: "Aim hasn't drafted this path yet." }), btn("Draft my path", "", () => draft("Drafting your path…"))].filter(Boolean));
  const next = (await send({ type: "path-next", id })) || {};
  const done = l => l.status === "completed";
  const unitDone = (u, i) => path.lessons.filter(l => l.unit === i + 1 && done(l)).length >= u.lessons;
  const current = pr?.unitIndex ?? -1;
  const items = [];
  path.plan.units.forEach((u, i) => {
    const lessons = path.lessons.filter(l => l.unit === i + 1);
    const state = unitDone(u, i) ? "done" : i === current ? "current" : "upcoming";
    items.push(node("li", { className: `unit ${state}` },
      node("span", { className: "dot", textContent: state === "done" ? "✓" : String(i + 1) }),
      node("div", {}, node("h2", { textContent: u.title }), u.about ? node("p", { className: "about", textContent: u.about }) : null,
        node("span", { className: "count", textContent: `${lessons.filter(done).length} of ~${u.lessons} lesson${u.lessons === 1 ? "" : "s"}` })),
      lessons.length && state !== "upcoming" ? node("div", { className: "lessons" }, ...lessons.map(l => node("div", { className: `lesson ${l.status}` },
        node("div", {}, node("b", { textContent: l.title }), node("small", { textContent: l.status === "completed" ? "Demonstrated" : l.status === "active" ? "In progress" : `${l.minutes} min · ${l.success}` }),
          l.status === "completed" ? null : node("small", { className: "steps", textContent: lessonKinds(l) })),
        l.status === "completed" ? null
          : next.resume && next.lesson?.id === l.id ? btn("Continue on YouTube", "", () => resume(next.resume))
          : next.lesson?.id === l.id ? btn("Begin on YouTube", "", () => begin(l)) : null))) : null));
    for (const o of path.plan.outside.filter(o => o.after === i + 1)) {
      const box = node("input", { type: "checkbox", checked: !!o.doneAt, onchange: async () => { await send({ type: "path-outside", id, outsideId: o.id, done: box.checked }); render(); } });
      items.push(node("li", { className: "unit outside" }, node("span", { className: "dot", textContent: o.doneAt ? "✓" : "" }),
        node("div", {}, node("span", { className: "tag", textContent: "Outside Aim" }), node("h2", { textContent: o.title }), o.note ? node("p", { className: "about", textContent: o.note }) : null),
        node("label", { className: "muted" }, box, " Done")));
    }
  });
  page.replaceChildren(...[head,
    next.needs === "lessons" ? node("p", {}, btn("Write my next lessons", "", () => draft("Writing your next lessons…"))) : null,
    node("ol", { className: "units" }, ...items),
    node("div", { className: "foot" }, node("a", { href: "path.html", textContent: "All your paths" }),
      btn("Remove this interest", "text", async () => { if (!confirm(`Remove ${path.interest} and its path? The aims and evidence in your library stay.`)) return; await send({ type: "path-remove", id }); location.href = "path.html"; }))].filter(Boolean));
}

// A lesson's steps by kind (0.79): "Watch · Read · Try · Explain · Show it".
const KIND_NAMES = { watch: "Watch", read: "Read", try: "Try", explain: "Explain", show: "Show it" };
function lessonKinds(l) {
  const plan = l.plan || [];
  const kinds = plan.map((s, i) => KIND_NAMES[s.do] || (s.search ? "Watch" : i === plan.length - 1 ? "Show it" : "Try"));
  return kinds.join(" · ");
}

async function renderList(page) {
  const list = (await send({ type: "paths" })) || [];
  page.replaceChildren(...[node("section", { className: "path-head" }, node("div", { className: "eyebrow", textContent: "Your paths" }), node("h1", { textContent: "What you're working toward" }),
    node("p", { className: "lede", textContent: "Each interest, the goal behind it, and how far along its path you are. Add one from Learning plans on YouTube's homepage." })),
    list.length ? node("div", { className: "list" }, ...list.map(x => node("a", { className: "card", href: `path.html?id=${encodeURIComponent(x.id)}` },
      node("div", { className: "eyebrow", textContent: x.interest }), node("h2", { textContent: x.title, style: "font: 500 22px/28px var(--font-serif); margin: 4px 0" }),
      node("div", { className: "progress" }, node("div", { className: "bar" }, node("i", { style: `width:${x.progress?.percent || 0}%` })),
        node("div", { className: "line" }, ...[].concat(progressLine(x.progress)).map(t => node("span", { textContent: t }))))))) : node("p", { className: "muted", textContent: "No interests yet." })].filter(Boolean));
}

render();
