// Waypoint — runs on youtube.com
// Stay focused when you can. Pivot when you choose. Explore when you intend to.

(() => {
  // ---------------- state ----------------
  let session = null;          // current Focus/Explore session (from storage)
  let level = "balanced";
  let settings = { recMode: "mark", hasKey: false, homeCard: true };
  let currentId = null;        // video on screen
  let currentInfo = null;
  const skipped = new Set();   // videos watched without a session (counts as leisure)
  let holding = false;         // keep the video paused until cleared
  const cleared = new Set();   // videos cleared to play in this tab
  const overridden = new Set();// videos where a rule was knowingly broken
  let timeUpShown = false;
  let modal = null, notice = null, dropdown = null;
  let endingHere = false;      // this tab ended the session (vs. the popup or another tab)

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const send = msg => new Promise(res => chrome.runtime.sendMessage(msg, r => res(r)));
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  const ICON = {
    waypoint: `<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M12 5.5l2.4 6.5L12 18.5 9.6 12z" fill="currentColor"/></svg>`,
    chevron: `<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M7 10l5 5 5-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    right: `<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M10 7l5 5-5 5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    pivot: `<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M4 12a8 8 0 0 1 13.7-5.6M20 12a8 8 0 0 1-13.7 5.6M18 3v4h-4M6 21v-4h4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    pause: `<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M10 9v6M14 9v6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`,
    play: `<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M10.5 8.8l4.5 3.2-4.5 3.2z" fill="currentColor"/></svg>`,
    save: `<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M7 4h10v16l-5-3.5L7 20z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>`,
    clock: `<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M12 7v5l3 2" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`,
    end: `<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.8"/><rect x="9" y="9" width="6" height="6" rx="1" fill="currentColor"/></svg>`,
    check2: `<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M8 12.5l2.7 2.7L16 9.8" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    search: `<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M15.5 15.5L20 20" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`,
    check: `<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><circle cx="12" cy="12" r="10" fill="currentColor"/><path d="M7.5 12.5l3 3 6-6.5" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    avoid: `<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M5.6 5.6l12.8 12.8" stroke="currentColor" stroke-width="1.8"/></svg>`,
    close: `<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`
  };

  function el(tag, attrs = {}, ...kids) {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === "class") n.className = v;
      else if (k === "html") n.innerHTML = v; // constant icon markup only
      else if (k.startsWith("on")) n.addEventListener(k.slice(2), v);
      else n.setAttribute(k, v === true ? "" : v);
    }
    for (const k of kids) if (k != null && k !== false) n.append(k);
    return n;
  }
  const icon = name => el("span", { class: "wp-icon", html: ICON[name] });

  // Purpose decides what kind of time this is: Focus and Quick answers are purposeful,
  // Explore and watching without a session are leisure.
  const watchKind = () => (session && session.mode !== "explore" ? "purposeful" : "leisure");
  const fmtMin = sec => `${Math.max(0, Math.ceil(sec / 60))} min`;
  const remaining = s => (s ? Math.max(0, s.budgetMin * 60 - s.usedSec) : 0);

  // ---------------- video helpers ----------------
  function videoIdFromUrl() {
    const u = new URL(location.href);
    if (u.pathname === "/watch") return u.searchParams.get("v");
    const m = u.pathname.match(/^\/shorts\/([^/?]+)/);
    return m ? m[1] : null;
  }
  const getVideoEl = () => $("video.html5-main-video") || $("video");

  document.addEventListener("play", e => {
    if (holding && e.target.tagName === "VIDEO") e.target.pause();
  }, true);

  function hold() { holding = true; getVideoEl()?.pause(); }
  function release(id) {
    cleared.add(id);
    holding = false;
    getVideoEl()?.play().catch(() => {});
  }
  function goBack() {
    holding = false;
    closeModal();
    if (history.length > 1) history.back();
    else location.href = "https://www.youtube.com/";
  }

  function channelLink() {
    return $("ytd-watch-metadata #channel-name a") || $("#owner #channel-name a") ||
      $("ytd-reel-player-overlay-renderer #channel-name a") || $("yt-reel-channel-bar-view-model a");
  }

  async function readVideoInfo(id) {
    for (let i = 0; i < 25 && !channelLink(); i++) await sleep(200);
    const link = channelLink();
    const channel = link?.textContent?.trim() || "";
    let channelKey = channel;
    try { if (link?.href) channelKey = new URL(link.href).pathname; } catch {}
    const title =
      $("h1.ytd-watch-metadata yt-formatted-string")?.textContent?.trim() ||
      document.title.replace(/ - YouTube$/, "").trim();
    const description =
      $("ytd-watch-metadata #description-inline-expander")?.innerText?.trim() ||
      $('meta[name="description"]')?.content || "";
    return { id, title, channel, channelKey, description };
  }

  // ---------------- top-bar chip + dropdown ----------------
  function renderChip() {
    const host = $("ytd-masthead #end");
    if (!host) return;
    let chip = $("#wp-chip");
    if (!chip) {
      chip = el("div", { id: "wp-chip", class: "wp" });
      host.prepend(chip);
    }
    chip.replaceChildren();
    const brand = el("span", { class: "wp-brand" }, icon("waypoint"), el("span", { class: "wp-brand-name" }, "Waypoint"));
    if (!session) {
      chip.append(brand, el("button", { class: "wp-pill wp-pill-solid", onclick: () => openStartDialog(null) }, "Start a session"));
      return;
    }
    const label = session.paused ? "Paused" : { focus: "Focus", explore: "Explore", quick: "Quick answer" }[session.mode];
    const pill = el("button", {
      class: `wp-pill wp-pill-${session.paused ? "paused" : session.mode}`,
      "aria-haspopup": "menu",
      onclick: e => { e.stopPropagation(); dropdown ? closeDropdown() : openDropdown(); }
    }, el("span", {}, label), session.mode !== "quick" ? el("span", { class: "wp-pill-time" }, fmtMin(remaining(session))) : null, icon("chevron"));
    chip.append(brand, pill);
  }

  function closeDropdown() { dropdown?.remove(); dropdown = null; }
  document.addEventListener("click", e => { if (dropdown && !dropdown.contains(e.target)) closeDropdown(); });

  function menuItem(iconName, text, onclick, opts = {}) {
    return el("button", { class: "wp-menu-item" + (opts.danger ? " wp-danger" : ""), onclick: () => { closeDropdown(); onclick(); } },
      icon(iconName), el("span", {}, text), opts.hint ? el("span", { class: "wp-hint" }, opts.hint) : null);
  }

  async function openDropdown() {
    if (!session) return;
    const pill = $("#wp-chip .wp-pill");
    const r = pill.getBoundingClientRect();
    const pct = Math.min(100, (remaining(session) / (session.budgetMin * 60)) * 100);
    const isQuick = session.mode === "quick";
    const isFocus = session.mode === "focus" || isQuick;

    const head = el("button", { class: "wp-menu-head", onclick: () => { closeDropdown(); openPivotDialog(); } },
      el("div", {},
        el("div", { class: "wp-label" }, isQuick ? "Quick answer" : isFocus ? "Current purpose" : "Explore session"),
        el("div", { class: "wp-strong" }, isFocus ? session.purpose : `Exploring · ${session.budgetMin} minutes`)),
      icon("right"));

    const time = el("div", { class: "wp-menu-block" },
      el("div", { class: "wp-label" }, "Time remaining"),
      el("div", { class: "wp-strong" }, fmtMin(remaining(session))),
      el("div", { class: "wp-bar" }, el("i", { style: `width:${pct}%` })));

    const items = el("div", { class: "wp-menu-items" });
    if (isQuick) items.append(
      menuItem("check2", "Got my answer", gotMyAnswer),
      menuItem("clock", "Turn into a Focus session", openConvertDialog),
      menuItem("pivot", "Change purpose", openPivotDialog));
    else if (isFocus) items.append(menuItem("pivot", "Change purpose", openPivotDialog));
    else items.append(
      menuItem("clock", "Extend time", () => openExtendDialog(), { hint: level === "strict" ? "(requires reason)" : null }),
      menuItem("pivot", "Change to Focus", openPivotDialog));
    items.append(session.paused
      ? menuItem("play", "Resume session", resumeSession)
      : menuItem("pause", "Pause session", async () => { await updateSession({ paused: true }); if (videoIdFromUrl()) showPaused(); }));
    if (currentId && currentInfo) items.append(
      menuItem("save", "Save this video for later", () => saveCurrent(false)),
      menuItem("avoid", "Avoid this channel", openAvoidDialog));
    items.append(menuItem("end", "End session", finishSession, { danger: true }));

    dropdown = el("div", { class: "wp wp-dropdown", role: "menu", onclick: e => e.stopPropagation() }, head);
    if (!isQuick) dropdown.append(time);
    if (session.searches?.length > 1) dropdown.append(el("div", { class: "wp-menu-block" },
      el("div", { class: "wp-label" }, "Searches toward this purpose"),
      el("div", { class: "wp-muted" }, session.searches.slice(-4).join(" · "))));

    if (session.mode === "focus") {
      const path = el("div", { class: "wp-menu-block wp-path" }, el("div", { class: "wp-label" }, "Suggested path"));
      dropdown.append(path);
      loadSuggestions(path);
    }
    dropdown.append(items);
    dropdown.style.top = `${r.bottom + 8}px`;
    dropdown.style.right = `${Math.max(16, innerWidth - r.right)}px`;
    document.body.append(dropdown);
  }

  async function loadSuggestions(container) {
    if (!settings.hasKey) {
      container.append(el("div", { class: "wp-muted" }, "Add a Claude API key in settings for suggestions."));
      return;
    }
    let list = session.suggestions?.purpose === session.purpose ? session.suggestions.items : null;
    if (!list) {
      const loading = el("div", { class: "wp-muted" }, "Finding a path…");
      container.append(loading);
      list = await send({ type: "suggest-path", purpose: session.purpose });
      loading.remove();
      if (Array.isArray(list) && list.length) {
        session = await send({ type: "session-patch", patch: { suggestions: { purpose: session.purpose, items: list } } });
      }
    }
    if (!Array.isArray(list) || !list.length) { container.append(el("div", { class: "wp-muted" }, "No suggestions right now.")); return; }
    list.slice(0, 3).forEach((s, i) => container.append(
      el("a", { class: "wp-suggest", href: "https://www.youtube.com/results?search_query=" + encodeURIComponent(s.query || s.label) },
        el("span", { class: "wp-num" }, String(i + 1)), el("span", {}, s.label || s.query))));
  }

  async function updateSession(patch) {
    session = await send({ type: "session-patch", patch });
    renderChip();
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
  const minLabel = m => (m >= 60 ? `${m / 60}h` : `${m}m`);

  // 1. Session start — "What do you want to accomplish?"
  function openStartDialog(info, initialMode = "focus") {
    let mode = initialMode;
    const purpose = el("textarea", { class: "wp-input", rows: "2", placeholder: "e.g. Learn how to build a small cabin foundation" });
    const time = chips([15, 30, 45, 60], 30, minLabel);
    const err = el("div", { class: "wp-error" });
    const purposeBlock = el("div", {}, el("label", { class: "wp-q" }, "What do you want to accomplish?"), purpose);
    const exploreNote = el("p", { class: "wp-muted", hidden: true }, "No purpose needed. Waypoint just keeps time.");
    // Explore draws from today's leisure allowance.
    let leisure = null;
    send({ type: "check", channelKey: "", kind: "leisure" }).then(c => {
      leisure = c;
      if (!c) return;
      exploreNote.textContent = c.daily.status !== "ok"
        ? `${c.daily.message} Focus sessions are still open.`
        : c.leisureLeft === Infinity || c.limits.leisureMin === 0
          ? "No purpose needed. Waypoint just keeps time."
          : `No purpose needed. You have ${c.leisureLeft} minutes of leisure left today.`;
    });

    const modeRow = el("div", { class: "wp-seg" });
    const renderMode = () => {
      modeRow.replaceChildren(
        el("button", { class: "wp-seg-btn" + (mode === "focus" ? " on" : ""), onclick: () => { mode = "focus"; renderMode(); } }, "Focus"),
        el("button", { class: "wp-seg-btn" + (mode === "explore" ? " on" : ""), onclick: () => { mode = "explore"; renderMode(); } }, "Just exploring"));
      purposeBlock.hidden = mode !== "focus";
      exploreNote.hidden = mode !== "explore";
    };
    renderMode();

    const start = async () => {
      const p = purpose.value.trim();
      if (mode === "focus" && p.length < 4) { err.textContent = "Write what you want to accomplish."; return; }
      let budgetMin = time.get();
      if (mode === "explore" && leisure) {
        if (leisure.daily.status !== "ok") { err.textContent = leisure.daily.message; return; }
        if (leisure.limits.leisureMin > 0 || leisure.limits.totalMin > 0) budgetMin = Math.min(budgetMin, leisure.leisureLeft);
        if (budgetMin < time.get()) toast(`Capped at ${budgetMin} minutes: what's left of today's leisure`);
      }
      session = await send({ type: "session-start", mode, purpose: mode === "focus" ? p : "", budgetMin });
      timeUpShown = false;
      closeModal();
      renderChip();
      if (info) evaluateVideo(info);
    };
    keepKeys(purpose, start);

    const actions = el("div", { class: "wp-actions" });
    // Skipping the session: one click in Lenient, a typed reason in Balanced, not offered in Strict.
    const skipReason = el("textarea", { class: "wp-input", rows: "2", placeholder: "Why watch without a session?", hidden: true });
    keepKeys(skipReason);
    if (info && level !== "strict") {
      const skip = el("button", { class: "wp-btn wp-btn-text", onclick: () => {
        if (level === "balanced") {
          if (skipReason.hidden) { skipReason.hidden = false; skipReason.focus(); skip.textContent = "Skip with this reason"; return; }
          if (skipReason.value.trim().length < 10) { err.textContent = "Write a real reason (a short sentence)."; return; }
        }
        send({ type: "log", entry: { kind: "no-session", videoId: info.id, title: info.title, reason: skipReason.value.trim() } });
        skipped.add(info.id);
        closeModal();
        send({ type: "check", channelKey: info.channelKey, kind: "leisure" }).then(c => continueAfterRules(info, c));
      } }, "Watch without a session");
      actions.append(skip);
    }
    if (!info) actions.append(el("button", { class: "wp-btn wp-btn-text", onclick: closeModal }, "Cancel"));
    actions.append(el("button", { class: "wp-btn wp-btn-primary", onclick: start }, "Start session"));

    openModal(el("div", { class: "wp-dialog", role: "dialog", "aria-modal": "true" },
      el("div", { class: "wp-dialog-brand" }, icon("waypoint"), "Waypoint"),
      info ? el("div", { class: "wp-muted wp-ellipsis" }, `Up next: ${info.title}`) : null,
      modeRow, purposeBlock, exploreNote,
      el("label", { class: "wp-q wp-q-sm" }, "How much time do you want to spend?"), time.row,
      skipReason, err, actions));
    setTimeout(() => purpose.focus(), 50);
  }

  // 2. Change direction — the intentional pivot
  function openPivotDialog(prefill = "", { releaseAfter = false, afterConfirm = null } = {}) {
    if (typeof prefill !== "string") prefill = "";
    if (!session) return;
    const remainingMin = Math.ceil(remaining(session) / 60);
    const purpose = el("textarea", { class: "wp-input", rows: "2", placeholder: "e.g. Understand soil conditions first" });
    purpose.value = prefill;
    let keep = true;
    const time = chips([15, 30, 45, 60], 30, minLabel);
    const reason = el("textarea", { class: "wp-input", rows: "2", placeholder: "Why add time? (Strict mode)" });
    const err = el("div", { class: "wp-error" });
    const timeBox = el("div", {});
    const renderTime = () => {
      timeBox.replaceChildren(...[
        el("label", { class: "wp-radio" }, el("input", { type: "radio", name: "wp-t", checked: keep, onchange: () => { keep = true; renderTime(); } }), "Keep my remaining time"),
        el("label", { class: "wp-radio" }, el("input", { type: "radio", name: "wp-t", checked: !keep, onchange: () => { keep = false; renderTime(); } }), "Set a new time limit"),
        !keep ? time.row : null,
        !keep && level === "strict" ? reason : null].filter(Boolean));
    };
    renderTime();
    keepKeys(purpose); keepKeys(reason);

    const confirm = async () => {
      const r = await send({ type: "session-pivot", purpose: purpose.value, budgetMin: keep ? null : time.get(), reason: reason.value });
      if (r.result === "error") { err.textContent = r.message; return; }
      session = r.session;
      timeUpShown = false;
      closeModal();
      if (afterConfirm) session = (await afterConfirm()) || session;
      renderChip();
      toast(`Purpose changed: ${session.purpose}`);
      if (currentInfo && holding) releaseAfter ? release(currentInfo.id) : evaluateVideo(currentInfo);
    };

    openModal(el("div", { class: "wp-dialog", role: "dialog", "aria-modal": "true" },
      el("div", { class: "wp-title" }, "Change direction"),
      session.purpose ? el("div", { class: "wp-current" }, el("div", { class: "wp-label" }, "Current purpose"), el("div", { class: "wp-strong" }, session.purpose)) : null,
      el("label", { class: "wp-q wp-q-sm" }, "What would you like to focus on instead?"), purpose,
      el("div", { class: "wp-row-between" }, el("span", { class: "wp-label" }, "Time remaining"), el("span", { class: "wp-strong" }, `${remainingMin} minutes`)),
      timeBox, err,
      el("div", { class: "wp-actions" },
        el("button", { class: "wp-btn wp-btn-text", onclick: closeModal }, "Cancel"),
        el("button", { class: "wp-btn wp-btn-primary", onclick: confirm }, "Confirm new purpose"))));
    setTimeout(() => purpose.focus(), 50);
  }

  // Extend time (Explore, or from the time-up notice)
  function openExtendDialog() {
    if (level !== "strict") return extend(15, "");
    const reason = el("textarea", { class: "wp-input", rows: "2", placeholder: "Why add 15 minutes?" });
    const err = el("div", { class: "wp-error" });
    keepKeys(reason);
    openModal(el("div", { class: "wp-dialog" },
      el("div", { class: "wp-title" }, "Extend time"),
      el("p", { class: "wp-muted" }, "Strict mode: extending is a deliberate decision."),
      reason, err,
      el("div", { class: "wp-actions" },
        el("button", { class: "wp-btn wp-btn-text", onclick: closeModal }, "Cancel"),
        el("button", { class: "wp-btn wp-btn-primary", onclick: async () => {
          const ok = await extend(15, reason.value);
          if (!ok) err.textContent = "Write a real reason (a short sentence).";
          else closeModal();
        } }, "Add 15 minutes"))));
    setTimeout(() => reason.focus(), 50);
  }

  async function extend(minutes, reason) {
    const r = await send({ type: "session-extend", minutes, reason });
    if (r.daily) { closeModal(); toast(r.message); return true; } // the day's limit wins over the session
    if (r.result !== "applied") return false;
    session = r.session;
    timeUpShown = false;
    closeNotice();
    renderChip();
    if (currentId && currentInfo && holding) cleared.has(currentId) ? release(currentId) : evaluateVideo(currentInfo);
    toast(`Added ${minutes} minutes`);
    return true;
  }

  // Your rules: daily limits and avoided channels.
  // rule = { status, message, level, soft } — soft rules (an Avoid → warn channel) just ask.
  function openRuleDialog(info, rule) {
    hold();
    const id = info.id;
    const actions = el("div", { class: "wp-actions" });
    const body = [];
    const watchAnyway = async (reason = "") => {
      await send({ type: "override", video: info, reason, status: rule.status });
      overridden.add(id);
      closeModal();
      const c = await send({ type: "check", channelKey: info.channelKey, kind: watchKind() });
      continueAfterRules(info, c);
    };
    if (rule.soft) {
      actions.append(
        el("button", { class: "wp-btn wp-btn-text", onclick: () => watchAnyway() }, "Watch anyway"),
        el("button", { class: "wp-btn wp-btn-primary", onclick: goBack }, "Go back"));
    } else if (rule.level === "strict") {
      body.push(el("p", { class: "wp-muted" }, "Strict mode is on, so this stays closed. You set this rule for a reason."));
      actions.append(el("button", { class: "wp-btn wp-btn-primary", onclick: goBack }, "Go back"));
    } else {
      const reason = el("textarea", { class: "wp-input", rows: "2", placeholder: "Why break your rule this time?" });
      const err = el("div", { class: "wp-error" });
      keepKeys(reason);
      if (rule.level === "balanced") body.push(reason, err);
      actions.append(
        el("button", { class: "wp-btn wp-btn-text", onclick: () => {
          if (rule.level === "balanced" && reason.value.trim().length < 10) { err.textContent = "Write a real reason (a short sentence)."; return; }
          watchAnyway(reason.value.trim());
        } }, "Watch anyway"),
        el("button", { class: "wp-btn wp-btn-primary", onclick: goBack }, "Go back"));
    }
    const hint = { leisure: "Focus sessions and quick answers aren't affected. Purposeful time stays open.",
      hours: "Focus sessions and quick answers aren't affected.", total: "This covers all YouTube time today." }[rule.status];
    openModal(el("div", { class: "wp-dialog" },
      el("div", { class: "wp-dialog-brand" }, icon("waypoint"), "Your rule"),
      el("div", { class: "wp-title" }, rule.message),
      hint ? el("div", { class: "wp-muted" }, hint) : null,
      ...body, actions));
  }

  // Optional channel rule, set from the dropdown while watching.
  function openAvoidDialog() {
    if (!currentInfo) return;
    const info = currentInfo;
    const pick = action => async () => {
      const r = await send({ type: "avoid", key: info.channelKey, name: info.channel, action });
      closeModal();
      toast(r.result === "applied" ? `${info.channel}: ${action === "block" ? "blocked" : "you'll get a warning"}` : r.message);
      if (r.result === "applied" && action === "block") goBack();
    };
    openModal(el("div", { class: "wp-dialog", role: "dialog", "aria-modal": "true" },
      el("div", { class: "wp-title" }, `Avoid ${info.channel || "this channel"}?`),
      el("p", { class: "wp-muted" }, "Warn: you're asked before watching, outside Focus sessions. Block: closed at every level your strictness allows. Undoing either waits 24 hours."),
      el("div", { class: "wp-actions" },
        el("button", { class: "wp-btn wp-btn-text", onclick: closeModal }, "Cancel"),
        el("button", { class: "wp-btn wp-btn-tonal", onclick: pick("warn") }, "Warn me"),
        el("button", { class: "wp-btn wp-btn-primary", onclick: pick("block") }, "Block"))));
  }

  // ---------------- notices (bottom bar, YouTube-toast style) ----------------
  function closeNotice() { notice?.remove(); notice = null; }
  function showNotice(content, { dismissible = true } = {}) {
    closeNotice();
    notice = el("div", { class: "wp wp-notice", role: "status" }, ...content,
      dismissible ? el("button", { class: "wp-icon-btn", "aria-label": "Dismiss", onclick: closeNotice, html: ICON.close }) : null);
    document.body.append(notice);
    return notice;
  }
  function toast(text) {
    const t = el("div", { class: "wp wp-toast" }, text);
    document.body.append(t);
    setTimeout(() => t.remove(), 3200);
  }

  // When you start to drift
  function showDrift(info) {
    hold();
    showNotice([
      el("span", { class: "wp-notice-icon" }, icon("pivot")),
      el("div", { class: "wp-notice-text" }, el("div", { class: "wp-strong" }, "This video looks different from your current purpose."),
        el("div", { class: "wp-muted wp-ellipsis" }, session.purpose)),
      el("div", { class: "wp-notice-actions" },
        el("button", { class: "wp-btn wp-btn-tonal", onclick: () => { closeNotice(); goBack(); } }, "Stay focused"),
        el("button", { class: "wp-btn wp-btn-tonal", onclick: () => { closeNotice(); openPivotDialog("", { releaseAfter: true }); } }, "Change purpose"),
        el("button", { class: "wp-btn wp-btn-tonal", onclick: () => saveCurrent(true) }, "Save for later"))
    ], { dismissible: false });
  }

  async function saveCurrent(thenLeave) {
    if (!currentInfo) return;
    await send({ type: "save", video: currentInfo });
    closeNotice();
    toast("Saved for later. Find it under the Waypoint icon.");
    if (thenLeave) goBack();
  }

  // A pause is a break from YouTube, not free watching.
  function showPaused() {
    hold();
    showNotice([
      el("span", { class: "wp-notice-icon" }, icon("pause")),
      el("div", { class: "wp-notice-text" }, el("div", { class: "wp-strong" }, "Your session is paused"),
        el("div", { class: "wp-muted" }, "Videos stay paused until you resume.")),
      el("div", { class: "wp-notice-actions" },
        el("button", { class: "wp-btn wp-btn-primary", onclick: resumeSession }, "Resume"),
        el("button", { class: "wp-btn wp-btn-tonal", onclick: finishSession }, "End session"))
    ], { dismissible: false }).dataset.keep = "1";
  }

  async function resumeSession() {
    await updateSession({ paused: false });
    closeNotice();
    if (currentInfo && holding) evaluateVideo(currentInfo);
  }

  // When time runs out
  function showTimeUp() {
    timeUpShown = true;
    if (videoIdFromUrl()) hold(); // time's up means the video stops, at every strictness level
    showNotice([
      el("span", { class: "wp-notice-icon" }, icon("clock")),
      el("div", { class: "wp-notice-text" }, el("div", { class: "wp-strong" }, "Your time is up"),
        el("div", { class: "wp-muted" }, `You've reached your ${session.budgetMin} minute session limit.`)),
      el("div", { class: "wp-notice-actions" },
        el("button", { class: "wp-btn wp-btn-primary", onclick: finishSession }, "End session"),
        el("button", { class: "wp-btn wp-btn-tonal", onclick: openExtendDialog }, "Add 15 minutes"))
    ], { dismissible: false }).dataset.keep = "1";
  }

  // Session end — a brief reflection
  // Ending a session (or running out of time) never leaves you inside a video.
  // You land back on the "What brings you here?" card, with a short reflection.
  async function finishSession(outcome) {
    endingHere = true;
    if (videoIdFromUrl()) hold();
    const s = await send({ type: "session-end", outcome: typeof outcome === "string" ? outcome : null });
    session = null;
    cleared.clear();
    overridden.clear();
    if (s) await chrome.storage.local.set({ reflection: s });
    location.href = "https://www.youtube.com/";
  }

  async function showReflection() {
    const { reflection: s } = await chrome.storage.local.get("reflection");
    if (!s) return;
    await chrome.storage.local.remove("reflection");
    if (s.outcome === "yes" && s.mode === "quick") { toast("Glad you found it."); return; }
    const mins = Math.max(1, Math.round(s.usedSec / 60));
    const { saved = [] } = await chrome.storage.local.get("saved");
    const pathText = s.path.length > 1 ? s.path.map(p => p.purpose).join(" → ") : null;
    const rate = outcome => async () => {
      await send({ type: "session-rate", outcome });
      closeNotice();
      toast(outcome === "yes" ? "Nice work." : "Noted. That's useful to know.");
    };
    showNotice([
      el("span", { class: "wp-notice-icon wp-accent" }, icon("check")),
      el("div", { class: "wp-notice-text" },
        el("div", { class: "wp-strong" }, "Session complete"),
        el("div", { class: "wp-muted" }, s.mode !== "explore" ? `You spent ${mins} minutes on: ${s.purpose}` : `You explored for ${mins} minutes.`),
        pathText ? el("div", { class: "wp-muted wp-ellipsis" }, `Path: ${pathText}`) : null,
        saved.length ? el("div", { class: "wp-muted" }, `${saved.length} saved for later. Start a session for them from the Waypoint icon.`) : null),
      s.mode !== "explore" ? el("div", { class: "wp-notice-actions wp-col" },
        el("div", { class: "wp-label" }, "Did you get what you came for?"),
        el("div", { class: "wp-notice-actions" },
          el("button", { class: "wp-btn wp-btn-tonal", onclick: rate("yes") }, "Yes"),
          el("button", { class: "wp-btn wp-btn-tonal", onclick: rate("partly") }, "Partly"),
          el("button", { class: "wp-btn wp-btn-tonal", onclick: rate("no") }, "No"))) : null
    ]);
  }

  // ---------------- recommendations ----------------
  function recItems() {
    const root = $("#secondary") || $("#related");
    if (!root) return [];
    const seen = new Set(), items = [];
    for (const r of $$("ytd-compact-video-renderer, yt-lockup-view-model", root)) {
      const a = $('a[href*="/watch?v="]', r);
      const title = ($("#video-title", r)?.textContent || $("h3", r)?.textContent || a?.title || "").trim();
      if (!a || !title || seen.has(a.href)) continue;
      seen.add(a.href);
      items.push({ node: r, title });
      if (items.length >= 15) break;
    }
    return items;
  }

  function clearRecLabels() {
    for (const n of $$("[data-wp-rec]")) {
      n.removeAttribute("data-wp-rec");
      n.querySelector(":scope > .wp-rec-tag")?.remove();
    }
  }

  async function labelRecommendations() {
    if (!session || session.mode === "explore" || session.paused || !settings.hasKey || settings.recMode === "off") return;
    const items = recItems().filter(i => !i.node.hasAttribute("data-wp-rec"));
    if (!items.length) return;
    const purposeAtStart = session.purpose;
    const labels = await send({ type: "label-recs", purpose: purposeAtStart, titles: items.map(i => i.title) });
    if (!Array.isArray(labels) || !session || session.purpose !== purposeAtStart) return;
    const TEXT = { match: "Matches your purpose", related: "Related perspective", off: "Off purpose" };
    items.forEach((it, i) => {
      const lab = labels[i];
      if (!TEXT[lab]) return;
      it.node.setAttribute("data-wp-rec", settings.recMode === "hide" && lab === "off" ? "hidden" : lab);
      if (lab !== "off" || settings.recMode === "mark")
        it.node.prepend(el("div", { class: `wp wp-rec-tag wp-rec-${lab}` }, TEXT[lab]));
    });
  }


  // ---------------- quick answers ----------------
  function gotMyAnswer() { return finishSession("yes"); }

  function openConvertDialog() {
    if (!session) return;
    const time = chips([15, 30, 45, 60], 30, minLabel);
    openModal(el("div", { class: "wp-dialog", role: "dialog", "aria-modal": "true" },
      el("div", { class: "wp-title" }, "Turn this into a Focus session"),
      el("div", { class: "wp-current" }, el("div", { class: "wp-label" }, "Your purpose"), el("div", { class: "wp-strong" }, session.purpose)),
      el("label", { class: "wp-q wp-q-sm" }, "How much time do you want to spend?"), time.row,
      el("div", { class: "wp-actions" },
        el("button", { class: "wp-btn wp-btn-text", onclick: closeModal }, "Cancel"),
        el("button", { class: "wp-btn wp-btn-primary", onclick: async () => {
          session = await send({ type: "session-to-focus", budgetMin: time.get() });
          timeUpShown = false;
          closeModal(); closeNotice(); renderChip(); renderResultsBar();
          toast("Focus session started");
        } }, "Start Focus session"))));
  }

  function openRefineDialog() {
    if (!session) return;
    const input = el("textarea", { class: "wp-input", rows: "2" });
    input.value = session.purpose;
    keepKeys(input);
    openModal(el("div", { class: "wp-dialog", role: "dialog", "aria-modal": "true" },
      el("div", { class: "wp-title" }, "Clarify your purpose"),
      el("p", { class: "wp-muted" }, "Optional. A clearer outcome gets you sharper suggestions. This isn't a pivot."),
      input,
      el("div", { class: "wp-actions" },
        el("button", { class: "wp-btn wp-btn-text", onclick: closeModal }, "Cancel"),
        el("button", { class: "wp-btn wp-btn-primary", onclick: async () => {
          session = await send({ type: "session-refine", purpose: input.value });
          closeModal(); renderChip(); renderResultsBar();
        } }, "Save"))));
    setTimeout(() => { input.focus(); input.select(); }, 50);
  }

  // Quick answers have no timer to set up, just a silent soft limit.
  function showSoftLimit() {
    timeUpShown = true;
    showNotice([
      el("span", { class: "wp-notice-icon" }, icon("search")),
      el("div", { class: "wp-notice-text" }, el("div", { class: "wp-strong" }, "Still looking for your answer?"),
        el("div", { class: "wp-muted wp-ellipsis" }, `${Math.round(session.usedSec / 60)} minutes on: ${session.purpose}`)),
      el("div", { class: "wp-notice-actions" },
        el("button", { class: "wp-btn wp-btn-primary", onclick: gotMyAnswer }, "Got my answer"),
        el("button", { class: "wp-btn wp-btn-tonal", onclick: () => { closeNotice(); openConvertDialog(); } }, "Make it a Focus session"),
        el("button", { class: "wp-btn wp-btn-tonal", onclick: () => level === "strict" ? openExtendDialog() : extend(10, "") }, "Keep looking"))
    ]);
  }

  // ---------------- homepage: "What brings you here?" ----------------
  const EXAMPLES = [
    "How do I fix a leaking faucet?",
    "Understand how a combustion engine works",
    "Learn the fundamentals of investing",
    "Find a tutorial for building a walnut table",
    "Why do long bridges not sag in the middle?"
  ];
  let exampleTimer = null;

  function removeHome() {
    document.documentElement.classList.remove("wp-home");
    $("#wp-home")?.remove();
    clearInterval(exampleTimer);
  }

  function goSearch(query, purpose) {
    const go = () => { location.href = "/results?search_query=" + encodeURIComponent(query); };
    if (purpose) chrome.storage.local.set({ pendingPurpose: { purpose, query, at: Date.now() } }).then(go);
    else go();
  }

  async function renderHome() {
    if (location.pathname !== "/") return;
    if (!settings.homeCard || session?.mode === "explore") return removeHome();
    let host = null;
    for (let i = 0; i < 20 && !(host = $('ytd-browse[page-subtype="home"] #primary') || $('ytd-browse[page-subtype="home"]')); i++) await sleep(200);
    if (!host || location.pathname !== "/") return;
    document.documentElement.classList.add("wp-home");
    const key = session ? `${session.mode}|${session.purpose}` : "none";
    if ($("#wp-home")?.dataset.key === key) return; // don't rebuild while someone is typing
    $("#wp-home")?.remove();
    clearInterval(exampleTimer);

    const input = el("input", { class: "wp-home-input", type: "text", "aria-label": "What do you want to find or learn?" });
    const findBtn = el("button", { class: "wp-btn wp-btn-primary wp-home-go" }, session ? "Search" : "Find it");
    const choice = el("div", { class: "wp-home-choice", hidden: true });
    const card = el("div", { id: "wp-home", class: "wp wp-home-card", "data-key": key });

    if (session) {
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
      if (session) return goSearch(q, null);
      if (!settings.hasKey) return goSearch(q, q);
      findBtn.disabled = true;
      findBtn.textContent = "One moment…";
      const r = await send({ type: "improve-search", purpose: q });
      findBtn.disabled = false;
      findBtn.textContent = "Find it";
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

    if (session) {
      card.append(
        el("div", { class: "wp-label" }, session.mode === "quick" ? "Your quick answer" : "Your purpose"),
        el("div", { class: "wp-home-purpose" }, session.purpose),
        el("div", { class: "wp-home-search" }, icon("search"), input, findBtn),
        el("div", { class: "wp-home-alt" },
          session.mode === "quick" ? el("button", { class: "wp-btn wp-btn-text", onclick: gotMyAnswer }, "Got my answer") : null,
          el("button", { class: "wp-btn wp-btn-text", onclick: finishSession }, "End session")));
    } else {
      card.append(
        el("div", { class: "wp-dialog-brand" }, icon("waypoint"), "Waypoint"),
        el("h1", { class: "wp-home-title" }, "What brings you here?"),
        el("div", { class: "wp-home-search" }, icon("search"), input, findBtn),
        el("div", { class: "wp-muted wp-home-hint" }, "Be specific about what you want to find or learn."),
        choice,
        el("div", { class: "wp-home-alt" },
          el("span", { class: "wp-muted" }, "Just browsing?"),
          el("button", { class: "wp-btn wp-btn-tonal", onclick: () => openStartDialog(null, "explore") }, "Explore instead")));
    }
    host.prepend(card);
  }

  // ---------------- search results: the search becomes your purpose ----------------
  let lastHandledSearch = null;

  async function onSearch(query) {
    query = query.trim();
    if (!query || query === lastHandledSearch) { renderResultsBar(); return; }
    lastHandledSearch = query;
    if (!session) {
      const { pendingPurpose: p } = await chrome.storage.local.get("pendingPurpose");
      chrome.storage.local.remove("pendingPurpose");
      const purpose = p && p.query === query && Date.now() - p.at < 120000 ? p.purpose : query;
      session = await send({ type: "session-start", mode: "quick", purpose, search: query, budgetMin: 15 });
      timeUpShown = false;
      renderChip();
      return renderResultsBar();
    }
    if (session.mode === "explore" || session.paused) return;
    if (session.searches?.[session.searches.length - 1] === query) return renderResultsBar();
    if (settings.hasKey && !session.vague) {
      const fit = await send({ type: "search-fit", purpose: session.purpose, query });
      if (fit?.verdict === "different") { renderResultsBar(); return showSearchDrift(query); }
    }
    session = await send({ type: "session-add-search", query });
    renderResultsBar();
  }

  function showSearchDrift(query) {
    showNotice([
      el("span", { class: "wp-notice-icon" }, icon("pivot")),
      el("div", { class: "wp-notice-text" }, el("div", { class: "wp-strong" }, "This search looks different from your purpose."),
        el("div", { class: "wp-muted wp-ellipsis" }, session.purpose)),
      el("div", { class: "wp-notice-actions" },
        el("button", { class: "wp-btn wp-btn-tonal", onclick: () => { closeNotice(); history.back(); } }, "Stay focused"),
        el("button", { class: "wp-btn wp-btn-tonal", onclick: () => {
          closeNotice();
          openPivotDialog(query, { afterConfirm: () => send({ type: "session-add-search", query }) });
        } }, "Change purpose"))
    ]);
  }

  async function renderResultsBar() {
    if (location.pathname !== "/results") return;
    if (!session || session.mode === "explore") { $("#wp-results-bar")?.remove(); return; }
    let anchor = null;
    for (let i = 0; i < 20 && !(anchor = $("ytd-search ytd-section-list-renderer")); i++) await sleep(250);
    if (!anchor || location.pathname !== "/results" || !session) return;

    const isQuick = session.mode === "quick";
    const seg = el("div", { class: "wp-seg" },
      el("button", { class: "wp-seg-btn" + (isQuick ? " on" : ""), "aria-pressed": String(isQuick) }, "Quick answer"),
      el("button", { class: "wp-seg-btn" + (!isQuick ? " on" : ""), "aria-pressed": String(!isQuick), onclick: () => isQuick && openConvertDialog() }, "Focus session"));

    const bar = el("div", { id: "wp-results-bar", class: "wp wp-results-bar" },
      el("div", { class: "wp-rb-purpose" },
        el("div", { class: "wp-label" }, "Your purpose"),
        el("div", { class: "wp-strong wp-ellipsis" }, session.purpose),
        session.vague ? el("button", { class: "wp-link", onclick: openRefineDialog }, "Add detail for sharper suggestions") : null),
      seg,
      isQuick
        ? el("button", { class: "wp-btn wp-btn-tonal", onclick: gotMyAnswer }, icon("check2"), "Got my answer")
        : el("span", { class: "wp-muted" }, `${fmtMin(remaining(session))} left`));

    const old = $("#wp-results-bar");
    if (old) old.replaceWith(bar);
    else anchor.parentElement.insertBefore(bar, anchor);
  }

  // ---------------- the main flow for each new video ----------------
  async function gate(id) {
    hold();
    const info = await readVideoInfo(id);
    if (currentId !== id) return;
    currentInfo = info;
    const check = await send({ type: "check", channelKey: info.channelKey, kind: watchKind() });
    if (currentId !== id) return;
    // Avoided channels: Block always applies; Warn applies outside Focus (your purpose takes precedence).
    const a = check.avoid;
    if (a && !overridden.has(id) && (a.action === "block" || watchKind() === "leisure")) {
      return openRuleDialog(info, {
        status: "avoid", level: check.level, soft: a.action === "warn",
        message: a.action === "block" ? `You've blocked ${info.channel || "this channel"}.` : `You marked ${info.channel || "this channel"} as one to avoid.`
      });
    }
    continueAfterRules(info, check);
  }

  function continueAfterRules(info, check) {
    const id = info.id;
    if (!session && !skipped.has(id)) return openStartDialog(info);
    if (session?.timeUp && session.mode !== "quick") return showTimeUp();
    if (session?.paused) return showPaused();
    if (check.daily && check.daily.status !== "ok" && !overridden.has(id))
      return openRuleDialog(info, { ...check.daily, level: check.level });
    if (!session) return release(id);
    evaluateVideo(info);
  }

  async function evaluateVideo(info) {
    const id = info.id;
    if (!session || session.paused || session.mode === "explore" || !settings.hasKey) return release(id);
    const search = session.searches?.[session.searches.length - 1];
    const fit = await send({ type: "classify", purpose: session.purpose, video: info, search });
    if (currentId !== id) return;
    send({ type: "log", entry: { kind: "video", videoId: id, title: info.title, purpose: session.purpose, verdict: fit?.verdict } });
    // A vague purpose ("woodworking") gets lighter checks: no drift prompts, just labels.
    if (fit?.verdict === "different" && !session.vague) return showDrift(info);
    release(id);
    if (fit?.verdict === "refinement") toast("Counts toward your purpose");
    setTimeout(labelRecommendations, 2500);
    setTimeout(labelRecommendations, 7000);
  }

  // ---------------- time tracking ----------------
  const TICK = 10;
  setInterval(async () => {
    if (!$("#wp-chip")) renderChip(); // YouTube re-renders the top bar sometimes
    const id = currentId;
    const v = getVideoEl();
    const playing = !!id && !holding && cleared.has(id) && !!v && !v.paused;
    // Browsing search results and scrolling counts too, as long as YouTube is on screen.
    const sessionActive = !!session && !session.paused && !(session.timeUp && session.mode !== "quick") &&
      document.visibilityState === "visible";
    if (!playing && !sessionActive) return;
    const r = await send({ type: "tick", kind: watchKind(), seconds: TICK, sessionActive });
    if (!r) return;
    level = r.level;
    session = r.session;
    renderChip();
    if (currentId !== id) return;
    // Daily limits are checked live, so a long video can't run past them.
    if (playing && r.daily?.status !== "ok" && !overridden.has(id)) return openRuleDialog(currentInfo, { ...r.daily, level: r.level });
    if (session?.timeUp && !timeUpShown) session.mode === "quick" ? showSoftLimit() : showTimeUp();
  }, TICK * 1000);

  // Keep in sync with changes made from the popup or another tab.
  chrome.storage.onChanged.addListener(ch => {
    if (ch.session) {
      const ended = ch.session.oldValue && !ch.session.newValue;
      session = ch.session.newValue || null;
      renderChip();
      if (ended && !endingHere && videoIdFromUrl()) { hold(); location.href = "https://www.youtube.com/"; }
    }
    if (ch.level) level = ch.level.newValue;
    if (ch.recMode) settings.recMode = ch.recMode.newValue;
    if (ch.homeCard) { settings.homeCard = ch.homeCard.newValue !== false; route(); }
    if (ch.session && location.pathname === "/") renderHome();
    if (ch.session && location.pathname === "/results") renderResultsBar();
    if (ch.apiKey) settings.hasKey = !!(ch.apiKey.newValue || "").trim();
  });

  // ---------------- navigation ----------------
  function route() {
    if (session?.timeUp && session.mode !== "quick" && !timeUpShown) showTimeUp();
    if (location.pathname === "/") renderHome(); else removeHome();
    if (location.pathname === "/results") onSearch(new URL(location.href).searchParams.get("search_query") || "");
    else $("#wp-results-bar")?.remove();
  }

  function onNavigate() {
    const id = videoIdFromUrl();
    renderChip();
    closeDropdown();
    route();
    if (id === currentId) return;
    currentId = id;
    currentInfo = null;
    closeModal();
    if (notice && !notice.dataset.keep) closeNotice();
    if (!id) { holding = false; return; }
    if (cleared.has(id)) {
      holding = false;
      readVideoInfo(id).then(info => { if (currentId === id) currentInfo = info; });
      return;
    }
    hold();
    setTimeout(() => { if (currentId === id) gate(id); }, 600);
  }

  async function init() {
    const r = await send({ type: "session-get" });
    session = r?.session || null;
    level = r?.level || "balanced";
    settings = (await send({ type: "settings" })) || settings;
    renderChip();
    showReflection();
    window.addEventListener("yt-navigate-finish", onNavigate);
    window.addEventListener("popstate", onNavigate);
    onNavigate();
  }
  init();
})();
