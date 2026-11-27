// Aim — the Weekly Challenge (0.76), on YouTube's homepage: one story a week, the same for everyone,
// written with Aim's help and checked and published by an editor (weekly-editor.html). The card shows
// what it's about and what to be familiar with; Hints give a few questions worth looking into (each
// with a video search), never the answers. Accept, then chapter by chapter: work something out,
// choose, or share out a budget. The story's own rules decide what happens (content/weekly-shared.js);
// signed in, the narrator answers from what the team knows, says what your reasoning weighed and
// missed, and writes your debrief. Your playthrough is kept in this browser; stop between chapters
// and pick it up later.

Object.assign(ICON, {
  drop: [22, ["path", { d: "M12 3.5c3 4 6 7.2 6 10.5a6 6 0 0 1-12 0c0-3.3 3-6.5 6-10.5z", fill: "none", stroke: "currentColor", "stroke-width": "1.6", "stroke-linejoin": "round" }]],
  layers: [22, ["path", { d: "M12 4L3.5 8.5 12 13l8.5-4.5z", fill: "none", stroke: "currentColor", "stroke-width": "1.6", "stroke-linejoin": "round" }],
    ["path", { d: "M3.5 12.5L12 17l8.5-4.5M3.5 16.5L12 21l8.5-4.5", fill: "none", stroke: "currentColor", "stroke-width": "1.6", "stroke-linejoin": "round", "stroke-linecap": "round" }]],
  bulb: [20, ["path", { d: "M9 17.5h6M10 20.5h4M12 3.5a6 6 0 0 0-3.6 10.8c.7.6 1.1 1.3 1.1 2.2h5c0-.9.4-1.6 1.1-2.2A6 6 0 0 0 12 3.5z", fill: "none", stroke: "currentColor", "stroke-width": "1.6", "stroke-linejoin": "round", "stroke-linecap": "round" }]],
  sprout: [20, ["path", { d: "M12 21V10.5", stroke: "currentColor", "stroke-width": "1.6", "stroke-linecap": "round" }],
    ["path", { d: "M12 15c-4.2 0-7-2.6-7-6.6 4.2 0 7 2.6 7 6.6zM12 11c0-4.2 2.8-7 7.5-7 0 4.3-2.8 7-7.5 7z", fill: "currentColor", "fill-opacity": ".22", stroke: "currentColor", "stroke-width": "1.6", "stroke-linejoin": "round" }],
    ["path", { d: "M8.5 21h7", stroke: "currentColor", "stroke-width": "1.6", "stroke-linecap": "round" }]],
  money: [22, ["rect", { x: "3.5", y: "6.5", width: "17", height: "11", rx: "2", fill: "none", stroke: "currentColor", "stroke-width": "1.6" }], ["circle", { cx: "12", cy: "12", r: "2.6", fill: "none", stroke: "currentColor", "stroke-width": "1.6" }]],
  impact: [26, ["circle", { cx: "12", cy: "12", r: "9", fill: "none", stroke: "currentColor", "stroke-width": "1.5" }], ["path", { d: "M15.5 9.2a4.2 4.2 0 1 0 0 5.6", fill: "none", stroke: "currentColor", "stroke-width": "1.8", "stroke-linecap": "round" }]],
  chart2: [22, ["path", { d: "M5 19V11M12 19V5M19 19v-6", fill: "none", stroke: "currentColor", "stroke-width": "1.8", "stroke-linecap": "round" }]]
});
// The icons a story may name (facts and topics); anything else gets the compass.
const WK_ICON = { people: "users", calendar: "calendarDots", mountain: "mountain", money: "money", clock: "clock", compass: "compass", drop: "drop", layers: "layers",
  tool: "tool", chart: "chart2", globe: "globe", book: "book" };
const wkIcon = name => icon(WK_ICON[name] || "compass");
const wkImage = src => (String(src || "").startsWith("bundled:") ? chrome.runtime.getURL(`scenes/${src.slice(8)}`) : src || "");
const wkMoney = n => `${n < 0 ? "−" : ""}$${Math.abs(Math.round(n)).toLocaleString("en-US")}`;

