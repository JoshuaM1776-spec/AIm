// Aim — a study session's overview and summary: each topic, its videos, whether you watched
// them, and what your TeachBack checks showed, with links to review. Read-only apart from
// moving between topics and ending the session.

const BRAND = chrome.runtime.getManifest().name;
for (const n of document.querySelectorAll("[data-brand]")) n.textContent = BRAND;
const send = msg => chrome.runtime.sendMessage(msg).catch(() => null);
const screen = document.getElementById("screen");
const STATUS = { demonstrated: ["Demonstrated", "strong"], partial: ["Developing", ""], needs_review: ["Needs review", ""], not_assessed: ["Not assessed", ""] };
const yt = path => `https://www.youtube.com${path}`;

function node(tag, props = {}, ...kids) {
  const n = Object.assign(document.createElement(tag), props);
  n.append(...kids.flat().filter(k => k != null && k !== false));
  return n;
}
const btn = (label, cls, onclick) => node("button", { className: `btn ${cls}`.trim(), type: "button", textContent: label, onclick });

// Kept across re-renders (the summary redraws as the session goes on in other tabs), so an open
// "Where could this take me?" stays open.
const pieces = new Map();
const keep = (key, make) => pieces.get(key) || pieces.set(key, make()).get(key);
let stage = "other";
send({ type: "pathways" }).then(r => { stage = r?.pathways?.stage || "other"; });

function topicCard(st, t, i) {
  const watched = t.videos.filter(v => t.watched.includes(v.id)).length;
  const weak = t.check?.objectives.filter(o => o.status !== "demonstrated") || [];
  return node("div", { className: "card" },
    node("div", { className: "topic-head" },
      node("h2", { textContent: `${i + 1}. ${t.title}` }),
      node("span", {},
        t.videos.length ? node("span", { className: "pill", textContent: `Watched ${watched} of ${t.videos.length}` }) : null,
        t.check ? node("span", { className: `pill ${weak.length ? "" : "strong"}`, textContent: weak.length ? "Review" : "Checked" })
          : node("span", { className: "pill", textContent: "Not checked yet" }))),
    t.brief ? node("p", { className: "small", textContent: t.brief }) : null,
    keep(`where|${t.id}`, () => PW.where(t.title, st.title, stage)),
    t.videos.length ? node("div", { className: "videos" }, t.videos.map(v =>
      node("a", { href: yt(`/watch?v=${encodeURIComponent(v.id)}`), textContent: `${t.watched.includes(v.id) ? "✓ " : ""}${v.title || "Video"}${v.channel ? ` · ${v.channel}` : ""}` })))
      : node("p", { className: "muted small", textContent: "Videos are picked when you open this topic." }),
    t.check ? node("div", {}, node("p", { className: "muted small", style: "margin:12px 0 4px", textContent: "What your check showed (an estimate)" }),
      t.check.objectives.map(o => node("div", { className: "obj" },
        node("span", { className: `pill ${STATUS[o.status][1]}`, textContent: STATUS[o.status][0] }),
        node("span", { textContent: o.text }),
        o.status !== "demonstrated" && o.search ? node("a", { href: yt(`/results?search_query=${encodeURIComponent(o.search)}`), textContent: "Review", className: "small" }) : null))) : null,
    st.endedAt ? null : node("div", { className: "row" },
      btn("Go to this topic", "tonal", async () => { await send({ type: "study-update", current: i }); location.href = yt(`/results?search_query=${encodeURIComponent(t.searches[0])}`); }),
      btn(t.check ? "Check again" : "Check yourself", "text", () => send({ type: "open-teachback", topic: `${t.title} (${st.title})`,
        notes: [t.brief, st.notes].filter(Boolean).join("\n\n").slice(0, 3000), study: t.id }))));
}

