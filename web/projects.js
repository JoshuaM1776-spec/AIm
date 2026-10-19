// Aim Homeschool — Projects & Materials: the next four weeks' featured projects, so supplies can be
// ready before project day, and one shopping list for all of them (items you have are crossed off;
// what's still needed can be copied or printed). Statuses: proposed, approved, materials ready,
// completed. The weekly plan stays where projects are approved. PARENT_WEBSITE.md §7.

import { h, btn, busyBtn, act, toast, S, fmtDate, addDays } from "./ui.js";
import { projectCard, weekOf } from "./week.js";

const WEEKS_AHEAD = 4;

export function projectsPage() {
  const l = S.home.learners.find(x => x.id === S.learnerId);
  if (!l) return h("p", { class: "empty" }, "Add a student first (Settings).");
  const weeks = Array.from({ length: WEEKS_AHEAD }, (_, i) => addDays(S.home.thisWeek, 7 * i));
  const projects = weeks.map(ws => { const w = weekOf(l, ws); return { ws, w, p: w ? (w.approved || w.draft).project : null }; });
  const owned = new Set(S.home.materials.owned || []);

  // One list across projects not yet done: same item, quantities together.
  const need = new Map();
  for (const { p, ws } of projects) if (p && p.status !== "completed") for (const m of p.materials) {
    const k = m.name.toLowerCase(), x = need.get(k) || { name: m.name, qty: [], kind: m.kind, for: [] };
    if (m.qty) x.qty.push(m.qty); x.for.push(`${p.title} (${fmtDate(ws)})`);
    need.set(k, x);
  }
  const list = [...need.values()].sort((a, b) => owned.has(a.name.toLowerCase()) - owned.has(b.name.toLowerCase()) || a.name.localeCompare(b.name));
  const missing = list.filter(m => !owned.has(m.name.toLowerCase()));
  const toggle = (name, have) => {
    const next = new Set(owned); have ? next.add(name.toLowerCase()) : next.delete(name.toLowerCase());
    act("hs-materials-save", { owned: [...next], version: S.home.materials.version });
  };
  const copy = async () => {
    const text = missing.map(m => `- ${m.name}${m.qty.length ? ` (${m.qty.join(" + ")})` : ""}`).join("\n");
    try { await navigator.clipboard.writeText(text); toast("Copied the list."); } catch { toast("Couldn't copy. Select the list and copy it instead."); }
  };

  return h("div", {},
    h("div", { class: "head" }, h("div", {}, h("h1", {}, "Projects & Materials"),
      h("p", { class: "lede" }, `The next ${WEEKS_AHEAD} weeks' projects for ${l.name}, so you can have supplies ready before project day.`))),
    h("div", { class: "grid2" },
      h("div", { class: "stack" }, projects.map(({ ws, w, p }) => p
        ? h("div", {}, h("p", { class: "small muted", style: "margin:0 0 6px" }, `Week of ${fmtDate(ws)}${w.status === "approved" ? "" : " · week not approved yet"}`),
          projectCard(p, { withStatus: true }),
          w.approved ? h("div", { class: "row no-print", style: "margin-top:8px" },
            p.status !== "ready" && p.status !== "completed" ? btn("Materials ready", "tonal small", () => act("hs-project-status", { learnerId: l.id, weekStart: ws, status: "ready" }, { done: "Marked ready." })) : null,
            p.status !== "completed" ? btn("Completed", "tonal small", () => act("hs-project-status", { learnerId: l.id, weekStart: ws, status: "completed" }, { done: "Nice work." })) : null) : null)
        : h("div", { class: "card" }, h("p", { class: "small muted", style: "margin:0" }, `Week of ${fmtDate(ws)}`),
          l.curriculum?.approved ? busyBtn("Plan this week to see its project", "tonal small", () => act("hs-week-propose", { learnerId: l.id, weekStart: ws }, { done: "Planned. Review it in Weekly Plan." }), { working: "Planning…" })
            : h("p", { class: "small" }, "Approve the curriculum to plan weeks.")))),
      h("div", { class: "card", id: "materials" },
        h("div", { class: "spread" }, h("h2", {}, "Shopping list"),
          h("div", { class: "row no-print" }, missing.length ? btn("Copy what's needed", "tonal small", copy) : null, btn("Print", "text small", () => print()))),
        list.length ? h("ul", { class: "materials" }, list.map(m => {
          const have = owned.has(m.name.toLowerCase());
          return h("li", { class: have ? "owned" : "" },
            h("input", { type: "checkbox", checked: have, "aria-label": `We have ${m.name}`, onchange: e => toggle(m.name, e.target.checked) }),
            h("span", { style: "flex:1" }, h("span", { class: "name" }, m.name), m.qty.length ? h("span", { class: "muted small" }, ` · ${m.qty.join(" + ")}`) : null,
              h("div", { class: "small muted" }, `${m.kind === "reusable" ? "Reusable" : "Used up"} · for ${m.for.join(", ")}`)));
        })) : h("p", { class: "empty" }, "Nothing yet. Projects' materials appear here as weeks are planned."),
        list.length ? h("p", { class: "small muted" }, "Tick what you already have; it's remembered for later projects too. Substitutes are fine when they do the same job.") : null)));
}
