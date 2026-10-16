// Aim — hidden and warned channels.

// A channel you chose to hide or be warned about: ask before watching, never force.
function openChannelWarning(info, action) {
  hold();
  const name = info.channel || "this channel";
  showPlayerCard(
    el("div", { class: "wp-dialog-brand" }, icon("logo"), "Aim"),
    el("div", { class: "wp-title" }, action === "hide" ? `You chose to hide ${name}.` : `You asked to be warned about ${name}.`),
    el("div", { class: "wp-muted" }, "Change this anytime in Aim's settings."),
    el("div", { class: "wp-actions wp-actions-start" },
      el("button", { class: "wp-btn wp-btn-primary", onclick: goBack }, "Go back"),
      el("button", { class: "wp-btn wp-btn-text", onclick: () => { overridden.add(info.id); closePlayerCard(); continueAfterRules(info); } }, "Continue")));
}

// Optional channel rule, set from the dropdown while watching.
function openAvoidDialog() {
  if (!currentInfo) return;
  const info = currentInfo;
  const pick = action => async () => {
    const r = await send({ type: "avoid", key: info.channelKey, name: info.channel, action });
    closeModal();
    if (!r) return toast("Couldn't save that. Try again.");
    settings.avoid = r.avoid;
    applyHidden();
    toast(`${info.channel}: ${action === "hide" ? "hidden from your feeds" : "you'll get a warning"}`);
  };
  openModal(el("div", { class: "wp-dialog", role: "dialog", "aria-modal": "true" },
    el("div", { class: "wp-title" }, `Hide or warn about ${info.channel || "this channel"}?`),
    el("p", { class: "wp-muted" }, "Hide: its videos disappear from your homepage, search results and sidebar, and opening one asks first. Warn: Aim asks before you watch it outside a purpose. Undo either in settings."),
    el("div", { class: "wp-actions" },
      el("button", { class: "wp-btn wp-btn-text", onclick: closeModal }, "Cancel"),
      el("button", { class: "wp-btn wp-btn-tonal", onclick: pick("warn") }, "Warn me"),
      el("button", { class: "wp-btn wp-btn-primary", onclick: pick("hide") }, "Hide channel"))));
}

// ---------------- hidden channels ----------------
// Like YouTube's "Don't recommend channel": their videos drop out of feeds, results and the sidebar.
function hiddenKeys() {
  return new Set(Object.entries(settings.avoid || {}).filter(([, c]) => c.action === "hide").map(([k]) => channelPath(k)));
}

function applyHidden() {
  const hidden = hiddenKeys();
  if (!hidden.size) { for (const n of $$("[data-wp-hidden]")) n.removeAttribute("data-wp-hidden"); return; }
  for (const { box, channelKey } of videoTiles()) box.toggleAttribute("data-wp-hidden", !!channelKey && hidden.has(channelKey));
}

let hideTimer = null;
const hideObserver = new MutationObserver(() => {
  if (hideTimer || !hiddenKeys().size) return;
  hideTimer = setTimeout(() => { hideTimer = null; applyHidden(); }, 300);
});