// What's on screen: this week's story and your playthrough (or an editor's playtest of a draft), and
// what the open chapter holds while you work on it (drafts survive a redraw).
let wk = { week: "", story: null, state: null, unavailable: false, playtest: false, hints: false };
let wkUi = {};
const wkFresh = () => { wkUi = { picked: null, why: "", num: "", amounts: {}, error: "", asking: false, answer: "", data: false, waiting: "", debriefing: false, debriefFailed: false }; };
wkFresh();
let wkHost = null;
function wkRedraw() { if (wkHost?.isConnected) wkHost.replaceWith(scene.panel === "story" ? weeklyPanel() : weeklyCard()); }
const wkSave = () => send({ type: "weekly-play-save", state: wk.state, playtest: wk.playtest });

// A playthrough belongs to the story as it was when you started; if the editor changed its chapters
// since, it starts over rather than land you somewhere that no longer exists.
const wkIds = story => (story?.chapters || []).map(c => c.id).join(",");
const wkFits = (story, state) => (story && state?.play && state.ids === wkIds(story) ? state : null);
// What this tab has in hand is at least as new as what's stored, unless another tab got further.
const wkLater = (mine, stored) => (mine && (!stored || (mine.play.log || []).length >= (stored.play.log || []).length) ? mine : stored);

// This week's story for the card: from the cache, fetched in the background when it's a new week.
// youtube.com/#aim-weekly-playtest (from the editor) plays a draft instead, in that tab.
let wkPlaytestLoad = null;
async function weeklyLoad() {
  // Another render can arrive while the playtest loads: both wait for it, and neither overwrites it.
  if (location.hash === "#aim-weekly-playtest") {
    history.replaceState(null, "", "/");
    wkPlaytestLoad = send({ type: "weekly-playtest" }).then(t => {
      if (t?.story) { wk = { ...wk, week: t.week, story: t.story, state: wkFits(t.story, t.state), playtest: true }; wkFresh(); scene = { view: "home", panel: null }; }
    });
  }
  if (wkPlaytestLoad) await wkPlaytestLoad;
  if (wk.playtest) return;
  const r = (await send({ type: "weekly-peek" })) || {};
  if (wk.playtest) return;
  const same = wk.story && r.story && wk.week === r.week && wkIds(wk.story) === wkIds(r.story);
  // Never blank a story this week already has while the next one is fetched.
  const keep = !r.story && wk.story && wk.week === r.week && !wk.playtest ? wk.story : null;
  wk = { ...wk, week: r.week || "", story: r.story || keep, unavailable: !!r.unavailable,
    state: keep ? wk.state : wkLater(same ? wkFits(r.story, wk.state) : null, wkFits(r.story, r.state)) };
  if (!r.fresh) send({ type: "weekly-get" }).then(n => {
    if (!alive || wk.playtest) return;
    if (n?.unavailable && !wk.unavailable) { wk.unavailable = true; if (!scene.panel) renderHome(); }
    if (n?.story && (!wk.story || wk.story.title !== n.story.title || wkIds(wk.story) !== wkIds(n.story))) { wk = { ...wk, week: n.week, story: n.story, state: wkFits(n.story, n.state) }; renderHome(); }
  });
}
// What the card shows, for renderHome's key.
const wkStateKey = () => [wk.week, wk.story?.title || "", wk.state?.play?.chapter ?? "", wk.state?.play?.done ? "done" : "", wk.playtest, wk.unavailable].join(":");

