// Aim — the video gate: hold a new video, check channel rules and purpose, then let it play.

document.addEventListener("play", e => {
  if (holding && e.target.tagName === "VIDEO") e.target.pause();
}, true);

function hold() { holding = true; getVideoEl()?.pause(); }
function release(id) {
  cleared.add(id);
  holding = false;
  getVideoEl()?.play().catch(() => {});
}
function goBack() {
  holding = false;
  closeModal();
  if (history.length > 1) history.back();
  else location.href = "https://www.youtube.com/";
}

// The hide/warn entry for a channel, if you set one.
function avoidFor(key) {
  key = channelPath(key);
  if (!key) return null;
  for (const [k, c] of Object.entries(settings.avoid || {})) if (channelPath(k) === key) return c;
  return null;
}

// When you start to drift
function showDrift(info) {
  hold();
  showNotice([
    el("span", { class: "wp-notice-icon" }, icon("pivot")),
    el("div", { class: "wp-notice-text" }, el("div", { class: "wp-strong" }, "This video looks different from your current purpose."),
      el("div", { class: "wp-muted wp-ellipsis" }, session.purpose)),
    el("div", { class: "wp-notice-actions" },
      el("button", { class: "wp-btn wp-btn-tonal", onclick: () => { closeNotice(); goBack(); } }, "Stay focused"),
      el("button", { class: "wp-btn wp-btn-tonal", onclick: () => { closeNotice(); openPivotDialog("", { releaseAfter: true }); } }, "Change purpose"),
      el("button", { class: "wp-btn wp-btn-tonal", onclick: () => saveCurrent(true) }, "Save for later"))
  ], { dismissible: false });
}

async function saveCurrent(thenLeave) {
  if (!currentInfo) return;
  await send({ type: "save", video: currentInfo });
  closeNotice();
  toast("Saved for later. Find it under the Aim icon.");
  if (thenLeave) goBack();
}

// ---------------- the main flow for each new video ----------------
async function gate(id) {
  hold();
  const info = await readVideoInfo(id);
  if (currentId !== id) return;
  currentInfo = info;
  // Hidden channels always ask; warned channels ask outside Focus (your purpose takes precedence).
  const a = avoidFor(info.channelKey);
  if (a && !overridden.has(id) && (a.action === "hide" || session?.mode !== "focus"))
    return openChannelWarning(info, a.action);
  continueAfterRules(info);
}

function continueAfterRules(info) {
  if (!session && !notNow) return openStartDialog(info);
  if (session?.timeUp) return showTimeUp();
  if (session?.paused) return showPaused();
  if (!session) return release(info.id);
  evaluateVideo(info);
}

async function evaluateVideo(info) {
  const id = info.id;
  if (!session || session.paused || session.mode !== "focus" || !settings.hasKey) return release(id);
  const search = session.searches?.[session.searches.length - 1];
  const fit = await send({ type: "classify", purpose: session.purpose, video: info, search });
  if (currentId !== id) return;
  // A vague purpose ("woodworking") gets lighter checks: no drift prompts, just labels.
  if (fit?.verdict === "different" && !session.vague) return showDrift(info);
  release(id);
  if (fit?.verdict === "refinement") toast("Counts toward your purpose");
  setTimeout(labelRecommendations, 2500);
  setTimeout(labelRecommendations, 7000);
}
