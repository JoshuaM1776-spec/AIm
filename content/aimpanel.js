// Aim — the one panel at the top of YouTube's sidebar while you watch for an aim (docs/SPEC.md §5; one
// panel since 0.78). It carries where you are: a lesson's plan, unit and number, or a study session's
// topic, with its steps and the one you're on. Then the one thing to do now: a guess before the video,
// one next action when it ends, otherwise the next step's video with why it was chosen; and Explain ·
// Try it · Notes. Folded in: What this video covers (video.js, Aim Plus) and More from your search
// (upnext.js). More opens Learn / Explain / Apply, where you are (explored, explained, applied) and a
// break. A quick answer gets only the aim and "Got my answer".
//
// The next video comes from what you're trying to do, not the last video: first something you couldn't
// yet explain (a gap from a conversation), then the next part of the aim you haven't explored, then
// your last search. Free: YouTube's own top result for that step; Aim Plus: the librarian's pick. The
// reason says why the step, and the source line says where the video came from; Aim never claims to
// know what a video teaches from its title.

let panelEnded = null;     // the video that just finished
let panelOpen = false;     // More: the fuller panel
let panelPromptGone = null; // the video whose end prompt you put away
const panelNext = new Map(); // step search → { status, video, source }
ICON.note = [20, ["path", { d: "M6 3.5h8l4 4v13H6z", fill: "none", stroke: "currentColor", "stroke-width": "1.8", "stroke-linejoin": "round" }],
  ["path", { d: "M9 12h6M9 15.5h4", fill: "none", stroke: "currentColor", "stroke-width": "1.8", "stroke-linecap": "round" }]];

document.addEventListener("ended", e => {
  if (!alive || e.target !== getVideoEl() || playerHost()?.classList.contains("ad-showing")) return;
  panelEnded = currentId;
  renderAimPanel();
}, true);

// The aim's page data (its field, for scenarios), shared with Aim's menu (session.js).
function panelAim(p) {
  if (menuBooks.has(p.id)) return menuBooks.get(p.id);
  send({ type: "aim-get", id: p.id }).then(d => { if (d?.aim) { menuBooks.set(p.id, d.aim); renderAimPanel(); } });
  return null;
}

// What to look at next, and why. A gap first, then the next part not yet explored, then your search.
function panelStep(p) {
  const watched = new Set((p.videos || []).map(v => v.id));
  const gap = (p.gaps || []).filter(g => !g.resolvedAt && !(g.videoId && watched.has(g.videoId))).pop();
  if (gap) return { kind: "gap", id: gap.id, title: gap.title, search: gap.search, why: `Addresses what you couldn't yet explain: ${gap.title}` };
  const parts = p.map?.parts || [];
  const fresh = parts.find(x => x.status === "new"), started = parts.find(x => x.status === "explored" || x.status === "partial");
  if (fresh) return { kind: "part", title: fresh.title, search: fresh.search, why: `Next part of your aim: ${fresh.title}` };
  if (started) return { kind: "part", title: started.title, search: started.search, why: `Builds on ${started.title}, which you've started` };
  const q = p.searches?.[p.searches.length - 1]?.q;
  if (q) return { kind: "search", title: q, search: q, why: `More from your search “${q}”` };
  const aim = p.learn || p.text;
  return aim ? { kind: "search", title: aim, search: aim, why: "Toward your aim" } : null;
}

// Videos YouTube's own search finds for a step, read from its results page (as for the librarian's
// suggested videos in talk.js).
async function searchCandidates(query) {
  try {
    const r = await fetch(`/results?search_query=${encodeURIComponent(query)}`, { credentials: "include" });
    const html = r.ok ? await r.text() : "", at = html.indexOf("var ytInitialData = ");
    if (at < 0) return [];
    const from = at + "var ytInitialData = ".length;
    const data = JSON.parse(html.slice(from, html.indexOf(";</script>", from)));
    return findAll(data, "videoRenderer").filter(v => /^[\w-]{6,20}$/.test(v.videoId || "")).slice(0, 12).map(v => ({
      id: v.videoId, title: v.title?.runs?.map(x => x.text).join("") || "", channel: v.ownerText?.runs?.[0]?.text || "", length: v.lengthText?.simpleText || "" }));
  } catch { return []; }
}

