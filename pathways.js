// Aim — Pathways: what interests me → what could I do with it → what would it take to get there.
// Views: home (themes, my paths, what I've said), a theme's work (?theme=), and a path (?path=)
// with its four steps: See it, Try it, Meet it, Prepare for it. Everything the page shows about
// the student is in this browser (see "Pathways" in store.js); the AI writes the content of each
// step on Aim's server (supabase/functions/ai/pathways.ts). Design: docs/HOMESCHOOL.md → "Pathways".

const BRAND = chrome.runtime.getManifest().name;
for (const n of document.querySelectorAll("[data-brand]")) n.textContent = BRAND;
const { send, make: node } = PW;
const screen = document.getElementById("screen");
const params = () => new URLSearchParams(location.search);
const yt = q => `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`;
const onet = q => `https://www.onetonline.org/find/quick?s=${encodeURIComponent(q)}`;
const OFFICIAL = [
  ["O*NET OnLine", "https://www.onetonline.org/", "Skills, pay and outlook for every occupation (US Department of Labor)"],
  ["Occupational Outlook Handbook", "https://www.bls.gov/ooh/", "Pay, outlook and how to become one (Bureau of Labor Statistics)"],
  ["Apprenticeship.gov", "https://www.apprenticeship.gov/", "Registered apprenticeships"],
  ["CareerOneStop", "https://www.careeronestop.org/", "Training, certifications and local programs"]
];
const STAGES = [["middle", "Middle school"], ["high", "High school"], ["college", "College"], ["working", "Working"], ["other", "Other"]];
const btn = (label, cls, onclick, extra = {}) => node("button", { type: "button", className: `btn ${cls}`.trim(), textContent: label, onclick, ...extra });
const render = (...kids) => screen.replaceChildren(...kids.flat().filter(k => k != null && k !== false));
const go = (q = {}) => { const p = new URLSearchParams(q); history.pushState(null, "", p.size ? `?${p}` : location.pathname); route(); };
addEventListener("popstate", () => route());

function toast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg; t.style.display = "block";
  clearTimeout(toast.timer); toast.timer = setTimeout(() => (t.style.display = "none"), 3000);
}

let state = null;      // { pathways, interests } from the background
let account = null;    // plus-status
const younger = () => state.pathways.stage === "middle";

// The background may be waking up (or Aim was just reloaded): ask again before giving up.
async function sendRead(msg) {
  for (let i = 0; i < 3; i++) { const r = await send(msg); if (r) return r; await new Promise(res => setTimeout(res, 300 * (i + 1))); }
  return null;
}
async function load() {
  state = await sendRead({ type: "pathways" });
  if (!state) { document.querySelector("main").replaceChildren(Object.assign(document.createElement("p"), { className: "error", textContent: "Aim didn't answer. Reload this page." })); throw new Error("no state"); }
}

// One request to Aim's server through the background. Returns the reply, or null after saying why.
async function ask(task, input, where) {
  let r;
  try { r = await chrome.runtime.sendMessage({ type: "plus-call", task, input }); }
  catch { r = { error: `${BRAND} was updated or reloaded. Reload this page.` }; }
  if (r && !r.error) return r;
  if (where) where.textContent = r?.error || "Something went wrong. Try again.";
  return null;
}

// ---------- not available / off ----------

function gate() {
  const msg = !account?.configured ? "Pathways isn't available in this version of Aim."
    : !account.signedIn ? `Sign in to ${BRAND} Plus in Settings to use Pathways.` : `Pathways is part of ${BRAND} Plus.`;
  render(node("div", { className: "card" }, node("h1", { textContent: "Pathways" }),
    node("p", { className: "lede", textContent: "What interests me? → What could I do with it? → What would it take to get there?" }),
    threeQuestions(), node("p", { className: "muted", textContent: msg }),
    account?.configured ? btn("Open Settings", "", () => chrome.runtime.openOptionsPage()) : null));
}

