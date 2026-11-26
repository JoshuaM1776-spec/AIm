// Aim — the Daily Challenge (0.75), on YouTube's homepage: the same challenge for everyone, from Aim's
// server, checked and published by an editor (daily-editor.html). A real moment, a problem, three
// choices or Not sure; nothing scored. Right: one "explain why", so a lucky guess doesn't count. Not
// yet: a short video or the why, then a second try with the same idea in today's world. Then done for
// today, with how we know (its sources) and "Want a plan for this?". Your answers are kept for the day
// in this browser (store.js → dailyMine).

let dl = { day: "", challenge: null, mine: {}, loading: false, error: "", unavailable: false };
let dlHost = null;
function dlRedraw() { if (dlHost?.isConnected) dlHost.replaceWith(dailyPanel()); }

async function openDaily() {
  scene.panel = "daily"; pw.open = false;
  dl = { ...dl, loading: !dl.challenge, error: "" };
  await renderHome();
  const r = (await send({ type: "daily-get", refresh: true })) || {};
  dl = { day: r.day || "", challenge: r.challenge || null, mine: r.mine || { day: r.day }, loading: false, error: r.challenge ? "" : r.error || "", unavailable: !!r.unavailable };
  dlRedraw();
}
async function dlSave(patch) {
  const r = await send({ type: "daily-answer", day: dl.day, patch });
  if (r?.mine) dl.mine = r.mine;
  dlRedraw();
}

// One question: its three choices (and Not sure, on the first try).
function dailyAsk(ask, step) {
  const pick = i => dlSave(step === "first" ? { first: { pick: i, right: i === ask.answer } } : { second: { pick: i, right: i === ask.answer }, doneAt: true });
  return el("div", { class: "wp-dl-ask" },
    el("div", { class: "wp-dl-q" }, ask.question),
    el("div", { class: "wp-dl-choices", role: "group", "aria-label": "Your answer" },
      ...ask.choices.map((c, i) => el("button", { class: "wp-dl-choice", onclick: () => pick(i) }, el("span", { class: "wp-dl-letter" }, "ABC"[i]), el("span", {}, c))),
      step === "first" ? el("button", { class: "wp-dl-choice wp-dl-unsure", onclick: () => pick(-1) }, "Not sure") : null));
}
// After answering: the choices, with the right one and yours marked.
function dailyMarked(ask, pick) {
  return el("div", { class: "wp-dl-ask" },
    el("div", { class: "wp-dl-q" }, ask.question),
    el("div", { class: "wp-dl-choices wp-dl-marked" }, ...ask.choices.map((c, i) => el("div", { class: `wp-dl-choice${i === ask.answer ? " right" : i === pick ? " missed" : ""}` },
      el("span", { class: "wp-dl-letter" }, "ABC"[i]), el("span", {}, c), i === pick ? el("span", { class: "wp-dl-you" }, "your answer") : null))));
}
const dailyWhy = (label, text) => (text ? el("div", { class: "wp-dl-why" }, el("span", { class: "wp-label" }, label), el("span", {}, text)) : null);