// ---------- the card ----------
function weeklyCard() {
  const s = wk.story;
  if (!s) {
    wkHost = el("section", { class: "wp-wk-card wp-wk-empty", "aria-label": "This week's challenge" },
      el("div", { class: "wp-wk-body" },
        el("span", { class: "wp-wk-pill" }, icon("sprout"), "Weekly Challenge"),
        el("h1", { class: "wp-wk-title" }, "This week's challenge is on its way"),
        el("p", { class: "wp-wk-premise" }, wk.unavailable ? "The Weekly Challenge comes from Aim's server, and this copy of Aim isn't connected to one."
          : "A new story every Monday, where what you know is your equipment. Check back soon.")));
    return wkHost;
  }
  const p = wk.state?.play, at = p && wkProgress(s, p);
  const action = !p ? "Accept Challenge" : p.done ? "See how it ended" : `Continue · Chapter ${at.n} of ${at.of}`;
  const withHints = s.topics.filter(t => t.hints?.length);
  wkHost = el("section", { class: `wp-wk-card${wk.playtest ? " wp-wk-playtest" : ""}`, "aria-label": "This week's challenge" },
    wk.playtest ? el("div", { class: "wp-wk-banner" }, "Playtest of a draft. Only you see it, and it's kept apart from the real challenge.",
      el("button", { class: "wp-link", onclick: () => { wk = { ...wk, playtest: false, story: null, state: null }; renderHome(); } }, "End playtest")) : null,
    el("div", { class: "wp-wk-top" },
      s.image ? el("div", { class: "wp-wk-pic", style: `background-image: url("${wkImage(s.image)}")`, role: "img", "aria-label": s.title }) : null,
      el("div", { class: "wp-wk-body" },
        el("span", { class: "wp-wk-pill" }, icon("sprout"), "Weekly Challenge", s.minutes ? el("span", { class: "wp-wk-pill-time" }, ` · ${s.minutes}`) : null),
        el("h1", { class: "wp-wk-title" }, s.title),
        el("p", { class: "wp-wk-premise" }, s.premise),
        s.facts.length ? el("div", { class: "wp-wk-facts" }, ...s.facts.map(f => el("span", {}, wkIcon(f.icon), f.text))) : null,
        s.topics.length ? el("div", { class: "wp-wk-rule" }) : null,
        s.topics.length ? el("div", { class: "wp-wk-familiar" },
          el("div", { class: "wp-wk-familiar-head" }, el("b", {}, "Be familiar with:"),
            withHints.length ? el("button", { class: `wp-wk-hints-btn${wk.hints ? " on" : ""}`, "aria-expanded": String(wk.hints),
              onclick: () => { wk.hints = !wk.hints; wkRedraw(); } }, icon("bulb"), wk.hints ? "Hide hints" : "Hints") : null),
          el("div", { class: "wp-wk-topics" }, ...s.topics.map(t => el("span", { class: "wp-wk-topic" }, wkIcon(t.icon), t.name))),
          wk.hints ? el("div", { class: "wp-wk-hints" }, ...withHints.map(t => el("div", { class: "wp-wk-hint-group" },
            el("span", { class: "wp-wk-hint-topic" }, wkIcon(t.icon), t.name),
            ...t.hints.map(h => el("div", { class: "wp-wk-hint" }, el("span", {}, h.q),
              h.search ? el("button", { class: "wp-link", onclick: () => goSearch(h.search) }, icon("play"), "Find a video") : null))))) : null,
          el("p", { class: "wp-wk-note" }, "These topics will help you succeed, but you'll need to discover and apply the details yourself.")) : null)),
    el("div", { class: "wp-wk-foot" },
      s.impact ? el("div", { class: "wp-wk-impact" }, el("span", { class: "wp-wk-impact-label" }, icon("impact"), "The Impact"), el("span", { class: "wp-wk-impact-text" }, s.impact)) : el("span"),
      el("button", { class: "wp-wk-accept", onclick: openWeekly }, action, icon("right"))));
  return wkHost;
}

// ---------- playing ----------
async function openWeekly() {
  if (!wk.story) return;
  if (!wk.state) wk.state = { week: wk.week, ids: wkIds(wk.story), play: wkStart(wk.story), outcome: null, feedback: {}, debrief: null };
  if (!wk.state.play.done && !wk.state.outcome) wk.state.play = wkEnter(wk.story, wk.state.play);
  await wkSave();
  wkFresh();
  scene.panel = "story";
  renderHome();
}

