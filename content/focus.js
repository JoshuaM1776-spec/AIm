// Aim — fewer distractions whenever you're not on a break: Shorts, recommendations and end
// screens, the subscriptions and trending feeds, and autoplay. A break restores YouTube as usual.
// The hiding itself is CSS (content.css), keyed on classes set here on <html>, so it applies
// before YouTube draws anything; early.js sets the same classes when the page starts.

const FOCUS_CLASSES = { hideShorts: "wp-hide-shorts", hideRecs: "wp-hide-recs", hideFeeds: "wp-hide-feeds" };

function syncFocus() {
  const root = document.documentElement;
  root.classList.toggle("wp-focus", !brk);
  for (const [key, cls] of Object.entries(FOCUS_CLASSES)) root.classList.toggle(cls, settings[key] !== false);
  syncAutoplay();
  renderFeedNote();
}

// "Shorts, recommendations and feeds are hidden · autoplay is off", for the menu.
function focusSummary() {
  const hidden = [settings.hideShorts !== false && "Shorts", settings.hideRecs !== false && "recommendations",
    settings.hideFeeds !== false && "feeds"].filter(Boolean);
  const parts = [];
  if (hidden.length) parts.push(`${hidden.join(", ").replace(/, ([^,]*)$/, " and $1")} hidden`);
  if (settings.noAutoplay !== false) parts.push("autoplay off");
  return parts.length ? parts.join(" · ").replace(/^./, c => c.toUpperCase()) : "YouTube as usual";
}

function focusBlock() {
  return el("div", { class: "wp-menu-block wp-row-between" },
    el("span", { class: "wp-muted" }, focusSummary()),
    el("button", { class: "wp-link", onclick: () => { closeDropdown(); send({ type: "open-options", section: "advanced" }); } }, "Adjust"));
}

// ---------------- autoplay ----------------
// Aim switches YouTube's own autoplay toggle off while you're not on a break, and back on
// afterwards, but only if it was Aim that switched it off.
const AUTOPLAY_RESTORE = "aim-autoplay-restore";
const remember = on => { try { on ? localStorage.setItem(AUTOPLAY_RESTORE, "1") : localStorage.removeItem(AUTOPLAY_RESTORE); } catch {} };
const remembered = () => { try { return localStorage.getItem(AUTOPLAY_RESTORE) === "1"; } catch { return false; } };

function syncAutoplay() {
  const toggle = autoplayToggle();
  if (!toggle) return;
  const on = toggle.getAttribute("aria-checked") === "true";
  const wantOff = !brk && settings.noAutoplay !== false;
  const flip = () => (toggle.closest("button") || toggle).click();
  if (wantOff && on) { flip(); remember(true); }
  else if (!wantOff && !on && remembered()) { flip(); remember(false); }
}

// ---------------- feeds ----------------
// Subscriptions and trending are replaced by a short note, like the homepage card.
function renderFeedNote() {
  const host = !brk && settings.hideFeeds !== false ? feedBrowse() : null;
  const existing = $("#wp-feed-note");
  if (!host) { existing?.remove(); return; }
  const p = activePurpose();
  const key = `${p?.text || ""}|${leisureUsedUp()}`;
  if (existing && existing.parentElement === host && existing.dataset.key === key) return;
  existing?.remove();
  host.prepend(el("div", { id: "wp-feed-note", class: "wp wp-home-card wp-feed-note", "data-key": key },
    brandLine(),
    el("div", { class: "wp-title" }, p ? "Feeds are hidden while you're on purpose" : "Feeds are hidden until you choose"),
    el("div", { class: "wp-muted" }, p ? `Your purpose: ${p.text}` : "Search for what you came for, or take a break to browse."),
    el("div", { class: "wp-label wp-home-break-label" }, "Take a break to browse"),
    breakChips(takeBreak)));
}

// ---------------- Shorts ----------------
// Opening a Short while you're on purpose: it waits behind a card, like any other drift.
function showShortsCard() {
  hold();
  const p = activePurpose();
  showPlayerCard(
    brandLine(),
    el("div", { class: "wp-title" }, "Shorts are hidden while you're on purpose"),
    p ? el("div", { class: "wp-current" }, el("div", { class: "wp-label" }, "Your purpose"), el("div", { class: "wp-strong" }, p.text)) : null,
    el("div", { class: "wp-actions wp-actions-start" },
      el("button", { class: "wp-btn wp-btn-primary", onclick: goBack }, "Back to my purpose")),
    el("div", { class: "wp-label" }, "Or take a break"),
    breakChips(takeBreak));
}
