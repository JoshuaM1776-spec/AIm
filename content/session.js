// Aim — the indicator in YouTube's top bar and what it opens: the current purpose or break,
// time left, Take a break, Change purpose, Done.

// ---------------- top-bar indicator ----------------
// One pill shaped like YouTube's own Create button. It sits beside the search box when the
// window is wide enough, and joins the buttons on the right when it isn't.
const CHIP_BESIDE_SEARCH_MIN_WIDTH = 1200;
const shorten = (t, n) => (t.length > n ? t.slice(0, n - 1).trimEnd() + "…" : t);

function chipContent() {
  if (status.totalReached) return { label: "Done for today", time: null };
  if (brk) {
    const left = breakLeft(brk);
    return { label: "Break", time: brk.oneVideoId ? "1 video" : fmtMin(left) };
  }
  const p = activePurpose();
  if (p) return { label: shorten(p.text, 28), time: p.timeUp ? "Time's up" : purposeLeft(p) !== null ? fmtMin(purposeLeft(p)) : null };
  return { label: "Set a purpose", time: null };
}

function renderChip() {
  const beside = innerWidth >= CHIP_BESIDE_SEARCH_MIN_WIDTH ? mastheadCenter() : null;
  const host = beside || mastheadHost();
  if (!host) return;
  let chip = $("#wp-chip");
  if (!chip) chip = el("div", { id: "wp-chip", class: "wp" });
  if (chip.parentElement !== host) beside ? host.append(chip) : host.prepend(chip);
  chip.classList.toggle("wp-chip-beside-search", !!beside);
  const { label, time } = chipContent();
  // Only rebuild when something visible changed, so keyboard focus survives the timer.
  const sig = `${label}|${time}`;
  if (chip.dataset.sig === sig) return;
  chip.dataset.sig = sig;
  chip.replaceChildren(el("button", {
    class: "wp-pill", title: purpose?.text ? `Aim: ${purpose.text}` : "Aim", "aria-haspopup": "menu",
    onclick: e => { e.stopPropagation(); dropdown ? closeDropdown() : openDropdown(); }
  }, icon("logo"), el("span", { class: "wp-pill-label" }, label),
    time ? el("span", { class: "wp-pill-time" }, time) : null, icon("chevron")));
}

// ---------------- the menu ----------------
function openDropdown() {
  const pill = $("#wp-chip .wp-pill");
  if (!pill) return;
  const r = pill.getBoundingClientRect();
  dropdown = el("div", { class: "wp wp-dropdown", role: "menu", onclick: e => e.stopPropagation() },
    ...(brk ? breakMenu() : activePurpose() ? purposeMenu() : idleMenu()));
  dropdown.style.top = `${r.bottom + 8}px`;
  dropdown.style.right = `${Math.max(16, innerWidth - r.right)}px`;
  document.body.append(dropdown);
}

function timeBlock(label, left, total) {
  return el("div", { class: "wp-menu-block" },
    el("div", { class: "wp-label" }, label),
    el("div", { class: "wp-strong" }, `${fmtMin(left)} left`),
    el("div", { class: "wp-bar" }, el("i", { style: `width:${Math.min(100, (left / total) * 100)}%` })));
}

function breakBlock() {
  return el("div", { class: "wp-menu-block" }, el("div", { class: "wp-label" }, "Take a break"), breakChips(takeBreak));
}

function videoItems() {
  if (!currentId || !currentInfo) return [];
  return [
    menuItem("save", "Save this video for later", () => saveCurrent(false)),
    menuItem("avoid", "Hide or warn about this channel", openAvoidDialog)
  ];
}

function purposeMenu() {
  const p = activePurpose();
  const left = purposeLeft(p);
  const head = el("button", { class: "wp-menu-head", onclick: () => { closeDropdown(); openPivotDialog(); } },
    el("div", {}, el("div", { class: "wp-label" }, "Your purpose"), el("div", { class: "wp-strong" }, p.text)),
    icon("right"));
  const time = left !== null ? timeBlock("Time limit", left, p.limitMin * 60)
    : el("div", { class: "wp-menu-block wp-row-between" },
        el("span", { class: "wp-muted" }, "No time limit"),
        el("button", { class: "wp-link", onclick: () => { closeDropdown(); openLimitDialog(); } }, "Set one"));
  const searches = p.searches.length > 1 ? el("div", { class: "wp-menu-block" },
    el("div", { class: "wp-label" }, "Searches toward this purpose"),
    el("div", { class: "wp-muted" }, p.searches.slice(-4).map(s => s.q).join(" · "))) : null;
  return [head, time, searches, focusBlock(), breakBlock(), el("div", { class: "wp-menu-items" },
    menuItem("check2", "Done", () => finishPurpose()),
    menuItem("pivot", "Change purpose", () => openPivotDialog()),
    left !== null ? menuItem("clock", "Change time limit", openLimitDialog) : null,
    ...videoItems())].filter(Boolean);
}

