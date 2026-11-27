// Aim — your paths (0.72), in Continue Learning on YouTube's homepage (0.73, content/scene.js): the
// interests you've added, each with the lesson you're on and progress (percent of the whole path, and
// what's left to the next checkpoint), and + to add one. Picking an interest picks up where you left off on its
// path: the lesson in progress, or the next one; when the detailed lessons run out, or a new interest
// has no plan yet, Aim drafts them first (Aim's server, signed in). See store.js → Paths.

let pw = { open: false, list: null, adding: false, busy: "", error: "", weekFor: null };
let pwHost = null;
function pwRedraw() { if (pwHost?.isConnected) pwHost.replaceWith(pathsWindow()); }

// Draft (or continue) a path's plan on Aim's server, then save it here.
async function draftPath(id, label) {
  if (!account.on) { pw.error = "Sign in to Aim, and it drafts a path for your goal."; return false; }
  pw.busy = label; pwRedraw();
  const ctx = await send({ type: "path-context", id });
  const known = ctx ? await send({ type: "challenge-known", interest: ctx.interest }) : null;
  const r = ctx ? await send({ type: "librarian", task: "path-plan", input: { ...ctx, level: known?.level || "intro" } }) : null;
  const saved = r && !r.error ? await send({ type: "path-plan-save", id, plan: r }) : null;
  pw.busy = "";
  if (!saved || saved.result !== "applied") { pw.error = r?.error || saved?.message || "Couldn't draft that just now. Try again."; pwRedraw(); return false; }
  return true;
}

async function pickPath(id) {
  pw.error = "";
  let r = await send({ type: "path-next", id });
  const name = pw.list?.find(x => x.id === id)?.interest || "this";
  if (r?.needs === "plan" && await draftPath(id, `Drafting your path for ${name}…`)) r = await send({ type: "path-next", id });
  else if (r?.needs === "lessons" && await draftPath(id, `Writing your next lessons for ${name}…`)) r = await send({ type: "path-next", id });
  if (!r || r.result !== "applied" || r.needs) { if (!pw.error) pw.error = r?.message || "Couldn't pick that up. Try again."; return pwRedraw(); }
  if (r.resume) return resumeTarget(r.resume); // the lesson in progress, where you left off
  pw.busy = `Starting: ${r.lesson.title}`; pwRedraw();
  const b = await send({ type: "path-lesson-begin", id, lessonId: r.lesson.id });
  pw.busy = "";
  if (!b || b.result !== "applied") { pw.error = b?.message || "Couldn't start that lesson. Try again."; return pwRedraw(); }
  pw.open = false;
  location.href = b.url;
}

async function addInterest(interest, goal) {
  interest = interest.trim(); goal = goal.trim();
  if (interest.length < 2) { pw.error = "What are you curious about?"; return pwRedraw(); }
  if (goal.length < 3) { pw.error = "And the goal behind it? Something you want to be able to do."; return pwRedraw(); }
  const r = await send({ type: "path-add", interest, goal });
  if (!r || r.result !== "applied") { pw.error = r?.message || "Couldn't add that. Try again."; return pwRedraw(); }
  pw.adding = false;
  pw.list = (await send({ type: "paths" })) || [];
  pwRedraw();
  if (account.on && !r.existed && await draftPath(r.path.id, `Drafting your path for ${interest}…`)) { pw.list = (await send({ type: "paths" })) || []; pwRedraw(); }
}

// Your week for a plan (0.80): how much time, and which days. Aim lays the next steps on them, from
// today; a missed day rolls forward. No streaks, nothing to fall behind on.
const WEEK_CHOICES = [[30, "30 min"], [60, "1 hour"], [120, "2 hours"], [180, "3 hours"], [300, "5 hours"]];
const WEEK_DAYS = [[1, "Mon"], [2, "Tue"], [3, "Wed"], [4, "Thu"], [5, "Fri"], [6, "Sat"], [0, "Sun"]];
const DOW_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const weekText = w => `${(WEEK_CHOICES.find(c => c[0] === w.minutes) || [0, `${w.minutes} min`])[1]} a week · ${WEEK_DAYS.filter(d => w.days.includes(d[0])).map(d => d[1]).join(", ")}`;
const dayText = d => `${d.minutes} min · Lesson ${d.lesson}: ${d.kinds.join(", ")}${d.more ? ` and ${d.more === 1 ? "the next lesson" : `${d.more} more lessons`}` : ""}`;

