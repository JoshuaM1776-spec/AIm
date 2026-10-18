// Aim Homeschool — the student's Today screen on YouTube's homepage, and the plan beside a
// lesson's video. For a student in a Homeschool household this replaces the "What brings you
// here?" card. Until the parent website exists it runs on a sample plan, turned on in Settings
// (see setHomeschoolPreview in store.js and docs/HOMESCHOOL.md → "Student home on YouTube").

const planOn = () => !!status.homeschool?.items?.length;
const planKey = () => JSON.stringify(status.homeschool?.items?.map(i => [i.id, !!i.doneAt, i.video?.id || "", i.interest || ""]) || null);
const planItem = id => status.homeschool?.items.find(i => i.id === id) || null;
const planNext = hs => hs.items.find(i => !i.doneAt) || null;

const SUBJECT_ICON = { Science: "flask", Math: "ruler", History: "globe", Project: "tool", English: "book", TeachBack: "ask" };
const KIND_ICON = { trip: "pin", check: "calendar", reflect: "star" };

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}
const planDuration = m => (m >= 60 ? `${Math.floor(m / 60)}h${m % 60 ? ` ${m % 60}m` : ""}` : `${m} min`);

// What each item's button does.
async function openPlanItem(item) {
  if (item.kind === "video") {
    const r = await send({ type: "plan-start", id: item.id });
    if (r?.result !== "applied") return toast(r?.message || "Couldn't start that. Try again.");
    location.href = r.url;
  } else if (item.kind === "teachback") {
    send({ type: "open-teachback", topic: item.topic || item.title, plan: item.id });
  } else openPlanGuide(item);
}

async function setPlanDone(item, done) {
  const r = await send({ type: "plan-done", id: item.id, done });
  if (r?.result !== "applied") return toast(r?.message || "Couldn't update the plan. Try again.");
  status.homeschool = r.homeschool;
  route();
}

// A project's guide, or a reading assignment: what to do, then Mark done.
function openPlanGuide(item) {
  const g = item.guide;
  openModal(el("div", { class: "wp wp-dialog wp-plan-guide", role: "dialog", "aria-modal": "true" }, ...[
    el("div", { class: "wp-plan-subject" }, item.subject, item.together ? el("span", { class: "wp-plan-tag" }, "Do this together") : null),
    el("div", { class: "wp-title" }, item.title),
    el("p", { class: "wp-muted" }, item.desc),
    item.together ? el("p", { class: "wp-plan-note" }, "Your parent marked this one to do together. Ask them to join you.") : null,
    g?.materials?.length ? [el("div", { class: "wp-label" }, "Materials"), el("ul", { class: "wp-plan-ul" }, ...g.materials.map(x => el("li", {}, x)))] : null,
    g?.steps?.length ? [el("div", { class: "wp-label" }, "Steps"), el("ol", { class: "wp-plan-ul" }, ...g.steps.map(x => el("li", {}, x)))] : null,
    g?.show ? el("p", { class: "wp-plan-note" }, g.show) : null,
    el("div", { class: "wp-actions" },
      el("button", { class: "wp-btn wp-btn-text", onclick: closeModal }, "Close"),
      item.doneAt ? el("button", { class: "wp-btn wp-btn-tonal", onclick: () => { closeModal(); setPlanDone(item, false); } }, "Not done yet")
        : el("button", { class: "wp-btn wp-plan-btn-strong", onclick: () => { closeModal(); setPlanDone(item, true); } }, icon("check2"), "Mark done"))
  ].flat().filter(Boolean)));
}

function planThumb(item) {
  if (item.video?.id) return el("div", { class: "wp-plan-thumb", style: `background-image: url("https://i.ytimg.com/vi/${encodeURIComponent(item.video.id)}/mqdefault.jpg")` },
    el("span", { class: "wp-plan-len" }, `${item.minutes} min`));
  return el("div", { class: `wp-plan-thumb wp-plan-tile wp-plan-${item.kind}`, "data-subject": item.subject },
    icon(SUBJECT_ICON[item.subject] || "book"), item.kind === "video" ? el("span", { class: "wp-plan-len" }, `${item.minutes} min`) : null);
}

