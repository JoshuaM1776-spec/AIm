// Aim — "Up next from your search": during a purpose, the watch page's sidebar shows what your
// own searches found, in place of YouTube's recommendations. No AI: your search, YouTube's ranking.

function upNextItems(p) {
  // Untitled entries are sponsored slots captured before Aim knew to skip them.
  const pool = (p.allowed || []).filter(v => v.id !== currentId && v.title);
  const lastQ = p.searches?.[p.searches.length - 1]?.q;
  const fromLast = pool.filter(v => v.q === lastQ);
  return (fromLast.length >= 3 ? fromLast : pool.slice().reverse()).slice(0, 12);
}

function renderUpNext() {
  renderThemePanel();
  const existing = $("#wp-upnext");
  const p = activePurpose();
  const host = p && !brk && location.pathname === "/watch" ? sidebarHost() : null;
  if (!host) { existing?.remove(); $("#wp-study")?.remove(); $("#wp-plan-panel")?.remove(); return; }
  if (p.plan && planOn()) return renderPlanPanel(p, host);
  $("#wp-plan-panel")?.remove();
  if (activeStudy(p)) return renderStudyPanel(p, host);
  $("#wp-study")?.remove();
  const items = upNextItems(p);
  const lastQ = p.searches?.[p.searches.length - 1]?.q;
  const key = `${currentId}|${lastQ}|${items.map(v => v.id).join(",")}`;
  if (existing && existing.parentElement === host && existing.dataset.key === key) return;
  existing?.remove();
  host.prepend(el("div", { id: "wp-upnext", class: "wp wp-upnext", "data-key": key },
    el("div", { class: "wp-upnext-head" },
      el("div", { class: "wp-strong" }, p.learn && !lastQ ? "More from your topics" : "Up next from your search"),
      el("div", { class: "wp-muted wp-ellipsis" }, lastQ ? `“${lastQ}”` : p.learn ? p.learn : p.text)),
    ...(items.length
      ? items.map(v => el("a", { class: "wp-upnext-item", href: `/watch?v=${encodeURIComponent(v.id)}`, title: v.title || "" },
          // A background image: if the thumbnail can't load, a grey box remains, not a broken-image icon.
          el("div", { class: "wp-upnext-thumb", style: `background-image: url("https://i.ytimg.com/vi/${encodeURIComponent(v.id)}/mqdefault.jpg")` },
            v.length ? el("span", { class: "wp-upnext-len" }, v.length) : null),
          el("div", { class: "wp-upnext-text" },
            el("div", { class: "wp-upnext-title" }, v.title || "Video"),
            v.channel ? el("div", { class: "wp-muted" }, v.channel) : null)))
      : [el("div", { class: "wp-muted wp-upnext-empty" }, "Search toward your aim, and what you find shows up here.")])));
}
