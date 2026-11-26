// Aim — YouTube's homepage, replaced by the scene (content/scene.js): Home (this week's challenge,
// content/weekly.js), Break and the panels. This file draws it and keeps the pieces the panels share: the aim you're on, its videos,
// and what you saved for later.

// Example requests, said the way you'd ask a librarian.
const EXAMPLES = ["How do jet engines work?", "Help me study for my biology exam."];

// The card after Done, shown on the homepage (never covering it) until dismissed.
let homeEnd = null;

function removeHome() {
  exploreOpen = false;
  scene = { view: "home", panel: null };
  early.showFeed();
  document.documentElement.classList.remove("wp-home", "wp-scene-on");
  $("#wp-home")?.remove();
}

// Searching from the card is a YouTube search; the results page makes it your purpose.
function goSearch(query) {
  location.href = "/results?search_query=" + encodeURIComponent(query);
}

async function renderHome() {
  if (location.pathname !== "/") return;
  // Explore and Break, asked for from the popup or the menu (youtube.com/#aim-explore, #aim-break).
  if (location.hash === "#aim-explore" || location.hash === "#aim-break") { scene = { view: "break", panel: null }; history.replaceState(null, "", "/"); }
  // Go deeper into one thing (Aim Plus): #aim-deeper= and the focus, from an aim's page.
  if (location.hash.startsWith("#aim-deeper=")) {
    let focus = null;
    try { focus = JSON.parse(decodeURIComponent(location.hash.slice("#aim-deeper=".length))); } catch {}
    history.replaceState(null, "", "/");
    if (focus?.title) setTimeout(() => openTalk({ mode: "deeper", focus: { title: String(focus.title).slice(0, 120), brief: String(focus.brief || "").slice(0, 200),
      chain: (Array.isArray(focus.chain) ? focus.chain : []).map(String).slice(0, 8) } }), 300);
  }
  // "Find the next challenge", from a completed one: this week's challenge, on that subject.
  if (location.hash.startsWith("#aim-challenge=")) {
    let subject = "";
    try { subject = decodeURIComponent(location.hash.slice("#aim-challenge=".length)).slice(0, 120); } catch {}
    history.replaceState(null, "", "/");
    if (subject) setTimeout(() => openChallengePanel("weekly", subject), 300);
  }
  // "Next lesson", from a completed one: pick its path up where it left off.
  if (location.hash.startsWith("#aim-path=")) {
    const id = decodeURIComponent(location.hash.slice("#aim-path=".length)).slice(0, 40);
    history.replaceState(null, "", "/");
    if (id) setTimeout(() => openContinue().then(() => pickPath(id)), 300);
  }
  if (location.hash === "#aim-talk" || location.hash === "#aim-put-together") {
    const mode = location.hash === "#aim-put-together" ? "synthesis" : null;
    history.replaceState(null, "", "/");
    setTimeout(() => openTalk(mode ? { mode } : {}), 300);
  }
  if (!settings.homeCard || brk) return removeHome();
  let host = null;
  for (let i = 0; i < 20 && !(host = homeHost()); i++) await sleep(200);
  if (!host || location.pathname !== "/") return early.showFeed();
  document.documentElement.classList.add("wp-home");
  early.showFeed(); // the card's own rule (html.wp-home) hides the feed from here on
  await librarianOn(); // signed in: the box also takes requests for the librarian
  if (planOn() && !status.totalReached) { // a Homeschool student's day
    document.documentElement.classList.remove("wp-scene-on");
    if ($("#wp-home.wp-scene")) $("#wp-home").remove();
    return renderToday(host);
  }
  const p = activePurpose();
  // This week's challenge (the card), as this browser has it; fetched in the background if it's a new week.
  if (!status.totalReached) await weeklyLoad();
  // Today's Daily Challenge, only if you turned it on (Settings → YouTube experience; paused in 0.76).
  const daily = settings.dailyOn && !status.totalReached ? (await send({ type: "daily-peek" })) || {} : {};
  if (location.pathname !== "/") return;
  exploreOpen = scene.view === "break" && !scene.panel;
  const view = status.totalReached ? "total" : scene.view;
  // While the story is open, it redraws itself (wkRedraw); nothing else on the page should rebuild it
  // under someone writing their reasoning.
  const key = scene.panel === "story" ? [view, "story", wk.week, wk.playtest, wk.story?.title || ""].join("|") : [view, scene.panel || "",
    p ? `p|${p.id}|${p.text}|${(p.map?.parts || []).map(x => x.id + x.status).join(".")}${p.map?.synthesis?.verdict || ""}${p.practice ? `${p.practice.title}${p.practice.triedAt || ""}` : ""}|${(status.currentVideos || []).map(v => v.id).join(",")}|${p.study ? `${p.study.current}:${p.study.topics.map(t => t.check?.at || 0).join(".")}:${p.study.apply?.doneAt || 0}` : ""}` : "idle",
    leisureUsedUp(), (status.saved || []).map(v => v.id).join(","), account.on, status.pathways?.offer?.name || "", !!homeEnd,
    settings.dailyOn ? dailyCardSub(daily) : "", wkStateKey(),
    (settings.learnTopics || []).join("+"), (settings.learnOff || []).length].join("|");
  if ($("#wp-home")?.dataset.key === key) return; // don't rebuild while someone is typing
  $("#wp-home")?.remove();
  document.documentElement.classList.add("wp-scene-on");

  const root = el("div", { id: "wp-home", class: "wp wp-scene", "data-key": key, "data-view": view });
  root.style.setProperty("--wp-scene-img", `url("${sceneFile(SCENE_BG[view] || SCENE_BG.home)}")`);
  const main = el("main", { class: "wp-scene-main" });
  root.append(el("div", { class: "wp-scene-bg", "aria-hidden": "true" }), sceneTop(), main);

  if (view === "total") {
    main.append(sceneTitle("That's today's YouTube time"),
      el("p", { class: "wp-scene-sub" }, `You set a daily limit of ${settings.totalMin} minutes. It resets at midnight.`));
  } else if (scene.panel === "continue") main.append(continuePanel(p));
  else if (scene.panel === "daily") main.append(dailyPanel());
  else if (scene.panel === "story") main.append(weeklyPanel());
  else if (scene.panel === "weekly") main.append(challengePanel(scene.panel)); // your own weekly challenge, from a finished one
  else if (view === "break") breakMain(main);
  else homeMain(main, p, daily);
  document.body.append(root);
  if (settings.dailyOn && view !== "total" && !daily.fresh && !scene.panel) send({ type: "daily-get" }).then(r => { if (r?.challenge && !daily.challenge && alive) renderHome(); });
  if (view === "home" && !scene.panel) {
    showTips();
    maybeOfferTalk(root);
    maybeOfferReview(root);
  }
}