function planRow(item, next) {
  const isNext = item === next;
  const label = item.doneAt ? (item.kind === "video" ? "Watch again" : item.kind === "teachback" ? "Try again" : "Open")
    : item.kind === "video" ? (item.video ? "Continue" : "Start") : item.kind === "project" ? "View guide" : item.kind === "reading" ? "Open" : "Start";
  const cls = item.doneAt ? "wp-btn wp-btn-text" : isNext ? "wp-btn wp-plan-btn-strong" : "wp-btn wp-plan-btn-quiet";
  return el("div", { class: `wp-plan-item${isNext ? " wp-plan-next" : ""}${item.doneAt ? " wp-plan-done" : ""}`, "data-id": item.id },
    el("button", { class: "wp-plan-dot", role: "checkbox", "aria-checked": item.doneAt ? "true" : "false",
      "aria-label": item.doneAt ? `${item.title}: done. Mark not done` : `Mark ${item.title} done`, title: item.doneAt ? "Done" : "Mark done",
      onclick: () => setPlanDone(item, !item.doneAt) }, item.doneAt ? icon("check") : null),
    planThumb(item),
    el("div", { class: "wp-plan-text" },
      el("div", { class: "wp-plan-subject" }, item.subject, item.together && !item.doneAt ? el("span", { class: "wp-plan-tag" }, "Do this together") : null),
      el("div", { class: "wp-plan-title" }, item.title),
      el("div", { class: "wp-plan-desc" }, item.doneAt ? "Done" : item.desc),
      // Finished: the student's own say on whether they want more of it, once.
      item.doneAt && !item.interest ? interestChips({ topic: item.title, subject: item.subject, source: "plan", ref: item.id }) : null,
      !item.doneAt && item.kind !== "teachback" ? whereLink(item.kind === "project" ? item.title : `${item.subject}: ${item.title}`, item.desc) : null),
    el("button", { class: cls, onclick: () => openPlanItem(item) },
      !item.doneAt && item.kind === "video" ? icon("play") : null, label));
}

function renderToday(host) {
  const hs = status.homeschool;
  const key = `today|${planKey()}|${greeting()}|${purpose?.plan || ""}|${account.on}|${status.pathways?.offer?.name || ""}`;
  if ($("#wp-home")?.dataset.key === key) return;
  $("#wp-home")?.remove();
  const next = planNext(hs);
  const done = hs.items.filter(i => i.doneAt).length;
  const minutes = hs.items.reduce((t, i) => t + (i.minutes || 0), 0);

  const input = el("input", { class: "wp-home-input", type: "text", "aria-label": "Ask Aim anything",
    placeholder: `Ask Aim anything… (e.g. “Why do volcanoes erupt?” or “How do tectonic plates move?”)` });
  const go = el("button", { class: "wp-home-go", "aria-label": "Go", title: "Go" }, icon("right"));
  const submit = () => { const q = input.value.trim(); if (!q) return input.focus(); aimSearch(q, on => { input.disabled = on; go.disabled = on; }); };
  go.onclick = submit;
  keepKeys(input, submit);

  const finished = !next ? el("div", { class: "wp-plan-finished" }, ...[
    el("div", { class: "wp-plan-finished-title" }, "You're done for today."),
    el("div", { class: "wp-muted" }, `You finished all ${hs.items.length}. Nice work.`),
    hs.deeper?.length ? [el("div", { class: "wp-label" }, "Go deeper (optional)"),
      el("div", { class: "wp-chips" }, ...hs.deeper.map(q => el("button", { class: "wp-chip", onclick: () => goSearch(q) }, q)))] : null,
    el("div", { class: "wp-label" }, "Or take a break"), breakChips(takeBreak)].flat().filter(Boolean)) : null;

  const planCard = el("section", { class: "wp-plan-card", "aria-label": "Today's plan" },
    el("div", { class: "wp-plan-head" },
      el("div", { class: "wp-plan-head-title" }, icon("calendar"), el("h2", {}, "Today's Plan"),
        el("span", { class: "wp-muted" }, new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })),
        el("span", { class: "wp-muted" }, `· About ${planDuration(minutes)}`)),
      el("div", { class: "wp-plan-progress" },
        el("span", { class: "wp-muted" }, `${done} of ${hs.items.length} done`),
        el("span", { class: "wp-plan-bar", role: "progressbar", "aria-valuemin": "0", "aria-valuemax": String(hs.items.length), "aria-valuenow": String(done) },
          el("i", { style: `width:${(done / hs.items.length) * 100}%` })))),
    finished,
    el("div", { class: "wp-plan-list" }, ...hs.items.map(i => planRow(i, next))));

  const offer = themeOfferBlock();
  const side = el("aside", { class: "wp-plan-side" },
    offer ? el("section", { class: "wp-plan-card wp-plan-offer" }, offer) : null,
    el("section", { class: "wp-plan-card wp-plan-unit" },
      el("h2", {}, "Current Unit"),
      el("div", { class: "wp-plan-unit-row" },
        el("div", { class: "wp-plan-thumb wp-plan-tile", "data-subject": hs.unit.subject }, icon(SUBJECT_ICON[hs.unit.subject] || "book")),
        el("div", {}, el("div", { class: "wp-strong" }, hs.unit.title), el("div", { class: "wp-muted" }, hs.unit.summary)))),
    el("section", { class: "wp-plan-card" },
      el("h2", {}, "Up next this week"),
      ...hs.upcoming.map(u => el("div", { class: "wp-plan-up" },
        el("span", { class: `wp-plan-up-icon wp-plan-up-${u.kind}` }, icon(KIND_ICON[u.kind] || "calendar")),
        el("div", { class: "wp-plan-up-text" }, el("div", { class: "wp-strong" }, u.title), el("div", { class: "wp-muted" }, u.desc)),
        el("span", { class: "wp-muted wp-plan-when" }, u.when)))),
    el("button", { class: "wp-plan-card wp-plan-dash", onclick: () => toast("Your dashboard (projects, portfolio, field trips and achievements) is part of the Aim Homeschool website, coming later.") },
      el("span", { class: "wp-plan-up-icon" }, icon("chart")),
      el("div", { class: "wp-plan-up-text" }, el("div", { class: "wp-strong" }, "My Dashboard"),
        el("div", { class: "wp-muted" }, "Projects, portfolio, field trips and achievements")),
      icon("right")));

  const card = el("div", { id: "wp-home", class: "wp wp-today", "data-key": key },
    el("div", { class: "wp-today-brand" }, brandLine(), el("span", { class: "wp-plan-tag wp-plan-tag-brand" }, "Homeschool"),
      hs.preview ? el("span", { class: "wp-muted wp-today-preview" }, "Preview · sample plan · ",
        el("button", { class: "wp-link", onclick: async () => { await send({ type: "homeschool-preview", on: false }); } }, "Turn off")) : null,
      el("button", { class: "wp-link wp-today-tour", onclick: () => startStudentTour(0) }, "Take the tour")),
    el("h1", { class: "wp-today-hello" }, `${greeting()}, ${hs.student}!`),
    el("div", { class: "wp-muted wp-today-sub" }, next ? "Let's keep the momentum going." : "That's everything for today."),
    el("div", { class: "wp-home-search wp-today-ask" }, el("span", { class: "wp-today-ask-mark" }, icon("ask")), input, go),
    el("div", { class: "wp-today-grid" }, planCard, side));
  host.prepend(card);
  showTips();
}

