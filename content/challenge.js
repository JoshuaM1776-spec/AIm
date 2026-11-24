// Aim — the Daily and Weekly Challenges (0.73), on YouTube's homepage (content/scene.js). The Daily
// Challenge is one focused problem for today, about ten minutes; the Weekly Challenge a larger one for
// the week, up to a couple of hours, building or investigating where it can. Each is drawn from your
// interests (your paths first, a different one each day or week) and kept until the day or the week
// ends: open the panel again and it's the same one (store.js → challengeToday). Ask for another, go
// easier or harder, try a different subject, or write your own. Begin makes it your aim: its plan steps
// become what Up next works through, and its last step is the Final Challenge (docs/SPEC.md §7–§9).
// Signed-in accounts (Aim's server writes challenges).

const CH_KIND = { understand: "Understand", build: "Build & do", investigate: "Investigate" };
const CH_LEVEL = { intro: "Intro", intermediate: "Intermediate", advanced: "Advanced" };
const CH_SCALE = {
  daily: { minutes: 10, title: "Daily Challenge", sub: "A focused problem to solve today.", noun: "today's challenge" },
  weekly: { minutes: 120, title: "Weekly Challenge", sub: "A larger goal to build real understanding.", noun: "this week's challenge" }
};
// The panel redraws itself in place, so the rest of the scene isn't rebuilt on every click.
let chHost = null;
function chRedraw() { if (chHost?.isConnected) chHost.replaceWith(challengePanel(chFind.scale)); }
// What's on screen. level: what the evidence suggests (from the background); shift: Easier or Harder.
const chFresh = scale => ({ scale, view: "loading", interest: "", listFor: "", list: [], pick: 0, busy: false, error: "", offered: [], level: "intro", shift: 0, own: false });
let chFind = chFresh("daily");
const CH_LEVELS = ["intro", "intermediate", "advanced"];
const chLevel = () => CH_LEVELS[Math.max(0, Math.min(2, CH_LEVELS.indexOf(chFind.level) + chFind.shift))];
const chSave = () => send({ type: "challenge-today-save", scale: chFind.scale, rec: { interest: chFind.listFor, list: chFind.list, pick: chFind.pick } });

// Which interest today: your paths first, then the Explore interests you picked; a different one each
// day (or week), in turn.
async function chSubject(scale) {
  const paths = (await send({ type: "paths" })) || [];
  const picked = LEARN_TOPICS.filter(t => (settings.learnTopics || []).includes(t.id)).map(t => t.name);
  const names = [...new Set([...paths.map(x => x.interest), ...picked].filter(Boolean))];
  if (!names.length) return "";
  const day = Math.floor((Date.now() - new Date().getTimezoneOffset() * 6e4) / 864e5);
  return names[(scale === "weekly" ? Math.floor((day + 3) / 7) : day) % names.length];
}

async function openChallengePanel(scale, subject = "") {
  scene.panel = scale; pw.open = false;
  chFind = chFresh(scale);
  if (!account.on) chFind.view = "signin";
  await renderHome();
  if (!account.on) return;
  const kept = subject ? null : (await send({ type: "challenge-today" }))?.[scale];
  if (kept?.list?.length) {
    chFind = { ...chFind, view: "detail", list: kept.list, pick: kept.pick || 0, listFor: kept.interest, interest: kept.interest, offered: kept.list.map(c => c.title) };
    return chRedraw();
  }
  const s = subject || await chSubject(scale);
  if (!s) { chFind.view = "ask"; return chRedraw(); }
  findChallenges(s);
}

