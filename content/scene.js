// Aim — the reading room (0.73): YouTube's homepage as one full-screen scene. Along the top: Aim,
// then Home, Break and Library, then you (a small menu). Under it, two views and three panels:
//   Home: a greeting, the search, and three cards: Continue Learning (the aim you're on and your
//     paths), the Daily Challenge (one focused problem, kept for the day) and the Weekly Challenge (a
//     larger one, kept for the week). Each card opens a panel over the scene.
//   Break: a break's length, then Explore & Learn (picks from channels that teach well) and what
//     you saved for later.
//   Library is Aim's own page (targets.html), opened in this tab.
// The pictures are scenes/*.jpg (see scenes/README.md); the colors are content/scene.css.

Object.assign(ICON, {
  home: [20, ["path", { d: "M3.5 11.2L12 4l8.5 7.2V20a.5.5 0 0 1-.5.5h-5.2v-6h-5.6v6H4a.5.5 0 0 1-.5-.5z", fill: "currentColor" }]],
  leaf: [20, ["path", { d: "M20 4C10.5 3.8 4.5 8.2 4.5 14.6c0 1.8.5 3.3 1.3 4.6C7.7 13.8 11.4 10.3 15.5 8.4c-3.6 2.6-6.6 6.2-8.3 11.4 1.3.6 2.6.9 3.9.9C16.5 20.7 20 15 20 4z", fill: "currentColor" }]],
  user: [24, ["circle", { cx: "12", cy: "8.6", r: "4.1", fill: "currentColor" }], ["path", { d: "M4.3 20.2c.7-4.3 3.8-6.8 7.7-6.8s7 2.5 7.7 6.8z", fill: "currentColor" }]],
  users: [30, ["circle", { cx: "9", cy: "8.5", r: "3.4", fill: "none", stroke: "currentColor", "stroke-width": "1.3" }],
    ["path", { d: "M2.8 19.6c.5-3.6 3-5.8 6.2-5.8s5.7 2.2 6.2 5.8", fill: "none", stroke: "currentColor", "stroke-width": "1.3", "stroke-linecap": "round" }],
    ["path", { d: "M14.6 5.4a3.4 3.4 0 1 1 1.3 6.5M17.3 14c2.3.6 3.8 2.7 4.1 5.6", fill: "none", stroke: "currentColor", "stroke-width": "1.3", "stroke-linecap": "round" }]],
  playRing: [30, ["circle", { cx: "12", cy: "12", r: "9.6", fill: "none", stroke: "currentColor", "stroke-width": "1.3" }], ["path", { d: "M10 8.2l6 3.8-6 3.8z", fill: "currentColor" }]],
  calendarDots: [30, ["rect", { x: "3.8", y: "5.3", width: "16.4", height: "14.7", rx: "2.2", fill: "none", stroke: "currentColor", "stroke-width": "1.3" }],
    ["path", { d: "M3.8 9.6h16.4M8.3 3.4v3.8M15.7 3.4v3.8", fill: "none", stroke: "currentColor", "stroke-width": "1.3", "stroke-linecap": "round" }],
    ["path", { d: "M7.6 12.6h.01M10.5 12.6h.01M13.5 12.6h.01M16.4 12.6h.01M7.6 15.8h.01M10.5 15.8h.01M13.5 15.8h.01", fill: "none", stroke: "currentColor", "stroke-width": "1.7", "stroke-linecap": "round" }]],
  playSolid: [22, ["path", { d: "M9 6.8l8.2 5.2L9 17.2z", fill: "currentColor" }]]
});

let scene = { view: "home", panel: null };
const sceneFile = f => chrome.runtime.getURL(`scenes/${f}`);
const SCENE_BG = { home: "home.jpg", break: "break.jpg" };
// Subjects with a picture (scenes/subjects/); the rest get their engraved emblem (covers.js).
const SUBJECT_ART = ["history", "science", "math", "space", "engineering", "craft", "health", "arts", "people", "faith", "general"];
const subjectArt = id => (SUBJECT_ART.includes(id) ? sceneFile(`subjects/${id}.jpg`) : null);
// A small picture for a subject: its photo, or its emblem on dark cloth.
function subjectThumb(id, cls = "wp-cl-thumb") {
  const art = subjectArt(id);
  if (art) return el("span", { class: cls, style: `background-image: url("${art}")`, "aria-hidden": "true" });
  return el("span", { class: `${cls} wp-cl-emblem`, "data-subject": id || "general", "aria-hidden": "true" }, coverEmblem(id && EMBLEMS[id] ? id : "general"));
}

function sceneGo(view) {
  scene = { view, panel: null };
  renderHome();
}
const openExplore = () => sceneGo("break");
function closePanel() {
  scene.panel = null;
  pw.open = false;
  renderHome();
}

