// Aim — when a session becomes an aim (0.67). Every visit has something it's for; only a goal goes on
// the library's shelf (see isAim in store.js). Here: the words for what you're on ("Your aim" for a
// goal, "Searching" for a session), "Make this an aim" in the menu and on search results, and the
// gentle offer in the panel once what you do shows a goal (three videos, or a second day).

const purposeIsGoal = () => !!status.aimIsGoal;
function aimWord(p) {
  return p.plan ? "Today's plan" : p.learn ? "Exploring" : purposeIsGoal() ? "Your aim" : "Searching";
}

// The goal in your words (Aim suggests some), and Make it an aim. offer: from the gentle offer, so
// "Not now" waits a couple of days and "Just searching" doesn't ask again for this session.
function goalEditor({ aimId, suggestion, lead = null, offer = false, onDone = () => {} }) {
  const input = el("input", { class: "wp-input wp-goal-input", type: "text", maxlength: "120", "aria-label": "Your goal" });
  input.value = suggestion || "";
  const save = async () => {
    const text = input.value.trim();
    if (text.length < 3) return input.focus();
    const r = await send({ type: "aim-goal", aimId, text });
    if (r?.result !== "applied") return toast(r?.message || "Couldn't make it an aim. Try again.");
    applyStatus(await send({ type: "status" }));
    toast(`Now an aim: ${shorten(r.text, 50)}. It's a book in your library.`);
    onDone(true);
    renderChip?.();
    renderAimPanel?.();
  };
  keepKeys(input, save);
  return el("div", { class: "wp-goal" },
    lead ? el("div", { class: "wp-goal-lead" }, lead) : null,
    el("label", { class: "wp-label" }, "Your goal, in your words", input),
    el("div", { class: "wp-row wp-goal-actions" },
      el("button", { class: "wp-btn wp-btn-primary", onclick: save }, "Make it an aim"),
      el("button", { class: "wp-btn wp-btn-text", onclick: () => { if (offer) send({ type: "goal-answer", aimId, answer: "later" }); onDone(false); } }, "Not now"),
      offer ? el("button", { class: "wp-btn wp-btn-text", onclick: () => { send({ type: "goal-answer", aimId, answer: "no" }); onDone(false); } }, "Just searching") : null));
}

// From the menu or search results: a small dialog.
function openGoalDialog() {
  closeDropdown?.();
  const p = activePurpose();
  if (!p) return;
  openModal(el("div", { class: "wp-dialog", role: "dialog", "aria-modal": "true", "aria-label": "Make this an aim" },
    el("div", { class: "wp-title" }, "Make this an aim"),
    el("p", { class: "wp-muted" }, "An aim is something you're working toward. It becomes a book in your library, with what it takes, what you've explained, and practice."),
    goalEditor({ aimId: p.id, suggestion: status.goalSuggestion || p.text, onDone: () => closeModal() })));
  setTimeout(() => $(".wp-goal-input")?.select(), 50);
}

// The gentle offer, for the panel: asked of the background as the session moves on (another video,
// another day); once there's an offer it stays until answered, so it never vanishes mid-typing.
let goalOfferSeen = { id: "", sig: "", offer: null, el: null };
function goalOfferBlock(p, rerender) {
  if (p.plan || p.learn || purposeIsGoal()) return null;
  if (goalOfferSeen.id !== p.id) goalOfferSeen = { id: p.id, sig: "", offer: null, el: null };
  if (!goalOfferSeen.offer) {
    const sig = `${(p.videos || []).length}|${(p.days || []).length}`;
    if (goalOfferSeen.sig !== sig) {
      goalOfferSeen.sig = sig;
      send({ type: "goal-offer" }).then(o => {
        if (goalOfferSeen.id === p.id && o?.aimId === p.id && !goalOfferSeen.offer) { goalOfferSeen.offer = o; rerender(); }
      });
    }
    return null;
  }
  const o = goalOfferSeen.offer;
  // Built once and reused: the panel redraws as Up next loads, and must not wipe what you typed.
  return goalOfferSeen.el ||= el("div", { class: "wp-ap-goal" }, goalEditor({ aimId: o.aimId, suggestion: o.suggestion, offer: true,
    lead: o.why === "days" ? "You keep coming back to this. Make it an aim?" : "You're getting into this. Make it an aim?",
    onDone: () => { goalOfferSeen.offer = null; goalOfferSeen.el = null; rerender(); } }));
}

// Guess first (0.71): before a video for a part of your aim, one question to take a real guess at.
// Shown at the top of the panel as a video starts, and the video waits (paused) until you answer or
// skip; built once per video so redraws keep what you typed. The guess comes back after the video.
let preCard = { video: "", el: null, done: false };
function preQuestionBlock(p, rerender) {
  if (!currentId || brk) return null;
  if (preCard.video !== currentId) preCard = { video: currentId, el: null, done: false };
  if (preCard.done) return preCard.el;
  const pre = preQuestion(p, settings.guessFirst !== false);
  if (!pre) return null;
  if (preCard.el) return preCard.el;
  const v = getVideoEl();
  if (v && (v.currentTime || 0) > 30) return null; // well into a video: too late to guess first
  if (v && !v.paused) { pausedByAim.add(v); v.pause(); }
  // Not playing yet: wait once for it to start, then pause, so the guess still comes first.
  else if (v) v.addEventListener("play", () => { if (!preCard.done && preCard.video === currentId && (v.currentTime || 0) < 30) { pausedByAim.add(v); v.pause(); } }, { once: true });
  const input = el("textarea", { class: "wp-input wp-pre-input", rows: "2", maxlength: "400", placeholder: "Your guess, in a sentence. It's fine to be wrong.", "aria-label": "Your guess" });
  const finish = async (skip) => {
    const text = input.value.trim();
    if (!skip && !text) return input.focus();
    await send({ type: "guess-save", aimId: p.id, partId: pre.partId, text, skip });
    applyStatus(await send({ type: "status" })); // so the panel's aim has the guess for the close
    preCard.done = true;
    preCard.el = skip ? null : el("div", { class: "wp-pre wp-pre-saved" }, el("span", { class: "wp-muted" }, "Guess saved. Watch, then explain it in a minute."));
    resume(currentId);
    rerender();
  };
  keepKeys(input, () => finish(false));
  preCard.el = el("div", { class: "wp-pre", role: "region", "aria-label": "Before you watch" },
    el("div", { class: "wp-pre-label" }, pre.open ? "Left open last time" : "Before you watch"),
    el("div", { class: "wp-pre-q" }, pre.q),
    input,
    el("div", { class: "wp-row wp-pre-actions" },
      el("button", { class: "wp-btn wp-btn-primary", onclick: () => finish(false) }, "Save my guess"),
      el("button", { class: "wp-btn wp-btn-text", onclick: () => finish(true) }, "Skip")));
  setTimeout(() => input.focus({ preventScroll: true }), 50);
  return preCard.el;
}
