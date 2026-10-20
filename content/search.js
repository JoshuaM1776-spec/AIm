// Aim — search results. With no purpose, a search becomes your purpose (no separate "why are
// you here?" step). With a purpose, a search that shares a meaningful word with it continues
// silently; one that doesn't waits behind one question. Accepted results are what you can watch.

let lastHandledSearch = null;

async function onSearch(query) {
  query = query.trim();
  if (!query || query === lastHandledSearch) { await renderResultsBar(); captureResults(); return librarianPicks(); }
  lastHandledSearch = query;
  setSearchPending(null);
  if (brk || status.totalReached) return renderResultsBar(); // on a break, searching is just browsing
  const p = activePurpose();
  if (!p) {
    const r = await send({ type: "purpose-start", text: query, search: query });
    if (r?.result !== "applied") return;
    applyStatus(await send({ type: "status" }));
    renderChip();
    renderResultsBar();
    return captureResults();
  }
  if (p.searches?.[p.searches.length - 1]?.q !== query) {
    const check = await send({ type: "search-check", query });
    if (check && !check.fits) { setSearchPending(query); return renderResultsBar(); }
    await acceptSearch(query);
  }
  await renderResultsBar();
  captureResults();
  librarianPicks();
}

async function acceptSearch(query) {
  await send({ type: "purpose-search", query });
  applyStatus(await send({ type: "status" }));
  setSearchPending(null);
}

// While a search waits for an answer, its results stay hidden (html.wp-search-pending).
function setSearchPending(query) {
  searchPending = query;
  document.documentElement.classList.toggle("wp-search-pending", !!query);
}

// Results of an accepted search become part of the purpose. Called again as more load.
function captureResults() {
  if (theme()) return captureTheme();
  const p = activePurpose();
  if (location.pathname !== "/results" || !p || brk || searchPending) return;
  const { videos, lists } = searchResults();
  // New results, and ones whose length or title YouTube has filled in since Aim last looked.
  const known = new Map((p.allowed || []).map(v => [v.id, v]));
  const fresh = videos.filter(v => { const k = known.get(v.id); return !k || (!k.length && v.length) || (!k.title && v.title); });
  const freshLists = lists.filter(l => !(p.allowedLists || []).includes(l));
  if (!fresh.length && !freshLists.length) return;
  const query = searchQuery();
  allowLocal(fresh, freshLists, query);
  send({ type: "purpose-allow", query, videos: fresh, lists: freshLists });
}

// Pages that aren't search results but are a search the person ran: Ask YouTube's own page, if it
// opens one. Feeds, channels, playlists and videos are not: a video found there still asks first.
const askPage = () => !["/", "/results", "/watch", "/playlist"].includes(location.pathname) &&
  !/^\/(shorts|feed|@|channel|c|user|gaming|music|premium|account|signin)\b/.test(location.pathname);

// A result clicked before it was captured still counts; so does a video picked from Ask YouTube.
document.addEventListener("click", e => {
  if (!(location.pathname === "/results" || askPage()) || !activePurpose() || brk || searchPending) return;
  const a = e.target.closest?.('a[href*="/watch?v="]');
  if (!a || a.closest(YT.ads)) return;
  let id = null, list = null;
  try { const u = new URL(a.href); id = u.searchParams.get("v"); list = u.searchParams.get("list"); } catch {}
  if (!id && !list) return;
  const videos = id ? [{ id, title: squash(a.getAttribute("aria-label") || a.title || a.textContent).slice(0, 300) }] : [];
  const query = location.pathname === "/results" ? searchQuery() : "Ask YouTube";
  allowLocal(videos, list ? [list] : [], query);
  send({ type: "purpose-allow", query, videos, lists: list ? [list] : [] });
}, true);

async function renderResultsBar() {
  if (location.pathname !== "/results") return;
  const p = activePurpose();
  if (theme()) { removePicks(); setSearchPending(null); return renderThemeBar(); } // relaxing with a theme
  if (!p || brk) { $("#wp-results-bar")?.remove(); removePicks(); setSearchPending(null); return; }
  const lib = await librarianOn();
  let anchor = null;
  for (let i = 0; i < 20 && !(anchor = resultsAnchor()); i++) await sleep(250);
  if (!anchor || location.pathname !== "/results" || !activePurpose()) return;
  if (searchPending) removePicks();
  const bar = searchPending ? pendingBar(p, searchPending) : purposeBar(p, lib);
  const old = $("#wp-results-bar");
  if (old) old.replaceWith(bar);
  else anchor.parentElement.insertBefore(bar, anchor);
  showTips();
}

