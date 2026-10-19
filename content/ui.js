// Aim — UI building blocks: dropdown menu items, dialogs, notices and toasts.

function closeDropdown() { dropdown?.remove(); dropdown = null; }
document.addEventListener("click", e => { if (dropdown && !dropdown.contains(e.target)) closeDropdown(); });

function menuItem(iconName, text, onclick, opts = {}) {
  return el("button", { class: "wp-menu-item" + (opts.danger ? " wp-danger" : ""), onclick: () => { closeDropdown(); onclick(); } },
    icon(iconName), el("span", {}, text), opts.hint ? el("span", { class: "wp-hint" }, opts.hint) : null);
}

// ---------------- modal dialogs ----------------
// Like YouTube's dialogs, Escape or a click outside closes one. Dialogs that hold a video
// waiting for your decision pass { dismiss: null }, so only their own buttons close them.
let modalDismiss = null;
function closeModal() { modal?.remove(); modal = null; modalDismiss = null; }
function openModal(card, { dismiss = closeModal } = {}) {
  closeModal();
  // Dismissible dialogs get a close button, top right, like YouTube's own.
  if (dismiss && card.classList.contains("wp-dialog") && !card.querySelector(":scope > .wp-dialog-close"))
    card.prepend(el("button", { class: "wp-icon-btn wp-dialog-close", "aria-label": "Close", title: "Close", onclick: () => modalDismiss?.() }, svgIcon("close")));
  modal = el("div", { class: "wp wp-scrim", onclick: e => { if (e.target === modal) modalDismiss?.(); } }, card);
  modalDismiss = dismiss;
  document.body.append(modal);
}
function keepKeys(input, onEnter) {
  input.addEventListener("keydown", e => {
    e.stopPropagation(); // keep YouTube shortcuts out of our text fields
    if (e.key === "Escape") return modalDismiss?.();
    if (onEnter && e.key === "Enter" && !e.shiftKey) { e.preventDefault(); onEnter(); }
  });
}
document.addEventListener("keydown", e => {
  if (e.key !== "Escape") return;
  if (dropdown) { closeDropdown(); $("#wp-chip .wp-pill")?.focus(); e.stopPropagation(); }
  else if (modal && modalDismiss) { modalDismiss(); e.stopPropagation(); }
}, true);
function chips(values, selected, fmt) {
  let value = selected;
  const row = el("div", { class: "wp-chips" });
  const render = () => {
    row.replaceChildren(...values.map(v => el("button", {
      class: "wp-chip" + (v === value ? " wp-chip-on" : ""),
      onclick: () => { value = v; render(); }
    }, fmt(v))));
  };
  render();
  return { row, get: () => value };
}
// ---------------- player card ----------------
// Decisions about the video on screen appear over the player itself, not as a page-wide
// dialog: the rest of YouTube stays usable around it.
function closePlayerCard() { playerCard?.remove(); playerCard = null; }
function showPlayerCard(...content) {
  closePlayerCard();
  closeModal();
  const host = playerHost();
  playerCard = el("div", { class: "wp wp-player-card" + (host ? "" : " wp-player-card-floating") },
    el("div", { class: "wp-pc-inner", role: "dialog", "aria-label": BRAND }, ...content));
  (host || document.body).append(playerCard);
  return playerCard;
}

// Chips for starting a break: 15 / 30 / 60 minutes, plus "Just this video" when on one.
// Disabled, with the reason, when today's leisure time is used up.
function breakChips(onPick, { oneVideoId = null } = {}) {
  const used = leisureUsedUp();
  const left = status.leisureLeftMin;
  const row = el("div", { class: "wp-chips" });
  // Custom: the row turns into "[ 20 ] min  Start".
  const custom = () => {
    const input = el("input", { class: "wp-input wp-custom-min", type: "number", min: "1", max: String(left ?? 600), value: String(Math.min(20, left ?? 20)), "aria-label": "Break length in minutes" });
    const go = () => { const m = parseInt(input.value, 10); if (m > 0) onPick({ minutes: m }); };
    keepKeys(input, go);
    row.replaceChildren(input, el("span", { class: "wp-muted" }, "min"), el("button", { class: "wp-chip wp-chip-on", onclick: go }, "Start break"));
    setTimeout(() => { input.focus(); input.select(); }, 0);
  };
  row.append(...[
    oneVideoId ? el("button", { class: "wp-chip", disabled: used, onclick: () => onPick({ oneVideoId }) }, "Just this video") : null,
    ...BREAK_CHOICES.map(m => el("button", { class: "wp-chip", disabled: used || (left !== null && left < m && m !== BREAK_CHOICES[0]), onclick: () => onPick({ minutes: m }) }, minLabel(m))),
    el("button", { class: "wp-chip", disabled: used, onclick: custom }, "Custom")].filter(Boolean));
  const note = el("div", { class: "wp-muted" }, used ? "Today's leisure time is used up. It resets at midnight."
    : left !== null ? `${left} min of leisure time left today.` : "");
  return el("div", { class: "wp-break-pick" }, row, note);
}

