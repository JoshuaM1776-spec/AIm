// Aim — the video gate: hold each new video, then decide.
//   On a break        → it plays.
//   With a purpose    → it's checked against the purpose.
//   With neither      → a card over the player asks: a purpose, or a break?
//   A limit ran out   → the video that was playing may finish within the grace period;
//                       anything else waits for a decision.

document.addEventListener("play", e => {
  if (holding && e.target.tagName === "VIDEO") e.target.pause();
}, true);

// When a video ends: a one-video break is over, and so is a grace period.
document.addEventListener("ended", e => {
  if (e.target.tagName !== "VIDEO" || !currentId) return;
  if (brk?.oneVideoId === currentId) return endOneVideoBreak();
  if (stop?.videoId === currentId) endGrace();
}, true);

function hold() { holding = true; getVideoEl()?.pause(); }
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
  toast("Saved for later. Find it under the Aim icon.");
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

// With a purpose: does this video belong to it? (AI-based for now; replaced by the
// search-based rule in step C, which needs no AI.)
async function evaluateVideo(info) {
  const id = info.id;
  const p = activePurpose();
  if (!p || !settings.hasKey) return release(id);
  const search = p.searches?.[p.searches.length - 1]?.q;
  const fit = await send({ type: "classify", purpose: p.text, video: info, search });
  if (currentId !== id) return;
  // A vague purpose ("woodworking") gets lighter checks: no drift card, just labels.
  if (fit?.verdict === "different" && !p.vague) return showDriftCard(info);
  release(id);
  setTimeout(labelRecommendations, 2500);
  setTimeout(labelRecommendations, 7000);
}

// ---------------- cards over the player ----------------
// Neither a purpose nor a break: choose one. There's no third way to watch.
function showChoiceCard(info) {
  hold();
  const input = el("input", { class: "wp-input", type: "text", placeholder: "What do you want to find or learn?", "aria-label": "Your purpose" });
  const err = el("div", { class: "wp-error" });
  const start = async () => {
    const text = input.value.trim();
    if (text.length < 2) { err.textContent = "Write what you're here for."; return input.focus(); }
    const r = await send({ type: "purpose-start", text });
    if (!r || r.result !== "applied") { err.textContent = r?.message || "Couldn't set that. Try again."; return; }
    applyStatus(await send({ type: "status" }));
    renderChip();
    closePlayerCard();
    if (currentId === info.id) continueAfterRules(info);
  };
  keepKeys(input, start);
  showPlayerCard(
    el("div", { class: "wp-dialog-brand" }, icon("logo"), "Aim"),
    el("div", { class: "wp-title" }, "What brings you here?"),
    el("div", { class: "wp-muted wp-ellipsis" }, info.title),
    el("div", { class: "wp-row" }, input, el("button", { class: "wp-btn wp-btn-primary", onclick: start }, "Set purpose")),
    err,
    el("div", { class: "wp-label" }, "Or take a break"),
    breakChips(takeBreak, { oneVideoId: info.id }));
  setTimeout(() => input.focus(), 50);
}

// With a purpose, a video that doesn't belong to it: change purpose or take a break.
function showDriftCard(info) {
  hold();
  const p = activePurpose();
  showPlayerCard(
    el("div", { class: "wp-dialog-brand" }, icon("logo"), "Aim"),
    el("div", { class: "wp-title" }, "Not part of your purpose"),
    el("div", { class: "wp-current" }, el("div", { class: "wp-label" }, "Your purpose"), el("div", { class: "wp-strong" }, p.text)),
    el("div", { class: "wp-muted wp-ellipsis" }, `This video: ${info.title}`),
    el("div", { class: "wp-actions wp-actions-start" },
      el("button", { class: "wp-btn wp-btn-primary", onclick: goBack }, "Back to my purpose"),
      el("button", { class: "wp-btn wp-btn-tonal", onclick: () => openPivotDialog() }, "Change purpose"),
      el("button", { class: "wp-btn wp-btn-text", onclick: () => saveCurrent(true) }, "Save for later")),
    el("div", { class: "wp-label" }, "Or take a break"),
    breakChips(takeBreak, { oneVideoId: info.id }));
}

// The purpose's time limit ran out.
function showTimeUpCard() {
  hold();
  const p = activePurpose();
  showPlayerCard(
    el("div", { class: "wp-dialog-brand" }, icon("logo"), "Aim"),
    el("div", { class: "wp-title" }, "Time's up"),
    el("div", { class: "wp-muted" }, `You set ${p.limitMin} minutes for: ${p.text}`),
    el("div", { class: "wp-actions wp-actions-start" },
      el("button", { class: "wp-btn wp-btn-primary", onclick: () => finishPurpose() }, "Done"),
      el("button", { class: "wp-btn wp-btn-tonal", onclick: () => addPurposeTime(15) }, "Add 15 minutes")),
    el("div", { class: "wp-label" }, "Or take a break"),
    breakChips(takeBreak));
}

// Today's YouTube total is reached: a hard stop until midnight.
function showTotalCard() {
  hold();
  showPlayerCard(
    el("div", { class: "wp-dialog-brand" }, icon("logo"), "Aim"),
    el("div", { class: "wp-title" }, "That's today's YouTube time"),
    el("div", { class: "wp-muted" }, `You set a daily limit of ${settings.totalMin} minutes. It resets at midnight.`),
    activePurpose() ? el("div", { class: "wp-actions wp-actions-start" },
      el("button", { class: "wp-btn wp-btn-tonal", onclick: () => finishPurpose() }, "Done with my purpose")) : null);
}

// ---------------- limits running out mid-video ----------------
const STOP_TEXT = {
  break: "Your break is over.",
  leisure: "That's today's leisure time.",
  purpose: "Time's up for your purpose.",
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
