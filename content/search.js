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
  const p = activePurpose();
  if (location.pathname !== "/results" || !p || brk || searchPending) return;
  const { videos, lists } = searchResults();
  const known = new Set((p.allowed || []).map(v => v.id));
  const fresh = videos.filter(v => !known.has(v.id));
  const freshLists = lists.filter(l => !(p.allowedLists || []).includes(l));
  if (!fresh.length && !freshLists.length) return;
  const query = searchQuery();
  allowLocal(fresh, freshLists, query);
  send({ type: "purpose-allow", query, videos: fresh, lists: freshLists });
}

// A result clicked before it was captured still counts.
document.addEventListener("click", e => {
  if (location.pathname !== "/results" || !activePurpose() || brk || searchPending) return;
  const a = e.target.closest?.('a[href*="/watch?v="]');
  if (!a) return;
  let id = null, list = null;
  try { const u = new URL(a.href); id = u.searchParams.get("v"); list = u.searchParams.get("list"); } catch {}
  if (!id && !list) return;
  const videos = id ? [{ id, title: squash(a.title || a.textContent) }] : [];
  allowLocal(videos, list ? [list] : [], searchQuery());
  send({ type: "purpose-allow", query: searchQuery(), videos, lists: list ? [list] : [] });
}, true);

async function renderResultsBar() {
  if (location.pathname !== "/results") return;
  const p = activePurpose();
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
}

function purposeBar(p, lib) {
  const left = purposeLeft(p);
  return el("div", { id: "wp-results-bar", class: `wp wp-results-bar${lib ? " wp-rb-lib" : ""}` },
    el("div", { class: "wp-rb-purpose" },
      el("div", { class: "wp-label" }, "Current Target"),
      el("div", { class: "wp-strong wp-ellipsis" }, p.text),
      el("button", { class: "wp-link", onclick: openRefineDialog }, "Edit")),
    left !== null ? el("span", { class: "wp-muted" }, `${fmtMin(left)} left`) : null,
    el("button", { class: "wp-btn wp-btn-tonal", onclick: askDone }, icon("check2"), "Target complete"),
    lib ? librarianBlock(p) : null);
}

// The search shares no meaningful word with the purpose: ask once, results hidden meanwhile.
function pendingBar(p, query) {
  return el("div", { id: "wp-results-bar", class: "wp wp-results-bar wp-rb-pending" },
    el("div", { class: "wp-rb-purpose" },
      el("div", { class: "wp-strong" }, `Is “${query}” part of your Target?`),
      el("div", { class: "wp-muted wp-ellipsis" }, `Current Target: ${p.text}`)),
    el("div", { class: "wp-actions wp-actions-start" },
      el("button", { class: "wp-btn wp-btn-primary", onclick: async () => {
        await acceptSearch(query);
        renderResultsBar();
        captureResults();
      } }, "Yes, it's part of it"),
      el("button", { class: "wp-btn wp-btn-tonal", onclick: () =>
        openPivotDialog(query, { afterConfirm: () => send({ type: "purpose-search", query }) }) }, "Change Target"),
      el("button", { class: "wp-btn wp-btn-text", onclick: () => history.back() }, "Back")),
    el("div", { class: "wp-rb-break" }, el("div", { class: "wp-label" }, "Or take a break"), breakChips(takeBreak)));
}