// "Take a Break": pick a length (or Custom), then Start Break. Breaks always draw on the daily
// leisure allowance, which the dialog shows.
function openBreakDialog() {
  closeDropdown();
  const used = leisureUsedUp();
  const left = status.leisureLeftMin;
  let choice = left !== null && left < 30 ? 15 : 30;
  const opts = el("div", { class: "wp-opts", role: "radiogroup", "aria-label": "Break length" });
  const customRow = el("div", { class: "wp-break-custom", hidden: true });
  const customInput = el("input", { class: "wp-input wp-custom-min", type: "number", min: "1", max: String(left ?? 600), value: String(Math.min(20, left ?? 20)), "aria-label": "Break length in minutes" });
  customRow.append(customInput, el("span", { class: "wp-muted" }, "minutes"));
  const render = () => {
    opts.replaceChildren(...[...BREAK_CHOICES, "custom"].map(v => el("button", {
      class: "wp-opt" + (v === choice ? " on" : ""), role: "radio", "aria-checked": String(v === choice),
      disabled: used || (typeof v === "number" && left !== null && left < v && v !== BREAK_CHOICES[0]),
      onclick: () => { choice = v; render(); if (v === "custom") setTimeout(() => { customInput.focus(); customInput.select(); }, 0); }
    }, v === "custom" ? "Custom" : v >= 60 ? `${v / 60} hour${v > 60 ? "s" : ""}` : `${v} minutes`)));
    customRow.hidden = choice !== "custom";
  };
  render();
  const start = () => {
    const minutes = choice === "custom" ? parseInt(customInput.value, 10) : choice;
    if (minutes > 0) takeBreak({ minutes });
  };
  keepKeys(customInput, start);
  openModal(el("div", { class: "wp-dialog wp-dialog-center wp-break-dialog", role: "dialog", "aria-modal": "true" },
    el("div", { class: "wp-title wp-dialog-icon" }, icon("coffee"), "Take a Break"),
    el("div", { class: "wp-sub" }, `Browse YouTube freely for a little while. ${BRAND} brings you back when your break ends.`),
    opts, customRow,
    el("button", { class: "wp-btn wp-btn-primary wp-btn-block", disabled: used, onclick: start }, "Start Break"),
    el("div", { class: "wp-muted" }, used ? "Today's leisure time is used up. It resets at midnight."
      : left !== null ? `Counts toward today's leisure time: ${left} min left.` : "Counts toward today's leisure time.")));
}

// Start a break; afterwards, re-check the video on screen under the new state.
async function takeBreak(choice) {
  const r = await send({ type: "break-start", ...choice });
  if (!r || r.result !== "applied") return toast(r?.message || "Couldn't start a break.");
  closeDropdown();
  closeModal();
  applyStatus(await send({ type: "status" }));
  renderChip();
  syncFocus();
  route();
  if (r.capped) toast(`Break set to ${r.capped} min: what's left of today's leisure time.`);
  else toast(choice.oneVideoId ? "Enjoy the video." : `Break: ${choice.minutes} minutes.`);
  if (currentId) regate(currentId);
  // A break is a good moment for the videos you saved for later.
  const saved = status.saved || [];
  if (!choice.oneVideoId && saved.length) showNotice([el("div", { class: "wp-notice-text" },
    el("b", {}, saved.length === 1 ? "You saved a video for later. Watch it now?" : `You saved ${saved.length} videos for later. Watch one now?`),
    savedRow(saved, 3))]);
}

// A break ran out: back to your Target (already resumed), or more break while leisure time lasts.
function showBreakOver(kind) {
  const p = activePurpose();
  const more = kind === "break" && !leisureUsedUp();
  const left = p ? purposeLeft(p) : null;
  openModal(el("div", { class: "wp-dialog wp-dialog-center wp-break-over", role: "dialog", "aria-modal": "true" },
    el("span", { class: "wp-icon" }, svgIcon("logo")),
    el("div", { class: "wp-title" }, kind === "leisure" ? "That's today's leisure time" : "Break time is up"),
    el("div", { class: "wp-sub" }, p ? "Ready to get back to your Target?" : "What's next?"),
    p ? el("div", { class: "wp-return" },
      p.last?.id ? el("div", { class: "wp-return-thumb", style: `background-image:url("https://i.ytimg.com/vi/${encodeURIComponent(p.last.id)}/mqdefault.jpg")` }) : null,
      el("div", { style: "min-width:0" }, el("div", { class: "wp-strong wp-ellipsis" }, p.text),
        el("div", { class: "wp-muted" }, left !== null ? `${fmtMin(left)} remaining` : `${fmtMin(p.usedSec || 0)} so far`))) : null,
    p ? el("button", { class: "wp-btn wp-btn-accent wp-btn-block", onclick: closeModal }, "Back on Target")
      : el("button", { class: "wp-btn wp-btn-primary wp-btn-block", onclick: () => { closeModal(); openStartDialog(); } }, "Set Target"),
    more ? el("button", { class: "wp-btn wp-btn-tonal wp-btn-block", onclick: () => { closeModal(); takeBreak({ minutes: 15 }); } }, "Extend break (15 min)") : null,
    el("button", { class: "wp-btn wp-btn-text wp-btn-block", onclick: closeModal }, "Keep browsing for now")));
}

// ---------------- notices (bottom bar, YouTube-toast style) ----------------
function closeNotice() { notice?.remove(); notice = null; }
function showNotice(content, { dismissible = true } = {}) {
  closeNotice();
  notice = el("div", { class: "wp wp-notice", role: "status" }, ...content,
    dismissible ? el("button", { class: "wp-icon-btn", "aria-label": "Dismiss", onclick: closeNotice }, svgIcon("close")) : null);
  document.body.append(notice);
  return notice;
}
function toast(text) {
  const t = el("div", { class: "wp wp-toast" }, text);
  document.body.append(t);
  setTimeout(() => t.remove(), 3200);
}
