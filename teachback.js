// Aim — TeachBack page: AI students ask questions, you explain, and you see what you showed.
// Everything AI-related happens on Aim's server (see supabase/functions/ai/teachback.ts); this page
// only shows the session and sends your answers through the background worker.

const BRAND = chrome.runtime.getManifest().name;
for (const n of document.querySelectorAll("[data-brand]")) n.textContent = BRAND;
const screen = document.getElementById("screen");
const params = new URLSearchParams(location.search);

const STATUS = {
  demonstrated: ["Demonstrated", "strong"],
  partial: ["Partly shown", ""],
  needs_review: ["Needs review", ""],
  not_assessed: ["Not assessed", ""]
};

function node(tag, props = {}, ...kids) {
  const n = Object.assign(document.createElement(tag), props);
  n.append(...kids.flat().filter(k => k != null && k !== false));
  return n;
}
// Like replaceChildren, but accepts lists and skips empty parts.
const render = (...kids) => screen.replaceChildren(...kids.flat().filter(k => k != null && k !== false));
const btn = (label, cls, onclick) => node("button", { className: `btn ${cls}`.trim(), type: "button", textContent: label, onclick });

function toast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.style.display = "block";
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => (t.style.display = "none"), 3000);
}

// One request to Aim's server, through the background worker. Returns the reply, or null after
// showing what went wrong in `errorBox`.
async function call(task, input, errorBox) {
  let r;
  try { r = await chrome.runtime.sendMessage({ type: "plus-call", task, input }); }
  catch { r = { error: "Aim was updated or reloaded. Reload this page." }; }
  if (r && !r.error) return r;
  if (errorBox) errorBox.textContent = r?.error || "Something went wrong. Try again.";
  if (r?.code === "auth" || r?.code === "plan") gate();
  if (r?.code === "stale" || r?.code === "ended") reload();
  return null;
}

let session = null;   // what the server last said about this session
let notes = params.get("notes") || ""; // kept for "Try again"; prefilled from a study session

async function reload() {
  const id = session?.id || params.get("id");
  if (!id) return intro();
  const r = await call("teachback-get", { id }, null);
  if (r) show(r.session);
}

function show(s) {
  session = s;
  if (params.get("id") !== s.id) { params.set("id", s.id); history.replaceState(null, "", "?" + params); }
  if (s.result) return results(s);
  if (s.readyToFinish) return finishing(false);
  question(s);
}

// ---------- not available ----------

async function gate() {
  const st = await chrome.runtime.sendMessage({ type: "plus-status" }).catch(() => null);
  const signedIn = st?.signedIn;
  render(
    node("h1", { textContent: "Test my understanding" }),
    node("p", { className: "muted", textContent: !st?.configured ? "TeachBack isn't available in this version of Aim."
      : !signedIn ? `Sign in to ${BRAND} Plus in Settings to use TeachBack.` : `TeachBack is part of ${BRAND} Plus.` }),
    st?.configured ? node("div", { className: "row" }, btn("Open Settings", "", () => chrome.runtime.openOptionsPage())) : null);
}

// ---------- start ----------

function intro(prefill = params.get("topic") || "") {
  const topic = node("input", { type: "text", id: "tbTopic", maxLength: 200, value: prefill, placeholder: "For example: How photosynthesis works" });
  const studied = node("textarea", { id: "tbNotes", maxLength: 3000, rows: 4, value: notes,
    placeholder: "Optional. Paste your notes or list the main points, so the questions match what you studied." });
  const err = node("div", { className: "error", role: "alert" });
  const busy = node("div", { className: "busy" });
  const go = btn("Start", "", async () => {
    if (topic.value.trim().length < 2) { err.textContent = "Say what you'd like to be tested on."; topic.focus(); return; }
    go.disabled = true; err.textContent = ""; busy.textContent = "Your students are getting ready…";
    notes = studied.value.trim();
    const r = await call("teachback-start", { topic: topic.value.trim(), notes }, err);
    go.disabled = false; busy.textContent = "";
    if (r) show(r.session);
  });
  go.id = "tbStart";
  render(
    node("h1", { textContent: "Test my understanding" }),
    node("p", { className: "muted", textContent: "Your students have some questions. See how well you can explain what you've learned." }),
    node("label", { htmlFor: "tbTopic", textContent: "What did you learn?" }), topic,
    node("label", { htmlFor: "tbNotes", textContent: "What did you study from?" }), studied,
    node("div", { className: "row" }, go), busy, err,
    node("p", { className: "muted small", style: "margin-top:16px",
      textContent: "Up to 15 questions, one at a time. Answer in your own words. You can ask for a hint, skip a question, or end whenever you like." }));
  (prefill ? studied : topic).focus();
}

// ---------- one question ----------