function breakMenu() {
  const left = breakLeft(brk);
  const waiting = purpose?.suspended ? purpose : null;
  const head = el("div", { class: "wp-menu-block wp-menu-first" },
    el("div", { class: "wp-label" }, "On a break"),
    el("div", { class: "wp-strong" }, brk.oneVideoId ? "Just this video" : `${fmtMin(left)} left`),
    left !== null ? el("div", { class: "wp-bar" }, el("i", { style: `width:${Math.min(100, (left / (brk.durationMin * 60)) * 100)}%` })) : null,
    waiting ? el("div", { class: "wp-muted wp-ellipsis", style: "margin-top:8px" }, `Your purpose is waiting: ${waiting.text}`) : null);
  return [head, el("div", { class: "wp-menu-items" },
    waiting ? menuItem("play", "Back to my purpose", endBreakNow) : menuItem("pivot", "Set a purpose", () => openStartDialog()),
    !brk.oneVideoId && !leisureUsedUp() ? menuItem("clock", "Add 15 minutes", extendBreakNow) : null,
    menuItem("end", "End break", endBreakNow),
    ...videoItems())].filter(Boolean);
}

function idleMenu() {
  return [el("div", { class: "wp-menu-block wp-menu-first" },
    el("div", { class: "wp-strong" }, status.totalReached ? "That's today's YouTube time" : "What brings you here?"),
    el("div", { class: "wp-muted" }, status.totalReached ? "Your daily limit resets at midnight." : "Set a purpose, or take a break.")),
    status.totalReached ? null : el("div", { class: "wp-menu-items" }, menuItem("pivot", "Set a purpose", () => openStartDialog())),
    status.totalReached ? null : focusBlock(),
    status.totalReached ? null : breakBlock()].filter(Boolean);
}

async function endBreakNow() {
  applyStatus(await send({ type: "break-end" }) && await send({ type: "status" }));
  renderChip();
  route();
  toast(purpose ? `Back to: ${purpose.text}` : "Break ended.");
  if (currentId) regate(currentId);
}

async function extendBreakNow() {
  const r = await send({ type: "break-extend", minutes: 15 });
  if (r?.result !== "applied") return toast(r?.message || "Couldn't add time.");
  applyStatus(await send({ type: "status" }));
  renderChip();
  toast(`Added ${r.added} minutes.`);
}

// ---------------- dialogs ----------------
// Set a purpose from the indicator (the homepage card and searching do the same).
function openStartDialog() {
  closeDropdown();
  const input = el("textarea", { class: "wp-input", rows: "2", placeholder: "What do you want to find or learn?" });
  const err = el("div", { class: "wp-error" });
  const start = async () => {
    const r = await send({ type: "purpose-start", text: input.value });
    if (!r || r.result !== "applied") { err.textContent = r?.message || "Couldn't set that. Try again."; return; }
    applyStatus(await send({ type: "status" }));
    closeModal();
    renderChip();
    route();
    if (currentId) regate(currentId);
  };
  keepKeys(input, start);
  openModal(el("div", { class: "wp-dialog", role: "dialog", "aria-modal": "true" },
    el("div", { class: "wp-dialog-brand" }, icon("logo"), "Aim"),
    el("label", { class: "wp-q" }, "What brings you here?"), input, err,
    el("div", { class: "wp-actions" },
      el("button", { class: "wp-btn wp-btn-text", onclick: closeModal }, "Cancel"),
      el("button", { class: "wp-btn wp-btn-primary", onclick: start }, "Set purpose"))));
  setTimeout(() => input.focus(), 50);
}

// The intentional pivot: a new purpose, keeping searches, videos and the time limit.
function openPivotDialog(prefill = "", { afterConfirm = null } = {}) {
  closeDropdown();
  if (!purpose) return openStartDialog();
  const input = el("textarea", { class: "wp-input", rows: "2", placeholder: "What do you want to focus on instead?" });
  input.value = typeof prefill === "string" ? prefill : "";
  const err = el("div", { class: "wp-error" });
  const confirm = async () => {
    const r = await send({ type: "purpose-pivot", text: input.value });
    if (!r || r.result !== "applied") { err.textContent = r?.message || "Couldn't change the purpose. Try again."; return; }
    if (afterConfirm) await afterConfirm();
    applyStatus(await send({ type: "status" }));
    closeModal();
    renderChip();
    route();
    toast(`Purpose changed: ${purpose.text}`);
    if (currentId) regate(currentId);
  };
  keepKeys(input, confirm);
  openModal(el("div", { class: "wp-dialog", role: "dialog", "aria-modal": "true" },
    el("div", { class: "wp-title" }, "Change purpose"),
    el("div", { class: "wp-current" }, el("div", { class: "wp-label" }, "Current purpose"), el("div", { class: "wp-strong" }, purpose.text)),
    el("label", { class: "wp-q wp-q-sm" }, "What would you like to focus on instead?"), input,
    el("p", { class: "wp-muted" }, "Your searches, videos and time limit carry over."), err,
    el("div", { class: "wp-actions" },
      el("button", { class: "wp-btn wp-btn-text", onclick: closeModal }, "Cancel"),
      el("button", { class: "wp-btn wp-btn-primary", onclick: confirm }, "Change purpose"))));
  setTimeout(() => input.focus(), 50);
}