function threeQuestions() {
  return node("div", { className: "flow" },
    node("div", {}, node("b", { textContent: "What interests me?" }), node("span", { className: "muted", textContent: "Themes from what you've chosen to explore." })),
    node("div", {}, node("b", { textContent: "What could I do with it?" }), node("span", { className: "muted", textContent: "Real work connected to it, and a chance to try a piece of it." })),
    node("div", {}, node("b", { textContent: "What would it take?" }), node("span", { className: "muted", textContent: "The skills, and the routes in, side by side." })));
}

function stagePicker(current, onPick) {
  const seg = node("div", { className: "seg", role: "group", ariaLabel: "Where you are" });
  const draw = v => seg.replaceChildren(...STAGES.map(([k, label]) => node("button", { type: "button", textContent: label, ariaPressed: String(v === k),
    onclick: () => { draw(k); onPick(k); } })));
  draw(current);
  return seg;
}

function intro() {
  let stage = state.pathways.stage || null;
  const err = node("div", { className: "error", role: "alert" });
  render(
    node("h1", { textContent: "Pathways" }),
    node("p", { className: "lede", textContent: `Discover kinds of work connected to what you enjoy learning, and try a small piece of them before deciding anything. ${BRAND} suggests; you decide.` }),
    threeQuestions(),
    node("div", { className: "card stack" },
      node("h3", { textContent: "Where are you right now?" }),
      stagePicker(stage, v => { stage = v; }),
      node("p", { className: "muted small", textContent: "Middle school shows kinds of work to discover. From high school on, you'll also see specific careers and how to get there." }),
      node("h3", { textContent: "What Pathways uses" }),
      node("ul", { className: "clean" },
        node("li", { textContent: "Your answers to “Want more of this?” after lessons, study sessions and TeachBack, and what you say in reflections." }),
        node("li", { textContent: "The topics you studied. Never your watch history." }),
        node("li", { textContent: "Nothing about who you are: not your gender, background, family or where you live. No scores." })),
      node("p", { className: "muted small", textContent: "It's kept in this browser. Turning Pathways off deletes all of it." }),
      err,
      node("div", { className: "row" }, btn("Turn on Pathways", "", async () => {
        if (!stage) { err.textContent = "Pick where you are first."; return; }
        const r = await send({ type: "pathways-set", on: true, stage });
        if (r?.result !== "applied") { err.textContent = "Couldn't turn it on. Try again."; return; }
        await load(); route();
      }))));
}

// ---------- home ----------

