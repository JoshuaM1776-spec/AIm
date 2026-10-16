// Aim — session UI: top-bar button and menu, start/pivot/add-time dialogs, pause, time up, ending.

// ---------------- top-bar chip + dropdown ----------------
function renderChip() {
  const host = mastheadHost();
  if (!host) return;
  let chip = $("#wp-chip");
  if (!chip) {
    chip = el("div", { id: "wp-chip", class: "wp" });
    host.prepend(chip);
  }
  // Only rebuild when something visible changed, so keyboard focus survives the timer.
  const sig = session ? `${session.mode}|${session.paused}|${fmtMin(remaining(session))}` : "none";
  if (chip.dataset.sig === sig) return;
  chip.dataset.sig = sig;
  chip.replaceChildren();
  const brand = el("span", { class: "wp-brand" }, icon("logo"), el("span", { class: "wp-brand-name" }, "Aim"));
  if (!session) {
    chip.append(brand, el("button", { class: "wp-pill wp-pill-solid", onclick: () => openStartDialog(null) }, "Start a session"));
    return;
  }
  const label = session.paused ? "Paused" : session.mode === "explore" ? "Explore" : "Focus";
  const pill = el("button", {
    class: `wp-pill wp-pill-${session.paused ? "paused" : session.mode}`,
    "aria-haspopup": "menu",
    onclick: e => { e.stopPropagation(); dropdown ? closeDropdown() : openDropdown(); }
  }, el("span", {}, label), el("span", { class: "wp-pill-time" }, fmtMin(remaining(session))), icon("chevron"));
  chip.append(brand, pill);
}

async function openDropdown() {
  if (!session) return;
  const pill = $("#wp-chip .wp-pill");
  const r = pill.getBoundingClientRect();
  const pct = Math.min(100, (remaining(session) / (session.budgetMin * 60)) * 100);
  const isFocus = session.mode === "focus";

  const head = el("button", { class: "wp-menu-head", onclick: () => { closeDropdown(); openPivotDialog(); } },
    el("div", {},
      el("div", { class: "wp-label" }, isFocus ? "Current purpose" : "Explore session"),
      el("div", { class: "wp-strong" }, isFocus ? session.purpose : `Exploring · ${session.budgetMin} minutes`)),
    icon("right"));

  const time = el("div", { class: "wp-menu-block" },
    el("div", { class: "wp-label" }, "Time remaining"),
    el("div", { class: "wp-strong" }, fmtMin(remaining(session))),
    el("div", { class: "wp-bar" }, el("i", { style: `width:${pct}%` })));

  const items = el("div", { class: "wp-menu-items" });
  const extendItem = menuItem("clock", "Add 15 minutes", () => openExtendDialog(), { hint: settings.hold ? "(asks for a reason)" : null });
  if (isFocus) items.append(
    menuItem("check2", "Got what I came for", gotMyAnswer),
    menuItem("pivot", "Change purpose", openPivotDialog),
    extendItem);
  else items.append(extendItem, menuItem("pivot", "Change to Focus", openPivotDialog));
  items.append(session.paused
    ? menuItem("play", "Resume session", resumeSession)
    : menuItem("pause", "Pause session", async () => { await updateSession({ paused: true }); if (videoIdFromUrl()) showPaused(); }));
  if (currentId && currentInfo) items.append(
    menuItem("save", "Save this video for later", () => saveCurrent(false)),
    menuItem("avoid", "Hide or warn about this channel", openAvoidDialog));
  items.append(menuItem("end", "End session", finishSession, { danger: true }));

  dropdown = el("div", { class: "wp wp-dropdown", role: "menu", onclick: e => e.stopPropagation() }, head, time);
  if (session.searches?.length > 1) dropdown.append(el("div", { class: "wp-menu-block" },
    el("div", { class: "wp-label" }, "Searches toward this purpose"),
    el("div", { class: "wp-muted" }, session.searches.slice(-4).join(" · "))));

  if (session.mode === "focus") {
    const path = el("div", { class: "wp-menu-block wp-path" }, el("div", { class: "wp-label" }, "Suggested path"));
    dropdown.append(path);
    loadSuggestions(path);
  }
  dropdown.append(items);
  dropdown.style.top = `${r.bottom + 8}px`;
  dropdown.style.right = `${Math.max(16, innerWidth - r.right)}px`;
  document.body.append(dropdown);
}

