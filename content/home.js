// Aim — the homepage card that replaces the feed.

// ---------------- homepage: "What brings you here?" ----------------
// Rotating examples in the placeholder slot after the first prompt.
const EXAMPLES = [
  "What do you want to find or learn?",
  "How do I fix a leaking faucet?",
  "Understand how a combustion engine works",
  "Learn the fundamentals of investing",
  "Find a tutorial for building a walnut table",
  "Why do long bridges not sag in the middle?"
];
let exampleTimer = null;

function removeHome() {
  early.showFeed();
  document.documentElement.classList.remove("wp-home");
  $("#wp-home")?.remove();
  clearInterval(exampleTimer);
}

// The purpose you typed can differ from the search you run; the results page picks it up.
async function goSearch(query, purpose) {
  if (purpose) await send({ type: "pending-purpose", purpose, query });
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
  clearInterval(exampleTimer);

  const input = el("input", { class: "wp-home-input", type: "text", "aria-label": "What do you want to find or learn?" });
  // Built like YouTube's own search box: a text field with an attached magnifier button.
  const findBtn = el("button", { class: "wp-home-go", "aria-label": p ? "Search" : "Find it", title: p ? "Search" : "Find it" }, icon("search"));
  const hint = el("div", { class: "wp-muted wp-home-hint" }, "Your search becomes your purpose. Be specific.");
  const choice = el("div", { class: "wp-home-choice", hidden: true });
  const card = el("div", { id: "wp-home", class: "wp wp-home-card", "data-key": key });

  if (p) {
    input.placeholder = "Search toward this purpose";
  } else {
    let i = 0;
    input.placeholder = EXAMPLES[0];
    exampleTimer = setInterval(() => {
      if (document.activeElement === input || input.value) return;
      i = (i + 1) % EXAMPLES.length;
      input.placeholder = EXAMPLES[i];
    }, 3500);
  }

  const submit = async () => {
    const q = input.value.trim();
    if (!q) { input.focus(); return; }
    if (p) return goSearch(q, null);
    if (!settings.hasKey) return goSearch(q, q);
    findBtn.disabled = true;
    hint.textContent = "Checking for a better search…";
    const r = await send({ type: "improve-search", purpose: q });
    findBtn.disabled = false;
    hint.textContent = "Your search becomes your purpose. Be specific.";
    if (!r?.better || !r.query || r.query.trim().toLowerCase() === q.toLowerCase()) return goSearch(q, q);
    // Only shown when there's a meaningfully better search. Purpose stays as you wrote it.
    choice.hidden = false;
    choice.replaceChildren(
      el("div", {}, el("div", { class: "wp-label" }, "Your purpose"), el("div", { class: "wp-strong" }, q)),
      el("div", {}, el("div", { class: "wp-label" }, "Suggested search"), el("div", { class: "wp-strong" }, r.query)),
      el("div", { class: "wp-actions" },
        el("button", { class: "wp-btn wp-btn-tonal", onclick: () => goSearch(q, q) }, "Use my search"),
        el("button", { class: "wp-btn wp-btn-primary", onclick: () => goSearch(r.query, q) }, "Use suggested search")));
  };
  findBtn.onclick = submit;
  keepKeys(input, submit);

  if (status.totalReached) {
    card.append(
      el("div", { class: "wp-dialog-brand" }, icon("logo"), "Aim"),
      el("h1", { class: "wp-home-title" }, "That's today's YouTube time"),
      el("div", { class: "wp-muted" }, `You set a daily limit of ${settings.totalMin} minutes. It resets at midnight.`));
  } else if (p) {
    card.append(
      el("div", { class: "wp-label" }, "Your purpose"),
      el("div", { class: "wp-home-purpose" }, p.text),
      el("div", { class: "wp-home-search" }, input, findBtn),
      el("div", { class: "wp-home-alt" },
        el("button", { class: "wp-btn wp-btn-tonal", onclick: () => finishPurpose() }, icon("check2"), "Done"),
        el("button", { class: "wp-btn wp-btn-text", onclick: () => openPivotDialog() }, "Change purpose")),
      el("div", { class: "wp-label wp-home-break-label" }, "Or take a break"),
      breakChips(takeBreak));
  } else {
    card.append(
      el("div", { class: "wp-dialog-brand" }, icon("logo"), "Aim"),
      el("h1", { class: "wp-home-title" }, "What brings you here?"),
      el("div", { class: "wp-home-search" }, input, findBtn),
      hint,
      choice,
      el("div", { class: "wp-label wp-home-break-label" }, "Just browsing? Take a break"),
      breakChips(takeBreak));
  }
  host.prepend(card);
}