function wkBar(p) {
  const L = wk.story.labels || {};
  return el("div", { class: "wp-wk-bar" },
    el("span", {}, icon("money"), `${L.budget || "Budget"}: `, el("b", {}, wkMoney(p.vars.budget))),
    el("span", {}, icon("calendarDots"), `${L.days || "Days left"}: `, el("b", {}, String(p.vars.days))));
}

// What the team knows, and (signed in) a question for the narrator, answered from it.
function wkTeam(ch) {
  if (!ch.data?.length) return null;
  const q = el("input", { class: "wp-input wp-wk-ask-input", type: "text", maxlength: "300", placeholder: "Ask the narrator something", "aria-label": "Ask the narrator" });
  const ask = async () => {
    const question = q.value.trim();
    if (question.length < 3) return q.focus();
    wkUi.asking = true; wkRedraw();
    const r = await send({ type: "librarian", task: "weekly-turn", input: { week: wk.week, mode: "ask", chapter: ch.id, question, draft: wk.playtest } });
    wkUi.asking = false;
    wkUi.answer = r?.answer ? `${question} · ${r.answer}` : r?.error || "The narrator couldn't answer just now.";
    wkUi.data = true;
    wkRedraw();
  };
  keepKeys(q, ask);
  const box = el("details", { class: "wp-wk-team", open: wkUi.data || null },
    el("summary", {}, icon("ask"), "What your team knows"),
    el("ul", {}, ...ch.data.map(d => el("li", {}, d))),
    account.on ? el("div", { class: "wp-wk-ask" }, q, el("button", { class: "wp-btn wp-btn-tonal", onclick: ask, disabled: wkUi.asking || null }, wkUi.asking ? "Asking…" : "Ask")) : null,
    wkUi.answer ? el("div", { class: "wp-wk-answer", role: "status" }, wkUi.answer) : null);
  box.addEventListener("toggle", () => { wkUi.data = box.open; });
  return box;
}

const wkBusy = text => el("div", { class: "wp-pw-busy" }, el("span", { class: "wp-talk-typing" }, el("i"), el("i"), el("i")), text);

// After a decision: what happened (the rules), and for a choice or a budget, the narrator's feedback on
// your reasoning (signed in) or what a strong answer weighs (signed out).
function wkOutcome() {
  const o = wk.state.outcome, fb = wk.state.feedback[o.ch];
  const ch = wk.story.chapters.find(c => c.id === o.ch) || {};
  const reasoned = ch.kind === "choose" || ch.kind === "allocate";
  return el("div", { class: "wp-wk-outcome" },
    o.right === true ? el("b", { class: "wp-wk-ok" }, "Right.") : o.right === false ? el("b", { class: "wp-wk-miss" }, "Not this time.") : null,
    o.text ? el("p", {}, o.text) : null,
    o.answer != null ? el("p", { class: "wp-wk-method" }, `The answer: ${Number(o.answer).toLocaleString("en-US")} ${o.unit || ""}. ${o.method || ""}`) : null,
    ...(o.short || []).map(x => el("p", { class: "wp-wk-short" }, el("b", {}, x.label), x.text ? `: ${x.text}` : "")),
    reasoned ? el("div", { class: "wp-wk-feedback" },
      fb?.said ? el("p", { class: "wp-wk-said" }, fb.said) : null,
      fb?.weighed?.length ? el("div", {}, el("span", { class: "wp-label" }, "Your reasoning weighed"), el("ul", {}, ...fb.weighed.map(x => el("li", {}, x)))) : null,
      fb?.missed?.length ? el("div", {}, el("span", { class: "wp-label" }, "Worth weighing too"), el("ul", {}, ...fb.missed.map(x => el("li", {}, x)))) : null,
      !fb && wkUi.waiting === o.ch ? wkBusy("The narrator is reading your reasoning…") : null,
      !fb && wkUi.waiting !== o.ch && ch.rubric?.length ? el("div", {}, el("span", { class: "wp-label" }, "A strong answer weighs"), el("ul", {}, ...ch.rubric.map(x => el("li", {}, x)))) : null) : null,
    el("div", { class: "wp-row" }, el("button", { class: "wp-btn wp-btn-primary wp-wk-next-btn", onclick: wkContinue }, wk.state.play.done ? "See how it ends" : "Next chapter", icon("right"))));
}
function wkContinue() {
  wk.state.outcome = null;
  if (!wk.state.play.done) wk.state.play = wkEnter(wk.story, wk.state.play);
  wkFresh();
  wkSave(); wkRedraw();
  wkHost?.scrollIntoView?.({ block: "start", behavior: "smooth" });
}

