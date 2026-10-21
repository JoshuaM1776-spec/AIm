// Aim — the homepage card that replaces the feed.

// ---------------- homepage: "What brings you here?" ----------------
// Example requests on the card, said the way you'd ask a librarian: one tap fills the box.
const EXAMPLES = ["How do jet engines work?", "Help me study for my biology exam."];

// The card after Done, shown inside the homepage card (so it never covers it) until dismissed.
let homeEnd = null;

function removeHome() {
  exploreOpen = false;
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
  if (planOn() && !status.totalReached) return renderToday(host); // a Homeschool student's day
  const p = activePurpose();
  const others = status.paused || [];
  const key = status.totalReached ? "total" : exploreOpen ? "explore"
    : [p ? `p|${p.id}|${p.text}|${(status.currentVideos || []).map(v => v.id).join(",")}|${p.study ? `${p.study.current}:${p.study.topics.map(t => t.check?.at || 0).join(".")}:${p.study.apply?.doneAt || 0}` : ""}` : "idle", leisureUsedUp(),
      others.map(x => `${x.id}:${x.recent?.[0]?.id || ""}`).join(","), (status.saved || []).map(v => v.id).join(","),
      account.on, status.pathways?.offer?.name || "", (settings.learnTopics || []).join("+"), (settings.learnOff || []).length].join("|");
  if ($("#wp-home")?.dataset.key === key) return; // don't rebuild while someone is typing
  $("#wp-home")?.remove();

  const input = el("input", { class: "wp-home-input", type: "text", "aria-label": "Tell me what you're looking for",
    placeholder: "Tell me what you're looking for…" });
  // One rounded field with a small arrow inside it; Enter does the same.
  const findBtn = el("button", { class: "wp-home-go", "aria-label": "Go", title: "Go" }, icon("right"));
  const card = el("div", { id: "wp-home", class: "wp wp-home-card", "data-key": key });
  const lib = account.on;
  const hintText = p ? "Searching for something new? If it isn't part of your aim, Aim asks first."
    : lib ? `Tell ${BRAND} what you want to accomplish. It'll help you find it.` : "What you type becomes your aim. Be specific.";
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

  if (exploreOpen) {
    card.classList.add("wp-explore");
    exploreView(card);
    host.prepend(card);
    return;
  }

  const resumeBlock = (p || others.length) ? el("div", { class: "wp-home-resume" },
    el("div", { class: "wp-label" }, "Pick up where you left off"),
    p ? currentTargetRow(p) : null,
    others.length ? el("div", { class: "wp-home-recent" },
      el("div", { class: "wp-label wp-home-sub" }, "Recent aims"),
      ...others.map(pausedTargetRow)) : null,
    el("button", { class: "wp-btn wp-btn-text wp-home-all", onclick: () => send({ type: "open-targets" }) }, "View all aims")) : null;

  card.append(...[
    brandLine(),
    homeEnd,
    el("h1", { class: "wp-home-title" }, "What brings you here?"),
    el("div", { class: "wp-home-search" }, input, findBtn),
    hint,
    themeOfferBlock(),
    // Examples help a first visit; once there's something to pick up, they'd only add clutter.
    !p && !others.length && !(settings.learnTopics || []).length ? el("div", { class: "wp-home-examples" },
      el("span", { class: "wp-muted" }, "Try"), ...EXAMPLES.map(t =>
        el("button", { class: "wp-home-example", onclick: () => { input.value = t; input.focus(); } }, `“${t}”`))) : null,
    exploreLine(p),
    resumeBlock,
    savedBlock(),
    el("div", { class: "wp-label wp-home-break-label" }, p ? "Or take a break" : "Just browsing? Take a break"),
    breakChips(takeBreak)].filter(Boolean));
  host.prepend(card);
  showTips();
  maybeOfferTalk(card);
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
  // A study session says where it stands; the full aim (current) carries the session itself.
  const st = t.study?.of ? t.study : t.study?.topics && !t.study.endedAt
    ? { topic: Math.min(t.study.topics.length, (t.study.current || 0) + 1), of: t.study.topics.length, checked: t.study.topics.filter(x => x.check).length } : null;
  return [lastActive(t.lastActiveAt), st ? `Study session: topic ${st.topic} of ${st.of}${st.checked ? `, ${st.checked} checked` : ""}` : null,
    mins ? `${mins} min` : null, t.videos ? `${t.videos} video${t.videos > 1 ? "s" : ""}` : null]
    .filter(Boolean).join(" · ");
}

// Resuming goes back to the last video, at the moment you left it, or else the last search.
// It never starts anything else, AI included.
async function resumeTarget(id) {
  const r = await send({ type: "purpose-resume", id });
  if (!r || r.result !== "applied") return toast(r?.message || "Couldn't resume that aim. Try again.");
  location.href = r.url;
}

