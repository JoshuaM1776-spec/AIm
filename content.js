// Aim — runs on youtube.com
// Stay focused when you can. Pivot when you choose. Explore when you intend to.

(() => {
  // ---------------- state ----------------
  let session = null;          // current Focus/Explore session (from storage)
  let settings = { recMode: "mark", hasKey: false, homeCard: true, hold: false, reminderMin: 0, avoid: {} };
  let currentId = null;        // video on screen
  let currentInfo = null;
  let notNow = false;          // "Not now" on the start prompt: don't ask again in this tab
  let holding = false;         // keep the video paused until cleared
  const cleared = new Set();   // videos cleared to play in this tab
  const overridden = new Set();// videos from a hidden/warned channel you chose to watch anyway
  let timeUpShown = false;
  let modal = null, notice = null, dropdown = null;
  let endingHere = false;      // this tab ended the session (vs. the popup or another tab)
  let alive = true;            // false once the extension is reloaded or updated under this tab

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  // Resolves to the reply, or null if the background failed or the extension went away.
  function send(msg) {
    if (!alive) return Promise.resolve(null);
    return new Promise(res => {
      try {
        chrome.runtime.sendMessage(msg, r => {
          if (chrome.runtime.lastError || !r || r.error) return res(null);
          res(r);
        });
      } catch {
        shutDown();
        res(null);
      }
    });
  }

  // After an extension update or reload this copy of the script is orphaned: take its UI
  // down and stop holding videos, instead of throwing errors until the tab is refreshed.
  function shutDown() {
    if (!alive) return;
    alive = false;
    clearInterval(tickTimer);
    hideObserver.disconnect();
    holding = false;
    for (const n of $$("#wp-chip, #wp-home, #wp-results-bar, .wp-notice, .wp-scrim, .wp-dropdown")) n.remove();
    document.documentElement.classList.remove("wp-home");
  }

  const ICON = {
    logo: `<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M12 5.5l2.4 6.5L12 18.5 9.6 12z" fill="currentColor"/></svg>`,
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

  // "/@name/videos" and "/@name" are the same channel. (Same rule as channelPath in store.js.)
  function channelPath(p) {
    let path = String(p || "");
    try { path = decodeURIComponent(path); } catch {}
    const m = path.match(/^\/(@[^/?#]+|channel\/[^/?#]+|c\/[^/?#]+|user\/[^/?#]+)/);
    return m ? "/" + m[1] : path;
  }
  const squash = s => (s || "").replace(/\s+/g, " ").trim();

  // YouTube swaps videos without reloading, so for a moment the page can still show the
  // previous video's details. oEmbed gives the right title and channel for this ID, and the
  // description is only read once the page has caught up to the same video.
  async function readVideoInfo(id) {
    const info = { id, title: "", channel: "", channelKey: "", description: "" };
    try {
      const r = await fetch("/oembed?format=json&url=" + encodeURIComponent("https://www.youtube.com/watch?v=" + id));
      if (r.ok) {
        const o = await r.json();
        info.title = squash(o.title);
        info.channel = squash(o.author_name);
        try { info.channelKey = channelPath(new URL(o.author_url).pathname); } catch {}
      }
    } catch {}
    const isWatch = location.pathname === "/watch";
    for (let i = 0; i < 15 && currentId === id; i++) {
      const pageTitle = squash($("h1.ytd-watch-metadata yt-formatted-string")?.textContent);
      const caughtUp = isWatch
        ? $("ytd-watch-flexy")?.getAttribute("video-id") === id && !!pageTitle && (!info.title || pageTitle === info.title)
        : !!channelLink();
      if (caughtUp) {
        const link = channelLink();
        info.title ||= pageTitle;
        info.channel ||= squash(link?.textContent);
        if (!info.channelKey) try { info.channelKey = channelPath(new URL(link.href).pathname); } catch {}
        if (isWatch) info.description = $("ytd-watch-metadata #description-inline-expander")?.innerText?.trim() || "";
        break;
      }
      await sleep(200);
    }
    info.title ||= document.title.replace(/ - YouTube$/, "").trim();
    info.channelKey ||= info.channel;
    return info;
  }

  // The hide/warn entry for a channel, if you set one.
  function avoidFor(key) {
    key = channelPath(key);
    if (!key) return null;
    for (const [k, c] of Object.entries(settings.avoid || {})) if (channelPath(k) === key) return c;
    return null;
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
    // Only rebuild when something visible changed, so keyboard focus survives the timer.
    const sig = session ? `${session.mode}|${session.paused}|${fmtMin(remaining(session))}` : "none";
    if (chip.dataset.sig === sig) return;
    chip.dataset.sig = sig;
    chip.replaceChildren();
    const brand = el("span", { class: "wp-brand" }, icon("logo"), el("span", { class: "wp-brand-name" }, "Aim"));
    if (!session) {
      chip.append(brand, el("button", { class: "wp-pill wp-pill-solid", onclick: () => openStartDialog(null) }, "Start a session"));
      return;
    }
    const label = session.paused ? "Paused" : session.mode === "explore" ? "Explore" : "Focus";
    const pill = el("button", {
      class: `wp-pill wp-pill-${session.paused ? "paused" : session.mode}`,
      "aria-haspopup": "menu",
      onclick: e => { e.stopPropagation(); dropdown ? closeDropdown() : openDropdown(); }
    }, el("span", {}, label), el("span", { class: "wp-pill-time" }, fmtMin(remaining(session))), icon("chevron"));
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
    const isFocus = session.mode === "focus";

    const head = el("button", { class: "wp-menu-head", onclick: () => { closeDropdown(); openPivotDialog(); } },
      el("div", {},
        el("div", { class: "wp-label" }, isFocus ? "Current purpose" : "Explore session"),
        el("div", { class: "wp-strong" }, isFocus ? session.purpose : `Exploring · ${session.budgetMin} minutes`)),
      icon("right"));

    const time = el("div", { class: "wp-menu-block" },
      el("div", { class: "wp-label" }, "Time remaining"),
      el("div", { class: "wp-strong" }, fmtMin(remaining(session))),
      el("div", { class: "wp-bar" }, el("i", { style: `width:${pct}%` })));

    const items = el("div", { class: "wp-menu-items" });
    const extendItem = menuItem("clock", "Add 15 minutes", () => openExtendDialog(), { hint: settings.hold ? "(asks for a reason)" : null });
    if (isFocus) items.append(
      menuItem("check2", "Got what I came for", gotMyAnswer),
      menuItem("pivot", "Change purpose", openPivotDialog),
      extendItem);
    else items.append(extendItem, menuItem("pivot", "Change to Focus", openPivotDialog));
    items.append(session.paused
      ? menuItem("play", "Resume session", resumeSession)
      : menuItem("pause", "Pause session", async () => { await updateSession({ paused: true }); if (videoIdFromUrl()) showPaused(); }));
    if (currentId && currentInfo) items.append(
      menuItem("save", "Save this video for later", () => saveCurrent(false)),
      menuItem("avoid", "Hide or warn about this channel", openAvoidDialog));
    items.append(menuItem("end", "End session", finishSession, { danger: true }));

    dropdown = el("div", { class: "wp wp-dropdown", role: "menu", onclick: e => e.stopPropagation() }, head, time);
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
      list = (await send({ type: "suggest-path", purpose: session.purpose }))?.items;
      loading.remove();
      if (Array.isArray(list) && list.length && session) {
        session = (await send({ type: "session-patch", patch: { suggestions: { purpose: session.purpose, items: list } } })) || session;
      }
    }
    if (!Array.isArray(list) || !list.length) { container.append(el("div", { class: "wp-muted" }, "No suggestions right now.")); return; }
    list.slice(0, 3).forEach((s, i) => container.append(
      el("a", { class: "wp-suggest", href: "https://www.youtube.com/results?search_query=" + encodeURIComponent(s.query || s.label) },
        el("span", { class: "wp-num" }, String(i + 1)), el("span", {}, s.label || s.query))));
  }

  async function updateSession(patch) {
    session = (await send({ type: "session-patch", patch })) || session;
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
    const exploreNote = el("p", { class: "wp-muted", hidden: true }, "No purpose needed. Aim just keeps time.");

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
      const started = await send({ type: "session-start", mode, purpose: mode === "focus" ? p : "", budgetMin: time.get() });
      if (!started) { err.textContent = "Couldn't start the session. Try again."; return; }
      session = started;
      timeUpShown = false;
      closeModal();
      renderChip();
      if (info) evaluateVideo(info);
    };
    keepKeys(purpose, start);

    const actions = el("div", { class: "wp-actions" });
    // A nudge, not a gate: "Not now" plays the video and stops asking in this tab.
    if (info) actions.append(el("button", { class: "wp-btn wp-btn-text", onclick: () => {
      notNow = true;
      closeModal();
      continueAfterRules(info);
    } }, "Not now"));
    else actions.append(el("button", { class: "wp-btn wp-btn-text", onclick: closeModal }, "Cancel"));
    actions.append(el("button", { class: "wp-btn wp-btn-primary", onclick: start }, "Start session"));

    openModal(el("div", { class: "wp-dialog", role: "dialog", "aria-modal": "true" },
      el("div", { class: "wp-dialog-brand" }, icon("logo"), "Aim"),
      info ? el("div", { class: "wp-muted wp-ellipsis" }, `Up next: ${info.title}`) : null,
      modeRow, purposeBlock, exploreNote,
      el("label", { class: "wp-q wp-q-sm" }, "How much time do you want to spend?"), time.row,
      err, actions));
    setTimeout(() => purpose.focus(), 50);
  }

  // 2. Change direction — the intentional pivot
  function openPivotDialog(prefill = "", { releaseAfter = false, afterConfirm = null } = {}) {
    if (typeof prefill !== "string") prefill = "";
    if (!session) return;
    const remainingMin = Math.ceil(remaining(session) / 60);
    const purpose = el("textarea", { class: "wp-input", rows: "2", placeholder: "e.g. Understand soil conditions first" });
    purpose.value = prefill;
    let keep = remainingMin > 0; // with no time left, keeping it would end the session on the spot
    const time = chips([15, 30, 45, 60], 30, minLabel);
    const reason = el("textarea", { class: "wp-input", rows: "2", placeholder: "Why add time?" });
    const err = el("div", { class: "wp-error" });
    const timeBox = el("div", {});
    const renderTime = () => {
      timeBox.replaceChildren(...[
        el("label", { class: "wp-radio" }, el("input", { type: "radio", name: "wp-t", checked: keep, onchange: () => { keep = true; renderTime(); } }), "Keep my remaining time"),
        el("label", { class: "wp-radio" }, el("input", { type: "radio", name: "wp-t", checked: !keep, onchange: () => { keep = false; renderTime(); } }), "Set a new time limit"),
        !keep ? time.row : null,
        !keep && settings.hold ? reason : null].filter(Boolean));
    };
    renderTime();
    keepKeys(purpose); keepKeys(reason);

    const confirm = async () => {
      const r = await send({ type: "session-pivot", purpose: purpose.value, budgetMin: keep ? null : time.get(), reason: reason.value });
      if (!r) { err.textContent = "Couldn't change the purpose. Try again."; return; }
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

  // Add time (from the dropdown, or the time-up notice)
  function openExtendDialog() {
    if (!settings.hold) return extend(15, "");
    const reason = el("textarea", { class: "wp-input", rows: "2", placeholder: "Why add 15 minutes?" });
    const err = el("div", { class: "wp-error" });
    keepKeys(reason);
    openModal(el("div", { class: "wp-dialog" },
      el("div", { class: "wp-title" }, "Add time"),
      el("p", { class: "wp-muted" }, "You asked Aim to hold you to your time limits, so adding time takes a reason."),
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
    if (r?.result !== "applied") return false;
    session = r.session;
    timeUpShown = false;
    closeNotice();
    renderChip();
    if (currentId && currentInfo && holding) cleared.has(currentId) ? release(currentId) : evaluateVideo(currentInfo);
    toast(`Added ${minutes} minutes`);
    return true;
  }

  // A channel you chose to hide or be warned about: ask before watching, never force.
  function openChannelWarning(info, action) {
    hold();
    const name = info.channel || "this channel";
    openModal(el("div", { class: "wp-dialog", role: "dialog", "aria-modal": "true" },
      el("div", { class: "wp-dialog-brand" }, icon("logo"), "Aim"),
      el("div", { class: "wp-title" }, action === "hide" ? `You chose to hide ${name}.` : `You asked to be warned about ${name}.`),
      el("div", { class: "wp-muted" }, "Change this anytime in Aim's settings."),
      el("div", { class: "wp-actions" },
        el("button", { class: "wp-btn wp-btn-text", onclick: () => { overridden.add(info.id); closeModal(); continueAfterRules(info); } }, "Watch anyway"),
        el("button", { class: "wp-btn wp-btn-primary", onclick: goBack }, "Go back"))));
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
      el("p", { class: "wp-muted" }, "Hide: its videos disappear from your homepage, search results and sidebar, and opening one asks first. Warn: Aim asks before you watch it outside a Focus session. Undo either in settings."),
      el("div", { class: "wp-actions" },
        el("button", { class: "wp-btn wp-btn-text", onclick: closeModal }, "Cancel"),
        el("button", { class: "wp-btn wp-btn-tonal", onclick: pick("warn") }, "Warn me"),
        el("button", { class: "wp-btn wp-btn-primary", onclick: pick("hide") }, "Hide channel"))));
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
    toast("Saved for later. Find it under the Aim icon.");
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
    ], { dismissible: false });
    notice.dataset.keep = "1";
    notice.dataset.kind = "paused";
  }

  async function resumeSession() {
    await updateSession({ paused: false });
    closeNotice();
    if (currentInfo && holding) evaluateVideo(currentInfo);
  }

  // When time runs out
  function showTimeUp() {
    timeUpShown = true;
    if (videoIdFromUrl()) hold(); // time's up means the video stops
    showNotice([
      el("span", { class: "wp-notice-icon" }, icon("clock")),
      el("div", { class: "wp-notice-text" }, el("div", { class: "wp-strong" }, "Your time is up"),
        el("div", { class: "wp-muted" }, `You've reached your ${session.budgetMin} minute session limit.`)),
      el("div", { class: "wp-notice-actions" },
        el("button", { class: "wp-btn wp-btn-primary", onclick: finishSession }, "End session"),
        el("button", { class: "wp-btn wp-btn-tonal", onclick: openExtendDialog }, "Add 15 minutes"))
    ], { dismissible: false });
    notice.dataset.keep = "1";
    notice.dataset.kind = "timeup";
  }

  // Session end — a brief reflection
  // Ending a session (or running out of time) never leaves you inside a video.
  // You land back on the "What brings you here?" card, with a short reflection.
  async function finishSession(outcome) {
    endingHere = true;
    if (videoIdFromUrl()) hold();
    await send({ type: "session-end", outcome: typeof outcome === "string" ? outcome : null });
    session = null;
    cleared.clear();
    overridden.clear();
    location.href = "https://www.youtube.com/";
  }

  async function showReflection() {
    const { reflection: s } = await chrome.storage.local.get("reflection");
    if (!s) return;
    await send({ type: "reflection-clear" });
    if (Date.now() - (s.endedAt || 0) > 10 * 60 * 1000) return; // ended long ago, e.g. from the popup
    if (s.outcome === "yes") { toast("Glad you found it."); return; }
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
        saved.length ? el("div", { class: "wp-muted" }, `${saved.length} saved for later. Find them under the Aim icon.`) : null),
      s.mode !== "explore" ? el("div", { class: "wp-notice-actions wp-col" },
        el("div", { class: "wp-label" }, "Did you get what you came for?"),
        el("div", { class: "wp-notice-actions" },
          el("button", { class: "wp-btn wp-btn-tonal", onclick: rate("yes") }, "Yes"),
          el("button", { class: "wp-btn wp-btn-tonal", onclick: rate("partly") }, "Partly"),
          el("button", { class: "wp-btn wp-btn-tonal", onclick: rate("no") }, "No"))) : null
    ]);
  }

  // Once a day, after the minutes you chose. Information, not a block.
  function showReminder(minutes) {
    const text = `You've spent ${minutes >= 60 ? `${Math.floor(minutes / 60)}h ${minutes % 60}m` : `${minutes} minutes`} on YouTube today.`;
    if (notice?.dataset.keep) return toast(text); // don't cover a time-up or paused notice
    showNotice([
      el("span", { class: "wp-notice-icon" }, icon("clock")),
      el("div", { class: "wp-notice-text" }, el("div", { class: "wp-strong" }, text),
        el("div", { class: "wp-muted" }, "This is the daily reminder you set in Aim. Nothing is blocked."))
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

  function clearRecLabel(n) {
    n.removeAttribute("data-wp-rec");
    delete n.dataset.wpRecTitle;
    n.querySelector(":scope > .wp-rec-tag")?.remove();
  }
  function clearRecLabels() { for (const n of $$("[data-wp-rec]")) clearRecLabel(n); }

  async function labelRecommendations() {
    if (!session || session.mode !== "focus" || session.paused || !settings.hasKey || settings.recMode === "off") return;
    // YouTube reuses sidebar elements for new videos, so a label only counts for the title it was given to.
    const items = recItems().filter(i => i.node.dataset.wpRecTitle !== i.title);
    if (!items.length) return;
    const purposeAtStart = session.purpose;
    const labels = (await send({ type: "label-recs", purpose: purposeAtStart, titles: items.map(i => i.title) }))?.labels;
    if (!Array.isArray(labels) || !session || session.purpose !== purposeAtStart) return;
    const TEXT = { match: "Matches your purpose", related: "Related perspective", off: "Off purpose" };
    items.forEach((it, i) => {
      const lab = labels[i];
      clearRecLabel(it.node);
      if (!TEXT[lab]) return;
      it.node.setAttribute("data-wp-rec", settings.recMode === "hide" && lab === "off" ? "hidden" : lab);
      it.node.dataset.wpRecTitle = it.title;
      if (lab !== "off" || settings.recMode === "mark")
        it.node.prepend(el("div", { class: `wp wp-rec-tag wp-rec-${lab}` }, TEXT[lab]));
    });
  }

  // ---------------- hidden channels ----------------
  // Like YouTube's "Don't recommend channel": their videos drop out of feeds, results and the sidebar.
  const FEED_ITEMS = "ytd-rich-item-renderer, ytd-video-renderer, ytd-compact-video-renderer, ytd-grid-video-renderer, yt-lockup-view-model";
  const CHANNEL_LINK = 'a[href^="/@"], a[href^="/channel/"], a[href^="/c/"], a[href^="/user/"]';

  function hiddenKeys() {
    return new Set(Object.entries(settings.avoid || {}).filter(([, c]) => c.action === "hide").map(([k]) => channelPath(k)));
  }

  function applyHidden() {
    const hidden = hiddenKeys();
    if (!hidden.size) { for (const n of $$("[data-wp-hidden]")) n.removeAttribute("data-wp-hidden"); return; }
    for (const n of $$(FEED_ITEMS)) {
      const box = n.closest("ytd-rich-item-renderer") || n;
      if (box !== n && box.matches(FEED_ITEMS)) continue; // the outer item decides
      const a = $(CHANNEL_LINK, n);
      let key = "";
      try { if (a) key = channelPath(new URL(a.href).pathname); } catch {}
      box.toggleAttribute("data-wp-hidden", !!key && hidden.has(key));
    }
  }

  let hideTimer = null;
  const hideObserver = new MutationObserver(() => {
    if (hideTimer || !hiddenKeys().size) return;
    hideTimer = setTimeout(() => { hideTimer = null; applyHidden(); }, 300);
  });

  // ---------------- clarifying a purpose ----------------
  function gotMyAnswer() { return finishSession("yes"); }

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
          session = (await send({ type: "session-refine", purpose: input.value })) || session;
          closeModal(); renderChip(); renderResultsBar();
        } }, "Save"))));
    setTimeout(() => { input.focus(); input.select(); }, 50);
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

  // The purpose you typed can differ from the search you run; the results page picks it up.
  async function goSearch(query, purpose) {
    if (purpose) await send({ type: "pending-purpose", purpose, query });
    location.href = "/results?search_query=" + encodeURIComponent(query);
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
        el("div", { class: "wp-label" }, "Your purpose"),
        el("div", { class: "wp-home-purpose" }, session.purpose),
        el("div", { class: "wp-home-search" }, icon("search"), input, findBtn),
        el("div", { class: "wp-home-alt" },
          el("button", { class: "wp-btn wp-btn-text", onclick: gotMyAnswer }, "Got what I came for"),
          el("button", { class: "wp-btn wp-btn-text", onclick: finishSession }, "End session")));
    } else {
      card.append(
        el("div", { class: "wp-dialog-brand" }, icon("logo"), "Aim"),
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
  const SEARCH_DEFAULT_MIN = 15;
  let lastHandledSearch = null;

  async function onSearch(query) {
    query = query.trim();
    if (!query || query === lastHandledSearch) { renderResultsBar(); return; }
    lastHandledSearch = query;
    if (!session) {
      // Searching with no session starts a short Focus session; the results bar shows it.
      const p = await send({ type: "pending-purpose-take", query });
      const started = await send({ type: "session-start", mode: "focus", purpose: p?.purpose || query, search: query, budgetMin: SEARCH_DEFAULT_MIN });
      if (!started) return;
      session = started;
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
    session = (await send({ type: "session-add-search", query })) || session;
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
    if (!session || session.mode !== "focus") { $("#wp-results-bar")?.remove(); return; }
    let anchor = null;
    for (let i = 0; i < 20 && !(anchor = $("ytd-search ytd-section-list-renderer")); i++) await sleep(250);
    if (!anchor || location.pathname !== "/results" || !session) return;

    const bar = el("div", { id: "wp-results-bar", class: "wp wp-results-bar" },
      el("div", { class: "wp-rb-purpose" },
        el("div", { class: "wp-label" }, "Your purpose"),
        el("div", { class: "wp-strong wp-ellipsis" }, session.purpose),
        el("button", { class: "wp-link", onclick: openRefineDialog }, session.vague ? "Add detail for sharper suggestions" : "Edit")),
      el("span", { class: "wp-muted" }, `Focus · ${fmtMin(remaining(session))} left`),
      el("button", { class: "wp-btn wp-btn-tonal", onclick: gotMyAnswer }, icon("check2"), "Got my answer"));

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
    // Hidden channels always ask; warned channels ask outside Focus (your purpose takes precedence).
    const a = avoidFor(info.channelKey);
    if (a && !overridden.has(id) && (a.action === "hide" || session?.mode !== "focus"))
      return openChannelWarning(info, a.action);
    continueAfterRules(info);
  }

  function continueAfterRules(info) {
    if (!session && !notNow) return openStartDialog(info);
    if (session?.timeUp) return showTimeUp();
    if (session?.paused) return showPaused();
    if (!session) return release(info.id);
    evaluateVideo(info);
  }

  async function evaluateVideo(info) {
    const id = info.id;
    if (!session || session.paused || session.mode !== "focus" || !settings.hasKey) return release(id);
    const search = session.searches?.[session.searches.length - 1];
    const fit = await send({ type: "classify", purpose: session.purpose, video: info, search });
    if (currentId !== id) return;
    // A vague purpose ("woodworking") gets lighter checks: no drift prompts, just labels.
    if (fit?.verdict === "different" && !session.vague) return showDrift(info);
    release(id);
    if (fit?.verdict === "refinement") toast("Counts toward your purpose");
    setTimeout(labelRecommendations, 2500);
    setTimeout(labelRecommendations, 7000);
  }

  // ---------------- time tracking ----------------
  // Time counts while a video plays (even in a background tab or the miniplayer) or while
  // you're looking at YouTube. The background credits real elapsed time, so several open
  // tabs never count the same moment twice.
  const TICK = 10;
  const tickTimer = setInterval(async () => {
    if (!chrome.runtime?.id) return shutDown();
    if (!$("#wp-chip")) renderChip(); // YouTube re-renders the top bar sometimes
    const id = currentId;
    const v = id ? getVideoEl() : $("ytd-miniplayer video");
    const playing = !!v && !v.paused && !holding && (!id || cleared.has(id));
    const looking = document.visibilityState === "visible" && document.hasFocus();
    if (!playing && !looking) return;
    const sessionRunning = !!session && !session.paused && !session.timeUp;
    const r = await send({ type: "tick", seconds: TICK, sessionRunning });
    if (!r) return;
    session = r.session;
    renderChip();
    if (r.reminder) showReminder(r.reminder);
    if (session?.timeUp && !timeUpShown) showTimeUp();
  }, TICK * 1000);

  // Keep in sync with changes made from the popup, settings or another tab.
  chrome.storage.onChanged.addListener((ch, area) => {
    if (area !== "local" || !alive) return;
    if (ch.session) {
      const ended = ch.session.oldValue && !ch.session.newValue;
      session = ch.session.newValue || null;
      if (!session?.timeUp) timeUpShown = false;
      // Time added or session resumed from another tab or the popup: lift this tab's hold too.
      const lifted = (notice?.dataset.kind === "timeup" && session && !session.timeUp) ||
        (notice?.dataset.kind === "paused" && session && !session.paused);
      if (lifted) {
        closeNotice();
        if (currentInfo && holding) evaluateVideo(currentInfo);
      }
      renderChip();
      if (ended && !endingHere && videoIdFromUrl()) { hold(); location.href = "https://www.youtube.com/"; }
      if (location.pathname === "/") renderHome();
      if (location.pathname === "/results") renderResultsBar();
    }
    if (ch.settings) {
      const homeChanged = (ch.settings.newValue?.homeCard !== false) !== settings.homeCard;
      settings = { ...settings, ...(ch.settings.newValue || {}) };
      if (homeChanged) route();
    }
    if (ch.avoid) { settings.avoid = ch.avoid.newValue || {}; applyHidden(); }
    if (ch.apiKey) settings.hasKey = !!(ch.apiKey.newValue || "").trim();
  });

  // ---------------- navigation ----------------
  function route() {
    if (session?.timeUp && !timeUpShown) showTimeUp();
    if (location.pathname === "/") renderHome(); else removeHome();
    if (location.pathname === "/results") onSearch(new URL(location.href).searchParams.get("search_query") || "");
    else $("#wp-results-bar")?.remove();
  }

  // yt-navigate-finish fires for every in-app navigation, back and forward included.
  function onNavigate() {
    const id = videoIdFromUrl();
    renderChip();
    closeDropdown();
    route();
    applyHidden();
    if (id === currentId) return;
    currentId = id;
    currentInfo = null;
    clearRecLabels();
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
    settings = (await send({ type: "settings" })) || settings;
    renderChip();
    showReflection();
    hideObserver.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ["href"] });
    window.addEventListener("yt-navigate-finish", onNavigate);
    onNavigate();
  }
  init();
})();
