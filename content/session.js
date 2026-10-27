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
  document.body.append(dropdown);
  // Right-aligned under the pill, but always inside the window, wherever YouTube puts the pill.
  const w = dropdown.offsetWidth;
  dropdown.style.left = `${Math.max(16, Math.min(r.right - w, innerWidth - w - 16))}px`;
}

// Aim's menu on YouTube mirrors the toolbar popup (popup.js): Focus or Explore, the aim with its book,
// Done and Set aside, the session tools and the session bar, in the same words and order. What only
// makes sense on YouTube (this video, this channel) follows under "This video".
const MENU_ICONS = {
  target: [22, ["path", { d: "M12 21a9 9 0 1 1 9-9M12 17a5 5 0 1 1 5-5", fill: "none", stroke: "currentColor", "stroke-width": "1.8", "stroke-linecap": "round" }],
    ["path", { d: "M12 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2zM14 10l6.5-6.5M17 3.5h3.5V7", fill: "none", stroke: "currentColor", "stroke-width": "1.8", "stroke-linecap": "round", "stroke-linejoin": "round" }]],
  hourglass: [22, ["path", { d: "M7 3.5h10M7 20.5h10M8 3.5c0 5 8 5 8 8.5s-8 3.5-8 8.5M16 3.5c0 5-8 5-8 8.5s8 3.5 8 8.5", fill: "none", stroke: "currentColor", "stroke-width": "1.8", "stroke-linecap": "round", "stroke-linejoin": "round" }]],
  talk: [22, ["path", { d: "M5 18.5l1.2-3.4A7.5 7.5 0 1 1 9 18.1z", fill: "none", stroke: "currentColor", "stroke-width": "1.8", "stroke-linejoin": "round" }]],
  library: [22, ["path", { d: "M4 5.5C6.5 4 9.5 4 12 6c2.5-2 5.5-2 8-.5V19c-2.5-1.5-5.5-1.5-8 .5-2.5-2-5.5-2-8-.5zM12 6v13.5", fill: "none", stroke: "currentColor", "stroke-width": "1.8", "stroke-linejoin": "round" }]]
};
Object.assign(ICON, MENU_ICONS);
const menuMin = sec => Math.max(0, Math.ceil(sec / 60));
const menuDur = m => (m >= 60 ? `${Math.floor(m / 60)}h${m % 60 ? ` ${m % 60}m` : ""}` : `${m} min`);
const menuAct = fn => () => { closeDropdown(); fn(); };

// Focus or Explore, as in the popup.
function menuModes() {
  const p = activePurpose(), exploring = !!p?.learn && !brk, focused = !!p && !p.learn && !brk;
  const mode = (on, ic, name, sub, go) => el("button", { class: `wp-dd-mode${on ? " wp-on" : ""}`, "aria-pressed": String(on), onclick: menuAct(go) },
    icon(ic), el("span", {}, el("b", {}, name), el("small", {}, sub)));
  return el("div", { class: "wp-dd-modes" },
    mode(focused, "target", "Focus", "Learn something specific", () => { location.href = "/"; }),
    mode(exploring, "compass", "Explore", "Follow your curiosity", () => {
      if (location.pathname === "/") { exploreOpen = true; renderHome(); } else location.href = "/#aim-explore";
    }));
}

// The session tools, as in the popup: Take a Break, the librarian, the library.
function menuTools() {
  const used = leisureUsedUp();
  return el("div", { class: "wp-dd-tools" },
    el("button", { class: "wp-dd-tool", disabled: used, onclick: menuAct(openBreakDialog) }, icon("hourglass"), "Take a Break",
      el("small", {}, used ? "None today" : "5–60 min")),
    account.on ? el("button", { class: "wp-dd-tool", onclick: menuAct(() => openTalk()) }, icon("talk"), "Librarian", el("small", {}, "Talk it through")) : null,
    el("button", { class: "wp-dd-tool", onclick: menuAct(() => send({ type: "open-targets" })) }, icon("library"), "My Library", el("small", {}, "Every aim")));
}

// What only applies to the video on screen.
function videoItems() {
  if (!currentId || !currentInfo) return [];
  return [
    menuItem("save", "Save this video for later", () => saveCurrent(false)),
    menuItem("avoid", "Sort this channel", openAvoidDialog)
  ];
}
function videoSection(extra = []) {
  const items = [...extra, ...videoItems()].filter(Boolean);
  return items.length ? el("div", { class: "wp-menu-items" }, el("div", { class: "wp-dd-label wp-dd-pad" }, currentId ? "This video" : "More"), ...items) : null;
}

// The aim's book, as on the library's shelf and in the popup (its subject comes from the aim's page data).
const menuBooks = new Map();
function menuBook(p) {
  const box = el("span", { class: "wp-dd-book" });
  const put = a => box.replaceChildren(cover(a, "small"));
  if (menuBooks.has(p.id)) put(menuBooks.get(p.id));
  else send({ type: "aim-get", id: p.id }).then(d => { if (d?.aim) { menuBooks.set(p.id, d.aim); put(d.aim); } });
  return box;
}