// Beside a lesson's video, in place of Up next: this lesson, Mark done, what's next, and the day.
function renderPlanPanel(p, host) {
  const hs = status.homeschool;
  const item = planItem(p.plan);
  const key = `${planKey()}|${p.plan}`;
  const existing = $("#wp-plan-panel");
  if (existing && existing.parentElement === host && existing.dataset.key === key) return;
  existing?.remove();
  $("#wp-upnext")?.remove(); $("#wp-study")?.remove();
  const after = hs.items.find(i => !i.doneAt && i !== item) || null;
  host.prepend(el("div", { id: "wp-plan-panel", class: "wp wp-plan-panel", "data-key": key },
    el("div", { class: "wp-row-between" },
      el("div", { class: "wp-label" }, "Today's plan"),
      el("a", { class: "wp-link", href: "/" }, "Back to Today")),
    item ? el("div", { class: "wp-plan-panel-now" },
      el("div", { class: "wp-plan-subject" }, item.subject),
      el("div", { class: "wp-strong" }, item.title),
      el("div", { class: "wp-muted" }, item.desc),
      whereLink(`${item.subject}: ${item.title}`, item.desc),
      item.doneAt && !item.interest ? interestChips({ topic: item.title, subject: item.subject, source: "plan", ref: item.id }) : null,
      item.doneAt ? el("div", { class: "wp-plan-panel-done" }, icon("check"), "Done")
        : el("button", { class: "wp-btn wp-plan-btn-quiet", onclick: () => setPlanDone(item, true) }, icon("check2"), "Mark done")) : null,
    after ? el("button", { class: `wp-btn ${item?.doneAt ? "wp-plan-btn-strong" : "wp-plan-btn-quiet"} wp-btn-block`, onclick: () => openPlanItem(after) },
      `Next: ${after.title}`, icon("right")) : el("div", { class: "wp-muted" }, "That's the last thing on today's plan."),
    el("ol", { class: "wp-plan-mini" }, ...hs.items.map(i => el("li", { class: `${i === item ? "here" : ""}${i.doneAt ? " done" : ""}` },
      el("span", { class: "wp-plan-mini-dot" }, i.doneAt ? icon("check") : null), i.title)))));
}