function home() {
  const P = state.pathways;
  const byId = new Map(state.interests.map(x => [x.id, x]));
  const themes = P.themes.filter(t => !t.dismissed);
  const curious = node("input", { type: "text", maxLength: 80, placeholder: "Something you're curious about, like weather, animals or building things",
    ariaLabel: "Something you're curious about" });
  const explore = () => curious.value.trim().length > 1 && go({ theme: curious.value.trim() });
  curious.addEventListener("keydown", e => { if (e.key === "Enter") explore(); });
  const refreshMsg = node("span", { className: "muted small" });
  const active = P.explorations.filter(x => !x.endedAt);
  const learned = P.explorations.filter(x => x.reflection);

  render(
    node("h1", { textContent: "Pathways" }),
    node("p", { className: "lede", textContent: "What interests me? → What could I do with it? → What would it take to get there?" }),
    node("div", { className: "stack" },
      node("section", { className: "card" },
        node("h2", { textContent: "Explore something you're curious about" }),
        node("div", { className: "ask", style: "margin-top:10px" }, curious, btn(younger() ? "See the work" : "See careers", "", explore))),

      node("section", { className: "stack" },
        node("div", { className: "row", style: "justify-content:space-between" },
          node("h2", { textContent: "From what you've explored" }),
          node("div", { className: "row" }, refreshMsg, btn("Look again", "text", async e => {
            e.target.disabled = true; refreshMsg.textContent = "Looking…";
            const r = await send({ type: "pathways-refresh" });
            e.target.disabled = false;
            refreshMsg.textContent = r?.result === "applied" ? "" : r?.message || "Couldn't look right now.";
            await load(); if (r?.result === "applied") home();
          }))),
        themes.length ? node("div", { className: "grid" }, themes.map(t => node("div", { className: "card theme-card" },
          node("h3", { textContent: t.name[0].toUpperCase() + t.name.slice(1) }),
          node("div", { className: "ev", textContent: `Based on: ${t.evidence.map(id => byId.get(id)?.topic).filter(Boolean).slice(0, 4).join(" · ")}` }),
          node("div", { className: "row" }, btn(younger() ? "See the work" : "See careers", "tonal", () => go({ theme: t.name })),
            btn("Don't suggest this", "text", async () => { await send({ type: "pathways-theme-seen", name: t.name, dismiss: true }); await load(); home(); })))))
          : node("p", { className: "muted", textContent: state.interests.filter(x => x.answer !== "no").length < 2
            ? "As you finish lessons, study sessions and TeachBack checks, tap “Want more of this?”. Themes show up here once there's something to go on."
            : "No clear themes yet. Keep exploring, or try “Look again”." })),

      active.length ? node("section", { className: "stack" }, node("h2", { textContent: "My paths" }),
        node("div", { className: "grid" }, active.map(pathCard))) : null,

      learned.length ? node("section", { className: "stack" }, node("h2", { textContent: "What you've found out" }),
        node("p", { className: "muted", textContent: "Finding out what you don't enjoy is as useful as finding out what you do." }),
        node("div", { className: "card" }, node("ul", { className: "clean record" }, learned.map(x => node("li", {},
          node("b", { textContent: x.career }), " ",
          node("span", { className: `pill ${x.reflection.further === "yes" ? "ok" : ""}`, textContent: { yes: "Want to explore more", maybe: "Maybe", no: "Not for me" }[x.reflection.further] || "Reflected" }),
          x.reflection.enjoyed ? node("div", { className: "muted", textContent: `Enjoyed: ${x.reflection.enjoyed}` }) : null,
          x.reflection.harder ? node("div", { className: "muted", textContent: `Harder than expected: ${x.reflection.harder}` }) : null))))) : null,

      state.interests.length ? node("details", { className: "card" }, node("summary", { textContent: `What you've said (${state.interests.length})`, style: "cursor:pointer;font-weight:500" }),
        node("ul", { className: "clean record", style: "margin-top:10px" }, state.interests.slice().reverse().slice(0, 50).map(x =>
          node("li", { textContent: `${x.topic}: ${{ yes: "Yes", maybe: "Maybe", no: "Not really" }[x.answer]}${x.note ? ` (“${x.note}”)` : ""}` })))) : null,

      node("footer", { className: "foot" },
        node("div", { className: "row" }, node("span", { textContent: "Where you are:" }),
          stagePicker(P.stage, async v => { await send({ type: "pathways-set", stage: v }); await load(); })),
        node("p", { style: "margin-top:12px" },
          "Pathways suggests; you decide. No scores, nothing about who you are, nothing shared or sold. Facts about pay and outlook come from ",
          node("a", { href: "https://www.onetonline.org/", target: "_blank", textContent: "O*NET" }), " and the ",
          node("a", { href: "https://www.bls.gov/ooh/", target: "_blank", textContent: "Bureau of Labor Statistics" }), ". "),
        btn("Turn off Pathways and delete its data", "text", async () => {
          if (!confirm("Turn off Pathways? This deletes your themes, paths, reflections and “Want more of this?” answers from this browser.")) return;
          await send({ type: "pathways-set", erase: true }); await load(); route();
        }))));
}