async function findNext(p, step) {
  if (panelNext.has(step.search)) return;
  panelNext.set(step.search, { status: "loading" });
  const watched = new Set([...(p.videos || []).map(v => v.id), currentId]);
  let video = null, source = "";
  // From your own search: what Aim already found for it, nothing to fetch.
  if (step.kind === "search") {
    const v = upNextItems(p).find(x => !watched.has(x.id));
    if (v) { video = v; source = "From your search"; }
  }
  if (!video) {
    // Your sources: channels you excluded from learning never come up; your preferred ones come first.
    const excluded = excludedNames(), preferred = new Set(preferredNames().map(n => n.toLowerCase()));
    const found = (await searchCandidates(step.search)).filter(v => !watched.has(v.id) && v.title && !excluded.has(v.channel.toLowerCase()))
      .sort((a, b) => preferred.has(b.channel.toLowerCase()) - preferred.has(a.channel.toLowerCase()));
    if (found.length && account.plus) {
      const r = await send({ type: "librarian", task: "librarian-rank", input: { target: `${step.title}, as part of: ${p.text}`, query: step.search, preferred: preferredNames(),
        results: found.slice(0, 12).map(v => ({ id: v.id, title: v.title, channel: v.channel, length: v.length })) } });
      const pick = r?.groups?.[0]?.videos?.[0];
      const v = pick && found.find(x => x.id === pick.id);
      if (v) { video = v; source = pick.reason ? `The librarian's pick: ${pick.reason}` : "The librarian's pick"; }
    }
    if (!video && found[0]) {
      video = found[0];
      source = preferred.has(video.channel.toLowerCase()) ? `From ${video.channel}, one of your preferred channels` : `YouTube's top result for “${step.search}”`;
    }
  }
  panelNext.set(step.search, video ? { status: "ready", video, source } : { status: "none" });
  renderAimPanel();
}

function playNext(step, v) {
  allowLocal([{ id: v.id, title: v.title, channel: v.channel }], [], step.search);
  send({ type: "purpose-allow", query: step.search, videos: [{ id: v.id, title: v.title, channel: v.channel }], lists: [] });
  if (step.kind === "gap") send({ type: "aim-gaps", aimId: activePurpose()?.id, videoFor: { id: step.id, videoId: v.id } });
  location.href = `/watch?v=${encodeURIComponent(v.id)}`;
}

// Explored, explained, applied: counts, never one score (SPEC §8).
function panelCounts(p) {
  const parts = p.map?.parts || [];
  const study = activeStudy(p);
  const explained = parts.filter(x => x.status === "explained").length + (study ? study.topics.filter(t => t.check).length : 0);
  const applied = (p.practice?.triedAt ? 1 : 0) + (p.scenarios || []).length;
  return { explored: (p.videos || []).length, explained, applied };
}

// The panel's folds remember whether they're open while you watch.
const panelFolds = { video: false, search: false };
function panelFold(key, id, title, sub, kids) {
  const d = el("details", { id, class: "wp-ap-fold", open: panelFolds[key] || null },
    el("summary", {}, el("span", { class: "wp-ap-fold-title" }, title), sub ? el("span", { class: "wp-muted wp-ellipsis" }, sub) : null), ...kids);
  d.addEventListener("toggle", () => { panelFolds[key] = d.open; });
  return d;
}

// A video in a list: More from your search, or a study topic's videos.
function videoRow(v, note = "") {
  return el("a", { class: "wp-upnext-item", href: `/watch?v=${encodeURIComponent(v.id)}`, title: v.title || "" },
    // A background image: if the thumbnail can't load, a grey box remains, not a broken-image icon.
    el("div", { class: "wp-upnext-thumb", style: `background-image: url("https://i.ytimg.com/vi/${encodeURIComponent(v.id)}/mqdefault.jpg")` },
      v.length ? el("span", { class: "wp-upnext-len" }, v.length) : null),
    el("div", { class: "wp-upnext-text" }, el("div", { class: "wp-upnext-title" }, v.title || "Video"),
      note || v.channel ? el("div", { class: "wp-muted" }, note || v.channel) : null));
}

