// Aim Homeschool — the big picture: each subject's units and objectives, in order, with pacing.
// The parent edits freely (saved as they go, as a draft); warnings explain what a change affects but
// never block it; approving makes a new version, and only approved versions are used for weeks.
// Changes are compared with the first plan (the baseline), so it's clear what was added, moved or
// removed. PARENT_WEBSITE.md §4.

import { call, ApiError } from "./api.js";
import { h, btn, busyBtn, act, toast, S, fmtDate, reload } from "./ui.js";

const work = new Map(); // learner id → { draft, version } being edited here
const uid = () => crypto.randomUUID().slice(0, 8);
let saveTimer = null, saving = null;

function copyFor(l) {
  const w = work.get(l.id);
  if (w && w.version >= (l.curriculum?.version || 0)) return w;
  const fresh = { draft: structuredClone(l.curriculum?.draft || { startDate: S.home.thisWeek, subjects: [] }), version: l.curriculum?.version || 0, warnings: l.curriculum?.warnings || [] };
  work.set(l.id, fresh);
  return fresh;
}

async function saveNow(l) {
  clearTimeout(saveTimer);
  const w = work.get(l.id);
  if (!w || !w.dirty) return;
  w.dirty = false;
  w.saving = true;
  saving = call("hs-curriculum-save", { learnerId: l.id, draft: w.draft, version: w.version || undefined }).then(async r => {
    w.version = r.version; w.warnings = r.warnings;
    await reload(); // so other pages (Overview) see the change
    w.saving = false;
    document.querySelector("#saveState")?.replaceChildren("Saved");
    window.dispatchEvent(new Event("aim:curriculum-saved"));
  }).catch(async e => {
    w.saving = false;
    toast(e.message);
    if (e instanceof ApiError && e.code === "conflict") { work.delete(l.id); await reload(); window.dispatchEvent(new Event("aim:render")); }
  });
  return saving;
}
function changed(l, { redraw } = {}) {
  const w = work.get(l.id) || copyFor(l);
  w.dirty = true;
  document.querySelector("#saveState")?.replaceChildren("Saving…");
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => saveNow(l).then(() => redraw && window.dispatchEvent(new Event("aim:render"))), 700);
  if (redraw) window.dispatchEvent(new Event("aim:render"));
}