// The bar along the top: the mark, the three places, and you. "You" opens Aim's menu (the same one as
// the Aim button on a video: set an aim, take a break, Focus or Explore), with your account, Settings
// and the rest of Aim under it (sceneYou, added by openDropdown in session.js).
function sceneTop() {
  const tab = (key, ic, label, onclick) => el("button", { class: `wp-scene-tab${scene.view === key ? " on" : ""}`, "aria-current": scene.view === key ? "page" : null, onclick },
    icon(ic), el("span", {}, label));
  return el("header", { class: "wp-scene-top" },
    el("button", { class: "wp-scene-logo", "aria-label": `${BRAND}: Home`, onclick: () => sceneGo("home") }, icon("logo"), el("span", {}, BRAND)),
    el("nav", { class: "wp-scene-nav", "aria-label": BRAND },
      tab("home", "home", "Home", () => sceneGo("home")),
      tab("break", "leaf", "Break", () => sceneGo("break")),
      tab("library", "book", "Library", () => send({ type: "open-targets", same: true }))),
    el("div", { class: "wp-scene-me-wrap" },
      el("button", { class: "wp-scene-me", "aria-label": `You and ${BRAND}'s menu`, title: "You", "aria-haspopup": "menu",
        onclick: e => { e.stopPropagation(); dropdown ? closeDropdown() : openDropdown(); } }, icon("user"))));
}
// Under Aim's menu on the homepage: you, and the rest of Aim (YouTube's own bar is under the scene).
function sceneYou() {
  return el("div", { class: "wp-dd-you" },
    el("div", { class: "wp-dd-you-who wp-muted" }, account.on ? (account.plus ? "Signed in · Aim Plus" : "Signed in to Aim") : "Not signed in"),
    menuItem("user", account.on ? "Your account" : "Sign in", () => send({ type: "open-options", section: "account" })),
    menuItem("tool", "Settings", () => send({ type: "open-options" })),
    menuItem("compass", "Your paths", () => send({ type: "open-path", id: "" })),
    menuItem("chart", "Learning record", () => send({ type: "open-record" })),
    menuItem("book", "Homeschool", () => send({ type: "open-pathways" })),
    menuItem("play", "Subscriptions", () => { location.href = "/feed/subscriptions"; }),
    menuItem("clock", "History", () => { location.href = "/feed/history"; }));
}

// A title between two thin gold rules.
const sceneTitle = (text, tag = "h1", cls = "wp-scene-title") => el("div", { class: `wp-scene-titlerow ${cls}-row` },
  el("span", { class: "wp-scene-rule", "aria-hidden": "true" }), el(tag, { class: `${cls}${tag === "h1" ? " wp-home-title" : ""}` }, text), el("span", { class: "wp-scene-rule", "aria-hidden": "true" }));

function sceneCard({ cls, ic, title, sub, glow = false, onclick }) {
  return el("button", { class: `wp-scene-card ${cls}${glow ? " glow" : ""}`, onclick },
    el("span", { class: "wp-scene-card-icon" }, icon(ic)),
    el("span", { class: "wp-scene-card-title" }, title),
    el("span", { class: "wp-scene-card-sub" }, sub));
}

// A panel over the scene: Continue Learning, the Daily or the Weekly Challenge.
function scenePanel({ cls = "", title, sub }, ...body) {
  return el("section", { class: `wp-scene-panel ${cls}`, role: "dialog", "aria-label": title },
    el("button", { class: "wp-scene-x", "aria-label": "Close", title: "Close", onclick: closePanel }, icon("close")),
    el("h2", { class: "wp-scene-panel-title" }, title),
    sub ? el("p", { class: "wp-scene-panel-sub" }, sub) : null,
    ...body.filter(Boolean));
}

// ---------- Continue Learning: the aim you're on, then your paths ----------
async function openContinue() {
  scene.panel = "continue";
  pw.open = true; pw.error = ""; pw.adding = false;
  pw.list = null;
  renderHome();
  pw.list = (await send({ type: "paths" })) || [];
  pwRedraw();
}
function continuePanel(p) {
  return scenePanel({ cls: "wp-cl", title: "Continue Learning", sub: "Pick up where you left off." },
    p ? currentTargetRow(p) : null,
    pathsWindow(),
    el("div", { class: "wp-cl-foot" },
      el("button", { class: "wp-link", onclick: () => send({ type: "open-targets", same: true }) }, "Everything in your Library")));
}

// ---------- Break: a break's length, then something new to explore ----------
function breakMain(main) {
  const lengths = breakChips(takeBreak);
  lengths.querySelector(".wp-chip")?.prepend(icon("coffee"));
  const explore = el("div", { class: "wp-scene-explore" });
  main.append(...[
    sceneTitle("Take a Break"),
    el("p", { class: "wp-scene-sub" }, activePurpose() ? "A break from your aim. Rest, explore something new, or return refreshed." : "Rest, explore something new, or return refreshed."),
    el("div", { class: "wp-scene-lengths wp-home-break" }, lengths),
    sceneTitle("Explore & Learn", "h2", "wp-scene-h2"),
    explore,
    savedBlock()].filter(Boolean));
  exploreView(explore);
}