// The narrator's feedback on a choice or a budget, signed in: asked once, kept with the playthrough.
function wkFeedback(ch, choice, explanation) {
  if (!account.on) return;
  wkUi.waiting = ch.id;
  send({ type: "librarian", task: "weekly-turn", input: { week: wk.week, mode: "feedback", chapter: ch.id, choice, explanation, draft: wk.playtest } }).then(r => {
    if (wkUi.waiting === ch.id) wkUi.waiting = "";
    if (r && !r.error && wk.state) { wk.state.feedback[ch.id] = { said: r.said || "", weighed: r.weighed || [], missed: r.missed || [] }; wkSave(); }
    wkRedraw();
  });
}

// Run a rule; a refusal (no money for that, not a number) stays on the chapter with its reason.
function wkDecide(act) {
  const r = act();
  wk.state.play = r.play;
  wkUi.error = r.error || "";
  if (r.error) { wkRedraw(); return null; }
  return r;
}

function wkChapterView(ch) {
  const p = wk.state.play, at = wkProgress(wk.story, p);
  const body = [
    el("div", { class: "wp-wk-ch-head" },
      el("span", { class: "wp-wk-ch-n" }, `Chapter ${at.n} of ${at.of}${ch.area ? ` · ${ch.area}` : ""}`),
      el("h3", { class: "wp-wk-ch-title" }, ch.title)),
    wkBar(p),
    ch.event ? el("div", { class: "wp-wk-event" }, icon("bulb"), el("span", {}, ch.event.text)) : null,
    el("p", { class: "wp-wk-scene" }, ch.scene)];
  const why = el("textarea", { class: "wp-input wp-wk-why", rows: "3", maxlength: "1200", placeholder: "Your reasoning, in a few sentences", "aria-label": ch.explain || "Your reasoning" });
  why.value = wkUi.why;
  why.addEventListener("input", () => { wkUi.why = why.value; });
  keepKeys(why);
  const explain = () => el("label", { class: "wp-wk-explain" }, el("span", {}, ch.explain || "Explain your reasoning."), why);
  if (ch.kind === "calculate") {
    const v = el("input", { class: "wp-input wp-wk-num", type: "text", inputmode: "decimal", placeholder: "Your answer", "aria-label": "Your answer" });
    v.value = wkUi.num;
    v.addEventListener("input", () => { wkUi.num = v.value; });
    const go = () => {
      if (!v.value.trim()) return v.focus();
      const r = wkDecide(() => wkCalculate(wk.story, wk.state.play, v.value));
      if (!r) return;
      wkUi.num = "";
      if (r.again) { wkUi.error = "Not quite. Check your working: one more try."; wkSave(); return wkRedraw(); }
      wk.state.outcome = { ch: ch.id, right: r.right, text: r.text, method: r.method, answer: r.answer, unit: ch.unit };
      wkSave(); wkRedraw();
    };
    keepKeys(v, go);
    body.push(ch.givens?.length ? el("ul", { class: "wp-wk-givens" }, ...ch.givens.map(g => el("li", {}, g))) : null,
      el("div", { class: "wp-wk-q" }, ch.question),
      el("div", { class: "wp-wk-answer-row" }, v, ch.unit ? el("span", { class: "wp-wk-unit" }, ch.unit) : null,
        el("button", { class: "wp-btn wp-btn-primary wp-wk-submit", onclick: go }, "Submit")),
      wkUi.error ? el("div", { class: "wp-wk-again", role: "alert" }, wkUi.error) : p.tries ? el("p", { class: "wp-wk-small" }, "Last try on this one.") : null);
    wkUi.error = wkUi.error && ""; // shown here, not again below
  } else if (ch.kind === "choose") {
    body.push(el("div", { class: "wp-wk-options", role: "group", "aria-label": "Your choice" }, ...ch.options.map(o => {
      const can = wkAffordable(p, o);
      return el("button", { class: `wp-wk-option${wkUi.picked === o.id ? " on" : ""}`, "aria-pressed": String(wkUi.picked === o.id), disabled: !can || null,
        onclick: () => { wkUi.picked = o.id; wkRedraw(); } },
        el("b", {}, o.label), el("span", {}, o.detail), can ? null : el("span", { class: "wp-wk-small" }, "Not enough budget left for this."));
    })),
      explain(),
      el("div", { class: "wp-row" }, el("button", { class: "wp-btn wp-btn-primary wp-wk-decide", disabled: !wkUi.picked || null, onclick: () => {
        const text = why.value.trim(), choice = wkUi.picked;
        const r = wkDecide(() => wkChoose(wk.story, wk.state.play, choice, text));
        if (!r) return;
        wk.state.outcome = { ch: ch.id, text: r.text };
        wkFeedback(ch, choice, text);
        wkSave(); wkRedraw();
      } }, "Decide", icon("right"))));
  } else if (ch.kind === "allocate") {
    const inputs = {};
    const total = el("b", {});
    const sum = () => {
      const t = Object.values(inputs).reduce((s, i) => s + Math.max(0, Math.round(Number(i.value) || 0)), 0);
      total.textContent = `${wkMoney(t)} of ${wkMoney(p.vars.budget)}`;
      total.classList.toggle("over", t > p.vars.budget);
    };
    body.push(el("div", { class: "wp-wk-buckets" }, ...ch.buckets.map(b => {
      const i = el("input", { class: "wp-input", type: "number", min: "0", step: "100", placeholder: "0", "aria-label": b.label });
      i.value = wkUi.amounts[b.id] ?? "";
      i.addEventListener("input", () => { wkUi.amounts[b.id] = i.value; sum(); });
      keepKeys(i);
      inputs[b.id] = i;
      return el("label", { class: "wp-wk-bucket" }, el("span", {}, el("b", {}, b.label), el("small", {}, `Needs about ${wkMoney(b.need)}`)), el("span", { class: "wp-wk-money" }, "$", i));
    })),
      el("div", { class: "wp-wk-total" }, "Shared out: ", total),
      explain(),
      el("div", { class: "wp-row" }, el("button", { class: "wp-btn wp-btn-primary wp-wk-commit", onclick: () => {
        const amounts = Object.fromEntries(Object.entries(inputs).map(([k, i]) => [k, Number(i.value) || 0]));
        const text = why.value.trim();
        const r = wkDecide(() => wkAllocate(wk.story, wk.state.play, amounts, text));
        if (!r) return;
        wk.state.outcome = { ch: ch.id, short: r.short };
        wkFeedback(ch, amounts, text);
        wkSave(); wkRedraw();
      } }, "Commit the budget", icon("right"))));
    sum();
  }
  if (wkUi.error) body.push(el("div", { class: "wp-error", role: "alert" }, wkUi.error));
  body.push(wkTeam(ch));
  return body;
}

