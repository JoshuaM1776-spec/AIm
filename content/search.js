// Aim — search results: a search with no session starts Focus; later searches are checked against the purpose.

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
  for (let i = 0; i < 20 && !(anchor = resultsAnchor()); i++) await sleep(250);
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
