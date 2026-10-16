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
}

// A break ran out: back to your purpose (already resumed), or more break while leisure time lasts.
function showBreakOver(kind) {
  const p = activePurpose();
  const more = kind === "break" && !leisureUsedUp();
  showNotice([
    el("span", { class: "wp-notice-icon" }, icon("logo")),
    el("div", { class: "wp-notice-text" },
      el("div", { class: "wp-strong" }, kind === "leisure" ? "That's today's leisure time" : "Break time is up"),
      el("div", { class: "wp-muted wp-ellipsis" }, p ? `Ready to get back to: ${p.text}` : "What's next?")),
    el("div", { class: "wp-notice-actions" },
      p ? el("button", { class: "wp-btn wp-btn-primary", onclick: closeNotice }, "Return to my purpose")
        : el("button", { class: "wp-btn wp-btn-primary", onclick: () => { closeNotice(); openStartDialog(); } }, "Set a purpose"),
      more ? el("button", { class: "wp-btn wp-btn-tonal", onclick: () => { closeNotice(); takeBreak({ minutes: 15 }); } }, "Extend break (15 min)") : null)
  ], { dismissible: false });
  notice.dataset.kind = "break-over";
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