// The editor, for the Curriculum page and setup's "big picture" step.
export function curriculumEditor(l, { onApproved } = {}) {
  const w = copyFor(l), c = w.draft;
  const warnings = w.warnings || [];
  const approved = l.curriculum?.approved, pending = !approved || JSON.stringify(approved) !== JSON.stringify(c);
  const box = h("div", { class: "stack" });

  // Status and approval.
  box.append(h("div", { class: "card" },
    h("div", { class: "spread" },
      h("div", {},
        h("h2", {}, approved ? `Approved: version ${l.curriculum.approvedVersion}` : "Not approved yet"),
        h("p", { class: "muted small" }, approved ? `Approved ${fmtDate(l.curriculum.approvedAt.slice(0, 10))}. ` : "",
          pending ? "You have changes that aren't approved. Weeks are planned from the approved version only." : "Weekly plans follow this version."),
        h("p", { class: "muted small", id: "saveState" }, w.dirty || w.saving ? "Saving…" : "Saved")),
      h("div", { class: "row" },
        pending && c.subjects.length ? busyBtn(approved ? "Approve changes" : "Approve this plan", "", async () => {
          await saveNow(l); await saving;
          await act("hs-curriculum-approve", { learnerId: l.id, version: work.get(l.id).version }, { done: "Approved. New weeks follow this plan." });
          onApproved?.(); // the approval's newer version replaces the copy here on the next draw
        }, { attrs: { id: "approveCurriculum" } }) : null)),
    warnings.length ? h("div", { class: "note warn" }, h("b", {}, "Worth checking"), h("ul", {}, warnings.map(x => h("li", {}, x.text))),
      h("p", { class: "small muted" }, "These don't block anything. You decide.")) : null,
    l.curriculum?.changes?.length ? h("details", {}, h("summary", { class: "small" }, `${l.curriculum.changes.length} changes since your first plan`),
      h("ul", { class: "small" }, l.curriculum.changes.map(x => h("li", {}, x)))) : null,
    h("label", { class: "field", style: "max-width:220px" }, "Starts the week of",
      h("input", { type: "date", value: c.startDate || S.home.thisWeek, onchange: e => { c.startDate = e.target.value; changed(l, { redraw: true }); } }))));

  // Subjects, units, objectives.
  const warnedUnits = new Set(warnings.map(x => x.unitId));
  for (const [si, s] of c.subjects.entries()) {
    const card = h("section", { class: "card subject", "aria-label": s.name });
    card.append(h("div", { class: "spread" },
      h("div", { class: "row" },
        h("input", { type: "text", value: s.name, "aria-label": "Subject", style: "font-weight:600;width:180px", oninput: e => { s.name = e.target.value; changed(l); } }),
        h("input", { type: "text", value: s.level, placeholder: "Level, like Grade 5", "aria-label": `${s.name} level`, style: "width:170px", oninput: e => { s.level = e.target.value; changed(l); } })),
      h("button", { class: "iconbtn", title: `Remove ${s.name}`, "aria-label": `Remove ${s.name}`, onclick: () => {
        if (confirm(`Remove ${s.name} and its units from the plan? You can approve or undo this before it affects any week.`)) { c.subjects.splice(si, 1); changed(l, { redraw: true }); }
      } }, "✕")));
    let wk = 0;
    for (const [ui, u] of s.units.entries()) {
      const startsWeek = wk + 1; wk += u.weeks;
      const reqNames = u.requires.map(r => c.subjects.flatMap(x => x.units).find(x => x.id === r)?.title).filter(Boolean);
      card.append(h("div", { class: `unit${warnedUnits.has(u.id) ? " warned" : ""}`, "data-unit": u.id },
        h("div", { class: "uhead" },
          h("input", { type: "text", class: "title", value: u.title, "aria-label": "Unit title", oninput: e => { u.title = e.target.value; changed(l); } }),
          h("input", { type: "number", class: "weeks", min: 1, max: 20, value: u.weeks, "aria-label": "Weeks", onchange: e => { u.weeks = Math.max(1, Math.min(20, Number(e.target.value) || 1)); changed(l, { redraw: true }); } }),
          h("span", { class: "small muted" }, `weeks · from week ${startsWeek}`),
          h("button", { class: "iconbtn", title: "Move up", "aria-label": `Move ${u.title} up`, disabled: ui === 0, onclick: () => { s.units.splice(ui - 1, 0, s.units.splice(ui, 1)[0]); changed(l, { redraw: true }); } }, "↑"),
          h("button", { class: "iconbtn", title: "Move down", "aria-label": `Move ${u.title} down`, disabled: ui === s.units.length - 1, onclick: () => { s.units.splice(ui + 1, 0, s.units.splice(ui, 1)[0]); changed(l, { redraw: true }); } }, "↓"),
          h("button", { class: "iconbtn", title: "Remove unit", "aria-label": `Remove ${u.title}`, onclick: () => { s.units.splice(ui, 1); changed(l, { redraw: true }); } }, "✕")),
        reqNames.length ? h("p", { class: "small muted" }, `Builds on: ${reqNames.join(", ")}`) : null,
        h("ul", {}, u.objectives.map((o, oi) => h("li", {},
          h("input", { type: "text", value: o.text, "aria-label": "Objective", oninput: e => { o.text = e.target.value; o.inferred = false; changed(l); } }),
          o.inferred ? h("span", { class: "inferred", title: "Aim read this from the curriculum's wording; check it" }, "check this") : null,
          h("button", { class: "iconbtn", "aria-label": `Remove objective ${o.text}`, onclick: () => { u.objectives.splice(oi, 1); changed(l, { redraw: true }); } }, "✕")))),
        h("div", { class: "row", style: "margin-top:6px" },
          btn("+ Objective", "text small", () => { u.objectives.push({ id: uid(), text: "", inferred: false }); changed(l, { redraw: true }); }),
          h("input", { type: "text", value: u.project, placeholder: "Culminating project (optional)", "aria-label": "Project", style: "flex:1 1 220px", oninput: e => { u.project = e.target.value; changed(l); } }))));
    }
    card.append(btn("+ Unit", "tonal small", () => { s.units.push({ id: uid(), title: "New unit", weeks: 2, objectives: [], requires: [], project: "" }); changed(l, { redraw: true }); }, { style: "margin-top:12px" }));
    box.append(card);
  }
  const subj = h("input", { type: "text", placeholder: "Add a subject", "aria-label": "New subject" });
  box.append(h("form", { class: "row", onsubmit: e => {
    e.preventDefault();
    const name = subj.value.trim();
    if (!name) return;
    c.subjects.push({ id: uid(), name, level: l.levels[name] || "", units: [] });
    changed(l, { redraw: true });
  } }, subj, h("button", { class: "btn tonal small", type: "submit" }, "Add subject")));
  return box;
}