function weekEditor(x, onDone) {
  const draft = { minutes: x.week?.minutes || 60, days: [...(x.week?.days || [1, 3, 6])] };
  const box = el("div", { class: "wp-week-edit", onclick: e => e.stopPropagation() });
  const draw = () => box.replaceChildren(
    el("div", { class: "wp-label" }, `Your week for ${x.interest}`),
    el("div", { class: "wp-week-q" }, "How much time a week?"),
    el("div", { class: "wp-week-chips", role: "group", "aria-label": "Time a week" }, ...WEEK_CHOICES.map(([m, t]) =>
      el("button", { class: "wp-week-chip", "aria-pressed": String(draft.minutes === m), onclick: () => { draft.minutes = m; draw(); } }, t))),
    el("div", { class: "wp-week-q" }, "Which days?"),
    el("div", { class: "wp-week-chips", role: "group", "aria-label": "Days" }, ...WEEK_DAYS.map(([d, t]) =>
      el("button", { class: "wp-week-chip", "aria-pressed": String(draft.days.includes(d)),
        onclick: () => { draft.days = draft.days.includes(d) ? draft.days.filter(y => y !== d) : [...draft.days, d]; draw(); } }, t))),
    el("div", { class: "wp-muted wp-week-note" }, draft.days.length ? `About ${Math.max(10, Math.round(draft.minutes / draft.days.length))} min on each. A day you miss rolls forward.` : "Pick at least one day."),
    el("div", { class: "wp-row" },
      el("button", { class: "wp-btn wp-btn-primary", disabled: !draft.days.length, onclick: async () => {
        const r = await send({ type: "path-week", id: x.id, week: draft });
        if (r?.result !== "applied") return toast(r?.message || "Couldn't save that. Try again.");
        onDone(true);
      } }, "Save"),
      x.week ? el("button", { class: "wp-btn wp-btn-text", onclick: async () => { await send({ type: "path-week", id: x.id, week: null }); onDone(true); } }, "No schedule") : null,
      el("button", { class: "wp-btn wp-btn-text", onclick: () => onDone(false) }, "Cancel")));
  draw();
  return box;
}

// What's left to the next checkpoint: lessons to the end of a unit, or a step outside Aim.
const pwProgressText = pr => !pr ? "No path yet: pick it to draft one"
  : pr.next ? (pr.next.outside ? `Next checkpoint: ${pr.next.title} (outside Aim)` : `${pr.next.left} lesson${pr.next.left === 1 ? "" : "s"} to: ${pr.next.title}`) : "Every unit done";

