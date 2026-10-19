// Aim — study sessions on YouTube (Aim Plus). Offered when the librarian sees a learning goal:
// Aim breaks the Target into topics, the librarian picks a video for each from YouTube's own
// results, and TeachBack checks understanding topic by topic. On the watch page the study plan
// takes the place of "Up next"; on a topic's results page it heads the results bar.

const activeStudy = p => (p?.study && !p.study.endedAt ? p.study : null);

// Which topic the page is about: the one whose video is playing or whose search this is.
function studyTopic(st) {
  if (!st) return null;
  if (currentId) { const t = st.topics.find(x => x.videos.some(v => v.id === currentId)); if (t) return t; }
  if (location.pathname === "/results") {
    const q = searchQuery().toLowerCase();
    const t = st.topics.find(x => x.searches.some(s => s.toLowerCase() === q));
    if (t) return t;
  }
  return st.topics[st.current] || st.topics[0];
}

const topicSearchUrl = t => `/results?search_query=${encodeURIComponent(t.searches[0])}`;

function openStudyDialog(p) {
  closeDropdown();
  const notes = el("textarea", { class: "wp-input", rows: "5", maxlength: "6000",
    placeholder: "Optional: your study guide, syllabus or notes (paste, or upload a .docx, .pdf or .txt), so the topics match your class." });
  const err = el("div", { class: "wp-error" });
  // Or a file: its text is read here, in the browser, and put in the box to check before planning.
  const fileNote = el("span", { class: "wp-muted wp-study-file-note" });
  const picker = el("input", { type: "file", accept: ".txt,.md,.docx,.pdf,text/plain", hidden: true });
  picker.addEventListener("change", async () => {
    const file = picker.files?.[0];
    picker.value = "";
    if (!file) return;
    err.textContent = ""; fileNote.textContent = `Reading ${file.name}…`;
    try {
      const text = await readFileText(file);
      notes.value = text.slice(0, 6000);
      fileNote.textContent = text.length > 6000 ? `Read ${file.name}. Only the first 6,000 characters fit; trim it to what this session covers.` : `Read ${file.name}. Check the text below, then Start.`;
      notes.focus();
    } catch (e) { fileNote.textContent = ""; err.textContent = e.message || "Couldn't read that file."; }
  });
  const upload = el("div", { class: "wp-study-file" },
    el("button", { class: "wp-btn wp-btn-tonal", onclick: () => picker.click() }, icon("book"), "Upload a file"), picker, fileNote);
  const start = el("button", { class: "wp-btn wp-btn-primary" }, "Start");
  start.onclick = async () => {
    start.disabled = true; err.textContent = ""; start.textContent = "Planning…";
    const plan = await send({ type: "librarian", task: "study-plan", input: { objective: p.text, notes: notes.value } });
    if (!plan || plan.error) { start.disabled = false; start.textContent = "Start"; err.textContent = plan?.error || "Couldn't plan the session. Try again."; return; }
    const r = await send({ type: "study-start", title: plan.title, scopeNote: plan.scopeNote, topics: plan.topics, notes: notes.value });
    if (r?.result !== "applied") { start.disabled = false; start.textContent = "Start"; err.textContent = r?.message || "Couldn't start the session."; return; }
    closeModal();
    location.href = r.url;
  };
  openModal(el("div", { class: "wp-dialog", role: "dialog", "aria-modal": "true" },
    el("div", { class: "wp-title" }, "Organize a study session"),
    el("div", { class: "wp-current" }, el("div", { class: "wp-label" }, "Current Target"), el("div", { class: "wp-strong" }, p.text)),
    el("p", { class: "wp-muted" }, `${BRAND} breaks this into a few topics in order, finds a clear video for each, and lets you check your understanding as you go.`),
    upload, notes, err,
    el("div", { class: "wp-actions" }, el("button", { class: "wp-btn wp-btn-text", onclick: closeModal }, "Cancel"), start)));
  setTimeout(() => notes.focus(), 50);
}

