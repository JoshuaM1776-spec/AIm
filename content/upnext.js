// Aim — "More from your search": during an aim, what your own searches found, in place of YouTube's
// recommendations, folded into the panel beside the video. No AI: your search, YouTube's ranking.

function upNextItems(p) {
  // Untitled entries are sponsored slots captured before Aim knew to skip them.
  const pool = (p.allowed || []).filter(v => v.id !== currentId && v.title);
  const lastQ = p.searches?.[p.searches.length - 1]?.q;
  const fromLast = pool.filter(v => v.q === lastQ);
  if (p.learn && !lastQ) return pool.slice(0, 12); // exploring: today's picks, in their order
  return (fromLast.length >= 3 ? fromLast : pool.slice().reverse()).slice(0, 12);
}

// The watch page's sidebar: the one panel (aimpanel.js), with More from your search folded into it;
// a themed break has its own panel (relax.js), and a parked Homeschool day its plan (plan.js).
function renderUpNext() {
  renderThemePanel();
  const p = activePurpose();
  const host = p && !brk && location.pathname === "/watch" ? sidebarHost() : null;
  if (host && p.plan && planOn()) renderPlanPanel(p, host); else $("#wp-plan-panel")?.remove();
  renderAimPanel();
}