function pathCard(x) {
  const steps = (younger() ? ["see", "try", "meet"] : ["see", "try", "meet", "prepare"]);
  const done = steps.filter(s => x.done[s]).length;
  return node("div", { className: "card career-card" },
    node("span", { className: "muted small", textContent: x.theme ? `From ${x.theme}` : "" }),
    node("h3", { textContent: x.career }),
    node("div", { className: "grow muted", textContent: x.what || "" }),
    node("div", { className: "row" }, node("span", { className: "pill blue", textContent: `${done} of ${steps.length} steps` }), x.saved ? node("span", { className: "pill", textContent: "Saved" }) : null),
    node("div", { className: "row" }, btn("Continue", "tonal", () => go({ path: x.id }))));
}

// ---------- a theme's work ----------

async function themeView(theme) {
  const err = node("div", { className: "error", role: "alert" });
  const back = node("button", { className: "back", textContent: "← Pathways", onclick: () => go() });
  render(back, node("h1", { textContent: `${younger() ? "Work" : "Careers"} connected to ${theme}` }), node("div", { className: "busy", textContent: `${BRAND} is looking…` }), err);
  const notFor = state.pathways.explorations.filter(x => x.reflection?.further === "no").map(x => x.career);
  const r = await ask("pathways-careers", { theme, stage: state.pathways.stage || "other", notFor }, err);
  if (!r) return;
  render(back,
    node("h1", { textContent: `${r.kind === "work" ? "Work" : "Careers"} connected to ${theme}` }),
    node("p", { className: "lede", textContent: "Pick any that sound interesting. Exploring one doesn't commit you to anything, and you can explore several." }),
    node("div", { className: "grid" }, r.careers.map(c => node("div", { className: "card career-card" },
      node("h3", { textContent: c.title }),
      node("div", { className: "grow", textContent: c.what }),
      node("div", { className: "muted", textContent: c.connection }),
      node("div", { className: "row", style: "margin-top:6px" }, btn("Explore this path", "", async () => {
        const s = await send({ type: "exploration-start", career: c.title, theme, kind: r.kind, what: c.what, related: r.careers });
        if (s?.result !== "applied") return toast(s?.message || "Couldn't start that. Try again.");
        go({ path: s.exploration.id });
      }))))),
    err);
}

// ---------- a path ----------

const ICON = {
  place: "M12 21s-6.5-6.2-6.5-11a6.5 6.5 0 0 1 13 0c0 4.8-6.5 11-6.5 11z",
  body: "M12 5.5a1.8 1.8 0 1 0 0-.1M8 21l2-7-3-2 2-4h6l2 4-3 2 2 7",
  school: "M3 9l9-4.5L21 9l-9 4.5zM7 11v4c0 1.5 2.2 3 5 3s5-1.5 5-3v-4",
  chart: "M5 19V11M11 19V5M17 19v-6"
};
function svg(d) {
  const s = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  s.setAttribute("viewBox", "0 0 24 24"); s.setAttribute("aria-hidden", "true");
  const p = document.createElementNS("http://www.w3.org/2000/svg", "path");
  for (const [k, v] of Object.entries({ d, fill: "none", stroke: "currentColor", "stroke-width": "1.8", "stroke-linecap": "round", "stroke-linejoin": "round" })) p.setAttribute(k, v);
  s.append(p);
  return s;
}

// A step's content: kept with the path once written, so it's the same every time you come back.
async function stepContent(x, step, err) {
  if (x.steps[step]) return x.steps[step];
  const r = await ask("pathways-step", { step, career: x.career, theme: x.theme, stage: state.pathways.stage || "other" }, err);
  if (!r) return null;
  const { ok, ...content } = r;
  await send({ type: "exploration-update", id: x.id, step, content });
  x.steps[step] = content;
  return content;
}

async function markDone(x, step, done = true) {
  const r = await send({ type: "exploration-update", id: x.id, step, done });
  if (r?.exploration) Object.assign(x, r.exploration);
}

