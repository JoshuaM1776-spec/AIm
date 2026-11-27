// Aim — a lesson's steps (0.79). Each step is one way of learning: Watch (a video, found by its
// search), Read (a section of a trusted free text, or of a document you added), Try (a few problems or
// a small hands-on task), Explain (to a practice student) and Show it (the lesson's Final Challenge).
// The plan says what each step is; every link is a search Aim builds on a trusted site, never one the
// AI wrote. Evidence only: what you watched, read, tried and explained. Nothing is scored.

const STEP_KINDS = { watch: "Watch", read: "Read", try: "Try", explain: "Explain", show: "Show it" };
let panelStepOpen = null; // the step whose card you opened in the panel: { aim, i }

// Trusted free sources for a Read step. Wikipedia's own search often lands on the article; the others
// are a search of that site alone.
const READ_SOURCES = {
  wikipedia: { name: "Wikipedia" },
  openstax: { name: "OpenStax", site: "openstax.org" },
  khan: { name: "Khan Academy", site: "khanacademy.org" },
  faa: { name: "the FAA's handbooks", site: "faa.gov" },
  medlineplus: { name: "MedlinePlus", site: "medlineplus.gov" },
  gutenberg: { name: "Project Gutenberg", site: "gutenberg.org" }
};
function readUrl(source, q) {
  const s = READ_SOURCES[source];
  return s?.site ? `https://duckduckgo.com/?q=${encodeURIComponent(`site:${s.site} ${q}`)}`
    : `https://en.wikipedia.org/w/index.php?search=${encodeURIComponent(q)}`;
}

// A lesson's steps and where each stands. A Watch step is done once a video for it has been watched;
// Read, Try and Explain when you say so (Explain: when the conversation ends); Show it when the Final
// Challenge is demonstrated. "current" is the step this video is for; "next" the first one not done.
function lessonSteps(p) {
  const ch = p?.challenge;
  if (!ch?.plan?.length) return null;
  const parts = p.map?.parts || [];
  const forThis = (p.allowed || []).find(v => v.id === currentId)?.q || "";
  const last = ch.plan.length - 1;
  const steps = ch.plan.map((s, i) => {
    const kind = STEP_KINDS[s.do] ? s.do : s.search ? "watch" : i === last ? "show" : "try";
    const part = s.search ? parts.find(x => x.search === s.search) || null : null;
    const done = kind === "show" ? ch.status === "completed" : !!(s.doneAt || s.skippedAt) || (kind === "watch" && !!part && part.status !== "new");
    return { ...s, i, kind, part, done, skipped: !s.doneAt && !!s.skippedAt };
  });
  if (!steps.some(s => s.kind === "show")) steps.push({ i: -1, kind: "show", title: "", look: ch.success, done: ch.status === "completed" });
  const current = steps.find(s => s.kind === "watch" && s.search && s.search === forThis) || null;
  const next = steps.find(s => !s.done && s !== current) || null;
  return { steps, current, next };
}
const stepTitle = s => (s.kind === "show" ? "the Final Challenge" : s.title);

// Passages from your own documents that match a Read step, looked up once per step.
const stepRefs = new Map();
function stepDocs(s, box) {
  const key = `${s.title}|${s.search}`;
  const fill = list => {
    if (!list?.length) return box.remove();
    box.replaceChildren(el("div", { class: "wp-ap-label" }, "In your documents"),
      ...list.map(m => el("details", { class: "wp-step-doc" },
        el("summary", {}, el("b", {}, m.ref), m.heading ? ` · ${m.heading}` : ""),
        el("p", {}, m.text))));
  };
  if (stepRefs.has(key)) return fill(stepRefs.get(key));
  send({ type: "ref-match", about: `${s.title} ${s.search} ${s.look}` }).then(r => { stepRefs.set(key, r?.matches || []); if (box.isConnected) fill(r?.matches || []); });
}