function dailyPanel() {
  const c = dl.challenge, m = dl.mine || {};
  const body = [];
  if (dl.loading) body.push(el("div", { class: "wp-pw-busy", role: "status" }, el("span", { class: "wp-talk-typing" }, el("i"), el("i"), el("i")), "Getting today's challenge…"));
  else if (!c) body.push(el("p", { class: "wp-dl-note" }, dl.unavailable ? "The Daily Challenge comes from Aim's server, and this copy of Aim isn't connected to one."
    : dl.error ? `Couldn't get today's challenge just now. ${dl.error}` : "Today's challenge isn't out yet. Check back a little later."));
  else {
    body.push(el("div", { class: "wp-dl-head" },
      el("span", { class: "wp-dl-meta" }, [c.area, c.moment].filter(Boolean).join(" · ")),
      el("b", { class: "wp-dl-title" }, c.title),
      el("p", { class: "wp-dl-scene" }, c.scene)));
    if (!m.first) body.push(dailyAsk(c, "first"), el("div", { class: "wp-dl-small" }, "First try. Nothing is scored; take your best guess."));
    else {
      body.push(dailyMarked(c, m.first.pick));
      if (m.first.right && !m.doneAt) {
        const t = el("textarea", { class: "wp-input wp-dl-explain", rows: "3", placeholder: "In a sentence or two", "aria-label": c.explain || "Why is that the answer?" });
        body.push(el("div", { class: "wp-dl-step" },
          el("b", {}, `That's it. ${c.explain || "Why is that the answer?"}`),
          el("span", { class: "wp-muted" }, "So a lucky guess doesn't count. Just for you; nothing is checked."), t,
          el("div", { class: "wp-row" },
            el("button", { class: "wp-btn wp-btn-primary", onclick: () => dlSave({ explain: t.value.trim(), doneAt: true }) }, "Done"),
            el("button", { class: "wp-btn wp-btn-text", onclick: () => dlSave({ explain: "", doneAt: true }) }, "Skip"))));
      } else if (!m.first.right && !m.learned) {
        body.push(el("div", { class: "wp-dl-step" },
          el("b", {}, m.first.pick < 0 ? "Fair enough. Get ready, then try again." : "Not quite. Get ready, then try again."),
          c.learn?.note ? el("span", { class: "wp-muted" }, c.learn.note) : null,
          el("div", { class: "wp-row" },
            c.learn?.search ? el("button", { class: "wp-btn wp-btn-primary", onclick: async () => { await send({ type: "daily-answer", day: dl.day, patch: { learned: true } }); goSearch(c.learn.search); } },
              icon("play"), "Watch a short video") : null,
            el("button", { class: "wp-btn wp-btn-tonal", onclick: () => dlSave({ learned: true }) }, "Read why"))));
      } else if (!m.first.right && !m.second) {
        body.push(dailyWhy("Why", c.why), el("div", { class: "wp-dl-step" }, el("b", {}, "Second try: the same idea, today."), dailyAsk(c.second, "second")));
      }
    }
    if (m.doneAt) {
      if (m.second) body.push(dailyWhy("Why", c.why), el("div", { class: "wp-dl-step" }, el("b", {}, "Second try"), dailyMarked(c.second, m.second.pick)));
      body.push(dailyWhy(m.second ? "And today" : "Why", m.second ? c.second.why : c.why),
        m.explain ? dailyWhy("You said", m.explain) : null,
        el("div", { class: "wp-dl-done" },
          el("b", {}, "Done for today."),
          el("span", { class: "wp-muted" }, m.first.right ? "Right the first time." : m.second?.right ? "Right on the second try." : "Not yet, and that's how it sticks. It'll come round again."),
          c.sources?.length ? el("div", { class: "wp-dl-sources" }, el("span", { class: "wp-label" }, "How do we know?"),
            ...c.sources.map(s => s.url ? el("a", { href: s.url, target: "_blank", rel: "noopener" }, s.title) : el("span", {}, s.title))) : null,
          c.plan?.interest ? el("button", { class: "wp-btn wp-btn-tonal wp-dl-plan", onclick: () => planFromDaily(c.plan) }, icon("plus"), `Want a plan for this? ${c.plan.interest}`) : null,
          el("span", { class: "wp-muted" }, "A new one tomorrow.")));
    }
  }
  dlHost = scenePanel({ cls: "wp-dl", title: "Daily Challenge", sub: "A new problem to solve each day. The same one for everyone." }, ...body);
  return dlHost;
}

// "Want a plan for this?": the interest and its goal, ready to add under Learning plans.
async function planFromDaily(plan) {
  await openContinue();
  pw.adding = true;
  pw.prefill = { interest: plan.interest || "", goal: plan.goal || "" };
  pwRedraw();
}

// The homepage card: today's title, where you are with it, or the usual line.
function dailyCardSub(d) {
  const c = d?.challenge, m = d?.mine || {};
  if (!c) return "A new problem to solve each day.";
  if (m.doneAt) return `Done for today: ${c.title}`;
  if (m.first && !m.first.right && m.learned && !m.second) return `Second try waiting: ${c.title}`;
  return `Today: ${c.title}`;
}
