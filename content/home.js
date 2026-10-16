// Aim — the homepage card that replaces the feed.

// ---------------- homepage: "What brings you here?" ----------------
// Example purposes on the card: one tap fills the search box.
const EXAMPLES = ["Learn cabinetmaking", "Understand the Roman Republic", "Fix my truck", "Improve my photography"];

function removeHome() {
  early.showFeed();
  document.documentElement.classList.remove("wp-home");
  $("#wp-home")?.remove();
}

// Searching from the card is a YouTube search; the results page makes it your purpose.
function goSearch(query) {
  location.href = "/results?search_query=" + encodeURIComponent(query);
}

async function renderHome() {
  if (location.pathname !== "/") return;
  if (!settings.homeCard || brk) return removeHome();
  let host = null;
  for (let i = 0; i < 20 && !(host = homeHost()); i++) await sleep(200);
  if (!host || location.pathname !== "/") return early.showFeed();
  document.documentElement.classList.add("wp-home");
  early.showFeed(); // the card's own rule (html.wp-home) hides the feed from here on
  const p = activePurpose();
  const key = status.totalReached ? "total" : p ? `p|${p.text}` : `idle|${leisureUsedUp()}`;
  if ($("#wp-home")?.dataset.key === key) return; // don't rebuild while someone is typing
  $("#wp-home")?.remove();

  const input = el("input", { class: "wp-home-input", type: "text", "aria-label": "What do you want to find or learn?" });
  // Built like YouTube's own search box: a text field with an attached magnifier button.
  const findBtn = el("button", { class: "wp-home-go", "aria-label": p ? "Search" : "Find it", title: p ? "Search" : "Find it" }, icon("search"));
  const hint = el("div", { class: "wp-muted wp-home-hint" }, "Your search becomes your Target. Be specific.");
  const card = el("div", { id: "wp-home", class: "wp wp-home-card", "data-key": key });

  if (p) {
    input.placeholder = "Search toward your Target";
  } else {
    input.placeholder = "What do you want to find or learn?";
  }

  const submit = () => {
    const q = input.value.trim();
    if (!q) { input.focus(); return; }
    goSearch(q);
  };
  findBtn.onclick = submit;
  keepKeys(input, submit);

  if (status.totalReached) {
    card.append(
      brandLine(),
      el("h1", { class: "wp-home-title" }, "That's today's YouTube time"),
      el("div", { class: "wp-muted" }, `You set a daily limit of ${settings.totalMin} minutes. It resets at midnight.`));
  } else if (p) {
    card.append(
      el("div", { class: "wp-label" }, "Current Target"),
      el("div", { class: "wp-home-purpose" }, p.text),
      el("div", { class: "wp-home-search" }, input, findBtn),
      el("div", { class: "wp-home-alt" },
        el("button", { class: "wp-btn wp-btn-tonal", onclick: askDone }, icon("check2"), "Target complete"),
        el("button", { class: "wp-btn wp-btn-text", onclick: () => openPivotDialog() }, "Change Target")),
      el("div", { class: "wp-label wp-home-break-label" }, "Or take a break"),
      breakChips(takeBreak));
  } else {
    card.append(
      brandLine(),
      el("h1", { class: "wp-home-title" }, "What brings you here?"),
      el("div", { class: "wp-home-search" }, input, findBtn),
      hint,
      el("div", { class: "wp-label" }, "Examples"),
      el("div", { class: "wp-chips" }, ...EXAMPLES.map(t => el("button", { class: "wp-chip", onclick: () => { input.value = t; input.focus(); } }, t))),
      el("div", { class: "wp-label wp-home-break-label" }, "Just browsing? Take a break"),
      breakChips(takeBreak));
  }
  host.prepend(card);
}
