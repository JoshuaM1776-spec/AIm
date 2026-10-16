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