// Clarifying is not pivoting: same goal, said more precisely.
function openRefineDialog() {
  if (!purpose) return;
  const input = el("textarea", { class: "wp-input", rows: "2" });
  input.value = purpose.text;
  keepKeys(input);
  openModal(el("div", { class: "wp-dialog", role: "dialog", "aria-modal": "true" },
    el("div", { class: "wp-title" }, "Edit your purpose"),
    el("p", { class: "wp-muted" }, "Say the same goal more precisely. To go somewhere new, use Change purpose."),
    input,
    el("div", { class: "wp-actions" },
      el("button", { class: "wp-btn wp-btn-text", onclick: closeModal }, "Cancel"),
      el("button", { class: "wp-btn wp-btn-primary", onclick: async () => {
        await send({ type: "purpose-refine", text: input.value });
        applyStatus(await send({ type: "status" }));
        closeModal(); renderChip(); renderResultsBar();
      } }, "Save"))));
  setTimeout(() => { input.focus(); input.select(); }, 50);
}

// Optional time limit for the current purpose.
function openLimitDialog() {
  closeDropdown();
  const p = activePurpose();
  if (!p) return;
  const time = chips([0, 15, 30, 45, 60], p.limitMin ? 30 : 0, m => (m ? minLabel(m) : "No limit"));
  openModal(el("div", { class: "wp-dialog", role: "dialog", "aria-modal": "true" },
    el("div", { class: "wp-title" }, "Time limit"),
    el("div", { class: "wp-muted" }, p.text),
    el("label", { class: "wp-q wp-q-sm" }, "How much longer do you want to spend on this?"), time.row,
    el("div", { class: "wp-actions" },
      el("button", { class: "wp-btn wp-btn-text", onclick: closeModal }, "Cancel"),
      el("button", { class: "wp-btn wp-btn-primary", onclick: async () => {
        await send({ type: "purpose-limit", minutes: time.get() });
        applyStatus(await send({ type: "status" }));
        closeModal(); renderChip();
        if (currentId && holding) regate(currentId);
      } }, "Save"))));
}

async function addPurposeTime(minutes) {
  await send({ type: "purpose-limit", add: minutes });
  applyStatus(await send({ type: "status" }));
  renderChip();
  toast(`Added ${minutes} minutes.`);
  if (currentId) regate(currentId);
}

// ---------------- Done ----------------
// Done never leaves you inside a video: you land back on "What brings you here?",
// where Aim asks once whether you found what you needed.
async function finishPurpose(outcome) {
  closeDropdown();
  endingHere = true;
  if (videoIdFromUrl()) hold();
  await send({ type: "purpose-done", outcome: typeof outcome === "string" ? outcome : null });
  purpose = null;
  cleared.clear();
  overridden.clear();
  location.href = "https://www.youtube.com/";
}

async function showReflection() {
  const { reflection: s } = await chrome.storage.local.get("reflection");
  if (!s) return;
  await send({ type: "reflection-clear" });
  if (Date.now() - (s.endedAt || 0) > 10 * 60 * 1000) return; // ended long ago, e.g. from the popup
  if (s.outcome) return toast("Done. Glad you found it.");
  const mins = Math.max(1, Math.round(s.usedSec / 60));
  const pathText = s.path?.length > 1 ? s.path.map(p => p.text).join(" → ") : null;
  const rate = outcome => async () => {
    await send({ type: "purpose-rate", id: s.id, outcome });
    closeNotice();
    toast(outcome === "yes" ? "Nice work." : "Noted. That's useful to know.");
  };
  showNotice([
    el("span", { class: "wp-notice-icon wp-accent" }, icon("check")),
    el("div", { class: "wp-notice-text" },
      el("div", { class: "wp-strong" }, "Done"),
      el("div", { class: "wp-muted" }, `${mins} min on: ${s.text}${s.videos?.length ? ` · ${s.videos.length} video${s.videos.length > 1 ? "s" : ""}` : ""}`),
      pathText ? el("div", { class: "wp-muted wp-ellipsis" }, `Path: ${pathText}`) : null),
    el("div", { class: "wp-notice-actions wp-col" },
      el("div", { class: "wp-label" }, "Did you find what you needed?"),
      el("div", { class: "wp-notice-actions" },
        el("button", { class: "wp-btn wp-btn-tonal", onclick: rate("yes") }, "Yes"),
        el("button", { class: "wp-btn wp-btn-tonal", onclick: rate("partly") }, "Partly"),
        el("button", { class: "wp-btn wp-btn-tonal", onclick: rate("no") }, "No")))
  ]);
}