async function findChallenges(interest, { custom = "" } = {}) {
  interest = String(interest || "").trim();
  if (!interest && !custom) { chFind = { ...chFind, view: "ask", error: "Type a subject first, like aviation, Polish or woodworking." }; return chRedraw(); }
  // A new subject starts fresh: nothing offered yet, and the level its own evidence suggests.
  if (interest && interest.toLowerCase() !== (chFind.listFor || "").toLowerCase()) chFind = { ...chFind, offered: [], shift: 0 };
  chFind = { ...chFind, busy: true, error: "", interest: interest || chFind.interest, view: chFind.list.length ? chFind.view : "loading" };
  chRedraw();
  const k = (await send({ type: "challenge-known", interest: interest || custom })) || {};
  chFind.level = CH_LEVELS.includes(k.level) ? k.level : "intro";
  const r = await send({ type: "librarian", task: "challenges-suggest", input: { interest, custom, minutes: CH_SCALE[chFind.scale].minutes, level: chLevel(), known: k.known || [], avoid: custom ? [] : chFind.offered } });
  chFind.busy = false;
  let list = r && !r.error ? (r.challenges || []).map(c => ({ ...c, interest: interest || chFind.interest })) : [];
  if (!list.length) {
    chFind.error = r?.error || "Couldn't find a challenge just now. Try again.";
    if (chFind.view === "loading") chFind.view = chFind.list.length ? "detail" : "ask";
    return chRedraw();
  }
  // The week's: building or investigating first, where there's one.
  if (chFind.scale === "weekly") list = [...list.filter(c => c.kind !== "understand"), ...list.filter(c => c.kind === "understand")];
  chFind = { ...chFind, list, pick: 0, view: "detail", own: false, listFor: interest || chFind.listFor || chFind.interest,
    offered: [...chFind.offered, ...list.map(c => c.title)].slice(-9) };
  chSave();
  chRedraw();
}

// Another one: the next of the three, then three new ones.
function chAnother() {
  if (chFind.pick + 1 < chFind.list.length) { chFind = { ...chFind, pick: chFind.pick + 1, view: "detail", error: "" }; chSave(); return chRedraw(); }
  findChallenges(chFind.listFor || chFind.interest);
}

async function beginChallenge(c) {
  chFind.busy = true; chRedraw();
  const r = await send({ type: "challenge-start", challenge: c });
  chFind.busy = false;
  if (!r || r.result !== "applied") { chFind.error = r?.message || "Couldn't start that. Try again."; return chRedraw(); }
  scene.panel = null;
  location.href = r.url;
}

const chMeta = c => [CH_KIND[c.kind] || "Understand", `${c.minutes} min`, CH_LEVEL[c.difficulty] || "Intro"].join(" · ");

// One challenge, whole: what it is, why it's worth it, how you'll know you've done it, and the plan.
function chDetail(c) {
  return el("div", { class: "wp-ch-detail" },
    el("span", { class: "wp-ch-meta" }, [c.interest, chMeta(c)].filter(Boolean).join(" · ")),
    el("b", { class: "wp-ch-title wp-ch-big" }, c.title),
    c.why ? el("span", { class: "wp-ch-why" }, c.why) : null,
    el("div", { class: "wp-ch-success" }, el("span", { class: "wp-ch-label" }, "You'll have done it when"), el("span", {}, c.success)),
    el("ol", { class: "wp-ch-plan" }, ...c.plan.map(s => el("li", {}, el("b", {}, s.title), el("span", { class: "wp-muted" }, ` · ~${s.minutes} min`),
      s.look ? el("div", { class: "wp-muted" }, s.look) : null))),
    c.materials?.length ? el("div", { class: "wp-ch-mats" }, el("span", { class: "wp-ch-label" }, "You'll need"),
      el("ul", {}, ...c.materials.map(m => el("li", {}, m.item, m.required ? null : el("span", { class: "wp-muted" }, " (optional)"))))) : null,
    c.safety ? el("div", { class: "wp-ch-safety" }, c.safety) : null,
    el("div", { class: "wp-row wp-ch-actions" },
      el("button", { class: "wp-btn wp-btn-primary", disabled: chFind.busy, onclick: () => beginChallenge(c) }, "Begin challenge"),
      el("span", { class: "wp-muted wp-ch-note" }, "The time is a target, not a timer. Skip what you know, or stop and pick it up later.")));
}

