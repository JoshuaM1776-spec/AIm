// Aim — "Relax with a theme": a break with something you'd enjoy in mind ("I just want to enjoy
// some engineering videos"). It's a break, counted against today's leisure time, and YouTube is as
// usual; Aim only keeps the theme in sight: a slim bar on its searches' results, and "More on
// <theme>" beside each video, from what those searches found. No study offers, no tests.

const theme = () => (brk && !brk.oneVideoId ? brk.theme : null);

// On the theme's results: remember what YouTube showed (ads left out), for "More on <theme>".
function captureTheme() {
  const t = theme();
  if (!t || location.pathname !== "/results") return;
  const known = new Map(t.videos.map(v => [v.id, v]));
  const fresh = searchResults().videos.filter(v => v.title && (!known.has(v.id) || (!known.get(v.id).length && v.length)));
  if (!fresh.length) return;
  for (const v of fresh) { const k = known.get(v.id); if (k) k.length ||= v.length; else t.videos.push({ id: v.id, title: v.title, channel: v.channel, length: v.length }); }
  send({ type: "theme-videos", videos: fresh.map(v => ({ id: v.id, title: v.title, channel: v.channel, length: v.length })) });
}

function themeBar(t) {
  const query = searchQuery().toLowerCase();
  const others = t.searches.filter(q => q.toLowerCase() !== query);
  const left = brk.durationMin ? fmtClock((breakEndsAt - Date.now()) / 1000) : null;
  return el("div", { id: "wp-results-bar", class: "wp wp-results-bar wp-rb-relax" },
    el("div", { class: "wp-rb-purpose" },
      el("span", { class: "wp-rb-mark" }, icon("coffee")),
      el("span", { class: "wp-rb-label" }, "Relaxing"),
      el("span", { class: "wp-strong wp-ellipsis wp-rb-text", title: t.text }, t.text),
      left ? el("span", { class: "wp-muted wp-rb-left" }, `${left} left`) : null),
    t.note || others.length ? el("div", { class: "wp-lib" },
      t.note ? el("div", { class: "wp-lib-note" }, t.note) : null,
      others.length ? el("div", { class: "wp-lib-refine" }, el("span", { class: "wp-muted" }, "Also try"),
        ...others.map(q => el("button", { class: "wp-chip", onclick: () => goSearch(q) }, q))) : null) : null);
}

async function renderThemeBar() {
  const t = theme();
  let anchor = null;
  for (let i = 0; i < 20 && !(anchor = resultsAnchor()); i++) await sleep(250);
  if (!anchor || location.pathname !== "/results" || !theme()) return;
  const bar = themeBar(t);
  const old = $("#wp-results-bar");
  if (old) old.replaceWith(bar); else anchor.parentElement.insertBefore(bar, anchor);
  captureTheme();
}

// Beside a video during a themed break: a few more on the theme, above YouTube's own suggestions.
function renderThemePanel() {
  const t = theme();
  const existing = $("#wp-theme-panel");
  const host = t && location.pathname === "/watch" ? sidebarHost() : null;
  const items = host ? t.videos.filter(v => v.id !== currentId).slice(-8).reverse() : [];
  if (!host || !items.length) { existing?.remove(); return; }
  const key = `${currentId}|${items.map(v => v.id + v.length).join(",")}`;
  if (existing && existing.parentElement === host && existing.dataset.key === key) return;
  existing?.remove();
  host.prepend(el("div", { id: "wp-theme-panel", class: "wp wp-upnext wp-theme-panel", "data-key": key },
    el("div", { class: "wp-upnext-head" },
      el("div", { class: "wp-strong" }, `More on ${t.text.toLowerCase()}`),
      el("div", { class: "wp-muted" }, "From your relax searches")),
    ...items.map(v => el("a", { class: "wp-upnext-item", href: `/watch?v=${encodeURIComponent(v.id)}`, title: v.title },
      el("div", { class: "wp-upnext-thumb", style: `background-image: url("https://i.ytimg.com/vi/${encodeURIComponent(v.id)}/mqdefault.jpg")` },
        v.length ? el("span", { class: "wp-upnext-len" }, v.length) : null),
      el("div", { class: "wp-upnext-text" }, el("div", { class: "wp-upnext-title" }, v.title), v.channel ? el("div", { class: "wp-muted" }, v.channel) : null)))));
}
