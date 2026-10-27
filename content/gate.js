// Aim — the video gate: hold each new video, then decide.
//   On a break        → it plays.
//   With a purpose    → it plays if your searches for the purpose found it.
//   With neither      → a card over the player asks: a purpose, or a break?
//   A limit ran out   → the video that was playing may finish within the grace period;
//                       anything else waits for a decision.

// "playing", not "play": a video is paused only once it has really started, so YouTube's player is
// never interrupted while it sets up (that can end in "An error occurred. Please try again later").
// Videos Aim paused itself, so release() resumes exactly those, and never one you paused.
const pausedByAim = new WeakSet();
document.addEventListener("playing", e => {
  if (alive && holding && e.target.tagName === "VIDEO") { pausedByAim.add(e.target); e.target.pause(); }
}, true);

// When a video ends: a one-video break is over, and so is a grace period.
document.addEventListener("ended", e => {
  // Only the video you're watching, and not an ad playing in it.
  if (!alive || e.target.tagName !== "VIDEO" || !currentId || e.target !== getVideoEl() || playerHost()?.classList.contains("ad-showing")) return;
  if (brk?.oneVideoId === currentId) return endOneVideoBreak();
  if (stop?.videoId === currentId) endGrace();
}, true);

// Hold the video on screen. One that hasn't started yet is left alone: the "playing" listener above
// pauses it the moment it does.
function hold() {
  if (!alive) return;
  holding = true;
  const v = getVideoEl();
  if (v && !v.paused && v.readyState >= 2) { pausedByAim.add(v); v.pause(); }
}
function release(id) {
  cleared.add(id);
  holding = false;
  closePlayerCard();
  resume(id);
  if (activePurpose() && !brk) onTrackPill();
}
// Play the video Aim held. YouTube may still be swapping the new video in (or showing an ad), so
// check again for a few seconds; stop as soon as it plays, if you pause it yourself, or if you leave.
function resume(id) {
  let tries = 0;
  const attempt = () => {
    if (holding || currentId !== id) return;
    const v = getVideoEl();
    if (v && v.paused && !v.ended && (pausedByAim.has(v) || v.dataset.aimHeld || tries === 0)) {
      pausedByAim.delete(v);
      delete v.dataset.aimHeld;
      v.play().catch(() => {});
    }
    if (v && !v.paused) return;
    // YouTube keeps its own play state and can undo a play() from outside: then press its play button.
    if (tries === 3 && v?.paused && !v.ended) playerHost()?.querySelector(".ytp-play-button")?.click();
    if (++tries < 6) setTimeout(attempt, [250, 500, 1000, 1500, 2500][tries - 1]);
  };
  attempt();
  // Anything Aim paused while it was deciding (a hover preview, an ad, the video itself) is no longer held.
  for (const v of document.querySelectorAll("video")) if (pausedByAim.has(v) && v !== getVideoEl()) pausedByAim.delete(v);
}