async function loadSuggestions(container) {
  if (!settings.hasKey) {
    container.append(el("div", { class: "wp-muted" }, "Add a Claude API key in settings for suggestions."));
    return;
  }
  let list = session.suggestions?.purpose === session.purpose ? session.suggestions.items : null;
  if (!list) {
    const loading = el("div", { class: "wp-muted" }, "Finding a path…");
    container.append(loading);
    list = (await send({ type: "suggest-path", purpose: session.purpose }))?.items;
    loading.remove();
    if (Array.isArray(list) && list.length && session) {
      session = (await send({ type: "session-patch", patch: { suggestions: { purpose: session.purpose, items: list } } })) || session;
    }
  }
  if (!Array.isArray(list) || !list.length) { container.append(el("div", { class: "wp-muted" }, "No suggestions right now.")); return; }
  list.slice(0, 3).forEach((s, i) => container.append(
    el("a", { class: "wp-suggest", href: "https://www.youtube.com/results?search_query=" + encodeURIComponent(s.query || s.label) },
      el("span", { class: "wp-num" }, String(i + 1)), el("span", {}, s.label || s.query))));
}

async function updateSession(patch) {
  session = (await send({ type: "session-patch", patch })) || session;
  renderChip();
}

// 1. Session start — "What do you want to accomplish?"
function openStartDialog(info, initialMode = "focus") {
  let mode = initialMode;
  const purpose = el("textarea", { class: "wp-input", rows: "2", placeholder: "e.g. Learn how to build a small cabin foundation" });
  const time = chips([15, 30, 45, 60], 30, minLabel);
  const err = el("div", { class: "wp-error" });
  const purposeBlock = el("div", {}, el("label", { class: "wp-q" }, "What do you want to accomplish?"), purpose);
  const exploreNote = el("p", { class: "wp-muted", hidden: true }, "No purpose needed. Aim just keeps time.");

  const modeRow = el("div", { class: "wp-seg" });
  const renderMode = () => {
    modeRow.replaceChildren(
      el("button", { class: "wp-seg-btn" + (mode === "focus" ? " on" : ""), onclick: () => { mode = "focus"; renderMode(); } }, "Focus"),
      el("button", { class: "wp-seg-btn" + (mode === "explore" ? " on" : ""), onclick: () => { mode = "explore"; renderMode(); } }, "Just exploring"));
    purposeBlock.hidden = mode !== "focus";
    exploreNote.hidden = mode !== "explore";
  };
  renderMode();

  const start = async () => {
    const p = purpose.value.trim();
    if (mode === "focus" && p.length < 4) { err.textContent = "Write what you want to accomplish."; return; }
    const started = await send({ type: "session-start", mode, purpose: mode === "focus" ? p : "", budgetMin: time.get() });
    if (!started) { err.textContent = "Couldn't start the session. Try again."; return; }
    session = started;
    timeUpShown = false;
    closeModal();
    renderChip();
    if (info) evaluateVideo(info);
  };
  keepKeys(purpose, start);

  const actions = el("div", { class: "wp-actions" });
  // A nudge, not a gate: "Not now" plays the video and stops asking in this tab.
  if (info) actions.append(el("button", { class: "wp-btn wp-btn-text", onclick: () => {
    notNow = true;
    closeModal();
    continueAfterRules(info);
  } }, "Not now"));
  else actions.append(el("button", { class: "wp-btn wp-btn-text", onclick: closeModal }, "Cancel"));
  actions.append(el("button", { class: "wp-btn wp-btn-primary", onclick: start }, "Start session"));

  openModal(el("div", { class: "wp-dialog", role: "dialog", "aria-modal": "true" },
    el("div", { class: "wp-dialog-brand" }, icon("logo"), "Aim"),
    info ? el("div", { class: "wp-muted wp-ellipsis" }, `Up next: ${info.title}`) : null,
    modeRow, purposeBlock, exploreNote,
    el("label", { class: "wp-q wp-q-sm" }, "How much time do you want to spend?"), time.row,
    err, actions));
  setTimeout(() => purpose.focus(), 50);
}