async function pathView(id, tab) {
  await load();
  const x = state.pathways.explorations.find(e => e.id === id);
  if (!x) return go();
  const steps = younger() ? ["see", "try", "meet"] : ["see", "try", "meet", "prepare"];
  const TABS = [["overview", "Overview"], ["see", "See it"], ["try", "Try it"], ["meet", "Meet it"], ["prepare", "Prepare for it"], ["related", "Related paths"]]
    .filter(([k]) => k !== "prepare" || steps.includes("prepare"));
  tab = TABS.some(([k]) => k === tab) ? tab : "overview";
  const err = node("div", { className: "error", role: "alert" });
  const body = node("div", { className: "stack" }, node("div", { className: "busy", textContent: `${BRAND} is getting this ready…` }));
  const side = node("aside", { className: "stack" });
  const tagline = node("p", { textContent: x.what || "" });
  const overviewBtn = node("a", { className: "btn", target: "_blank", href: yt(`${x.career} explained`), textContent: "▶ Watch an overview" });
  const save = btn(x.saved ? "Saved to My Paths" : "Save to My Paths", "ghost", async () => {
    const r = await send({ type: "exploration-update", id: x.id, saved: !x.saved });
    if (r?.exploration) { x.saved = r.exploration.saved; save.textContent = x.saved ? "Saved to My Paths" : "Save to My Paths"; }
  });
  render(
    node("section", { className: "hero" },
      node("img", { className: "mark", src: "icons/light/128.png", alt: "" }),
      node("button", { className: "back", textContent: "← Back to Pathways", onclick: () => go() }),
      node("div", { className: "kicker", textContent: x.kind === "work" ? "Kind of work" : "Career path" }),
      node("h1", { textContent: x.career }),
      tagline,
      node("div", { className: "row" }, overviewBtn, save,
        btn(x.endedAt ? "Reflected" : "Stop exploring", "ghost", () => reflect(x, "stop"), { disabled: !!x.endedAt }))),
    node("div", { className: "tabs", role: "tablist" }, TABS.map(([k, label]) => node("button", { role: "tab", ariaSelected: String(k === tab),
      onclick: () => go({ path: x.id, tab: k }) }, label, x.done[k] ? node("span", { className: "tick", textContent: "✓" }) : null))),
    node("div", { className: "layout" }, node("div", {}, body, err), side));

  // The side column: quick facts, "You might enjoy this if…", related paths.
  const ov = await stepContent(x, "overview", err);
  if (ov) {
    tagline.textContent = ov.tagline || x.what || "";
    if (ov.overviewSearch) overviewBtn.href = yt(ov.overviewSearch);
    side.replaceChildren(
      node("div", { className: "card facts" }, node("h2", { textContent: "Quick facts" }),
        fact(ICON.place, "Work environment", ov.environment), fact(ICON.body, "Physical demand", ov.physical),
        x.kind === "work" ? null : fact(ICON.school, "Education options", ov.education),
        x.kind === "work" ? null : node("div", { className: "fact" }, svg(ICON.chart), node("div", {}, node("b", { textContent: "Pay and job outlook" }),
          node("a", { href: onet(x.career), target: "_blank", textContent: "See official figures on O*NET →" })))),
      ov.enjoyIf?.length ? node("div", { className: "card enjoy" }, node("h2", { textContent: "You might enjoy this if…" }),
        node("ul", {}, ov.enjoyIf.map(s => node("li", { textContent: s }))),
        node("p", { className: "muted small", textContent: "Only you can say. Trying it is the best way to find out." }),
        btn("Try it", "", () => go({ path: x.id, tab: "try" }))) : null,
      relatedCard(x));
  }
  const show = { overview: overviewTab, see: seeTab, try: tryTab, meet: meetTab, prepare: prepareTab, related: () => body.replaceChildren(relatedCard(x, true)) }[tab];
  await show(x, body, err);
}

const fact = (d, label, text) => text ? node("div", { className: "fact" }, svg(d), node("div", {}, node("b", { textContent: label }), node("span", { className: "muted", textContent: text }))) : null;

