// Aim — search results. With no purpose, a search becomes your purpose (no separate
// "why are you here?" step). With a purpose, later searches stay under it.

let lastHandledSearch = null;

async function onSearch(query) {
  query = query.trim();
  if (!query || query === lastHandledSearch) { renderResultsBar(); return; }
  lastHandledSearch = query;
  if (brk || status.totalReached) return renderResultsBar(); // on a break, searching is just browsing
  const p = activePurpose();
  if (!p) {
    // The homepage card may have kept the words you typed as your purpose (see goSearch).
    const pending = await send({ type: "pending-purpose-take", query });
    const r = await send({ type: "purpose-start", text: pending?.purpose || query, search: query });
    if (r?.result !== "applied") return;
    applyStatus(await send({ type: "status" }));
    renderChip();
    return renderResultsBar();
  }
  if (p.searches?.[p.searches.length - 1]?.q === query) return renderResultsBar();
  // AI check for now; step C replaces it with a word check against your purpose.
  if (settings.hasKey && !p.vague) {
    const fit = await send({ type: "search-fit", purpose: p.text, query });
    if (fit?.verdict === "different") { renderResultsBar(); return showSearchDrift(query); }
  }
  await send({ type: "purpose-search", query });
  applyStatus(await send({ type: "status" }));
  renderResultsBar();
}

function showSearchDrift(query) {
  const p = activePurpose();
  showNotice([
    el("span", { class: "wp-notice-icon" }, icon("pivot")),
    el("div", { class: "wp-notice-text" }, el("div", { class: "wp-strong" }, "This search looks different from your purpose."),
      el("div", { class: "wp-muted wp-ellipsis" }, p.text)),
    el("div", { class: "wp-notice-actions" },
      el("button", { class: "wp-btn wp-btn-tonal", onclick: () => { closeNotice(); history.back(); } }, "Back to my purpose"),
      el("button", { class: "wp-btn wp-btn-tonal", onclick: () => {
        closeNotice();
        openPivotDialog(query, { afterConfirm: () => send({ type: "purpose-search", query }) });
      } }, "Change purpose"))
  ], { dismissible: false });
}

async function renderResultsBar() {
  if (location.pathname !== "/results") return;
  const p = activePurpose();
  if (!p || brk) { $("#wp-results-bar")?.remove(); return; }
  let anchor = null;
  for (let i = 0; i < 20 && !(anchor = resultsAnchor()); i++) await sleep(250);
  if (!anchor || location.pathname !== "/results" || !activePurpose()) return;
  const left = purposeLeft(p);
  const bar = el("div", { id: "wp-results-bar", class: "wp wp-results-bar" },
    el("div", { class: "wp-rb-purpose" },
      el("div", { class: "wp-label" }, "Your purpose"),
      el("div", { class: "wp-strong wp-ellipsis" }, p.text),
      el("button", { class: "wp-link", onclick: openRefineDialog }, p.vague ? "Add detail" : "Edit")),
    left !== null ? el("span", { class: "wp-muted" }, `${fmtMin(left)} left`) : null,
    el("button", { class: "wp-btn wp-btn-tonal", onclick: () => finishPurpose() }, icon("check2"), "Done"));
  const old = $("#wp-results-bar");
  if (old) old.replaceWith(bar);
  else anchor.parentElement.insertBefore(bar, anchor);
}
