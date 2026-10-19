// Aim — your channels: preferred (trusted), warned and hidden.

// A channel you chose to hide or be warned about: ask before watching, never force.
function openChannelWarning(info, action) {
  hold();
  const name = info.channel || "this channel";
  showPlayerCard(
    brandLine(),
    el("div", { class: "wp-title" }, action === "hide" ? `You chose to hide ${name}.` : `You asked to be warned about ${name}.`),
    el("div", { class: "wp-muted" }, `Change this anytime in ${BRAND}'s settings.`),
    el("div", { class: "wp-actions wp-actions-start" },
      el("button", { class: "wp-btn wp-btn-primary", onclick: goBack }, "Go back"),
      el("button", { class: "wp-btn wp-btn-text", onclick: () => withReason("channel", `Why watch ${name} this time?`, name,
        () => { overridden.add(info.id); closePlayerCard(); continueAfterRules(info); }) }, "Continue")));
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
    toast(`${info.channel}: ${action === "hide" ? "hidden from your feeds" : action === "prefer" ? "one of your channels" : "you'll get a warning"}`);
  };
  openModal(el("div", { class: "wp-dialog", role: "dialog", "aria-modal": "true" },
    el("div", { class: "wp-title" }, `How should ${BRAND} treat ${info.channel || "this channel"}?`),
    el("p", { class: "wp-muted" }, `Prefer: a channel you trust. Its videos get a “Your channel” badge in results${account.on ? `, and ${BRAND}'s librarian puts them first when they fit` : ""}. ` +
      `Warn: ${BRAND} asks before you watch it without a Target. Hide: its videos disappear from your homepage, search results and sidebar. Change any of these in settings.`),
    el("div", { class: "wp-actions" },
      el("button", { class: "wp-btn wp-btn-text", onclick: closeModal }, "Cancel"),
      el("button", { class: "wp-btn wp-btn-tonal", onclick: pick("hide") }, "Hide"),
      el("button", { class: "wp-btn wp-btn-tonal", onclick: pick("warn") }, "Warn me"),
      el("button", { class: "wp-btn wp-btn-primary", onclick: pick("prefer") }, "Prefer"))));
}

// Channels you prefer, by path, and their names (for the librarian).
const channelsBy = action => Object.entries(settings.avoid || {}).filter(([, c]) => c.action === action);
const preferredNames = () => channelsBy("prefer").map(([k, c]) => c.name || k).slice(0, 30);

// ---------------- hidden channels ----------------
// Like YouTube's "Don't recommend channel": their videos drop out of feeds, results and the sidebar.
function hiddenKeys() {
  return new Set(channelsBy("hide").map(([k]) => channelPath(k)));
}
const preferredKeys = () => new Set(channelsBy("prefer").map(([k]) => channelPath(k)));

// Hidden channels drop out; preferred ones get a "Your channel" badge.
function applyHidden() {
  const hidden = hiddenKeys(), preferred = preferredKeys();
  if (!hidden.size && !preferred.size) { for (const n of $$("[data-wp-hidden], [data-wp-preferred]")) { n.removeAttribute("data-wp-hidden"); n.removeAttribute("data-wp-preferred"); } return; }
  for (const { box, channelKey } of videoTiles()) {
    box.toggleAttribute("data-wp-hidden", !!channelKey && hidden.has(channelKey));
    box.toggleAttribute("data-wp-preferred", !!channelKey && preferred.has(channelKey));
  }
}

