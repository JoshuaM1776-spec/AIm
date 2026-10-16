// Aim — purpose labels on sidebar recommendations during Focus.

function clearRecLabel(n) {
  n.removeAttribute("data-wp-rec");
  delete n.dataset.wpRecTitle;
  n.querySelector(":scope > .wp-rec-tag")?.remove();
}
function clearRecLabels() { for (const n of $$("[data-wp-rec]")) clearRecLabel(n); }

async function labelRecommendations() {
  if (!session || session.mode !== "focus" || session.paused || !settings.hasKey || settings.recMode === "off") return;
  // YouTube reuses sidebar elements for new videos, so a label only counts for the title it was given to.
  const items = sidebarItems().filter(i => i.node.dataset.wpRecTitle !== i.title);
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