// One compact row: the aim, a small Change action, Done, and (signed in) the librarian, which
// stays folded away unless it has something new to say about this search. The videos stay the
// main event.
let libOpen = null; // { query, open }: the reader's own choice for this search
function purposeBar(p, lib) {
  const left = purposeLeft(p);
  const query = searchQuery().toLowerCase();
  const L = p.librarian;
  const fresh = !!(L && (L.refine || L.note) && (L.searches?.[0] || "").toLowerCase() === query);
  const open = lib && (libOpen?.query === query ? libOpen.open : fresh);
  const bar = el("div", { id: "wp-results-bar", class: `wp wp-results-bar${open ? " wp-rb-open" : ""}` });
  const toggle = lib ? el("button", { class: `wp-rb-icon${open ? " on" : ""}`, "aria-label": open ? "Hide the librarian" : "Ask the librarian",
    title: open ? "Hide the librarian" : "Ask the librarian", "aria-expanded": open ? "true" : "false",
    onclick: () => { libOpen = { query, open: !open }; renderResultsBar(); if (!open) setTimeout(() => $("#wp-lib .wp-lib-input")?.focus(), 0); } },
    icon("ask")) : null;
  bar.append(...[
    el("div", { class: "wp-rb-purpose" },
      el("span", { class: "wp-rb-mark" }, icon("logo")),
      el("span", { class: "wp-rb-label" }, p.plan ? "Today's plan" : "Your aim"),
      el("span", { class: "wp-strong wp-ellipsis wp-rb-text", title: p.text }, p.text),
      el("button", { class: "wp-link wp-rb-change", onclick: () => openPivotDialog() }, "Change")),
    left !== null ? el("span", { class: "wp-muted wp-rb-left" }, `${fmtMin(left)} left`) : null,
    el("button", { class: `wp-rb-icon${p.notes ? " has" : ""}`, "aria-label": p.notes ? "Notes" : "Add notes", title: p.notes ? "Notes" : "Add notes", onclick: openNotesDialog }, icon("book")),
    el("button", { class: "wp-rb-icon", "aria-label": doneLabel(p), title: doneLabel(p), onclick: doneAction(p) }, icon("check2")),
    toggle,
    activeStudy(p) ? studyBarBlock(p) : null,
    open ? librarianBlock(p) : null,
    !open && stillLooking(p) ? stillLookingRow(p, stillLooking(p), lib) : null].filter(Boolean));
  return bar;
}

// "Still looking?": three searches for this aim with nothing watched for more than a minute and
// a half since. Offered once per streak; signed in, it opens the librarian, otherwise a tip.
const stillDismissed = new Set();
function stillLooking(p) {
  const s = p.searches || [];
  if (s.length < 3 || activeStudy(p) || p.plan) return null;
  const since = s[s.length - 3].at || 0, key = `${p.id}|${since}`;
  if (stillDismissed.has(key)) return null;
  if ((p.videos || []).some(v => (v.lastAt || v.at || 0) >= since && (v.sec || 0) >= 90)) return null;
  return key;
}
function stillLookingRow(p, key, lib) {
  const dismiss = () => { stillDismissed.add(key); $(".wp-rb-still")?.remove(); };
  // A hint in one line, not a stop: the results stay where they are.
  return el("div", { class: "wp-rb-still" },
    el("span", { class: "wp-muted" }, lib ? "Still looking?" : "Still looking? Try the exact name of the part, error or idea, or fewer words."),
    lib ? el("button", { class: "wp-link", onclick: () => {
      dismiss(); libOpen = { query: searchQuery().toLowerCase(), open: true }; renderResultsBar();
      setTimeout(() => $("#wp-lib .wp-lib-input")?.focus(), 0); } }, `Tell ${BRAND} what you need`) : null,
    el("button", { class: "wp-icon-btn", "aria-label": "Dismiss", title: "Dismiss", onclick: dismiss }, svgIcon("close")));
}

// The search shares no meaningful word with the purpose: ask once, results hidden meanwhile.
function pendingBar(p, query) {
  return el("div", { id: "wp-results-bar", class: "wp wp-results-bar wp-rb-pending" },
    el("div", { class: "wp-rb-purpose" },
      el("div", { class: "wp-strong" }, `Is “${query}” part of your aim?`),
      el("div", { class: "wp-muted wp-ellipsis" }, `Your aim: ${p.text}`)),
    el("div", { class: "wp-actions wp-actions-start" },
      el("button", { class: "wp-btn wp-btn-primary", onclick: () => withReason("search", `How is “${query}” part of your aim?`, query, async () => {
        await acceptSearch(query);
        renderResultsBar();
        captureResults();
      }) }, "Yes, it's part of it"),
      el("button", { class: "wp-btn wp-btn-tonal", onclick: () =>
        openPivotDialog(query, { afterConfirm: () => send({ type: "purpose-search", query }) }) }, "Change my aim"),
      el("button", { class: "wp-btn wp-btn-text", onclick: () => history.back() }, "Back")),
    el("div", { class: "wp-rb-break" }, el("div", { class: "wp-label" }, "Or take a break"), breakChips(takeBreak)));
}