function pathsWindow() {
  if (!pw.open) { pwHost = el("div", { class: "wp-pw-slot", hidden: true }); return pwHost; }
  const rows = (pw.list || []).map(x => {
    const pct = x.progress?.percent || 0;
    const row = el("div", { class: "wp-pw-row wp-cl-row", title: `Pick up ${x.interest} where you left off` },
      subjectThumb(x.subject),
      el("div", { class: "wp-cl-text" },
        el("span", { class: "wp-cl-head" }, el("span", { class: "wp-cl-title wp-pw-interest" }, x.interest), el("span", { class: "wp-cl-goal" }, x.goal)),
        el("span", { class: "wp-muted wp-pw-goal" }, x.lesson ? `Lesson ${x.lesson.n} · ${x.lesson.title}` : "Pick it up, and Aim lays out the path"),
        el("span", { class: "wp-cl-progress" },
          el("span", { class: "wp-pw-bar", role: "progressbar", "aria-valuenow": String(pct), "aria-valuemin": "0", "aria-valuemax": "100", "aria-label": `${pct}% of the path` }, el("i", { style: `width:${pct}%` })),
          el("span", { class: "wp-cl-pct" }, x.progress ? `${pct}%` : "")),
        el("span", { class: "wp-pw-meta" }, pwProgressText(x.progress),
          x.planned ? el("button", { class: "wp-link wp-pw-see", onclick: e => { e.stopPropagation(); send({ type: "open-path", id: x.id }); } }, "See the path") : null),
        // Your week (0.80): today's piece, or the next day with one; or set one.
        x.planned ? el("span", { class: "wp-pw-week" },
          x.week ? el("span", { class: x.today ? "wp-pw-today" : "wp-muted" }, x.today ? `Today · ${dayText(x.today)}` : x.next ? `Next: ${DOW_NAMES[x.next.dow]} · ${dayText(x.next)}` : weekText(x.week)) : null,
          el("button", { class: "wp-link", onclick: e => { e.stopPropagation(); pw.weekFor = pw.weekFor === x.id ? null : x.id; pwRedraw(); } }, x.week ? "Your week" : "Set your week")) : null),
      el("button", { class: "wp-cl-play wp-pw-pick", disabled: !!pw.busy, "aria-label": `Pick up ${x.interest} where you left off`, onclick: e => { e.stopPropagation(); pickPath(x.id); } }, icon("playSolid")));
    row.addEventListener("click", () => { if (!pw.busy) pickPath(x.id); });
    if (pw.weekFor !== x.id) return row;
    return el("div", { class: "wp-pw-item" }, row, weekEditor(x, async saved => {
      pw.weekFor = null;
      if (saved) { pw.list = (await send({ type: "paths" })) || []; applyStatus(await send({ type: "status" })); }
      pwRedraw();
    }));
  });
  const add = pw.adding ? (() => {
    const i = el("input", { class: "wp-input", type: "text", placeholder: "An interest, like aviation", "aria-label": "Interest", maxlength: "60" });
    const g = el("input", { class: "wp-input", type: "text", placeholder: "The goal behind it, like “earn a private pilot's license”", "aria-label": "Goal", maxlength: "160" });
    keepKeys(i, () => g.focus());
    keepKeys(g, () => addInterest(i.value, g.value));
    setTimeout(() => i.focus(), 30);
    return el("div", { class: "wp-pw-add" }, i, g, el("div", { class: "wp-row" },
      el("button", { class: "wp-btn wp-btn-primary", onclick: () => addInterest(i.value, g.value) }, "Add"),
      el("button", { class: "wp-btn wp-btn-text", onclick: () => { pw.adding = false; pw.error = ""; pwRedraw(); } }, "Cancel")));
  })() : null;
  pwHost = el("div", { class: "wp-pw", "aria-label": "Your learning plans" },
    el("div", { class: "wp-pw-head" },
      el("span", { class: "wp-label" }, "Your learning plans"),
      el("button", { class: "wp-link wp-pw-plus", title: "Add an interest", onclick: () => { pw.adding = true; pw.error = ""; pwRedraw(); } }, icon("plus"), "Add an interest")),
    pw.list === null ? el("div", { class: "wp-muted wp-pw-note" }, "Loading…")
      : rows.length ? el("div", { class: "wp-pw-list" }, ...rows)
      : pw.adding ? null : el("div", { class: "wp-muted wp-pw-note" }, "Add what you're curious about, and the goal behind it. Aim lays out a path, in order, and you pick it up here."),
    add,
    pw.busy ? el("div", { class: "wp-pw-busy", role: "status" }, el("span", { class: "wp-talk-typing" }, el("i"), el("i"), el("i")), pw.busy) : null,
    pw.error ? el("div", { class: "wp-error wp-pw-note" }, pw.error) : null);
  return pwHost;
}
