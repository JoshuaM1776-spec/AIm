// Aim — the indicator in YouTube's top bar and what it opens: the current purpose or break,
// time left, Take a break, Change my aim, Done.

// ---------------- top-bar indicator ----------------
// One pill shaped like YouTube's own Create button. It sits beside the search box when the
// window is wide enough, and joins the buttons on the right when it isn't.
const CHIP_BESIDE_SEARCH_MIN_WIDTH = 1200;
const shorten = (t, n) => (t.length > n ? t.slice(0, n - 1).trimEnd() + "…" : t);

function chipContent() {
  if (status.totalReached) return { label: "Done for today", time: null };
  if (brk) return { label: brk.theme ? `Relax: ${shorten(brk.theme.text, 22)}` : "Break", time: brk.oneVideoId ? "1 video" : `${fmtClock((breakEndsAt - Date.now()) / 1000)} left` };
  const p = activePurpose();
  if (p) return { label: shorten(p.text, 28), time: p.timeUp ? "Time's up" : purposeLeft(p) !== null ? fmtMin(purposeLeft(p)) : null };
  return { label: "Set aim", time: null };
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
  // A timed break's countdown ticks in place instead (see tickCountdown).
  const sig = `${label}|${brk?.durationMin ? `break:${brk.id}` : time}`;
  if (chip.dataset.sig === sig) return tickCountdown();
  chip.dataset.sig = sig;
  chip.replaceChildren(...[el("button", {
    class: "wp-pill" + (brk ? " wp-pill-break" : ""), title: purpose?.text ? `${BRAND}: ${purpose.text}` : BRAND, "aria-haspopup": "menu",
    onclick: e => { e.stopPropagation(); dropdown ? closeDropdown() : openDropdown(); }
  }, icon(brk ? "coffee" : "logo"), el("span", { class: "wp-pill-label" }, label),
    time ? el("span", { class: "wp-pill-time" }, time) : null, icon("chevron")),
    brk ? el("button", { class: "wp-icon-btn wp-chip-end", title: "End break", "aria-label": "End break", onclick: e => { e.stopPropagation(); endBreakNow(); } }, svgIcon("close")) : null]
    .filter(Boolean)); // replaceChildren would print a null as the text "null"
}

// The break countdown, every second, without rebuilding the indicator.
function tickCountdown() {
  if (!brk?.durationMin) return;
  const t = $("#wp-chip .wp-pill-time");
  if (t) t.textContent = `${fmtClock((breakEndsAt - Date.now()) / 1000)} left`;
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
  return el("div", { class: "wp-menu-items" }, menuItem("coffee", "Take a break", openBreakDialog,
    { hint: leisureUsedUp() ? "none left today" : status.leisureLeftMin !== null ? `${status.leisureLeftMin} min left` : "" }));
}

function videoItems() {
  if (!currentId || !currentInfo) return [];
  return [
    menuItem("save", "Save this video for later", () => saveCurrent(false)),
    menuItem("avoid", "Sort this channel", openAvoidDialog)
  ];
}

function purposeMenu() {
  const p = activePurpose();
  const left = purposeLeft(p);
  const head = el("button", { class: "wp-menu-head", onclick: () => { closeDropdown(); openPivotDialog(); } },
    el("div", {}, el("div", { class: "wp-label" }, "Your aim"), el("div", { class: "wp-strong" }, p.text)),
    icon("right"));
  const time = left !== null ? timeBlock("Time limit", left, p.limitMin * 60)
    : el("div", { class: "wp-menu-block wp-row-between" },
        el("span", { class: "wp-muted" }, "No time limit"),
        el("button", { class: "wp-link", onclick: () => { closeDropdown(); openLimitDialog(); } }, "Set one"));
  const searches = p.searches.length > 1 ? el("div", { class: "wp-menu-block" },
    el("div", { class: "wp-label" }, "Searches toward this aim"),
    el("div", { class: "wp-muted" }, p.searches.slice(-4).map(s => s.q).join(" · "))) : null;
  return [head, time, searches, focusBlock(), breakBlock(), el("div", { class: "wp-menu-items" },
    menuItem("check2", doneLabel(activePurpose()), doneAction(activePurpose())),
    menuItem("pivot", "Change my aim", () => openPivotDialog()),
    menuItem("pause", "Set aside for later", setAsideTarget),
    menuItem("book", p.notes ? "Notes" : "Add notes", openNotesDialog),
    account.on && (p.videos || []).length ? menuItem("ask", "Talk it through", () => openTalk()) : null,
    left !== null ? menuItem("clock", "Change time limit", openLimitDialog) : null,
    ...videoItems())].filter(Boolean);
}