// 2. Change direction — the intentional pivot
function openPivotDialog(prefill = "", { releaseAfter = false, afterConfirm = null } = {}) {
  if (typeof prefill !== "string") prefill = "";
  if (!session) return;
  const remainingMin = Math.ceil(remaining(session) / 60);
  const purpose = el("textarea", { class: "wp-input", rows: "2", placeholder: "e.g. Understand soil conditions first" });
  purpose.value = prefill;
  let keep = remainingMin > 0; // with no time left, keeping it would end the session on the spot
  const time = chips([15, 30, 45, 60], 30, minLabel);
  const reason = el("textarea", { class: "wp-input", rows: "2", placeholder: "Why add time?" });
  const err = el("div", { class: "wp-error" });
  const timeBox = el("div", {});
  const renderTime = () => {
    timeBox.replaceChildren(...[
      el("label", { class: "wp-radio" }, el("input", { type: "radio", name: "wp-t", checked: keep, onchange: () => { keep = true; renderTime(); } }), "Keep my remaining time"),
      el("label", { class: "wp-radio" }, el("input", { type: "radio", name: "wp-t", checked: !keep, onchange: () => { keep = false; renderTime(); } }), "Set a new time limit"),
      !keep ? time.row : null,
      !keep && settings.hold ? reason : null].filter(Boolean));
  };
  renderTime();
  keepKeys(purpose); keepKeys(reason);

  const confirm = async () => {
    const r = await send({ type: "session-pivot", purpose: purpose.value, budgetMin: keep ? null : time.get(), reason: reason.value });
    if (!r) { err.textContent = "Couldn't change the purpose. Try again."; return; }
    if (r.result === "error") { err.textContent = r.message; return; }
    session = r.session;
    timeUpShown = false;
    closeModal();
    if (afterConfirm) session = (await afterConfirm()) || session;
    renderChip();
    toast(`Purpose changed: ${session.purpose}`);
    if (currentInfo && holding) releaseAfter ? release(currentInfo.id) : evaluateVideo(currentInfo);
  };

  openModal(el("div", { class: "wp-dialog", role: "dialog", "aria-modal": "true" },
    el("div", { class: "wp-title" }, "Change direction"),
    session.purpose ? el("div", { class: "wp-current" }, el("div", { class: "wp-label" }, "Current purpose"), el("div", { class: "wp-strong" }, session.purpose)) : null,
    el("label", { class: "wp-q wp-q-sm" }, "What would you like to focus on instead?"), purpose,
    el("div", { class: "wp-row-between" }, el("span", { class: "wp-label" }, "Time remaining"), el("span", { class: "wp-strong" }, `${remainingMin} minutes`)),
    timeBox, err,
    el("div", { class: "wp-actions" },
      el("button", { class: "wp-btn wp-btn-text", onclick: closeModal }, "Cancel"),
      el("button", { class: "wp-btn wp-btn-primary", onclick: confirm }, "Confirm new purpose"))));
  setTimeout(() => purpose.focus(), 50);
}

// Add time (from the dropdown, or the time-up notice)
function openExtendDialog() {
  if (!settings.hold) return extend(15, "");
  const reason = el("textarea", { class: "wp-input", rows: "2", placeholder: "Why add 15 minutes?" });
  const err = el("div", { class: "wp-error" });
  keepKeys(reason);
  openModal(el("div", { class: "wp-dialog" },
    el("div", { class: "wp-title" }, "Add time"),
    el("p", { class: "wp-muted" }, "You asked Aim to hold you to your time limits, so adding time takes a reason."),
    reason, err,
    el("div", { class: "wp-actions" },
      el("button", { class: "wp-btn wp-btn-text", onclick: closeModal }, "Cancel"),
      el("button", { class: "wp-btn wp-btn-primary", onclick: async () => {
        const ok = await extend(15, reason.value);
        if (!ok) err.textContent = "Write a real reason (a short sentence).";
        else closeModal();
      } }, "Add 15 minutes"))));
  setTimeout(() => reason.focus(), 50);
}

async function extend(minutes, reason) {
  const r = await send({ type: "session-extend", minutes, reason });
  if (r?.result !== "applied") return false;
  session = r.session;
  timeUpShown = false;
  closeNotice();
  renderChip();
  if (currentId && currentInfo && holding) cleared.has(currentId) ? release(currentId) : evaluateVideo(currentInfo);
  toast(`Added ${minutes} minutes`);
  return true;
}

// A pause is a break from YouTube, not free watching.
function showPaused() {
  hold();
  showNotice([
    el("span", { class: "wp-notice-icon" }, icon("pause")),
    el("div", { class: "wp-notice-text" }, el("div", { class: "wp-strong" }, "Your session is paused"),
      el("div", { class: "wp-muted" }, "Videos stay paused until you resume.")),
    el("div", { class: "wp-notice-actions" },
      el("button", { class: "wp-btn wp-btn-primary", onclick: resumeSession }, "Resume"),
      el("button", { class: "wp-btn wp-btn-tonal", onclick: finishSession }, "End session"))
  ], { dismissible: false });
  notice.dataset.keep = "1";
  notice.dataset.kind = "paused";
}

async function resumeSession() {
  await updateSession({ paused: false });
  closeNotice();
  if (currentInfo && holding) evaluateVideo(currentInfo);
}

