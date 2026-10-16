// Aim — UI building blocks: dropdown menu items, dialogs, notices and toasts.

function closeDropdown() { dropdown?.remove(); dropdown = null; }
document.addEventListener("click", e => { if (dropdown && !dropdown.contains(e.target)) closeDropdown(); });

function menuItem(iconName, text, onclick, opts = {}) {
  return el("button", { class: "wp-menu-item" + (opts.danger ? " wp-danger" : ""), onclick: () => { closeDropdown(); onclick(); } },
    icon(iconName), el("span", {}, text), opts.hint ? el("span", { class: "wp-hint" }, opts.hint) : null);
}

// ---------------- modal dialogs ----------------
function closeModal() { modal?.remove(); modal = null; }
function openModal(card) {
  closeModal();
  modal = el("div", { class: "wp wp-scrim" }, card);
  document.body.append(modal);
}
function keepKeys(input, onEnter) {
  input.addEventListener("keydown", e => {
    e.stopPropagation(); // keep YouTube shortcuts out of our text fields
    if (onEnter && e.key === "Enter" && !e.shiftKey) { e.preventDefault(); onEnter(); }
  });
}
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
