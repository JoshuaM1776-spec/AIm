// Aim — the video gate: hold each new video, then decide.
//   On a break        → it plays.
//   With a purpose    → it plays if your searches for the purpose found it.
//   With neither      → a card over the player asks: a purpose, or a break?
//   A limit ran out   → the video that was playing may finish within the grace period;
//                       anything else waits for a decision.

// "playing", not "play": a video is paused only once it has really started, so YouTube's player is
// never interrupted while it sets up (that can end in "An error occurred. Please try again later").
document.addEventListener("playing", e => {
  if (holding && e.target.tagName === "VIDEO") e.target.pause();
}, true);

// When a video ends: a one-video break is over, and so is a grace period.
document.addEventListener("ended", e => {
  if (e.target.tagName !== "VIDEO" || !currentId) return;
  if (brk?.oneVideoId === currentId) return endOneVideoBreak();
  if (stop?.videoId === currentId) endGrace();
}, true);

// Hold the video on screen. One that hasn't started yet is left alone: the "playing" listener above
// pauses it the moment it does.
function hold() {
  holding = true;
  const v = getVideoEl();
  if (v && !v.paused && v.readyState >= 2) v.pause();
}
function release(id) {
  cleared.add(id);
  holding = false;
  closePlayerCard();
  getVideoEl()?.play().catch(() => {});
}
function goBack() {
  holding = false;
  closeModal();
  closePlayerCard();
  if (history.length > 1) history.back();
  else location.href = "https://www.youtube.com/";
}

// Check the video on screen again, e.g. after a break ends or a purpose changes.
function regate(id) {
  if (!id || id !== currentId) return;
  cleared.delete(id);
  hold();
  gate(id, currentInfo);
}

// The hide/warn entry for a channel, if you set one.
function avoidFor(key) {
  key = channelPath(key);
  if (!key) return null;
  for (const [k, c] of Object.entries(settings.avoid || {})) if (channelPath(k) === key) return c;
  return null;
}

async function saveCurrent(thenLeave) {
  if (!currentInfo) return;
  await send({ type: "save", video: currentInfo });
  closeNotice();
  toast(`Saved for later. Find it under the ${BRAND} icon.`);
  if (thenLeave) goBack();
}

// ---------------- the main flow for each new video ----------------
async function gate(id, known = null) {
  hold();
  const info = known?.id === id ? known : await readVideoInfo(id);
  if (currentId !== id) return;
  currentInfo = info;
  if (graced(id)) { release(id); return showGraceNotice(); }
  if (status.totalReached) return showTotalCard();
  // Hidden channels always ask; warned channels ask unless they fit your purpose.
  const a = avoidFor(info.channelKey);
  if (a && !overridden.has(id) && (a.action === "hide" || !activePurpose())) return openChannelWarning(info, a.action);
  continueAfterRules(info);
}

async function continueAfterRules(info) {
  const id = info.id;
  if (brk) {
    // A one-video break covers that video only; moving to another ends it.
    if (brk.oneVideoId && brk.oneVideoId !== id) {
      applyStatus(await send({ type: "break-end" }) && await send({ type: "status" }));
      renderChip();
      if (currentId !== id) return;
      return continueAfterRules(info);
    }
    return release(id);
  }
  const p = activePurpose();
  if (!p) return showChoiceCard(info);
  if (p.timeUp) return showTimeUpCard();
  if (isShortsPage() && settings.hideShorts !== false) return showShortsCard();
  evaluateVideo(info);
}

// With a purpose: is this video one your searches for it found? No AI: you chose the searches.
async function evaluateVideo(info) {
  const id = info.id;
  if (!isAllowed(id)) {
    // Make sure we're not judging by a stale copy (a result clicked a moment ago).
    applyStatus(await send({ type: "status" }));
    if (currentId !== id) return;
    if (!isAllowed(id)) return showDriftCard(info);
  }
  release(id);
}

// ---------------- cards over the player ----------------
// Neither a purpose nor a break: choose one. There's no third way to watch.
function showChoiceCard(info) {
  hold();
  const input = el("input", { class: "wp-input", type: "text", placeholder: "What do you want to find or learn?", "aria-label": "Your Target" });
  const err = el("div", { class: "wp-error" });
  const start = async () => {
    const text = input.value.trim();
    if (text.length < 2) { err.textContent = "Write what you're here for."; return input.focus(); }
    const r = await send({ type: "purpose-start", text, video: { id: info.id, title: info.title, channel: info.channel } });
    if (!r || r.result !== "applied") { err.textContent = r?.message || "Couldn't set that. Try again."; return; }
    applyStatus(await send({ type: "status" }));
    renderChip();
    closePlayerCard();
    if (currentId === info.id) continueAfterRules(info);
  };
  keepKeys(input, start);
  showPlayerCard(
    brandLine(),
    el("div", { class: "wp-title" }, "What brings you here?"),
    el("div", { class: "wp-muted wp-ellipsis" }, info.title),
    el("div", { class: "wp-row" }, input, el("button", { class: "wp-btn wp-btn-primary", onclick: start }, "Set Target")),
    err,
    el("div", { class: "wp-label" }, "Or take a break"),
    breakChips(takeBreak, { oneVideoId: info.id }));
  setTimeout(() => input.focus(), 50);
}