function relatedCard(x, full = false) {
  if (!x.related?.length) return full ? node("p", { className: "muted", textContent: "No related paths yet." }) : null;
  return node("div", { className: "card related" }, node("h2", { textContent: "Related paths" }),
    node("p", { className: "muted small", textContent: x.theme ? `More ${x.kind === "work" ? "work" : "careers"} connected to ${x.theme}.` : "" }),
    x.related.map(r => node("button", { type: "button", onclick: async () => {
      const s = await send({ type: "exploration-start", career: r.title, theme: x.theme, kind: x.kind, what: r.what, related: [{ title: x.career, what: x.what }, ...x.related] });
      if (s?.exploration) go({ path: s.exploration.id });
    } }, node("b", { textContent: r.title }), node("div", { className: "muted small", textContent: r.what }))));
}

async function overviewTab(x, body, err) {
  const steps = younger() ? ["see", "try", "meet"] : ["see", "try", "meet", "prepare"];
  const CARDS = {
    see: ["See it", "Watch people who do this work explain it, and the honest parts of a typical day.", "Watch videos"],
    try: ["Try it", "A real piece of the work, with real constraints. The best way to find out if you'd enjoy it.", "Start the project"],
    meet: ["Meet it", "A virtual field trip, a visit with a parent, or good questions for someone who does it.", "Explore options"],
    prepare: ["Prepare for it", "The skills you'd need, and the routes in: apprenticeship, certificate, college, military or your own business.", "View next steps"]
  };
  const see = node("div");
  body.replaceChildren(
    node("div", { className: "card" },
      node("h2", { textContent: "Explore this path" }),
      node("p", { className: "muted", textContent: `${steps.length} steps to find out whether this could be a good fit for you. Stop whenever you like: “not for me” is a useful answer too.` }),
      node("div", { className: "steps" }, steps.map((s, i) => node("div", { className: `step s${i + 1}${s === "try" ? " heart" : ""}` },
        node("div", { className: "row", style: "justify-content:space-between" }, node("span", { className: "num", textContent: String(i + 1) }),
          x.done[s] ? node("span", { className: "pill ok", textContent: "Done" }) : s === "try" ? node("span", { className: "pill blue", textContent: "Most important" }) : null),
        node("h3", { textContent: CARDS[s][0] }), node("p", { textContent: CARDS[s][1] }),
        btn(CARDS[s][2], s === "try" ? "" : "outline", () => go({ path: x.id, tab: s })))))),
    see);
  const c = await stepContent(x, "see", null);
  if (c?.searches?.length) see.replaceChildren(node("div", { className: "card" },
    node("h2", { textContent: "Real people. Real stories." }),
    node("p", { className: "muted", textContent: `Hear from people who do this work, on YouTube. ${BRAND} keeps the search on this path.` }),
    stories(c.searches)));
}

const stories = searches => node("div", { className: "stories" }, searches.map(q => node("a", { className: "story", href: yt(q), target: "_blank" },
  node("span", { className: "play", textContent: "▶" }), node("b", { textContent: q[0].toUpperCase() + q.slice(1) }), node("span", { className: "muted small", textContent: "Search YouTube" }))));

const doneRow = (x, step, label = "Mark this step done") => node("div", { className: "row", style: "margin-top:12px" },
  x.done[step] ? node("span", { className: "pill ok", textContent: "Step done" })
    : btn(label, "tonal", async () => { await markDone(x, step); go({ path: x.id, tab: step }); }));

async function seeTab(x, body, err) {
  const c = await stepContent(x, "see", err);
  if (!c) return body.replaceChildren();
  body.replaceChildren(node("div", { className: "card" },
    node("h2", { textContent: "See it" }), node("p", { textContent: c.summary }),
    node("h3", { textContent: "The honest parts" }), node("ul", { className: "clean" }, c.realities.map(t => node("li", { textContent: t }))),
    node("h3", { style: "margin-top:16px", textContent: "Real people. Real stories." }), stories(c.searches),
    doneRow(x, "see", "I've seen enough of this step")));
}

