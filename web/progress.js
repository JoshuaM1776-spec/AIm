// Aim Homeschool — Progress: each objective in the approved curriculum with what the student has
// shown, in four words (Not assessed, Needs review, Developing, Demonstrated), the evidence behind it,
// and separately how many lessons for it were watched. Watching is never counted as understanding.
// PARENT_WEBSITE.md §9.

import { h, S, STATUS_WORDS, fmtDate } from "./ui.js";

const TONE = { demonstrated: "ok", developing: "learn", needs_review: "warn", not_assessed: "" };

export function progressPage() {
  const l = S.home.learners.find(x => x.id === S.learnerId);
  if (!l) return h("p", { class: "empty" }, "Add a student first (Settings).");
  const c = l.curriculum?.approved;
  const head = h("div", { class: "head" }, h("div", {}, h("h1", {}, `${l.name}'s progress`),
    h("p", { class: "lede" }, "What your student has shown they understand, from TeachBack checks and projects, objective by objective. Lessons watched are listed apart: watching isn't the same as understanding.")));
  if (!c) return h("div", {}, head, h("p", { class: "empty" }, "Progress appears here once the curriculum is approved and lessons begin."));
  const counts = { demonstrated: 0, developing: 0, needs_review: 0, not_assessed: 0 };
  for (const s of c.subjects) for (const u of s.units) for (const o of u.objectives) counts[l.objectives[o.id]?.status || "not_assessed"]++;
  return h("div", {}, head,
    h("div", { class: "card" }, h("div", { class: "legend" }, Object.entries(STATUS_WORDS).map(([k, w]) => h("span", { class: `pill ${TONE[k]}` }, `${w}: ${counts[k]}`))),
      h("p", { class: "small muted" }, "Demonstrated: explained or applied it without hints. Developing: some of it, with gaps. Needs review: not yet. Not assessed: no check yet.")),
    c.subjects.map(s => h("section", { class: "card", "aria-label": s.name },
      h("h2", {}, s.name, s.level ? h("span", { class: "muted small" }, ` · ${s.level}`) : null),
      s.units.map(u => h("div", { style: "margin-top:12px" }, h("h3", {}, u.title),
        u.objectives.map(o => {
          const st = l.objectives[o.id] || { status: "not_assessed", watched: 0, evidence: "" };
          return h("div", { class: "obj", "data-objective": o.id },
            h("div", {}, h("div", {}, o.text),
              st.evidence ? h("div", { class: "ev" }, `“${st.evidence}”${st.at ? ` · ${fmtDate(st.at.slice(0, 10))}` : ""}`) : null,
              st.watched ? h("div", { class: "ev" }, `${st.watched} lesson${st.watched === 1 ? "" : "s"} watched or done`) : null),
            h("span", { class: `pill ${TONE[st.status]}` }, STATUS_WORDS[st.status]));
        }))))));
}