// Where this aim sits, and its steps (0.78): a lesson on a plan (its steps, each one way of learning,
// 0.79; steps.js),
// a study session (its topics), or a learning aim's map (its parts, then Put it together). The step
// you're on is the one whose search found this video, or else the next one not yet explained.
// Plain searches have none.
function panelPlace(p) {
  const st = activeStudy(p);
  if (st) {
    const t = studyTopic(st);
    return { label: `Study session · Topic ${st.topics.indexOf(t) + 1} of ${st.topics.length}`, title: st.title, study: true,
      steps: st.topics.map((x, j) => ({ title: x.title, state: x === t ? "now" : !x.check ? "next" : checkLabel(x) === "Review" ? "part" : "done",
        note: x !== t && x.check ? checkLabel(x) : "", go: x === t ? null : () => goTopic(st, j) })) };
  }
  const l = p.pathRef && status.lesson?.lessonId === p.pathRef.lessonId ? status.lesson : null;
  const where = l ? `${l.interest} · Unit ${l.unit} · Lesson ${l.n} of about ${l.of}` : null;
  const ls = lessonSteps(p);
  if (ls) {
    const now = ls.current || ls.next;
    return { label: where, then: l?.next || "", lesson: !!l,
      steps: ls.steps.map(s => ({ title: stepTitle(s), kind: STEP_KINDS[s.kind], state: s === now ? "now" : s.done ? "done" : "next", final: s.kind === "show",
        note: s.skipped ? "Skipped" : "", go: s === ls.current ? null : () => openStep(p, s) })) };
  }
  const parts = p.map?.parts || [];
  if (!parts.length) return null;
  const forThis = (p.allowed || []).find(v => v.id === currentId)?.q;
  const now = parts.find(x => x.search && x.search === forThis) || parts.find(x => x.status !== "explained") || null;
  const steps = parts.map(x => ({ title: x.title, state: x === now ? "now" : x.status === "explained" ? "done" : x.status === "new" ? "next" : "part" }));
  steps.push({ title: "Put it together", state: p.map?.synthesis?.verdict === "solid" ? "done" : "next", final: true });
  return { label: where, steps, then: l?.next || "", lesson: !!l };
}