function checkLabel(t) {
  if (!t.check) return t.watched.length ? "Watched" : "";
  const counts = t.check.objectives.reduce((c, o) => (c[o.status] = (c[o.status] || 0) + 1, c), {});
  if (counts.needs_review || counts.partial) return "Review";
  if (counts.demonstrated) return "Checked";
  return "Checked";
}

function checkTopic(p, st, t) {
  send({ type: "open-teachback", topic: `${t.title} (${st.title})`, notes: [t.brief, st.notes].filter(Boolean).join("\n\n").slice(0, 3000), study: t.id });
}

async function goTopic(st, index) {
  await send({ type: "study-update", current: index });
  location.href = topicSearchUrl(st.topics[index]);
}

// The topic in focus: its brief, its videos, and the next step.
function topicBlock(p, st, t) {
  const i = st.topics.indexOf(t);
  const last = i === st.topics.length - 1;
  return el("div", { class: "wp-study-topic" },
    el("div", { class: "wp-label" }, `Topic ${i + 1} of ${st.topics.length}`),
    el("div", { class: "wp-strong" }, t.title),
    t.brief ? el("div", { class: "wp-study-brief" }, t.brief) : null,
    whereLink(t.title, st.title),
    el("div", { class: "wp-study-actions" },
      el("button", { class: "wp-btn wp-btn-tonal", onclick: () => checkTopic(p, st, t) }, t.check ? "Check again" : "Check yourself"),
      last ? el("button", { class: "wp-btn wp-btn-text", onclick: () => send({ type: "open-study" }) }, "See summary")
        : el("button", { class: "wp-btn wp-btn-text", onclick: () => goTopic(st, i + 1) }, "Next topic", icon("right"))));
}

// The watch page's sidebar during a study session.
function renderStudyPanel(p, host) {
  const st = activeStudy(p);
  const t = studyTopic(st);
  const key = JSON.stringify([currentId, st.id, st.current, st.topics.map(x => [x.videos.length, x.watched.length, !!x.check])]);
  const existing = $("#wp-study");
  if (existing && existing.parentElement === host && existing.dataset.key === key) return;
  existing?.remove();
  $("#wp-upnext")?.remove();
  host.prepend(el("div", { id: "wp-study", class: "wp wp-study", "data-key": key },
    el("div", { class: "wp-row-between" },
      el("div", {}, el("div", { class: "wp-label" }, "Study session"), el("div", { class: "wp-strong" }, st.title)),
      el("button", { class: "wp-link", onclick: () => send({ type: "open-study" }) }, "Overview")),
    topicBlock(p, st, t),
    t.videos.length ? el("div", { class: "wp-study-videos" }, ...t.videos.filter(v => v.id !== currentId).map(v =>
      el("a", { class: "wp-upnext-item", href: `/watch?v=${encodeURIComponent(v.id)}`, title: v.title || "" },
        el("div", { class: "wp-upnext-thumb", style: `background-image: url("https://i.ytimg.com/vi/${encodeURIComponent(v.id)}/mqdefault.jpg")` },
            v.length ? el("span", { class: "wp-upnext-len" }, v.length) : null),
        el("div", { class: "wp-upnext-text" }, el("div", { class: "wp-upnext-title" }, v.title || "Video"),
          v.reason ? el("div", { class: "wp-muted" }, v.reason) : null)))) : null,
    el("ol", { class: "wp-study-list" }, ...st.topics.map((x, i) => el("li", { class: x === t ? "wp-study-here" : "" },
      el("button", { class: "wp-link", onclick: () => goTopic(st, i) }, x.title),
      checkLabel(x) ? el("span", { class: "wp-muted" }, ` · ${checkLabel(x)}`) : null)))));
}

// On a topic's results page, the results bar leads with the topic.
function studyBarBlock(p) {
  const st = activeStudy(p);
  if (!st) return null;
  const t = studyTopic(st);
  return el("div", { class: "wp-lib wp-study-bar" }, topicBlock(p, st, t));
}

// The offer, on a learning goal's results (Plus only; never during a video).
function studyOffer(p) {
  if (activeStudy(p) || !account.plus || p.librarian?.kind !== "learn") return null;
  return el("button", { class: "wp-chip", onclick: () => openStudyDialog(p) }, "Organize a study session");
}
