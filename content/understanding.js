// Aim — Your understanding: for a learning aim, the parts of what understanding it takes (from the
// librarian; a map, not a curriculum) and how far you've got on each. Watching moves a part to
// Explored; only what you say to the librarian moves it further. When most of it is explained, Aim
// offers to put it all together: a finish line, so an aim can end with an answer you understand.
// The rules are in store.js (newMap, mapExplored, mapReady, talkMarks, talkVerdict).

const MAP_LABEL = { new: "Not yet explored", explored: "Explored", partial: "Getting there", explained: "Explained" };

function mapIsReady(map) {
  if (!map?.parts?.length || map.synthesis?.verdict === "solid") return false;
  const explained = map.parts.filter(x => x.status === "explained").length;
  const partly = map.parts.filter(x => x.status === "explained" || x.status === "partial").length;
  return explained >= 2 && partly >= Math.ceil(map.parts.length * 0.6);
}

// Put it together: the librarian asks for the whole answer, then says what it does well and what it leaves out.
const putTogether = aimId => openTalk({ aimId, mode: "synthesis" });

function understandingBlock(p) {
  const map = p?.map;
  if (!map?.parts?.length) return null;
  const row = part => el("div", { class: `wp-map-part wp-map-${part.status}` },
    el("span", { class: "wp-map-dot", "aria-hidden": "true" }),
    el("button", { class: "wp-map-title", title: `Search: ${part.search}`, onclick: () => goSearch(part.search) }, part.title),
    el("span", { class: "wp-map-status" }, MAP_LABEL[part.status] || MAP_LABEL.new),
    el("button", { class: "wp-icon-btn wp-map-x", "aria-label": `Not part of it for me: ${part.title}`, title: "Not part of it for me",
      onclick: async () => { const r = await send({ type: "map-remove", partId: part.id }); if (r?.result === "applied") { applyStatus(await send({ type: "status" })); renderHome(); } } },
      svgIcon("close")));
  const solid = map.synthesis?.verdict === "solid";
  const next = map.parts.find(x => x.status === "new") || map.parts.find(x => x.status === "explored");
  let foot = null;
  if (solid) foot = el("div", { class: "wp-map-next" },
    el("span", {}, "You put it all together. Done here, or keep going?"),
    el("button", { class: "wp-btn wp-btn-tonal", onclick: doneAction(p) }, doneLabel(p)));
  else if (mapIsReady(map)) foot = el("div", { class: "wp-map-next" },
    el("span", {}, "You've explored most of what this takes. Want to try putting it together?"),
    el("button", { class: "wp-btn wp-btn-primary", onclick: () => putTogether(p.id) }, "Put it together"));
  else if (next) foot = el("div", { class: "wp-map-next" },
    el("span", {}, el("span", { class: "wp-muted" }, "Worth exploring next: "), el("b", {}, next.title), next.brief ? el("span", { class: "wp-muted" }, ` · ${next.brief}`) : null),
    el("button", { class: "wp-btn wp-btn-tonal", onclick: () => goSearch(next.search) }, icon("search"), "Search"));
  return el("div", { class: "wp-map" },
    el("div", { class: "wp-row-between" },
      el("div", { class: "wp-label" }, "Your understanding"),
      el("span", { class: "wp-muted wp-map-count" }, `${map.parts.filter(x => x.status === "explained").length} of ${map.parts.length} explained`)),
    ...map.parts.map(row),
    el("div", { class: `wp-map-part wp-map-links wp-map-${solid ? "explained" : "new"}` },
      el("span", { class: "wp-map-dot", "aria-hidden": "true" }),
      el("span", { class: "wp-map-title" }, "How these fit together"),
      el("span", { class: "wp-map-status" }, solid ? "Explained" : "Next connection")),
    foot);
}

// For a set-aside or finished aim on the homepage: its next step, in a few words.
function understandingNext(u) {
  if (!u?.parts?.length) return null;
  if (u.solid) return "You put it together";
  if (u.ready) return "Next: put it together";
  const next = u.parts.find(x => x.status === "new") || u.parts.find(x => x.status === "explored");
  const done = u.parts.filter(x => x.status === "explained").length;
  return next ? `Next: ${next.title} · ${done} of ${u.parts.length} explained` : null;
}