async function tryTab(x, body, err) {
  const c = await stepContent(x, "try", err);
  if (!c) return body.replaceChildren();
  body.replaceChildren(node("div", { className: "card brief" },
    node("div", { className: "row", style: "justify-content:space-between" }, node("span", { className: "pill ok", textContent: "Try it" }), c.time ? node("span", { className: "muted", textContent: c.time }) : null),
    node("h2", { style: "margin-top:8px", textContent: c.title }),
    c.client ? node("div", { className: "client", textContent: `For: ${c.client}` }) : null,
    node("p", { textContent: c.brief }),
    c.together ? node("div", { className: "together" }, node("b", { textContent: "Do this together. " }), c.togetherReason || "Ask a parent to join you for this one.") : null,
    node("h3", { textContent: "Constraints" }), node("ul", { className: "clean" }, c.constraints.map(t => node("li", { textContent: t }))),
    node("h3", { style: "margin-top:12px", textContent: "What you'll make" }), node("p", { textContent: c.deliverable }),
    c.materials.length ? [node("h3", { textContent: "Materials" }), node("ul", { className: "clean" }, c.materials.map(t => node("li", { textContent: t })))] : null,
    node("h3", { style: "margin-top:12px", textContent: "Steps" }), node("ol", { className: "clean" }, c.steps.map(t => node("li", { textContent: t }))),
    c.rubric.length ? [node("h3", { style: "margin-top:12px", textContent: "How a professional would judge it" }),
      node("table", { className: "routes" }, c.rubric.map(r => node("tr", {}, node("td", {}, node("b", { textContent: r.criterion })), node("td", { textContent: r.good }))))] : null,
    c.skills.length ? node("p", { className: "muted small", style: "margin-top:12px", textContent: `Skills it uses: ${c.skills.join(", ")}` }) : null,
    node("div", { className: "row", style: "margin-top:12px" },
      x.done.try ? node("span", { className: "pill ok", textContent: "Done" }) : btn("I did it", "", () => reflect(x, "try")),
      node("span", { className: "muted small", textContent: "Afterwards, three quick questions about how it went." }))));
}

async function meetTab(x, body, err) {
  const c = await stepContent(x, "meet", err);
  if (!c) return body.replaceChildren();
  body.replaceChildren(node("div", { className: "card" },
    node("h2", { textContent: "Meet it" }),
    node("h3", { textContent: "Questions to ask someone who does this" }),
    node("ol", { className: "clean" }, c.questions.map(t => node("li", { textContent: t }))),
    btn("Copy the questions", "text", async () => { await navigator.clipboard.writeText(c.questions.map((q, i) => `${i + 1}. ${q}`).join("\n")); toast("Copied."); }),
    node("h3", { style: "margin-top:16px", textContent: "Ways to meet someone" }),
    node("ul", { className: "clean" }, c.ways.map(t => node("li", { textContent: t }))),
    node("p", { className: "muted small", textContent: `Always with a parent arranging it. ${BRAND} never contacts anyone for you.` }),
    node("h3", { style: "margin-top:16px", textContent: "Virtual field trips" }), stories(c.searches),
    doneRow(x, "meet")));
}

