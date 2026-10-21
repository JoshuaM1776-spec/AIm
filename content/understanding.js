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

// ---------- Put it into practice ----------
// The librarian's suggestion of one small way to use what you learned, with a project video to follow.
// "I tried it" is your word for it (no proof asked); a note on how it went comes up next time you talk.
async function findPractice(aimId, practice) {
  await send({ type: "practice-set", aimId, practice });
  if (activePurpose()?.id !== aimId) {
    const r = await send({ type: "purpose-resume", id: aimId }); // a finished aim starts again, with its practice
    if (!r || r.result !== "applied") return toast(r?.message || "Couldn't do that. Try again.");
  }
  location.href = `/results?search_query=${encodeURIComponent(practice.search)}`;
}

// In the librarian's panel, when a conversation ends with a suggestion.
function practiceCard(aimId, practice) {
  const status = el("div", { class: "wp-row" },
    el("button", { class: "wp-btn wp-btn-primary", onclick: () => { closeTalk(); findPractice(aimId, practice); } }, icon("search"), "Find a project video"),
    el("button", { class: "wp-btn wp-btn-text", onclick: async () => {
      const r = await send({ type: "practice-set", aimId, practice });
      status.replaceChildren(el("span", { class: "wp-muted" }, r?.result === "applied" ? "Saved with your aim. It's on the homepage." : "Couldn't save that."));
    } }, "Save for later"));
  return el("div", { class: "wp-practice" },
    el("div", { class: "wp-label" }, "Put it into practice"),
    el("div", { class: "wp-strong" }, practice.title),
    practice.why ? el("div", { class: "wp-muted" }, practice.why) : null,
    status);
}

// On the homepage, under the current aim: the saved practice, and I tried it.
function practiceBlock(p) {
  const pr = p?.practice;
  if (!pr) return null;
  const box = el("div", { class: "wp-practice wp-practice-home" });
  const draw = () => box.replaceChildren(...[
    el("div", { class: "wp-label" }, pr.triedAt ? "You tried it" : "Put it into practice"),
    el("div", { class: "wp-strong" }, pr.title),
    pr.triedAt ? (pr.note ? el("div", { class: "wp-muted" }, `“${pr.note}”`) : null) : pr.why ? el("div", { class: "wp-muted" }, pr.why) : null,
    pr.triedAt
      ? el("div", { class: "wp-row" }, account.on ? el("button", { class: "wp-btn wp-btn-tonal", onclick: () => openTalk({ aimId: p.id }) }, "Talk about how it went") : null)
      : el("div", { class: "wp-row" },
          el("button", { class: "wp-btn wp-btn-tonal", onclick: () => findPractice(p.id, pr) }, icon("search"), "Find a project video"),
          el("button", { class: "wp-btn wp-btn-text", onclick: () => tried() }, "I tried it"))].filter(Boolean));
  const tried = () => {
    const note = el("textarea", { class: "wp-input", rows: "2", maxlength: "500", placeholder: "How did it go? What would you change? (optional)", "aria-label": "How it went" });
    keepKeys(note);
    box.replaceChildren(el("div", { class: "wp-label" }, "You tried it"), el("div", { class: "wp-strong" }, pr.title), note,
      el("div", { class: "wp-row" },
        el("button", { class: "wp-btn wp-btn-primary", onclick: async () => {
          const r = await send({ type: "practice-set", aimId: p.id, tried: true, note: note.value });
          if (r?.practice) Object.assign(pr, r.practice);
          draw();
        } }, "Save"),
        el("button", { class: "wp-btn wp-btn-text", onclick: draw }, "Cancel")));
    note.focus();
  };
  draw();
  return box;
}
