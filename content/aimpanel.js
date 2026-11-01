// Aim — the panel at the top of YouTube's sidebar while you watch for an aim: the aim and how far
// you've got, then the three things you can do with it, Learn, Explain and Apply, each with its
// next step here, and Notes, your library and Save at the foot. It follows the moment: when the
// video ends, Explain comes forward. "Up next from your search" (upnext.js) sits under it, as what
// Learn leads to. The same three actions as an aim's page (aim.js).

let panelEnded = null; // the video that just finished, so Explain can come forward
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

// How far you've got, from evidence: parts explained, or study topics checked. Videos watched are a
// count, never a progress bar.
function panelProgress(p) {
  const parts = p.map?.parts || [];
  if (parts.length) { const n = parts.filter(x => x.status === "explained").length; return { frac: n / parts.length, text: `${n} of ${parts.length} explained` }; }
  const st = activeStudy(p);
  if (st) { const n = st.topics.filter(t => t.check).length; return { frac: n / st.topics.length, text: `${n} of ${st.topics.length} topics checked` }; }
  const v = (p.videos || []).length;
  return { frac: null, text: v ? `${v} video${v > 1 ? "s" : ""} watched` : "Just started" };
}

function renderAimPanel() {
  const existing = $("#wp-aimpanel");
  const p = activePurpose();
  const host = p && !brk && location.pathname === "/watch" && !(p.plan && planOn()) ? sidebarHost() : null;
  if (!host) return existing?.remove();
  if (panelEnded && panelEnded !== currentId) panelEnded = null;
  const parts = p.map?.parts || [];
  const nextPart = parts.find(x => x.status === "new") || parts.find(x => x.status === "explored");
  // Ready to put it together: most of the parts explained or partly (the same rule as mapReady in store.js).
  const partly = parts.filter(x => x.status === "explained" || x.status === "partial").length;
  const ready = parts.length > 0 && p.map?.synthesis?.verdict !== "solid" && parts.filter(x => x.status === "explained").length >= 2 && partly >= Math.ceil(parts.length * 0.6);
  const pr = p.practice, aim = panelAim(p), field = aim?.scenarioDomain || null;
  const ended = panelEnded === currentId;
  const pick = ended || ready ? "explain" : pr && !pr.triedAt ? "apply" : "learn";
  const prog = panelProgress(p);
  const key = [p.id, p.text, prog.text, nextPart?.id || "", ready, pr?.title || "", pr?.triedAt || "", field || "", ended, account.on, currentId].join("|");
  if (existing && existing.parentElement === host && host.firstElementChild === existing && existing.dataset.key === key) return;
  existing?.remove();

  const row = (k, ic, title, sub, onclick) => el("button", { class: `wp-ap-row${k === pick ? " wp-ap-next" : ""}`, onclick },
    el("span", { class: "wp-ap-ico" }, icon(ic)), el("span", { class: "wp-ap-text" }, el("b", {}, title), el("span", {}, sub)),
    k === pick ? el("span", { class: "wp-ap-tag" }, "Next") : icon("right"));
  const learn = nextPart
    ? row("learn", "book", "Learn", `Next: ${nextPart.title}`, () => { location.href = "/results?search_query=" + encodeURIComponent(nextPart.search); })
    : row("learn", "book", "Learn", "Up next from your search", () => $("#wp-upnext")?.scrollIntoView({ behavior: "smooth", block: "nearest" }));
  const explain = !account.on
    ? row("explain", "talk", "Explain", "Sign in to talk it through", () => send({ type: "open-options", section: "account" }))
    : ready ? row("explain", "talk", "Explain", "Put the whole answer together", () => openTalk({ mode: "synthesis" }))
    : row("explain", "talk", "Explain", ended ? "Explain this video while it's fresh" : "Teach it back to the librarian", () => openTalk());
  const apply = pr && !pr.triedAt ? row("apply", "tool", "Apply", pr.title, () => send({ type: "open-aim", id: p.id }))
    : field ? row("apply", "tool", "Apply", "Run a scenario", () => send({ type: "open-scenario", aimId: p.id }))
    : row("apply", "tool", "Apply", pr ? `You tried: ${pr.title}` : "Projects and practice", () => send({ type: "open-aim", id: p.id }));

  host.prepend(el("div", { id: "wp-aimpanel", class: "wp wp-aimpanel", "data-key": key },
    el("div", { class: "wp-ap-head" },
      el("span", { class: "wp-icon" }, svgIcon("logo")), el("b", {}, BRAND),
      el("button", { class: "wp-icon-btn", title: "Open this aim's page", "aria-label": "Open this aim's page", onclick: () => send({ type: "open-aim", id: p.id }) }, icon("right"))),
    el("div", { class: "wp-ap-aim" },
      el("span", { class: "wp-ap-target" }, icon("target")),
      el("div", { class: "wp-ap-aimtext" },
        el("span", { class: "wp-ap-label" }, p.learn ? "Exploring" : "Your aim"),
        el("b", {}, p.learn ? p.learn : p.text),
        prog.frac !== null ? el("div", { class: "wp-ap-bar" }, el("i", { style: `width:${Math.round(prog.frac * 100)}%` })) : null,
        el("span", { class: "wp-ap-prog" }, prog.text)),
      el("button", { class: "wp-link", onclick: () => openPivotDialog() }, "Change")),
    ended ? el("div", { class: "wp-ap-moment" }, "You finished this video. Explaining it now is when it sticks.") : null,
    el("div", { class: "wp-ap-rows" }, learn, explain, apply),
    el("div", { class: "wp-ap-foot" },
      el("button", { class: "wp-ap-chip", onclick: openNotesDialog }, icon("note"), p.notes ? "Notes" : "Add notes"),
      el("button", { class: "wp-ap-chip", onclick: () => send({ type: "open-targets" }) }, icon("library"), "Library"),
      currentInfo ? el("button", { class: "wp-ap-chip wp-ap-save", title: "Save this video for later", "aria-label": "Save this video for later", onclick: () => saveCurrent(false) }, icon("save")) : null)));
}