async function prepareTab(x, body, err) {
  const c = await stepContent(x, "prepare", err);
  if (!c) return body.replaceChildren();
  const list = (title, items, search) => items.length ? [node("h3", { style: "margin-top:12px", textContent: title }),
    node("ul", { className: "clean" }, items.map(t => node("li", {}, t, search ? [" · ", node("a", { href: yt(`${t} for beginners`), target: "_blank", textContent: "find videos" })] : [])))] : null;
  body.replaceChildren(node("div", { className: "card" },
    node("h2", { textContent: "Prepare for it" }),
    list("Skills", c.skills), list("Knowledge", c.knowledge), list("What to learn next", c.studyNext, true),
    c.routes.length ? [node("h3", { style: "margin-top:16px", textContent: "Ways in" }),
      node("table", { className: "routes" }, node("tr", {}, node("th", { textContent: "Route" }), node("th", { textContent: "What it involves" }), node("th", { textContent: "Typical time" })),
        c.routes.map(r => node("tr", {}, node("td", {}, node("b", { textContent: r.route })), node("td", { textContent: r.what }), node("td", { className: "muted", textContent: r.time }))))] : null,
    node("h3", { style: "margin-top:16px", textContent: "Official sources" }),
    node("ul", { className: "clean" }, node("li", {}, node("a", { href: onet(x.career), target: "_blank", textContent: `${x.career} on O*NET OnLine` }), " · pay, outlook, skills"),
      OFFICIAL.slice(1).map(([name, href, what]) => node("li", {}, node("a", { href, target: "_blank", textContent: name }), ` · ${what}`))),
    doneRow(x, "prepare")));
}

// The three questions, after Try it or when stopping a path. "Not for me" is a good answer.
function reflect(x, why) {
  const enjoyed = node("textarea", { maxLength: 600, rows: 3, placeholder: "The parts you liked, even small ones" });
  const harder = node("textarea", { maxLength: 600, rows: 3, placeholder: "Anything that was harder, slower or less interesting than you thought" });
  let further = null;
  const err = node("div", { className: "error", role: "alert" });
  const seg = node("div", { className: "seg" });
  const draw = () => seg.replaceChildren(...[["yes", "Yes"], ["maybe", "Maybe"], ["no", "Not for me"]].map(([k, label]) =>
    node("button", { type: "button", textContent: label, ariaPressed: String(further === k), onclick: () => { further = k; draw(); } })));
  draw();
  render(node("button", { className: "back", textContent: `← ${x.career}`, onclick: () => go({ path: x.id }) }),
    node("div", { className: "card reflect", style: "max-width:680px" },
      node("h1", { textContent: why === "try" ? "How did it go?" : "Before you go" }),
      node("p", { className: "muted", textContent: `About ${x.career}. Your answers stay with you, and shape what Pathways shows next.` }),
      node("label", { textContent: "What did you enjoy?" }), enjoyed,
      node("label", { textContent: "What was harder or less interesting than you expected?" }), harder,
      node("label", { textContent: "Would you like to explore this further?" }), seg,
      node("p", { className: "muted small", style: "margin-top:8px", textContent: "Finding out something isn't for you is a success, not a failure." }),
      err,
      node("div", { className: "row", style: "margin-top:12px" }, btn("Save", "", async () => {
        if (!further) { err.textContent = "Pick Yes, Maybe or Not for me."; return; }
        if (why === "try") await markDone(x, "try");
        const r = await send({ type: "exploration-update", id: x.id, reflection: { enjoyed: enjoyed.value, harder: harder.value, further }, end: further === "no" || why === "stop" });
        if (r?.result !== "applied") { err.textContent = "Couldn't save that. Try again."; return; }
        toast(further === "no" ? "Noted. That's useful to know." : "Saved.");
        go(further === "no" || why === "stop" ? {} : { path: x.id });
      }), btn("Cancel", "text", () => go({ path: x.id })))));
  enjoyed.focus();
}

// ---------- start ----------

async function route() {
  if (!state) await load();
  const p = params();
  if (!state.pathways.on) return intro();
  if (p.get("path")) return pathView(p.get("path"), p.get("tab"));
  if (p.get("theme")) return themeView(p.get("theme").slice(0, 80));
  await load();
  home();
}

(async () => {
  account = await send({ type: "plus-status" });
  if (!account?.configured || !account.signedIn || (account.plan && account.plan !== "plus" && account.plan !== "homeschool")) return gate();
  route();
})();