function breakMenu() {
  const left = breakLeft(brk);
  const waiting = purpose?.suspended ? purpose : null;
  const head = el("div", { class: "wp-menu-block wp-menu-first" },
    el("div", { class: "wp-label" }, brk.theme ? `Relaxing: ${brk.theme.text}` : "On a break"),
    el("div", { class: "wp-strong" }, brk.oneVideoId ? "Just this video" : `${fmtMin(left)} left`),
    left !== null ? el("div", { class: "wp-bar" }, el("i", { style: `width:${Math.min(100, (left / (brk.durationMin * 60)) * 100)}%` })) : null,
    waiting ? el("div", { class: "wp-muted wp-ellipsis", style: "margin-top:8px" }, `Your aim is waiting: ${waiting.text}`) : null);
  return [head, el("div", { class: "wp-menu-items" },
    waiting ? menuItem("play", "Back to my aim", endBreakNow) : menuItem("pivot", "Set aim", () => openStartDialog()),
    // The homepage card is hidden during a break, so set-aside aims can be picked up from here.
    ...(waiting ? [] : (status.paused || []).slice(0, 2).map(t => menuItem("play", `Resume: ${shorten(t.text, 34)}`, () => resumeTarget(t.id)))),
    !brk.oneVideoId && !leisureUsedUp() ? menuItem("clock", "Add 15 minutes", extendBreakNow) : null,
    menuItem("end", "End break", endBreakNow),
    ...videoItems())].filter(Boolean);
}

function idleMenu() {
  return [el("div", { class: "wp-menu-block wp-menu-first" },
    el("div", { class: "wp-strong" }, status.totalReached ? "That's today's YouTube time" : "What brings you here?"),
    el("div", { class: "wp-muted" }, status.totalReached ? "Your daily limit resets at midnight." : "Set an aim, or take a break.")),
    status.totalReached ? null : el("div", { class: "wp-menu-items" }, menuItem("pivot", "Set aim", () => openStartDialog())),
    status.totalReached ? null : focusBlock(),
    status.totalReached ? null : breakBlock()].filter(Boolean);
}