// When time runs out
function showTimeUp() {
  timeUpShown = true;
  if (videoIdFromUrl()) hold(); // time's up means the video stops
  showNotice([
    el("span", { class: "wp-notice-icon" }, icon("clock")),
    el("div", { class: "wp-notice-text" }, el("div", { class: "wp-strong" }, "Your time is up"),
      el("div", { class: "wp-muted" }, `You've reached your ${session.budgetMin} minute session limit.`)),
    el("div", { class: "wp-notice-actions" },
      el("button", { class: "wp-btn wp-btn-primary", onclick: finishSession }, "End session"),
      el("button", { class: "wp-btn wp-btn-tonal", onclick: openExtendDialog }, "Add 15 minutes"))
  ], { dismissible: false });
  notice.dataset.keep = "1";
  notice.dataset.kind = "timeup";
}

// Session end — a brief reflection
// Ending a session (or running out of time) never leaves you inside a video.
// You land back on the "What brings you here?" card, with a short reflection.
async function finishSession(outcome) {
  endingHere = true;
  if (videoIdFromUrl()) hold();
  await send({ type: "session-end", outcome: typeof outcome === "string" ? outcome : null });
  session = null;
  cleared.clear();
  overridden.clear();
  location.href = "https://www.youtube.com/";
}

async function showReflection() {
  const { reflection: s } = await chrome.storage.local.get("reflection");
  if (!s) return;
  await send({ type: "reflection-clear" });
  if (Date.now() - (s.endedAt || 0) > 10 * 60 * 1000) return; // ended long ago, e.g. from the popup
  if (s.outcome === "yes") { toast("Glad you found it."); return; }
  const mins = Math.max(1, Math.round(s.usedSec / 60));
  const { saved = [] } = await chrome.storage.local.get("saved");
  const pathText = s.path.length > 1 ? s.path.map(p => p.purpose).join(" → ") : null;
  const rate = outcome => async () => {
    await send({ type: "session-rate", outcome });
    closeNotice();
    toast(outcome === "yes" ? "Nice work." : "Noted. That's useful to know.");
  };
  showNotice([
    el("span", { class: "wp-notice-icon wp-accent" }, icon("check")),
    el("div", { class: "wp-notice-text" },
      el("div", { class: "wp-strong" }, "Session complete"),
      el("div", { class: "wp-muted" }, s.mode !== "explore" ? `You spent ${mins} minutes on: ${s.purpose}` : `You explored for ${mins} minutes.`),
      pathText ? el("div", { class: "wp-muted wp-ellipsis" }, `Path: ${pathText}`) : null,
      saved.length ? el("div", { class: "wp-muted" }, `${saved.length} saved for later. Find them under the Aim icon.`) : null),
    s.mode !== "explore" ? el("div", { class: "wp-notice-actions wp-col" },
      el("div", { class: "wp-label" }, "Did you get what you came for?"),
      el("div", { class: "wp-notice-actions" },
        el("button", { class: "wp-btn wp-btn-tonal", onclick: rate("yes") }, "Yes"),
        el("button", { class: "wp-btn wp-btn-tonal", onclick: rate("partly") }, "Partly"),
        el("button", { class: "wp-btn wp-btn-tonal", onclick: rate("no") }, "No"))) : null
  ]);
}

// Once a day, after the minutes you chose. Information, not a block.
function showReminder(minutes) {
  const text = `You've spent ${minutes >= 60 ? `${Math.floor(minutes / 60)}h ${minutes % 60}m` : `${minutes} minutes`} on YouTube today.`;
  if (notice?.dataset.keep) return toast(text); // don't cover a time-up or paused notice
  showNotice([
    el("span", { class: "wp-notice-icon" }, icon("clock")),
    el("div", { class: "wp-notice-text" }, el("div", { class: "wp-strong" }, text),
      el("div", { class: "wp-muted" }, "This is the daily reminder you set in Aim. Nothing is blocked."))
  ]);
}

// ---------------- clarifying a purpose ----------------
function gotMyAnswer() { return finishSession("yes"); }

function openRefineDialog() {
  if (!session) return;
  const input = el("textarea", { class: "wp-input", rows: "2" });
  input.value = session.purpose;
  keepKeys(input);
  openModal(el("div", { class: "wp-dialog", role: "dialog", "aria-modal": "true" },
    el("div", { class: "wp-title" }, "Clarify your purpose"),
    el("p", { class: "wp-muted" }, "Optional. A clearer outcome gets you sharper suggestions. This isn't a pivot."),
    input,
    el("div", { class: "wp-actions" },
      el("button", { class: "wp-btn wp-btn-text", onclick: closeModal }, "Cancel"),
      el("button", { class: "wp-btn wp-btn-primary", onclick: async () => {
        session = (await send({ type: "session-refine", purpose: input.value })) || session;
        closeModal(); renderChip(); renderResultsBar();
      } }, "Save"))));
  setTimeout(() => { input.focus(); input.select(); }, 50);
}
