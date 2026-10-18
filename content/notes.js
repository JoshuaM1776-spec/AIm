// Aim — notes on a Target: questions for a call, things to remember for the exam. They save as
// you type and stay with the Target when it's set aside, completed or resumed. Signed in, the
// librarian can suggest questions to add (it never answers them).

let notesTimer = null;
function saveNotes(text) {
  clearTimeout(notesTimer);
  notesTimer = setTimeout(async () => {
    const r = await send({ type: "target-notes", text });
    if (r?.result !== "applied" || !purpose) return;
    const had = !!purpose.notes;
    purpose.notes = r.notes;
    if (had !== !!r.notes && location.pathname === "/results") renderResultsBar(); // the notes dot in the bar
  }, 400);
}

async function openNotesDialog() {
  closeDropdown();
  const p = activePurpose();
  if (!p) return;
  await librarianOn();
  const box = el("textarea", { class: "wp-input wp-notes-input", rows: "10", maxlength: "4000", "aria-label": "Notes for this Target",
    placeholder: "Questions to ask, things to remember…" });
  box.value = p.notes || "";
  box.addEventListener("input", () => saveNotes(box.value));
  const status_ = el("div", { class: "wp-muted wp-notes-status" });
  const suggest = account.on ? el("button", { class: "wp-btn wp-btn-tonal", onclick: async () => {
    suggest.disabled = true; status_.textContent = `${BRAND} is thinking of questions…`;
    const r = await send({ type: "librarian", task: "librarian-questions", input: { target: p.text, notes: box.value,
      searches: (p.searches || []).map(s => s.q).slice(-10), watched: (p.videos || []).slice(-8).map(v => ({ title: v.title })) } });
    suggest.disabled = false;
    if (!r?.questions?.length) { status_.textContent = "No new questions right now."; return; }
    box.value = `${box.value.trimEnd()}${box.value.trim() ? "\n" : ""}${r.questions.map(q => `- ${q}`).join("\n")}\n`;
    saveNotes(box.value);
    status_.textContent = `Added ${r.questions.length} questions. Edit or delete any of them.`;
  } }, icon("ask"), "Suggest questions") : null;
  openModal(el("div", { class: "wp-dialog wp-notes-dialog", role: "dialog", "aria-modal": "true", "aria-label": "Notes" },
    el("div", { class: "wp-title" }, "Notes"),
    el("div", { class: "wp-current" }, el("div", { class: "wp-label" }, "Target"), el("div", { class: "wp-strong" }, p.text)),
    box, status_,
    el("div", { class: "wp-actions" }, suggest, el("span", { style: "flex:1" }),
      el("button", { class: "wp-btn wp-btn-primary", onclick: () => { saveNotes(box.value); closeModal(); } }, "Done"))));
  setTimeout(() => { box.focus(); box.setSelectionRange(box.value.length, box.value.length); }, 50);
}