async function endBreakNow() {
  applyStatus(await send({ type: "break-end" }) && await send({ type: "status" }));
  renderChip();
  route();
  toast(purpose ? `Back to my aim: ${purpose.text}` : "Break ended.");
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
// "Recent aims": one tap fills the box (it still needs confirming).
function recentList(input) {
  const recent = (status.recent || []).filter(t => t !== purpose?.text);
  if (!recent.length) return null;
  return el("div", { class: "wp-recent" },
    el("div", { class: "wp-label" }, "Recent aims"),
    ...recent.map(t => el("button", { class: "wp-recent-item", onclick: () => { input.value = t; input.focus(); } }, icon("clock"), el("span", { class: "wp-ellipsis" }, t))));
}

// Set a purpose from the indicator (the homepage card and searching do the same).
function openStartDialog() {
  closeDropdown();
  const input = el("input", { type: "text", placeholder: "What do you want to find or learn?", "aria-label": "Your aim" });
  const err = el("div", { class: "wp-error" });
  const start = async () => {
    // Set from a video page, the purpose includes the video on screen.
    const video = currentId && currentInfo?.id === currentId ? { id: currentId, title: currentInfo.title, channel: currentInfo.channel } : undefined;
    const r = await send({ type: "purpose-start", text: input.value, video });
    if (!r || r.result !== "applied") { err.textContent = r?.message || "Couldn't set that. Try again."; return; }
    applyStatus(await send({ type: "status" }));
    closeModal();
    renderChip();
    route();
    if (currentId) regate(currentId);
  };
  keepKeys(input, start);
  openModal(el("div", { class: "wp-dialog", role: "dialog", "aria-modal": "true" },
    brandLine(),
    el("label", { class: "wp-q" }, "What brings you here?"),
    el("div", { class: "wp-field" }, icon("search"), input), recentList(input), err,
    el("div", { class: "wp-actions" },
      el("button", { class: "wp-btn wp-btn-text", onclick: closeModal }, "Cancel"),
      el("button", { class: "wp-btn wp-btn-primary", onclick: start }, "Set aim"))));
  setTimeout(() => input.focus(), 50);
}

// The intentional pivot: a new aim. The current one is set aside, to resume later.
// From a video that didn't fit, pass it as `video`: the new aim includes it.
function openPivotDialog(prefill = "", { afterConfirm = null, video = null } = {}) {
  closeDropdown();
  if (!purpose) return openStartDialog();
  const input = el("input", { type: "text", placeholder: "What do you want to find or learn?", "aria-label": "New aim" });
  input.value = typeof prefill === "string" ? prefill : "";
  const err = el("div", { class: "wp-error" });
  const confirm = async () => {
    const v = video ? { id: video.id, title: video.title, channel: video.channel } : undefined;
    const r = await send({ type: "purpose-pivot", text: input.value, video: v });
    if (!r || r.result !== "applied") { err.textContent = r?.message || "Couldn't change the aim. Try again."; return; }
    if (afterConfirm) await afterConfirm();
    applyStatus(await send({ type: "status" }));
    closeModal();
    renderChip();
    route();
    toast(r.setAside ? `New aim. "${shorten(r.setAside, 40)}" is set aside for later.` : `New aim: ${purpose.text}`);
    if (currentId) regate(currentId);
  };
  keepKeys(input, confirm);
  openModal(el("div", { class: "wp-dialog", role: "dialog", "aria-modal": "true" },
    el("div", { class: "wp-title" }, "Change my aim"),
    el("div", { class: "wp-current" }, el("div", { class: "wp-label" }, "Your aim"), el("div", { class: "wp-strong" }, purpose.text)),
    el("div", { class: "wp-field" }, icon("search"), input), recentList(input),
    el("p", { class: "wp-muted" }, "Your current aim is set aside with its searches and videos. Pick it up again from the homepage anytime."), err,
    el("div", { class: "wp-actions" },
      el("button", { class: "wp-btn wp-btn-text", onclick: closeModal }, "Cancel"),
      el("button", { class: "wp-btn wp-btn-primary", onclick: confirm }, "Change my aim"))));
  setTimeout(() => input.focus(), 50);
}

// Clarifying is not pivoting: same goal, said more precisely.
function openRefineDialog() {
  if (!purpose) return;
  const input = el("textarea", { class: "wp-input", rows: "2" });
  input.value = purpose.text;
  keepKeys(input);
  openModal(el("div", { class: "wp-dialog", role: "dialog", "aria-modal": "true" },
    el("div", { class: "wp-title" }, "Edit your aim"),
    el("p", { class: "wp-muted" }, "Say the same goal more precisely. To go somewhere new, use Change my aim."),
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
// Done is one tap. What it was like comes after, on the homepage, in one light card: the time and
// videos, Test my understanding (Plus, for learning), a quiet "Found what you needed?", and a way
// back in if Done was a slip. A quick lookup says "Got my answer" instead.
const isLookup = p => p?.librarian?.kind === "lookup" && !p.study && !p.plan;
const doneLabel = p => (isLookup(p) ? "Got my answer" : "Done with this aim");
const doneAction = p => (isLookup(p) ? () => finishPurpose("yes") : () => finishPurpose(null));
const askDone = () => finishPurpose(null);

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
  if (s.outcome) return toast(s.outcome === "yes" ? "Done. Glad you found it." : "Done. Noted for next time.");
  const mins = Math.max(1, Math.round(s.usedSec / 60));
  const learning = s.kind === "learn" || !!s.study || !s.kind;
  const brief = learning ? await send({ type: "plus-brief" }) : null, plus = brief?.plus === true;
  // Signed in, a learning aim gets the librarian's question in place of "Found what you needed?" and
  // Test my understanding: one prompt, not three. If it can't open, those come back.
  const talkable = !!brief?.account && (s.videos || []).some(v => (v.sec || 0) >= 20);
  const rated = el("div", { class: "wp-end-rate" });
  const rate = outcome => async () => {
    await send({ type: "purpose-rate", id: s.id, outcome });
    rated.replaceChildren(el("span", { class: "wp-muted" }, outcome === "yes" ? "Nice work." : "Noted. That's useful to know."));
  };
  rated.append(el("span", { class: "wp-muted" }, "Found what you needed?"),
    ...[["yes", "Yes"], ["partly", "Partly"], ["no", "No"]].map(([v, label]) => el("button", { class: "wp-link", onclick: rate(v) }, label)));
  const close = () => { homeEnd?.remove(); homeEnd = null; closeNotice(); };
  const teach = plus ? el("button", { class: "wp-btn wp-btn-tonal", onclick: () => { close(); send({ type: "open-teachback", topic: s.text }); } }, "Test my understanding") : null;
  const slot = el("div", { class: "wp-end-talk" }, talkable ? el("div", { class: "wp-talk-msg wp-talk-typing", "aria-label": "The librarian is reading your session" }, el("i"), el("i"), el("i")) : rated);
  if (talkable) {
    if (teach) teach.hidden = true;
    prepareTalk({ aimId: s.id, source: "done" }).then(state => {
      if (state.error) { slot.replaceChildren(rated); if (teach) teach.hidden = false; return; }
      slot.replaceChildren(talkInvite(state, { onEnd: () => slot.replaceChildren() }));
    });
  }
  const parts = [
    el("span", { class: "wp-notice-icon wp-accent" }, icon("check")),
    el("div", { class: "wp-notice-text" },
      el("div", { class: "wp-strong" }, `Done · ${mins} min on ${s.text}`),
      s.videos?.length ? el("div", { class: "wp-muted" }, `${s.videos.length} video${s.videos.length > 1 ? "s" : ""}`) : null,
      slot,
      // With Pathways on, a learning aim asks once whether you'd like more of it.
      status.pathways && learning ? interestChips({ topic: s.study?.title || s.text, source: "target" }) : null),
    el("div", { class: "wp-notice-actions wp-col" },
      teach,
      el("button", { class: "wp-link", onclick: () => { close(); resumeTarget(s.id); } }, "Not done? Pick it back up"))];
  // On Aim's homepage it sits at the top of the card, so it never covers anything; elsewhere it's a notice.
  if (location.pathname !== "/" || !settings.homeCard || brk || planOn()) return showNotice(parts);
  homeEnd = el("div", { class: "wp-home-end", role: "status" }, ...parts,
    el("button", { class: "wp-icon-btn", "aria-label": "Dismiss", onclick: close }, svgIcon("close")));
  const card = $("#wp-home");
  if (card) delete card.dataset.key;
  renderHome();
}
