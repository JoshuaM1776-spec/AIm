// Aim — the homepage card that replaces the feed.

// ---------------- homepage: "What brings you here?" ----------------
// Example purposes on the card: one tap fills the search box.
const EXAMPLES = ["Study for my biology exam", "Learn cabinetmaking", "Understand the Roman Republic", "Fix my truck"];

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
  await librarianOn(); // signed in: the box also takes requests for the librarian
  const p = activePurpose();
  const others = status.paused || [];
  const key = status.totalReached ? "total"
    : [p ? `p|${p.id}|${p.text}` : "idle", leisureUsedUp(), others.map(x => x.id).join(","), account.on].join("|");
  if ($("#wp-home")?.dataset.key === key) return; // don't rebuild while someone is typing
  $("#wp-home")?.remove();

  const input = el("input", { class: "wp-home-input", type: "text", "aria-label": "What do you want to find or learn?",
    placeholder: "What do you want to find or learn?" });
  // Built like YouTube's own search box: a text field with an attached magnifier button.
  const findBtn = el("button", { class: "wp-home-go", "aria-label": "Search", title: "Search" }, icon("search"));
  const card = el("div", { id: "wp-home", class: "wp wp-home-card", "data-key": key });
  const lib = account.on;
  const hintText = p ? "Searching for something new? If it isn't part of your Target, Aim asks first."
    : lib ? `Tell ${BRAND} what you want to accomplish. It'll help you find it.` : "Your search becomes your Target. Be specific.";
  const hint = el("div", { class: "wp-muted wp-home-hint" }, hintText);
  // Signed in, a request or goal goes to the librarian; a plain search goes straight to YouTube.
  const busy = on => {
    input.disabled = on; findBtn.disabled = on;
    hint.textContent = on ? `${BRAND} is looking…` : hintText;
  };
  const submit = () => {
    const q = input.value.trim();
    if (!q) { input.focus(); return; }
    aimSearch(q, busy);
  };
  findBtn.onclick = submit;
  keepKeys(input, submit);

  if (status.totalReached) {
    card.append(
      brandLine(),
      el("h1", { class: "wp-home-title" }, "That's today's YouTube time"),
      el("div", { class: "wp-muted" }, `You set a daily limit of ${settings.totalMin} minutes. It resets at midnight.`));
    host.prepend(card);
    return;
  }

  const resumeBlock = (p || others.length) ? el("div", { class: "wp-home-resume" },
    el("div", { class: "wp-label" }, "Pick up where you left off"),
    p ? currentTargetRow(p) : null,
    others.length ? el("div", { class: "wp-home-recent" },
      el("div", { class: "wp-label wp-home-sub" }, "Recent Targets"),
      ...others.map(pausedTargetRow)) : null,
    el("button", { class: "wp-btn wp-btn-text wp-home-all", onclick: () => send({ type: "open-targets" }) }, "View all Targets")) : null;

  card.append(...[
    brandLine(),
    el("h1", { class: "wp-home-title" }, "What brings you here?"),
    p ? null : el("div", { class: "wp-muted wp-home-lede" }, `Whether you're preparing for an exam, learning a new skill, or finding a quick answer, ${BRAND} helps you stay focused on what you came to YouTube to accomplish.`),
    el("div", { class: "wp-home-search" }, input, findBtn),
    hint,
    // Examples help a first visit; once there's something to pick up, they'd only add clutter.
    !p && !others.length ? el("div", { class: "wp-label" }, "Examples") : null,
    !p && !others.length ? el("div", { class: "wp-chips" }, ...EXAMPLES.map(t => el("button", { class: "wp-chip", onclick: () => { input.value = t; input.focus(); } }, t))) : null,
    p ? null : el("button", { class: "wp-btn wp-btn-primary wp-btn-block wp-home-go-big", onclick: submit }, "Search YouTube", icon("right")),
    resumeBlock,
    el("div", { class: "wp-label wp-home-break-label" }, p ? "Or take a break" : "Just browsing? Take a break"),
    breakChips(takeBreak)].filter(Boolean));
  host.prepend(card);
}

// "Last active yesterday"
function lastActive(ts) {
  if (!ts) return "";
  const day = d => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((day(new Date()) - day(new Date(ts))) / 86400000);
  if (days <= 0) return "Last active today";
  if (days === 1) return "Last active yesterday";
  if (days < 7) return `Last active ${days} days ago`;
  return `Last active ${new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
}

function targetMeta(t) {
  const mins = Math.round((t.usedSec || 0) / 60);
  return [lastActive(t.lastActiveAt), mins ? `${mins} min` : null, t.videos ? `${t.videos} video${t.videos > 1 ? "s" : ""}` : null]
    .filter(Boolean).join(" · ");
}

// Resuming goes back to the last video, at the moment you left it, or else the last search.
// It never starts anything else, AI included.
async function resumeTarget(id) {
  const r = await send({ type: "purpose-resume", id });
  if (!r || r.result !== "applied") return toast(r?.message || "Couldn't resume that Target. Try again.");
  location.href = r.url;
}

function currentTargetRow(p) {
  return el("div", { class: "wp-home-current" },
    el("div", { class: "wp-label" }, "Current Target"),
    el("div", { class: "wp-home-purpose" }, p.text),
    el("div", { class: "wp-muted wp-home-meta" }, targetMeta({ ...p, videos: (p.videos || []).length })),
    el("div", { class: "wp-home-alt" },
      el("button", { class: "wp-btn wp-btn-primary", onclick: () => resumeTarget(p.id) }, icon("play"), "Continue"),
      el("button", { class: "wp-btn wp-btn-tonal", onclick: askDone }, icon("check2"), "Target complete"),
      el("button", { class: "wp-btn wp-btn-text", onclick: setAsideTarget }, "Set aside")));
}

function pausedTargetRow(t) {
  return el("div", { class: "wp-home-row" },
    el("div", { class: "wp-home-row-text" },
      el("div", { class: "wp-strong wp-ellipsis" }, t.text),
      el("div", { class: "wp-muted wp-home-meta" }, targetMeta(t))),
    el("button", { class: "wp-btn wp-btn-tonal", onclick: () => resumeTarget(t.id) }, "Resume"));
}

async function setAsideTarget() {
  closeDropdown();
  const r = await send({ type: "purpose-pause" });
  if (r?.result !== "applied") return toast("Couldn't set that aside. Try again.");
  toast("Set aside. Pick it up again from the homepage anytime.");
  if (location.pathname !== "/") location.href = "https://www.youtube.com/";
}