// Use your own curriculum: a file read in this browser, or pasted text, with the parent's
// confirmation that they may use it for their family. PARENT_WEBSITE.md §4.
export function uploadBox({ onAdded } = {}) {
  const title = h("input", { type: "text", placeholder: "Title, like Grade 5 Science", "aria-label": "Title" });
  const kind = h("select", { "aria-label": "What it is" }, h("option", { value: "purchased" }, "A curriculum we bought"), h("option", { value: "open" }, "An openly licensed curriculum"), h("option", { value: "own" }, "Our own materials"));
  const text = h("textarea", { rows: 6, placeholder: "Paste the scope and sequence, table of contents or syllabus. Or choose a file.", "aria-label": "Curriculum text" });
  const confirmBox = h("input", { type: "checkbox", id: "uploadConfirm" });
  const file = h("input", { type: "file", accept: ".txt,.md,.docx,.pdf", "aria-label": "Curriculum file", onchange: async e => {
    const f = e.target.files[0];
    if (!f) return;
    try { text.value = await window.readFileText(f); if (!title.value) title.value = f.name.replace(/\.[^.]+$/, ""); toast("Read. Check the text, then add it."); }
    catch (err) { toast(err.message); }
  } });
  return h("div", { class: "card" },
    h("h2", {}, "Use your own curriculum"),
    h("p", { class: "muted small" }, "Aim reads your file in this browser and keeps the text for your family only. It's used to plan for your family and is never shared, never used for anyone else, and never used to train AI. Delete it any time."),
    h("div", { class: "row" }, title, kind), h("div", { class: "row", style: "margin:10px 0" }, file), text,
    h("label", { class: "check" }, confirmBox, h("span", {}, "I have the right to use this curriculum for my family. Aim uses it only to plan for my family and never shares it.")),
    busyBtn("Add curriculum", "", async () => {
      const r = await act("hs-upload-add", { title: title.value, kind: kind.value, confirmed: confirmBox.checked, text: text.value }, { done: "Added." });
      onAdded?.(r.id);
    }, { attrs: { id: "addUpload" } }));
}

export function uploadsList() {
  const ups = S.home.uploads;
  if (!ups.length) return null;
  return h("ul", { class: "materials" }, ups.map(u => h("li", {},
    h("span", { class: "name", style: "flex:1" }, h("b", {}, u.title), h("span", { class: "muted small" }, ` · ${Math.round(u.chars / 1000)}k characters · added ${fmtDate(u.createdAt.slice(0, 10))}`)),
    btn("Delete", "text small danger", async () => { if (confirm(`Delete “${u.title}” and its text? Plans already approved keep their objectives.`)) await act("hs-upload-delete", { id: u.id }, { done: "Deleted." }); }))));
}

// Builds the draft from the family's curriculum. Replaces the draft only (approved stays).
export async function buildFromUploads(l, typed = "") {
  const startDate = copyFor(l).draft.startDate || S.home.thisWeek;
  work.delete(l.id); // the new draft replaces what was being edited here
  await act("hs-curriculum-build", { learnerId: l.id, uploadIds: S.home.uploads.map(u => u.id), text: typed, startDate,
    subjects: S.home.household.settings.subjects || Object.keys(l.levels) },
    { done: "Here's your curriculum, organized. Check it and change anything." });
}

export function curriculumPage() {
  const l = S.home && S.home.learners.find(x => x.id === S.learnerId);
  if (!l) return h("p", { class: "empty" }, "Add a student first (Settings).");
  const typed = h("textarea", { rows: 3, placeholder: "Or type the units, one per line", "aria-label": "Units, typed" });
  return h("div", {},
    h("div", { class: "head" }, h("div", {}, h("h1", {}, `${l.name}'s curriculum`),
      h("p", { class: "lede" }, "The big picture for the year: subjects, units and what you want learned. Aim plans each week inside it. Change anything; nothing reaches a week until you approve."))),
    curriculumEditor(l),
    h("details", { class: "card", style: "margin-top:16px" }, h("summary", {}, h("b", {}, "Your curriculum files"), h("span", { class: "muted small" }, " · build the plan again from them")),
      uploadsList(), uploadBox(),
      h("div", { class: "divider" }), typed,
      busyBtn("Build the plan from these", "tonal", () => { if (!l.curriculum?.draft || confirm("Replace your current draft with a new one built from these? Your approved version stays until you approve again.")) return buildFromUploads(l, typed.value); }, { attrs: { style: "margin-top:10px" } })));
}