function challengePanel(scale) {
  const S = CH_SCALE[scale];
  const c = chFind.list[chFind.pick];
  const subject = el("input", { class: "wp-input wp-ch-subject", type: "text", maxlength: chFind.own ? "200" : "120",
    placeholder: chFind.own ? "Your own challenge, in a sentence" : chFind.list.length ? "A different subject, like Polish or woodworking" : "A subject, like aviation, Polish or woodworking",
    "aria-label": chFind.own ? "Your own challenge" : "A different subject" });
  const go = () => {
    const v = subject.value.trim();
    if (!v) return subject.focus();
    return chFind.own ? findChallenges(chFind.listFor || chFind.interest || v, { custom: v }) : findChallenges(v);
  };
  keepKeys(subject, go);
  const busyLine = el("div", { class: "wp-pw-busy", role: "status" }, el("span", { class: "wp-talk-typing" }, el("i"), el("i"), el("i")),
    `Finding ${S.noun}${chFind.interest ? ` in ${chFind.interest}` : ""}…`);
  const body = [];
  if (chFind.view === "signin") {
    body.push(el("p", { class: "wp-ch-why" }, "Aim writes challenges for you on its server, from your interests and what you've shown, so they come with an Aim account."),
      el("div", { class: "wp-row wp-ch-actions" }, el("button", { class: "wp-btn wp-btn-primary", onclick: () => send({ type: "open-options", section: "account" }) }, "Sign in")));
  } else if (chFind.view === "loading") body.push(busyLine);
  else if (chFind.view === "ask") {
    body.push(el("div", { class: "wp-ch-ask" }, el("b", {}, "What are you curious about?"),
      el("span", { class: "wp-muted" }, "Add your interests under Continue Learning, and Aim picks from them each time.")));
  } else if (chFind.view === "list") {
    body.push(el("div", { class: "wp-ch-label" }, `Challenges in ${chFind.listFor}`),
      el("div", { class: "wp-ch-list" }, ...chFind.list.map((x, i) => el("button", { class: `wp-ch-card${i === chFind.pick ? " on" : ""}`,
        onclick: () => { chFind = { ...chFind, pick: i, view: "detail" }; chSave(); chRedraw(); } },
        el("span", { class: "wp-ch-meta" }, chMeta(x)), el("b", { class: "wp-ch-title" }, x.title), x.why ? el("span", { class: "wp-ch-why" }, x.why) : null))));
  } else if (c) body.push(chDetail(c));
  if (chFind.busy && chFind.view !== "loading") body.push(busyLine);
  if (chFind.error) body.push(el("div", { class: "wp-error wp-ch-error" }, chFind.error));
  if (chFind.view !== "signin" && chFind.view !== "loading") {
    const has = chFind.list.length > 0;
    body.push(el("div", { class: "wp-ch-more" },
      has ? el("div", { class: "wp-row wp-ch-links" },
        el("button", { class: "wp-link", disabled: chFind.busy, onclick: chAnother }, "Another one"),
        chFind.list.length > 1 ? el("button", { class: "wp-link", onclick: () => { chFind.view = chFind.view === "list" ? "detail" : "list"; chRedraw(); } }, chFind.view === "list" ? "Back" : `See all ${chFind.list.length}`) : null,
        // Ability: what the evidence suggests, adjustable in the moment (docs/SPEC.md §8).
        chLevel() !== "intro" ? el("button", { class: "wp-link", disabled: chFind.busy, onclick: () => { chFind.shift--; findChallenges(chFind.listFor); } }, "Easier") : null,
        chLevel() !== "advanced" ? el("button", { class: "wp-link", disabled: chFind.busy, onclick: () => { chFind.shift++; findChallenges(chFind.listFor); } }, "Harder") : null,
        el("button", { class: "wp-link", onclick: () => { chFind.own = !chFind.own; chRedraw(); setTimeout(() => $(".wp-ch-subject")?.focus(), 0); } }, chFind.own ? "Pick a subject instead" : "Write my own")) : null,
      el("div", { class: "wp-ch-row" }, subject,
        el("button", { class: "wp-btn wp-btn-tonal", disabled: chFind.busy, onclick: go }, chFind.own ? "Tidy it up" : has ? "Find" : "Find a challenge"))));
  }
  chHost = scenePanel({ cls: `wp-ch wp-ch-${scale}`, title: S.title, sub: S.sub }, ...body);
  return chHost;
}

// The Final Challenge's outcome, recorded with its evidence, and what comes next.
const CH_OUTCOME = { solid: "demonstrated", getting_there: "partly", not_enough: "not_enough" };
function recordChallenge(state, verdict) {
  const p = activePurpose();
  if (!state.aimId || !(p?.id === state.aimId ? p.challenge : state.session?.challenge)) return null;
  const answer = [...state.thread].reverse().find(m => m.role === "person")?.text || "";
  send({ type: "challenge-result", aimId: state.aimId, outcome: CH_OUTCOME[verdict] || "not_enough", answer, shown: state.feedback?.explained || [] });
  return CH_OUTCOME[verdict] || "not_enough";
}