// "Put it into practice": one small project using what the session covered, once there's something to
// build on (a topic checked, or the session ended). Optional, and never graded.
let applyBusy = false, applyErr = "", applyNoteOpen = false, applyDraft = "";
async function suggestApply(st) {
  if (applyBusy) return; // one suggestion at a time: each is an AI call
  applyBusy = true; applyErr = ""; render();
  let r;
  try {
    r = await chrome.runtime.sendMessage({ type: "plus-call", task: "study-apply", input: {
      title: st.title, goal: (await send({ type: "status" }))?.purpose?.text || "", previous: st.apply?.title || "",
      topics: st.topics.map(t => ({ title: t.title, brief: t.brief, practice: (t.check?.objectives || []).filter(o => o.status !== "demonstrated").map(o => o.text) })) } });
  } catch { r = { error: `${BRAND} was updated or reloaded. Reload this page.` }; }
  applyBusy = false;
  if (!r || r.error) applyErr = r?.error || "Something went wrong. Try again.";
  else await send({ type: "study-update", apply: r });
  render();
}
function applyCard(st) {
  if (!st.topics.some(t => t.check) && !st.endedAt) return null;
  const a = st.apply;
  const head = node("div", { className: "spread" }, node("h2", { textContent: "Put it into practice" }),
    a?.minutes ? node("span", { className: "pill", textContent: `About ${a.minutes} min` }) : null);
  if (!a) return node("div", { className: "card apply" }, head,
    node("p", { className: "muted", textContent: "A small project that uses what you studied, aimed at what your checks say to practice. Optional, and never graded." }),
    applyErr ? node("p", { className: "error", textContent: applyErr }) : null,
    node("div", { className: "row" }, btn(applyBusy ? "Thinking…" : "Suggest a project", "", () => suggestApply(st))));
  const done = !!a.doneAt;
  return node("div", { className: "card apply" }, head,
    node("h3", { textContent: a.title }),
    node("p", { textContent: a.task }),
    a.steps.length ? node("ol", { className: "clean" }, a.steps.map(x => node("li", { textContent: x }))) : null,
    a.shows ? node("p", { className: "muted small", textContent: `Finishing it shows: ${a.shows}` }) : null,
    a.safety ? node("p", { className: "note small", textContent: a.safety }) : null,
    done ? node("div", { className: "note" }, node("span", { className: "pill ok", textContent: "Done" }), a.note ? node("span", { textContent: a.note }) : null) : null,
    !done && applyNoteOpen ? node("div", {},
      node("label", { className: "field", textContent: "What did you make or find out? (a sentence or two)" }),
      (() => { const ta = node("textarea", { value: applyDraft, rows: 3, oninput: e => { applyDraft = e.target.value; } }); return ta; })(),
      node("div", { className: "row" },
        btn("Save", "", async () => { await send({ type: "study-update", applyDone: { note: applyDraft } }); applyNoteOpen = false; applyDraft = ""; render(); }),
        btn("Cancel", "text", () => { applyNoteOpen = false; render(); }))) : null,
    applyErr ? node("p", { className: "error", textContent: applyErr }) : null,
    done || applyNoteOpen ? null : node("div", { className: "row" },
      btn("I did it", "", () => { applyNoteOpen = true; render(); }),
      btn(applyBusy ? "Thinking…" : "Suggest another", "text", () => suggestApply(st))));
}

async function render() {
  const s = await send({ type: "status" });
  const st = s?.purpose?.study;
  if (!st) {
    screen.replaceChildren(node("div", { className: "card empty-state" }, node("div", { className: "empty-icon" }),
      node("h1", { textContent: "No study session yet" }),
      node("p", { textContent: "A study session turns a learning goal into a few topics in order, each with a clear video, and checks you along the way." }),
      node("p", { className: "why", textContent: `Start one from a learning aim's search results on YouTube, with ${BRAND} Plus.` }),
      node("div", { className: "row" },
        Object.assign(document.createElement("a"), { className: "btn", href: "https://www.youtube.com/", textContent: "Go to YouTube" }),
        Object.assign(document.createElement("a"), { className: "btn tonal", href: "targets.html", textContent: "Open my library" }))));
    return;
  }
  const checked = st.topics.filter(t => t.check).length;
  const review = st.topics.filter(t => t.check?.objectives.some(o => o.status !== "demonstrated"));
  screen.replaceChildren(...[
    node("p", { className: "muted small", textContent: s.purpose.text }),
    node("h1", { textContent: st.title }),
    st.endedAt ? node("p", {}, node("span", { className: "pill", textContent: "Session ended" })) : null,
    node("p", { className: "muted", textContent: `${st.topics.length} topics · ${checked} checked${review.length ? ` · ${review.length} to review` : ""}` }),
    st.scopeNote ? node("p", { className: "note", textContent: st.scopeNote }) : null,
    review.length ? node("div", { className: "note" }, node("b", { textContent: "Worth reviewing: " }), review.map(t => t.title).join(", ")) : null,
    st.topics.map((t, i) => topicCard(st, t, i)),
    applyCard(st),
    keep(`interest|${st.id}`, () => PW.interest({ topic: st.title, source: "study" })),
    st.endedAt ? null : node("div", { className: "row" },
      btn("Continue studying", "", () => { const t = st.topics[st.current] || st.topics[0]; location.href = yt(`/results?search_query=${encodeURIComponent(t.searches[0])}`); }),
      btn("End study session", "text", async () => {
        if (!confirm("End this study session? Your aim stays, and this summary remains here.")) return;
        await send({ type: "study-update", end: true });
        render();
      })),
    node("p", { className: "small" }, node("a", { href: "record.html", textContent: "See your learning record" })),
    node("p", { className: "muted small", style: "margin-top:20px",
      textContent: "Checks are estimates from TeachBack conversations, based only on what you wrote. They aren't grades." })
  ].flat().filter(Boolean));
}

render();
// Stay current while the session goes on in other tabs.
// A tick every 10 seconds rewrites the aim's clock: redraw only when the study session itself
// changed, and never while you're typing in it.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local" || !changes.purpose) return;
  const { oldValue: a, newValue: b } = changes.purpose;
  if (a && b && a.id === b.id && JSON.stringify(a.study) === JSON.stringify(b.study)) return;
  if (document.activeElement?.matches?.("textarea, input")) return;
  render();
});