// Home (0.76): this week's challenge fills the scene; under it, a slim search and where you left off
// (your aim, or your learning plans), and the Daily Challenge if you turned it on.
function homeMain(main, p, daily) {
  const input = el("input", { class: "wp-home-input", type: "text", "aria-label": "Search for videos, topics, or anything you want to learn",
    placeholder: "Search for videos, topics, or anything you want to learn…" });
  const findBtn = el("button", { class: "wp-home-go", "aria-label": "Go", title: "Go" }, icon("right"));
  const hint = el("div", { class: "wp-muted wp-home-hint", role: "status" });
  // Signed in, a request or goal goes to the librarian; a plain search goes straight to YouTube.
  const busy = on => {
    input.disabled = on; findBtn.disabled = on;
    hint.textContent = on ? `${BRAND} is looking…` : "";
  };
  const submit = () => {
    const q = input.value.trim();
    if (!q) { input.focus(); return; }
    aimSearch(q, busy);
  };
  findBtn.onclick = submit;
  keepKeys(input, submit);
  main.append(...[
    homeEnd,
    weeklyCard(),
    el("div", { class: "wp-home-under" },
      el("div", { class: "wp-home-search" }, el("span", { class: "wp-home-search-icon" }, icon("search")), input, findBtn),
      el("button", { class: "wp-home-chip wp-home-continue", onclick: openContinue, title: p ? `Continue: ${p.text}` : "Your learning plans" },
        icon("playRing"), el("span", {}, p ? `Continue: ${p.text}` : "Learning plans"), icon("right")),
      settings.dailyOn ? el("button", { class: "wp-home-chip wp-home-daily", onclick: openDaily, title: dailyCardSub(daily) },
        icon("calendarDots"), el("span", {}, "Today's challenge"), icon("right")) : null),
    hint,
    el("div", { class: "wp-scene-invites" }),
    themeOfferBlock()].filter(Boolean));
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

// The aim you're on, at the top of Continue Learning: a row like a path's (its last video, its name,
// where it stands, and play), then what it holds: the question left open, the study session, the
// map of what you've explained, the thing to try, and its videos.
function currentTargetRow(p) {
  const vids = status.currentVideos || [];
  const v = vids[0];
  return el("div", { class: "wp-home-resume" }, el("div", { class: "wp-home-current" },
    el("div", { class: "wp-cl-row wp-cl-aim" },
      v ? el("span", { class: "wp-cl-thumb", style: `background-image: url("${thumbUrl(v.id)}")`, "aria-hidden": "true" }) : subjectThumb("general"),
      el("div", { class: "wp-cl-text" },
        el("span", { class: "wp-label" }, "Your aim"),
        el("button", { class: "wp-home-purpose wp-home-open wp-cl-title", title: "Open this aim's page", onclick: () => send({ type: "open-aim", id: p.id }) }, p.text),
        el("span", { class: "wp-muted wp-home-meta" }, targetMeta({ ...p, videos: (p.videos || []).length }))),
      el("button", { class: "wp-cl-play", "aria-label": "Continue", title: "Continue", onclick: () => resumeTarget(p.id) }, icon("playSolid"))),
    // The open loop (0.71): the question the last one-minute close left for next time.
    p.openQuestion?.q && !p.openQuestion.closedAt ? el("div", { class: "wp-open-q" }, el("span", { class: "wp-label" }, "Left open last time"), el("span", {}, p.openQuestion.q)) : null,
    studyTodayBlock(p),
    activeStudy(p) ? null : understandingBlock(p),
    practiceBlock(p),
    v ? lastVideoCard(p, v) : null,
    moreVideos(vids.slice(1)),
    el("div", { class: "wp-home-alt" },
      el("button", { class: "wp-btn wp-btn-tonal", onclick: doneAction(p) }, icon("check2"), doneLabel(p)),
      el("button", { class: "wp-btn wp-btn-text", onclick: setAsideTarget }, "Set aside"))));
}

// What picking this aim up would mean, in a few words: the study topic that needs review or comes
// next, or the video you stopped partway through.
function nextStep(t) {
  if (t.practice && !t.practice.tried) return `Next: try it · ${t.practice.title}`;
  const u = understandingNext(t.understanding);
  if (u && !t.study) return u;
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

// Links like "Next lesson" or "Find the next challenge" set the address's #part while you're already
// on the homepage, which doesn't reload it: handle them as they arrive.
addEventListener("hashchange", () => { if (location.pathname === "/" && /^#aim-/.test(location.hash) && alive) renderHome(); });