// "Staying on track": a small pill on the player for a few seconds when a video plays for your aim.
// Quiet confirmation, never in the way; tap it for Aim's menu.
function onTrackPill() {
  const host = playerHost();
  if (!host || $(".wp-ontrack", host)) return;
  const p = activePurpose();
  const pill = el("button", { class: "wp wp-ontrack", title: "Aim's menu", onclick: e => { e.stopPropagation(); pill.remove(); openDropdown(); } },
    el("span", { class: "wp-icon" }, svgIcon("logo")), el("b", {}, BRAND),
    el("span", { class: "wp-ontrack-text" }, el("span", {}, "Staying on track"),
      el("span", { class: "wp-ontrack-aim" }, p.learn ? `Exploring: ${p.learn}` : `Learning: ${p.text}`)), icon("right"));
  host.append(pill);
  setTimeout(() => pill.classList.add("wp-ontrack-out"), 3500);
  setTimeout(() => pill.remove(), 4000);
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

// Watch something from "Saved for later": during a break it just plays; otherwise it's a
// one-video break, so it doesn't count toward your aim.
async function watchSaved(v) {
  if (!brk) {
    const r = await send({ type: "break-start", oneVideoId: v.id });
    if (!r || r.result !== "applied") return toast(r?.message || "Couldn't start a break.");
  }
  location.href = `/watch?v=${encodeURIComponent(v.id)}`;
}

async function saveCurrent(thenLeave) {
  if (!currentInfo) return;
  await send({ type: "save", video: currentInfo });
  closeNotice();
  toast("Saved for later. It's on YouTube's home page, and offered when you take a break.");
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
  // Hidden channels always ask; warned channels ask unless they fit your purpose; break channels ask
  // while you're on an aim (on a break they're what you're there for).
  const a = avoidFor(info.channelKey);
  if (a && !overridden.has(id) && (a.action === "hide" || (a.action === "warn" && !activePurpose()) || (a.action === "break" && activePurpose() && !brk)))
    return openChannelWarning(info, a.action);
  continueAfterRules(info);
}

async function continueAfterRules(info) {
  const id = info.id;
  if (brk) {
    // A one-video break covers that video only; moving to another ends it.
    if (brk.oneVideoId && brk.oneVideoId !== id) {
      const ended = await send({ type: "break-end" });
      // No answer (Aim was reloaded): don't ask again and again; let the video be.
      if (!ended) return release(id);
      applyStatus(await send({ type: "status" }));
      renderChip();
      if (currentId !== id || brk?.oneVideoId) return currentId === id ? release(id) : undefined;
      return continueAfterRules(info);
    }
    return release(id);
  }
  const p = activePurpose();
  if (!p) return showChoiceCard(info);
  if (p.timeUp) return showTimeUpCard();
  if (isShortsPage() && settings.hideShorts !== false) {
    // Shorts from your topics (Settings → Learn something) play; any other waits.
    if (await isLearnShort(id)) { if (currentId !== id) return; release(id); return showReviewBar(id); }
    return showShortsCard();
  }
  evaluateVideo(info);
}

// With a purpose: is this video one your searches for it found? No AI: you chose the searches.
async function evaluateVideo(info) {
  const id = info.id;
  if (!isAllowed(id)) {
    // Make sure we're not judging by a stale copy (a result clicked a moment ago).
    applyStatus(await send({ type: "status" }));
    if (currentId !== id) return;
    if (!isAllowed(id)) {
      // Same channel as before, or plainly on topic: it continues the aim, no question asked.
      const check = await send({ type: "video-check", video: { id, title: info.title, channel: info.channel } });
      if (currentId !== id) return;
      if (!check?.fits) return showDriftCard(info);
      allowLocal([{ id, title: info.title, channel: info.channel }], [], "");
    }
  }
  release(id);
}

// ---------------- cards over the player ----------------
// Neither a purpose nor a break: choose one. There's no third way to watch.
function showChoiceCard(info) {
  hold();
  const input = el("input", { class: "wp-input", type: "text", placeholder: "What do you want to find or learn?", "aria-label": "Your aim" });
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
    el("div", { class: "wp-row" }, input, el("button", { class: "wp-btn wp-btn-primary", onclick: start }, "Set aim")),
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
  const input = el("input", { class: "wp-input", type: "text", placeholder: "Search toward your aim", "aria-label": "Search toward your aim" });
  const search = () => { const q = input.value.trim(); if (q) location.href = "/results?search_query=" + encodeURIComponent(q); };
  keepKeys(input, search);
  // One question, two answers. Everything else waits under "More options".
  const partOfIt = () => withReason("video", "How is this video part of your aim?", info.title || info.id, async () => {
    allowLocal([{ id: info.id, title: info.title, channel: info.channel }], [], "");
    await send({ type: "purpose-allow", query: "", videos: [{ id: info.id, title: info.title, channel: info.channel }], lists: [] });
    release(info.id);
  });
  showPlayerCard(
    brandLine(),
    el("div", { class: "wp-title" }, "Part of your aim?"),
    el("div", { class: "wp-current" }, el("div", { class: "wp-label" }, "Your aim"), el("div", { class: "wp-strong" }, p.text)),
    el("div", { class: "wp-actions wp-actions-start" },
      el("button", { class: "wp-btn wp-btn-primary", onclick: () => (history.length > 1 ? goBack() : input.focus()) }, "Back to my aim"),
      el("button", { class: "wp-btn wp-btn-tonal", onclick: partOfIt }, "Yes, it's part of it"),
      // Curiosity pulled you somewhere: make that the aim (the old one waits), or not.
      el("button", { class: "wp-btn wp-btn-text", onclick: () => openPivotDialog(deeperText(info.title), { video: info }) }, "Follow this instead")),
    el("details", { class: "wp-more" },
      el("summary", {}, "More options"),
      el("div", { class: "wp-row" }, input, el("button", { class: "wp-btn wp-btn-tonal", onclick: search }, "Search")),
      el("div", { class: "wp-actions wp-actions-start" },
        el("button", { class: "wp-btn wp-btn-text", onclick: () => saveCurrent(true) }, "Save for later")),
      el("div", { class: "wp-label" }, "Or take a break"),
      breakChips(takeBreak, { oneVideoId: info.id })));
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
      el("button", { class: "wp-btn wp-btn-primary", onclick: doneAction(p) }, doneLabel(p)),
      el("button", { class: "wp-btn wp-btn-tonal", onclick: () => withReason("more-time", "Why add 15 minutes?", p.text, () => addPurposeTime(15)) }, "Add 15 minutes")),
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
      el("button", { class: "wp-btn wp-btn-tonal", onclick: doneAction(activePurpose()) }, doneLabel(activePurpose()))) : null);
}

// ---------------- limits running out mid-video ----------------
const STOP_TEXT = {
  break: "Your break is over.",
  leisure: "That's today's leisure time.",
  purpose: "Time's up for this aim.",
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