function question(s) {
  const q = s.current;
  const answer = node("textarea", { id: "tbAnswer", maxLength: 2000, rows: 5, placeholder: "Explain it in your own words…" });
  answer.setAttribute("aria-label", "Your answer");
  const err = node("div", { className: "error", role: "alert" });
  const busy = node("div", { className: "busy" });
  const hintBox = node("div");
  const lock = on => { for (const b of screen.querySelectorAll("button, textarea")) b.disabled = on; };

  async function act(action) {
    if (action === "answer" && !answer.value.trim()) { err.textContent = "Write an answer, or skip this question."; answer.focus(); return; }
    lock(true); err.textContent = "";
    busy.textContent = action === "hint" ? `${q.student.name} is thinking of a hint…` : action === "skip" ? "Next question…" : `${q.student.name} is thinking about your answer…`;
    const r = await call("teachback-turn", { id: s.id, seq: q.seq, action, answer: action === "answer" ? answer.value : undefined }, err);
    busy.textContent = "";
    if (!r) { lock(false); return; }
    if (action === "hint") {
      lock(false);
      session = r.session;
      hintBox.replaceChildren(node("div", { className: "note" }, node("b", { textContent: "Hint: " }), r.hint));
      hint.textContent = r.session.current.hintsLeft ? "Another hint" : "No hints left";
      hint.disabled = !r.session.current.hintsLeft;
      q.seq = r.session.current.seq;
      answer.focus();
      return;
    }
    show(r.session);
  }

  const send = btn("Answer", "", () => act("answer"));
  send.id = "tbSend";
  const hint = btn(q.hintsLeft < 2 ? (q.hintsLeft ? "Another hint" : "No hints left") : "Give me a hint", "tonal", () => act("hint"));
  hint.disabled = q.hintsLeft <= 0;
  const skip = btn("Skip", "text", () => act("skip"));
  answer.addEventListener("keydown", e => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); act("answer"); } });

  render(
    node("div", { className: "spread" },
      node("div", { className: "muted small", id: "tbProgress",
        textContent: `${s.topic} · Objective ${s.progress.objective} of ${s.progress.of} · Question ${s.progress.asked} of up to ${s.progress.max}` }),
      btn("End session", "text", () => { if (confirm("End the session now? You'll see results for what you've answered so far.")) finishing(true); })),
    node("div", { className: "student" },
      node("div", { className: "face", "aria-hidden": "true", textContent: q.student.name[0] }),
      node("div", {}, node("b", { textContent: q.student.name }), node("span", { className: "muted small", textContent: q.student.role }))),
    node("p", { className: "question", id: "tbQuestion", textContent: q.question }),
    hintBox, answer,
    node("div", { className: "row" }, send, hint, skip,
      node("span", { className: "muted small", textContent: navigator.platform.includes("Mac") ? "⌘+Enter to send" : "Ctrl+Enter to send" })),
    busy, err);
  answer.focus();
}

// ---------- results ----------

async function finishing(end) {
  const err = node("div", { className: "error", role: "alert" });
  render(node("h1", { textContent: "Checking what you showed…" }),
    node("p", { className: "muted", textContent: "This takes a few seconds." }), err);
  const r = await call("teachback-finish", { id: session.id, end }, err);
  if (r) show(r.session);
  else err.after(node("div", { className: "row" }, btn("Try again", "", () => finishing(end))));
}

const ytSearch = q => "https://www.youtube.com/results?search_query=" + encodeURIComponent(q);

// Opened from a study session: report this topic's result back to it, once.
let reported = false;
function reportToStudy(s) {
  const topicId = params.get("study");
  if (!topicId || reported || !s.result) return;
  reported = true;
  chrome.runtime.sendMessage({ type: "study-update", topicId, check: { assessmentId: s.id, endedEarly: s.result.endedEarly,
    objectives: s.result.objectives.map(o => ({ text: o.text, status: o.status, search: o.review?.search || "" })) } }).catch(() => {});
}

function results(s) {
  reportToStudy(s);
  const R = s.result;
  const weak = R.objectives.filter(o => o.review);
  const cards = R.objectives.map(o => node("div", { className: "card" },
    node("div", {}, node("span", { className: `pill ${STATUS[o.status][1]}`, textContent: STATUS[o.status][0] }),
      o.hinted ? node("span", { className: "pill", textContent: "With hints" }) : null),
    node("h2", { textContent: o.text, style: "margin:10px 0 6px" }),
    o.note ? node("p", { textContent: o.note }) : null,
    o.evidence.map(e => node("div", { className: "quote" }, `You said: “${e}”`)),
    o.review?.explanation ? node("p", { className: "small", textContent: o.review.explanation }) : null,
    o.review ? node("a", { href: ytSearch(o.review.search), target: "_blank", rel: "noopener", textContent: "Review this on YouTube" }) : null));

  render(
    node("p", { className: "muted small", textContent: s.topic }),
    node("h1", { textContent: "What you showed" }),
    R.endedEarly ? node("p", {}, node("span", { className: "pill", textContent: "Ended early" })) : null,
    node("p", { textContent: R.summary || "Here's what your answers showed for each part." }),
    R.strengths.length ? [node("h2", { textContent: "Strengths" }), node("ul", {}, R.strengths.map(x => node("li", { textContent: x })))] : null,
    node("h2", { textContent: "Each part" }),
    cards,
    R.nextStep ? node("p", { className: "note", textContent: R.nextStep }) : null,
    node("div", { className: "row" },
      weak.length ? btn("Review weak areas", "", () => window.open(ytSearch(weak[0].review.search), "_blank", "noopener")) : null,
      btn("Try again", weak.length ? "tonal" : "", () => { session = null; params.delete("id"); history.replaceState(null, "", location.pathname); intro(s.topic); }),
      btn("Continue learning", "text", () => { location.href = "https://www.youtube.com/"; })),
    node("p", { className: "muted small", style: "margin-top:20px",
      textContent: "These results are estimates from this conversation, based only on what you wrote. They aren't a grade or a certification." }));
}

// ---------- start up ----------

(async () => {
  const brief = await chrome.runtime.sendMessage({ type: "plus-status" }).catch(() => null);
  if (!brief?.configured || !brief.signedIn || (brief.plan && brief.plan !== "plus")) return gate();
  params.get("id") ? reload() : intro();
})();