// With a purpose, a video your searches for it didn't find: back, search, change purpose,
// or take a break. There's no "watch anyway": a video that fits elsewhere means a new purpose.
function showDriftCard(info) {
  hold();
  const p = activePurpose();
  const input = el("input", { class: "wp-input", type: "text", placeholder: "Search toward your Target", "aria-label": "Search toward your Target" });
  const search = () => { const q = input.value.trim(); if (q) location.href = "/results?search_query=" + encodeURIComponent(q); };
  keepKeys(input, search);
  showPlayerCard(
    brandLine(),
    el("div", { class: "wp-title" }, "Not on your Target"),
    el("div", { class: "wp-current" }, el("div", { class: "wp-label" }, "Current Target"), el("div", { class: "wp-strong" }, p.text)),
    el("div", { class: "wp-muted" }, p.searches.length
      ? "While you have a Target, you watch what your searches for it found. This video wasn't among them."
      : "Search for what you're looking for, and the results are yours to watch."),
    el("div", { class: "wp-row" }, input, el("button", { class: "wp-btn wp-btn-tonal", onclick: search }, "Search")),
    el("div", { class: "wp-actions wp-actions-start" },
      history.length > 1 ? el("button", { class: "wp-btn wp-btn-primary", onclick: goBack }, "Back") : null,
      el("button", { class: "wp-btn wp-btn-tonal", onclick: () => openPivotDialog("", { video: info }) }, "Change Target"),
      el("button", { class: "wp-btn wp-btn-text", onclick: () => saveCurrent(true) }, "Save for later")),
    el("div", { class: "wp-label" }, "Or take a break"),
    breakChips(takeBreak, { oneVideoId: info.id }));
}

// The purpose's time limit ran out.
function showTimeUpCard() {
  hold();
  const p = activePurpose();
  showPlayerCard(
    brandLine(),
    el("div", { class: "wp-title" }, "Time's up"),
    el("div", { class: "wp-muted" }, `You set ${p.limitMin} minutes for: ${p.text}`),
    el("div", { class: "wp-actions wp-actions-start" },
      el("button", { class: "wp-btn wp-btn-primary", onclick: askDone }, "Target complete"),
      el("button", { class: "wp-btn wp-btn-tonal", onclick: () => addPurposeTime(15) }, "Add 15 minutes")),
    el("div", { class: "wp-label" }, "Or take a break"),
    breakChips(takeBreak));
}

// Today's YouTube total is reached: a hard stop until midnight.
function showTotalCard() {
  hold();
  showPlayerCard(
    brandLine(),
    el("div", { class: "wp-title" }, "That's today's YouTube time"),
    el("div", { class: "wp-muted" }, `You set a daily limit of ${settings.totalMin} minutes. It resets at midnight.`),
    activePurpose() ? el("div", { class: "wp-actions wp-actions-start" },
      el("button", { class: "wp-btn wp-btn-tonal", onclick: askDone }, "Target complete")) : null);
}

// ---------------- limits running out mid-video ----------------
const STOP_TEXT = {
  break: "Your break is over.",
  leisure: "That's today's leisure time.",
  purpose: "Time's up for this Target.",
  total: "That's today's YouTube time."
};

// The limit ran out while this video played: let it finish, within the grace period.
function showGraceNotice() {
  if (!stop) return;
  const mins = Math.max(1, Math.ceil((stop.graceEndsAt - Date.now()) / 60000));
  showNotice([
    el("span", { class: "wp-notice-icon" }, icon("clock")),
    el("div", { class: "wp-notice-text" }, el("div", { class: "wp-strong" }, STOP_TEXT[stop.kind] || "Time's up."),
      el("div", { class: "wp-muted" }, `Finish this video. Aim pauses it in ${mins} min if it's still going.`))
  ]);
  notice.dataset.kind = "grace";
}

// The grace video ended, or its time ran out: the limit takes full effect.
async function endGrace() {
  if (!stop) return;
  await send({ type: "stop-clear" });
  applyStatus(await send({ type: "status" }));
  if (notice?.dataset.kind === "grace") closeNotice();
  renderChip();
  regate(currentId);
}

async function endOneVideoBreak() {
  applyStatus(await send({ type: "break-end" }) && await send({ type: "status" }));
  renderChip();
  route();
  regate(currentId);
}