function renderAimPanel() {
  const existing = $("#wp-aimpanel");
  const p = activePurpose();
  const host = p && !brk && location.pathname === "/watch" && !(p.plan && planOn()) ? sidebarHost() : null;
  if (!host) return existing?.remove();
  if (panelEnded && panelEnded !== currentId) panelEnded = null;
  const kind = p.librarian?.kind || (p.learn ? "explore" : "");
  const quick = kind === "lookup";
  const parts = p.map?.parts || [];
  const partly = parts.filter(x => x.status === "explained" || x.status === "partial").length;
  const ready = parts.length > 0 && p.map?.synthesis?.verdict !== "solid" && parts.filter(x => x.status === "explained").length >= 2 && partly >= Math.ceil(parts.length * 0.6);
  const watched = new Set((p.videos || []).map(v => v.id));
  const followUp = (p.gaps || []).filter(g => !g.resolvedAt && g.videoId && (watched.has(g.videoId) || g.videoId === currentId)).pop();
  const ls = quick ? null : lessonSteps(p);
  const step = quick ? null : ls ? (ls.next?.kind === "watch" ? { kind: "part", title: ls.next.title, search: ls.next.search, why: `Next step: ${ls.next.title}` } : null) : panelStep(p);
  const found = step ? panelNext.get(step.search) : null;
  if (step && !found) findNext(p, step);
  const pr = p.practice, field = panelAim(p)?.scenarioDomain || null;
  const ended = panelEnded === currentId && panelPromptGone !== currentId;
  const c = panelCounts(p);
  const goalBlock = goalOfferBlock(p, renderAimPanel);
  const preBlock = goalBlock ? null : preQuestionBlock(p, renderAimPanel);
  const ct = closeTarget(p); // what the one-minute close would be about
  const place = quick ? null : panelPlace(p);
  const st = activeStudy(p);
  const items = st || quick ? [] : upNextItems(p);
  const lastQ = p.searches?.[p.searches.length - 1]?.q;
  const covers = conceptsWanted(p) && concepts?.id === currentId ? concepts : null;
  const key = [!!goalBlock, preBlock ? (preCard.done ? "pre-done" : "pre") : "", ct?.partId || "", ct?.guess ? 1 : 0, purposeIsGoal(), p.challenge?.status || "", p.id, p.text, kind, step?.search || "", found?.status || "", found?.video?.id || "", followUp?.id || "", ready, pr?.title || "", pr?.triedAt || "", field || "",
    ended, panelOpen, account.on, account.plus, currentId, c.explored, c.explained, c.applied, !!currentInfo,
    JSON.stringify(place), panelStepOpen?.aim === p.id ? panelStepOpen.i : "", st ? JSON.stringify([st.id, st.current, st.topics.map(x => [x.videos.length, x.watched.length, !!x.check])]) : "",
    lastQ || "", items.map(v => v.id).join(","), covers ? `${covers.id}:${covers.state}` : "", p.learn || ""].join("|");
  if (existing && existing.parentElement === host && host.firstElementChild === existing && existing.dataset.key === key) return;
  existing?.remove();

  // A challenge (0.70): its last step is the Final Challenge, judged against its success condition.
  const ch = p.challenge?.status === "active" ? p.challenge : null;
  const attempt = () => openTalk({ mode: "synthesis" });
  const explainIt = () => (followUp ? openTalk({ followUp }) : ready ? openTalk({ mode: "synthesis" }) : openTalk());
  const explainLabel = followUp ? `Follow up: ${followUp.title}` : ready ? (ch ? "Attempt the challenge" : "Put it together") : "Explain it";
  const signIn = () => send({ type: "open-options", section: "account" });
  const openSearch = () => { panelFolds.search = true; const f = $("#wp-upnext"); if (f) { f.open = true; f.scrollIntoView({ behavior: "smooth", block: "nearest" }); } };

  // When the video ends: one next step, chosen by context (SPEC §5). Others stay as small links.
  let prompt = null;
  if (ended) {
    const keepLearning = found?.status === "ready" ? () => playNext(step, found.video) : openSearch;
    const primary = quick ? { text: "Got what you needed?", label: doneLabel(p), go: doneAction(p) }
      : ch && ready && account.on ? { text: "You've worked through the plan. Ready for the final challenge?", label: "Attempt the challenge", go: attempt }
      : followUp && account.on ? { text: `You watched something about ${followUp.title}. Try explaining it now.`, label: "Explain it now", go: () => openTalk({ followUp }) }
      : pr && !pr.triedAt ? { text: "You've seen how. The best next step is doing it.", label: `Try it: ${pr.title}`, go: () => send({ type: "open-aim", id: p.id }) }
      : ls?.next && ls.next.kind !== "watch" && !(ct?.guess && account.on) ? { text: `Next in this lesson: ${STEP_KINDS[ls.next.kind].toLowerCase()}, ${stepTitle(ls.next)}.`,
          label: `${STEP_KINDS[ls.next.kind]}: ${shorten(stepTitle(ls.next), 40)}`, go: () => { panelPromptGone = currentId; openStep(p, ls.next); } }
      : parts.length && ct && account.on ? { text: ct.guess ? `Before it, you guessed: “${shorten(ct.guess, 90)}”. Now explain it, in a minute.` : "Explaining it now, in a minute, is when it sticks.",
          label: "Explain it in a minute", go: () => openTalk({ mode: "close", close: ct }) }
      : kind === "explore" || (parts.length && (p.videos || []).length <= 1) || !account.on ? { text: "Keep going while you're in it.", label: "Keep learning", go: keepLearning }
      : { text: "You've finished watching. Explaining it now is when it sticks.", label: "Explain what you learned", go: explainIt };
    prompt = el("div", { class: "wp-ap-prompt", role: "region", "aria-label": "Video complete" },
      el("div", { class: "wp-ap-prompt-head" }, icon("check2"), el("b", {}, "Video complete")),
      el("p", {}, primary.text),
      el("button", { class: "wp-btn wp-btn-primary wp-btn-block", onclick: primary.go }, primary.label),
      el("div", { class: "wp-ap-links" },
        primary.label !== "Keep learning" && !quick ? el("button", { class: "wp-link", onclick: keepLearning }, "Keep learning") : null,
        !quick && account.on && !/Explain/.test(primary.label) ? el("button", { class: "wp-link", onclick: explainIt }, "Explain it") : null,
        el("button", { class: "wp-link", onclick: () => { panelPromptGone = currentId; renderAimPanel(); } }, "Done for now")));
  }

  // The next step: one video for it, with why.
  const upNext = !step ? null : el("div", { class: "wp-ap-next" },
    el("div", { class: "wp-ap-label" }, place?.lesson ? "Next step" : "Up next"),
    found?.status === "ready"
      ? el("div", { class: "wp-ap-nextbox" },
          el("button", { class: "wp-ap-video", onclick: () => playNext(step, found.video), title: found.video.title },
            el("span", { class: "wp-ap-thumb", style: `background-image:url("https://i.ytimg.com/vi/${encodeURIComponent(found.video.id)}/mqdefault.jpg")` },
              found.video.length ? el("span", { class: "wp-upnext-len" }, found.video.length) : null),
            el("span", { class: "wp-ap-vtext" }, el("b", {}, found.video.title), el("span", { class: "wp-ap-why" }, step.why))),
          el("span", { class: "wp-ap-src" }, found.source),
          el("button", { class: "wp-btn wp-btn-primary wp-btn-block", onclick: () => playNext(step, found.video) }, icon("play"), "Play next"))
      : found?.status === "none"
        ? el("div", { class: "wp-ap-none" }, `Nothing convincing came up for “${step.search}”. `, el("button", { class: "wp-link", onclick: () => { location.href = "/results?search_query=" + encodeURIComponent(step.search); } }, "Search it yourself"))
        : el("div", { class: "wp-ap-none" }, `Finding a video for: ${step.title}…`));

  // A lesson's step opened from the list, else its next step when that isn't a video: its card.
  const openI = panelStepOpen?.aim === p.id ? panelStepOpen.i : null;
  const cardStep = !ls ? null : ls.steps.find(s => openI !== null && s.i === openI && !(s.kind === "watch" && s.search)) || (ls.next && ls.next.kind !== "watch" ? ls.next : null);

  // The steps, with where you are.
  const steps = place?.steps?.length ? el("ol", { class: "wp-ap-steps", "aria-label": place.study ? "Topics" : "Steps" },
    ...place.steps.slice(0, 9).map(s => el("li", { class: `wp-ap-step ${s.state}${s.final ? " final" : ""}`, "aria-current": s.state === "now" ? "step" : null },
      el("span", { class: "wp-ap-step-mark", "aria-hidden": "true" }),
      el("span", { class: "wp-ap-step-main" }, s.kind ? el("span", { class: "wp-ap-step-kind" }, s.kind) : null,
        s.go ? el("button", { class: "wp-link", onclick: s.go }, s.title) : el("span", { class: "wp-ap-step-title" }, s.title)),
      s.note ? el("span", { class: "wp-ap-step-note" }, s.note) : null))) : null;

  // More: Learn, Explain, Apply; where you are; a break.
  const row = (ic, title, sub, onclick) => el("button", { class: "wp-ap-row", onclick }, el("span", { class: "wp-ap-ico" }, icon(ic)),
    el("span", { class: "wp-ap-text" }, el("b", {}, title), el("span", {}, sub)), icon("right"));
  const more = !panelOpen || quick ? null : el("div", { class: "wp-ap-more" },
    el("div", { class: "wp-ap-counts" },
      el("span", {}, el("b", {}, String(c.explored)), " explored"), el("span", {}, el("b", {}, String(c.explained)), " explained"), el("span", {}, el("b", {}, String(c.applied)), " applied")),
    row("book", "Learn", step ? step.title : "More from your search", () => (found?.status === "ready" ? playNext(step, found.video) : openSearch())),
    ch ? row("target", "Final challenge", ch.success, account.on ? attempt : signIn) : null,
    row("talk", "Explain", account.on ? (followUp ? `Follow up: ${followUp.title}` : ready ? "Put the whole answer together" : "Teach it back to a practice student") : "Sign in to teach it back", account.on ? explainIt : signIn),
    pr && !pr.triedAt ? row("tool", "Apply", pr.title, () => send({ type: "open-aim", id: p.id }))
      : field ? row("tool", "Apply", "Run a scenario", () => send({ type: "open-scenario", aimId: p.id }))
      : row("tool", "Apply", pr ? `You tried: ${pr.title}` : "Projects and practice", () => send({ type: "open-aim", id: p.id })),
    el("div", { class: "wp-ap-links" },
      el("button", { class: "wp-link", onclick: () => send({ type: "open-targets" }) }, "Library"),
      currentInfo ? el("button", { class: "wp-link", onclick: () => saveCurrent(false) }, "Save this video") : null,
      el("button", { class: "wp-link", onclick: openBreakDialog }, "Take a break"),
      el("button", { class: "wp-link", onclick: () => openPivotDialog() }, "Change aim")));

  const lessonExplain = ls?.steps.find(s => s.kind === "explain" && !s.done), lessonTry = ls?.steps.find(s => s.kind === "try" && !s.done);
  const label = place?.label || (p.challenge ? (p.challenge.status === "completed" ? "Challenge complete" : "Your challenge") : quick ? "Looking for" : kind === "explore" ? "Exploring" : purposeIsGoal() ? "You're learning" : "Searching for");
  const panel = el("div", { id: "wp-aimpanel", class: "wp wp-aimpanel", "data-key": key },
    el("div", { class: "wp-ap-head" },
      el("span", { class: "wp-icon" }, svgIcon("logo")), el("b", {}, BRAND),
      quick ? null : el("button", { class: "wp-icon-btn", "aria-expanded": String(panelOpen), title: panelOpen ? "Less" : "More", "aria-label": panelOpen ? "Show less" : "Show more",
        onclick: () => { panelOpen = !panelOpen; renderAimPanel(); } }, icon("chevron")),
      el("button", { class: "wp-icon-btn", title: "Open this aim's page", "aria-label": "Open this aim's page", onclick: () => send({ type: "open-aim", id: p.id }) }, icon("right"))),
    el("div", { class: "wp-ap-aim" },
      el("span", { class: "wp-ap-target" }, icon("target")),
      el("div", { class: "wp-ap-aimtext" }, el("span", { class: "wp-ap-label" }, label), el("b", {}, place?.title || (p.learn ? p.learn : p.text))),
      place?.study ? el("button", { class: "wp-link", onclick: () => send({ type: "open-study" }) }, "Overview")
        : el("button", { class: "wp-link", onclick: () => openPivotDialog() }, "Change")),
    steps,
    place?.then ? el("div", { class: "wp-ap-then wp-muted" }, `Then: ${place.then}`) : null,
    goalBlock,
    preBlock,
    prompt,
    goDeeperRow(p),
    el("div", { class: "wp-ap-connect" }),
    st ? studySection(p) : null,
    quick && !ended ? el("button", { class: "wp-btn wp-btn-tonal wp-btn-block", onclick: doneAction(p) }, doneLabel(p)) : null,
    ended || st ? null : cardStep ? stepCard(p, cardStep, { attempt, signIn }) : upNext,
    quick ? null : el("div", { class: "wp-ap-tiles" },
      lessonExplain ? el("button", { class: "wp-ap-tile", title: lessonExplain.title, onclick: () => openStep(p, lessonExplain) }, icon("talk"), "Explain")
        : el("button", { class: "wp-ap-tile", title: account.on ? explainLabel : "Sign in to talk it through", onclick: account.on ? explainIt : signIn }, icon("talk"), followUp && account.on ? "Follow up" : ready && account.on ? "Put together" : "Explain"),
      lessonTry ? el("button", { class: "wp-ap-tile", title: lessonTry.title, onclick: () => openStep(p, lessonTry) }, icon("tool"), "Try it")
        : el("button", { class: "wp-ap-tile", title: pr ? pr.title : field ? "Run a scenario" : "Projects and practice",
          onclick: () => (field && !(pr && !pr.triedAt) ? send({ type: "open-scenario", aimId: p.id }) : send({ type: "open-aim", id: p.id })) }, icon("tool"), "Try it"),
      el("button", { class: "wp-ap-tile", onclick: openNotesDialog }, icon("note"), "Notes")),
    covers ? conceptsSection() : null,
    st || quick ? null : panelFold("search", "wp-upnext", p.learn && !lastQ ? "More to explore" : "More from your search", lastQ ? `“${lastQ}”` : p.learn ? "Today's picks" : "",
      items.length ? items.map(v => videoRow(v)) : [el("div", { class: "wp-muted wp-upnext-empty" }, "Search toward your aim, and what you find shows up here.")]),
    more);
  host.prepend(panel);
  connectionLine(panel);
  if (covers?.state === "ready") watchForEnd();
}