// Each chapter in a line, for the end and for the debrief.
function wkRecord() {
  const s = wk.story;
  return (wk.state.play.log || []).map(l => {
    const ch = s.chapters.find(c => c.id === l.ch) || {};
    const result = l.kind === "calculate" ? (l.right ? (l.tries > 1 ? "right on the second try" : "right the first time") : `not this time (the answer was ${Number(ch.answer).toLocaleString("en-US")} ${ch.unit || ""})`)
      : l.kind === "choose" ? `chose ${l.label}${l.explanation ? `: “${l.explanation.slice(0, 160)}”` : ""}`
      : `shared out the budget${l.short?.length ? `, short on ${l.short.map(id => (ch.buckets || []).find(b => b.id === id)?.label || id).join(", ")}` : ", every part covered"}`;
    return { chapter: ch.title || l.ch, result };
  });
}

// The end: how it ended (the rules), each decision, the debrief, what to learn next, how we know.
function wkEnd() {
  const s = wk.story, p = wk.state.play, end = wkEnding(s, p), record = wkRecord(), d = wk.state.debrief;
  if (!d && account.on && !wkUi.debriefing && !wkUi.debriefFailed) {
    wkUi.debriefing = true;
    send({ type: "librarian", task: "weekly-turn", input: { week: wk.week, mode: "debrief", ending: end?.title || "", record, draft: wk.playtest } }).then(r => {
      wkUi.debriefing = false;
      if (r && !r.error && wk.state) { wk.state.debrief = { summary: r.summary || "", showed: r.showed || [], next: r.next || [] }; wkSave(); }
      else wkUi.debriefFailed = true;
      wkRedraw();
    });
  }
  // Without the narrator: the first hint of each topic, as what to look into next.
  const local = s.topics.flatMap(t => t.hints.slice(0, 1).map(h => ({ topic: t.name, why: h.q, search: h.search }))).slice(0, 3);
  const next = d?.next?.length ? d.next : local;
  return [
    el("div", { class: "wp-wk-ch-head" }, el("span", { class: "wp-wk-ch-n" }, "How it ended"), el("h3", { class: "wp-wk-ch-title" }, end?.title || "The end")),
    end?.text ? el("p", { class: "wp-wk-scene" }, end.text) : null,
    wkBar(p),
    el("div", { class: "wp-wk-record" }, el("span", { class: "wp-label" }, "Your decisions"), el("ol", {}, ...record.map(r => el("li", {}, el("b", {}, r.chapter), ` · ${r.result}`)))),
    d?.summary ? el("div", { class: "wp-wk-debrief" }, el("span", { class: "wp-label" }, "Your debrief"), el("p", {}, d.summary),
      d.showed?.length ? el("ul", {}, ...d.showed.map(x => el("li", {}, x))) : null)
      : wkUi.debriefing ? wkBusy("The narrator is writing your debrief…") : null,
    next.length ? el("div", { class: "wp-wk-next" }, el("span", { class: "wp-label" }, "Worth learning next"),
      ...next.map(n => el("div", { class: "wp-wk-hint" }, el("span", {}, el("b", {}, n.topic), ` · ${n.why}`),
        n.search ? el("button", { class: "wp-link", onclick: () => goSearch(n.search) }, icon("play"), "Find a video") : null))) : null,
    s.sources?.length ? el("div", { class: "wp-wk-sources" }, el("span", { class: "wp-label" }, "How do we know?"),
      ...s.sources.map(x => x.url ? el("a", { href: x.url, target: "_blank", rel: "noopener" }, x.title) : el("span", {}, x.title))) : null,
    el("p", { class: "wp-wk-small" }, wk.playtest ? "End of the playtest." : "A new challenge every Monday.")
  ];
}

function weeklyPanel() {
  const s = wk.story, p = wk.state?.play;
  const body = !s || !p ? [el("p", {}, "This week's challenge isn't here.")]
    : wk.state.outcome ? [el("div", { class: "wp-wk-ch-head" }, el("span", { class: "wp-wk-ch-n" }, s.chapters.find(c => c.id === wk.state.outcome.ch)?.title || "")), wkOutcome()]
    : p.done ? wkEnd() : wkChapterView(s.chapters[p.chapter]);
  wkHost = scenePanel({ cls: "wp-wk-panel", title: s?.title || "Weekly Challenge",
    sub: wk.playtest ? "Playtest of a draft" : p?.done ? null : "Stop any time between chapters; it picks up where you left off." }, ...body);
  return wkHost;
}