// ---------- thumbnails of what you watched for an aim ----------
// Only videos you chose for that aim (never suggestions), with nothing that plays or previews.
const thumbUrl = id => `https://i.ytimg.com/vi/${encodeURIComponent(id)}/mqdefault.jpg`;
function thumb(v, cls) {
  const pct = v.d > 0 && v.t > 0 ? Math.min(100, Math.round((v.t / v.d) * 100)) : 0;
  return el("span", { class: `wp-thumb ${cls}`, style: `background-image: url("${thumbUrl(v.id)}")` },
    v.d ? el("span", { class: "wp-thumb-len" }, fmtClock(v.d)) : null,
    pct ? el("span", { class: "wp-thumb-progress" }, el("i", { style: `width: ${pct}%` })) : null);
}
// Play one of the aim's videos from where you stopped (from the start if you'd finished it).
async function playTargetVideo(v) {
  await send({ type: "purpose-allow", query: "", videos: [{ id: v.id, title: v.title, channel: v.channel }], lists: [] });
  const from = v.t > 5 && !(v.d && v.t > v.d - 15) ? `&t=${Math.floor(v.t)}s` : "";
  location.href = `/watch?v=${encodeURIComponent(v.id)}${from}`;
}
function lastVideoCard(p, v) {
  const stopped = v.t > 5 && !(v.d && v.t > v.d - 15) ? `Stopped at ${fmtClock(v.t)}` : v.d && v.t > v.d - 15 ? "Finished" : "";
  return el("button", { class: "wp-home-video", title: `Continue “${v.title}”`, onclick: () => resumeTarget(p.id) },
    thumb(v, "wp-thumb-lg"),
    el("span", { class: "wp-home-video-text" },
      el("span", { class: "wp-home-video-title" }, v.title || "Your last video"),
      v.channel ? el("span", { class: "wp-muted" }, v.channel) : null,
      stopped ? el("span", { class: "wp-muted" }, stopped) : null));
}
function moreVideos(list) {
  if (!list.length) return null;
  const row = el("div", { class: "wp-home-minis", hidden: "" },
    ...list.map(v => el("button", { class: "wp-mini", title: v.title, onclick: () => playTargetVideo(v) },
      thumb(v, "wp-thumb-sm"), el("span", { class: "wp-mini-title" }, v.title))));
  const toggle = el("button", { class: "wp-btn wp-btn-text wp-home-see-more", "aria-expanded": "false" }, `See more (${list.length})`);
  toggle.onclick = () => {
    const open = row.hidden;
    row.hidden = !open;
    toggle.setAttribute("aria-expanded", String(open));
    toggle.textContent = open ? "See less" : `See more (${list.length})`;
  };
  return el("div", { class: "wp-home-more" }, toggle, row);
}

// "Saved for later": videos you set aside for another time. Watching one is a one-video break, so
// it never counts toward an aim. A video leaves the list once you've watched it.
function savedRow(list, max) {
  return el("div", { class: "wp-home-minis wp-saved-row" }, ...list.slice(0, max).map(v => el("div", { class: "wp-mini" },
    el("button", { class: "wp-mini-play", title: v.title, onclick: () => watchSaved(v) }, thumb(v, "wp-thumb-sm"), el("span", { class: "wp-mini-title" }, v.title)),
    el("button", { class: "wp-mini-x", "aria-label": `Remove “${v.title}” from Saved for later`, title: "Remove", onclick: async e => {
      e.currentTarget.closest(".wp-mini").remove();
      await send({ type: "saved-remove", id: v.id });
      status.saved = (status.saved || []).filter(x => x.id !== v.id);
      if (!status.saved.length) $(".wp-home-saved")?.remove();
    } }, icon("close")))));
}
function savedBlock() {
  const list = status.saved || [];
  if (!list.length) return null;
  return el("div", { class: "wp-home-saved" },
    el("div", { class: "wp-row-between" },
      el("div", { class: "wp-label" }, "Saved for later"),
      el("span", { class: "wp-muted wp-home-saved-note" }, "Watching one is a short break")),
    savedRow(list, 6));
}

function currentTargetRow(p) {
  const vids = status.currentVideos || [];
  return el("div", { class: "wp-home-current" },
    el("div", { class: "wp-label" }, "Your aim"),
    el("div", { class: "wp-home-purpose" }, p.text),
    el("div", { class: "wp-muted wp-home-meta" }, targetMeta({ ...p, videos: (p.videos || []).length })),
    studyTodayBlock(p),
    vids[0] ? lastVideoCard(p, vids[0]) : null,
    moreVideos(vids.slice(1)),
    el("div", { class: "wp-home-alt" },
      el("button", { class: "wp-btn wp-btn-accent", onclick: () => resumeTarget(p.id) }, icon("play"), "Continue"),
      el("button", { class: "wp-btn wp-btn-tonal", onclick: doneAction(p) }, icon("check2"), doneLabel(p)),
      el("button", { class: "wp-btn wp-btn-text", onclick: setAsideTarget }, "Set aside")));
}

// What picking this aim up would mean, in a few words: the study topic that needs review or comes
// next, or the video you stopped partway through.
function nextStep(t) {
  const n = t.study?.next;
  if (n) return n.kind === "review" ? `Next: review ${n.title}` : n.kind === "topic" ? `Next: ${n.title}` : "Next: put it to work";
  const v = t.recent?.[0];
  if (v?.title && v.d > 0 && v.t > 30 && v.t < v.d * 0.9) return `Next: finish “${v.title}” · ${Math.max(1, Math.round((v.d - v.t) / 60))} min left`;
  return null;
}

function pausedTargetRow(t) {
  const v = t.recent?.[0], next = nextStep(t);
  return el("div", { class: "wp-home-row" },
    v ? el("button", { class: "wp-home-row-thumb", title: `Resume: ${v.title}`, onclick: () => resumeTarget(t.id) }, thumb(v, "wp-thumb-xs")) : null,
    el("div", { class: "wp-home-row-text" },
      el("div", { class: "wp-strong wp-ellipsis" }, t.text),
      el("div", { class: "wp-muted wp-home-meta" }, targetMeta(t)),
      next ? el("div", { class: "wp-home-next wp-ellipsis" }, next) : null),
    el("button", { class: "wp-btn wp-btn-tonal", onclick: () => resumeTarget(t.id) }, "Resume"));
}

async function setAsideTarget() {
  closeDropdown();
  const r = await send({ type: "purpose-pause" });
  if (r?.result !== "applied") return toast("Couldn't set that aside. Try again.");
  toast("Set aside. Pick it up again from the homepage anytime.");
  if (location.pathname !== "/") location.href = "https://www.youtube.com/";
}