// A step from the panel's list: a Watch step searches for its video; the others open their card.
function openStep(p, s) {
  if (s.kind === "watch" && s.search) { location.href = "/results?search_query=" + encodeURIComponent(s.search); return; }
  panelStepOpen = { aim: p.id, i: s.i };
  renderAimPanel();
  $("#wp-aimpanel .wp-step-card")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

async function markStep(p, s, opts = {}) {
  const r = await send({ type: "lesson-step", aimId: p.id, index: s.i, ...opts });
  if (r?.result !== "applied") return toast(r?.message || "Couldn't save that just now.");
  panelStepOpen = null;
  applyStatus(await send({ type: "status" }));
  renderAimPanel();
}

// The card for one step, in the panel's Next step slot: what to do, and how to mark it done.
function stepCard(p, s, { attempt, signIn }) {
  const skip = () => markStep(p, s, { skip: true });
  const head = el("div", { class: "wp-step-head" }, el("span", { class: `wp-step-kind ${s.kind}` }, STEP_KINDS[s.kind]),
    s.minutes ? el("span", { class: "wp-muted" }, `${s.minutes} min`) : null);
  const look = s.kind === "show" ? p.challenge?.success || s.look : s.look; // Show it: the success condition
  const kids = [head, el("b", { class: "wp-step-title" }, s.kind === "show" ? "The Final Challenge" : s.title),
    look ? el("p", { class: "wp-step-look" }, look) : null];
  if (s.kind === "read") {
    const src = READ_SOURCES[s.source] ? s.source : "wikipedia";
    const docs = el("div", { class: "wp-step-docs" });
    stepDocs(s, docs);
    kids.push(el("a", { class: "wp-btn wp-btn-tonal wp-btn-block", href: readUrl(src, s.search || s.title), target: "_blank", rel: "noopener" }, `Find it in ${READ_SOURCES[src].name}`),
      src !== "wikipedia" ? el("a", { class: "wp-link wp-step-alt", href: readUrl("wikipedia", s.search || s.title), target: "_blank", rel: "noopener" }, "Or on Wikipedia") : null,
      docs,
      el("div", { class: "wp-row" }, el("button", { class: "wp-btn wp-btn-primary", onclick: () => markStep(p, s) }, "Done reading"),
        el("button", { class: "wp-btn wp-btn-text", onclick: skip }, "Skip")));
  } else if (s.kind === "try") {
    const ch = p.challenge;
    const note = el("textarea", { class: "wp-step-note", rows: 2, maxlength: 400, placeholder: "How did it go? A line is plenty. Optional." });
    note.addEventListener("keydown", e => e.stopPropagation()); // keep YouTube's shortcuts out of the box
    kids.push(ch.materials?.length ? el("p", { class: "wp-muted" }, `You'll need: ${ch.materials.map(m => m.item + (m.required ? "" : " (optional)")).join(", ")}.`) : null,
      ch.safety ? el("p", { class: "wp-step-safety" }, ch.safety) : null,
      note,
      el("div", { class: "wp-row" }, el("button", { class: "wp-btn wp-btn-primary", onclick: () => markStep(p, s, { note: note.value }) }, "Done"),
        el("button", { class: "wp-btn wp-btn-text", onclick: skip }, "Skip")));
  } else if (s.kind === "explain") {
    kids.push(account.on
      ? el("div", { class: "wp-row" }, el("button", { class: "wp-btn wp-btn-primary", onclick: () => openTalk({ step: { index: s.i, title: s.title, ask: s.look } }) }, icon("talk"), "Explain it"),
          el("button", { class: "wp-btn wp-btn-text", onclick: skip }, "Skip"))
      : el("div", { class: "wp-row" }, el("button", { class: "wp-btn wp-btn-tonal", onclick: signIn }, "Sign in to explain it"),
          el("button", { class: "wp-btn wp-btn-text", onclick: skip }, "Skip")));
  } else if (s.kind === "show") {
    kids.push(account.on ? el("button", { class: "wp-btn wp-btn-primary wp-btn-block", onclick: attempt }, "Attempt the challenge")
      : el("button", { class: "wp-btn wp-btn-tonal wp-btn-block", onclick: signIn }, "Sign in to attempt it"));
  } else if (s.search) {
    kids.push(el("button", { class: "wp-btn wp-btn-tonal wp-btn-block", onclick: () => { location.href = "/results?search_query=" + encodeURIComponent(s.search); } }, "Find a video for it"));
  }
  return el("div", { class: "wp-ap-next wp-step-card", "data-step": String(s.i) }, el("div", { class: "wp-ap-label" }, "Next step"), el("div", { class: "wp-step-box" }, ...kids));
}