function purposeMenu() {
  const p = activePurpose();
  const parts = p.map?.parts || [];
  const sub = parts.length ? `${parts.filter(x => x.status === "explained").length} of ${parts.length} explained` : `${menuDur(Math.max(1, menuMin(p.usedSec)))} so far`;
  const card = el("div", { class: "wp-dd-card" },
    el("div", { class: "wp-dd-label" }, p.learn ? "Exploring" : "Your aim"),
    el("div", { class: "wp-dd-aimrow" },
      menuBook(p),
      el("button", { class: "wp-dd-aimlink", title: "Open this aim's page", onclick: menuAct(() => send({ type: "open-aim", id: p.id })) },
        el("span", { class: "wp-dd-title" }, p.learn ? `Exploring: ${p.learn}` : p.text), el("span", { class: "wp-muted" }, sub)),
      el("button", { class: "wp-dd-change", title: "Change my aim", onclick: menuAct(() => openPivotDialog()) }, "Change", icon("right"))),
    el("div", { class: "wp-dd-actions" },
      el("button", { class: "wp-btn wp-btn-primary", onclick: menuAct(doneAction(p)) }, icon("check2"), doneLabel(p) === "Done with this aim" ? "Done" : doneLabel(p)),
      el("button", { class: "wp-btn wp-btn-tonal", onclick: menuAct(setAsideTarget) }, icon("pause"), "Set aside")),
    el("div", { class: "wp-dd-label", style: "margin-top:14px" }, "Session tools"),
    menuTools(),
    p.limitMin ? el("div", { class: "wp-dd-limit" },
      el("span", {}, `Session · ${Math.min(p.limitMin, menuMin(p.usedSec))} of ${p.limitMin} minutes`),
      el("div", { class: "wp-bar" }, el("i", { style: `width:${Math.min(100, (menuMin(p.usedSec) / p.limitMin) * 100)}%` })))
      : el("div", { class: "wp-dd-limit" }, el("span", { class: "wp-muted" }, "No time limit"),
          el("button", { class: "wp-link", onclick: menuAct(openLimitDialog) }, "Set one")),
    el("div", { class: "wp-dd-more" },
      el("button", { class: "wp-link-muted", onclick: menuAct(() => openPivotDialog()) }, "Change my aim"),
      el("button", { class: "wp-link-muted", onclick: menuAct(openNotesDialog) }, p.notes ? "Notes" : "Add notes"),
      p.limitMin ? el("button", { class: "wp-link-muted", onclick: menuAct(openLimitDialog) }, "Time limit") : null));
  return [menuModes(), card, videoSection(), focusBlock()].filter(Boolean);
}

function breakMenu() {
  const left = breakLeft(brk);
  const waiting = purpose?.suspended ? purpose : null;
  const card = el("div", { class: "wp-dd-card" },
    el("div", { class: "wp-dd-label" }, brk.theme ? `Relaxing: ${brk.theme.text}` : "On a break"),
    el("div", { class: "wp-dd-big" }, brk.oneVideoId ? "Just this video" : left !== null ? `${menuDur(menuMin(left))} left` : "No limit"),
    left !== null && brk.durationMin ? el("div", { class: "wp-dd-limit" }, el("span", { class: "wp-muted" }, `of ${menuDur(brk.durationMin)}`),
      el("div", { class: "wp-bar" }, el("i", { style: `width:${Math.min(100, (left / (brk.durationMin * 60)) * 100)}%` }))) : null,
    waiting ? el("div", { class: "wp-muted wp-ellipsis", style: "margin-top:8px" }, `Your aim is waiting: ${waiting.text}`) : null,
    el("div", { class: "wp-dd-actions" },
      el("button", { class: "wp-btn wp-btn-primary", onclick: menuAct(endBreakNow) }, waiting ? "Back to my aim" : "End break"),
      !brk.oneVideoId && !leisureUsedUp() ? el("button", { class: "wp-btn wp-btn-tonal", onclick: menuAct(extendBreakNow) }, "+15 min")
        : el("button", { class: "wp-btn wp-btn-tonal", onclick: menuAct(() => send({ type: "open-targets" })) }, "My Library")));
  // The homepage card is hidden during a break, so set-aside aims can be picked up from here.
  const resumes = waiting ? [] : [menuItem("pivot", "Set aim", () => openStartDialog()),
    ...(status.paused || []).slice(0, 2).map(t => menuItem("play", `Resume: ${shorten(t.text, 34)}`, () => resumeTarget(t.id)))];
  return [menuModes(), card, videoSection(resumes)].filter(Boolean);
}

function idleMenu() {
  if (status.totalReached) return [el("div", { class: "wp-dd-card" },
    el("div", { class: "wp-strong" }, "That's today's YouTube time"),
    el("div", { class: "wp-muted" }, "Your daily limit resets at midnight."))];
  const card = el("div", { class: "wp-dd-card" },
    el("div", { class: "wp-strong" }, "No aim set"),
    el("div", { class: "wp-muted" }, "Tell Aim what you're looking for, or take a break."),
    el("div", { class: "wp-dd-actions" },
      el("button", { class: "wp-btn wp-btn-primary", onclick: menuAct(() => openStartDialog()) }, "Set aim"),
      el("button", { class: "wp-btn wp-btn-tonal", disabled: leisureUsedUp(), onclick: menuAct(openBreakDialog) }, "Take a Break")),
    el("div", { class: "wp-dd-more" },
      el("button", { class: "wp-link-muted", onclick: menuAct(() => send({ type: "open-targets" })) }, "My Library")));
  const resumes = (status.paused || []).slice(0, 2).map(t => menuItem("play", `Resume: ${shorten(t.text, 34)}`, () => resumeTarget(t.id)));
  return [menuModes(), card, videoSection(resumes), focusBlock()].filter(Boolean);
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
