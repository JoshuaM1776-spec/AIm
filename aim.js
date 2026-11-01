// Aim — one aim's page (aim.html?id=…), opened like a book: the title and where you are (what you
// watched, what you explained, what you did, kept apart), the three things to do next (Learn, Explain,
// Apply), then its chapters: Learn (videos and what to look at next), Understand (what it takes, what
// you've explained, going deeper), Practice, and Notes. Doing anything goes back to YouTube, picking
// the aim up first.

const BRAND = chrome.runtime.getManifest().name;
for (const n of document.querySelectorAll("[data-brand]")) n.textContent = BRAND;
const send = msg => chrome.runtime.sendMessage(msg).catch(() => null);
const id = new URLSearchParams(location.search).get("id") || "";

function node(tag, props = {}, ...kids) {
  const n = Object.assign(document.createElement(tag), props);
  n.append(...kids.flat().filter(k => k != null && k !== false));
  return n;
}
const btn = (label, cls, onclick) => node("button", { className: `btn ${cls}`.trim(), type: "button", textContent: label, onclick });
function toast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg; t.style.display = "block";
  clearTimeout(toast.timer); toast.timer = setTimeout(() => (t.style.display = "none"), 3000);
}
function when(ts) {
  if (!ts) return "";
  const day = d => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((day(new Date()) - day(new Date(ts))) / 86400000);
  return days <= 0 ? "today" : days === 1 ? "yesterday" : days < 7 ? `${days} days ago` : new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

// Pick the aim up (a finished one starts again), then go to YouTube: where you left off, or `url`.
async function goTo(url = null) {
  const r = await send({ type: "purpose-resume", id });
  if (!r || r.result !== "applied") return toast(r?.message || "Couldn't do that. Try again.");
  location.href = url || r.url;
}
const search = q => goTo(`https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`);

const STATUS = { new: "Not yet explored", explored: "Explored", partial: "Getting there", explained: "Explained" };
const STATE = { active: "In progress", paused: "Set aside", completed: "Completed" };

let refLevel = ""; // your references' level, for going deeper at the right depth

// What understanding this aim takes, part by part, with Go deeper on each.
function understanding(a) {
  const map = a.map;
  if (!map?.parts?.length) return null;
  const solid = map.synthesis?.verdict === "solid";
  return node("div", { className: "block", id: "understanding" },
    node("h3", { textContent: "What this takes" }),
    ...map.parts.map(p => {
      const saved = (a.chains || []).find(c => c.partId === p.id);
      const holder = node("div", { className: "deeper-holder" });
      const toggle = () => {
        if (holder.firstChild) return holder.replaceChildren();
        holder.append(deeperLadder({ aimId: id, topic: a.text, domain: a.scenarioDomain || "general", level: refLevel, root: p.title, brief: p.brief, partId: p.id, chain: saved,
          talk: chain => goTo(`https://www.youtube.com/#aim-deeper=${encodeURIComponent(JSON.stringify({ title: p.title, brief: p.brief || "", chain }))}`) }));
      };
      return [node("div", { className: "part" },
        node("span", { className: `dot ${p.status}` }),
        node("span", {}, node("b", { textContent: p.title }), node("small", { textContent: `${STATUS[p.status]}${p.brief ? ` · ${p.brief}` : ""}` }),
          saved ? node("small", { textContent: ` · ${saved.levels.length} level${saved.levels.length > 1 ? "s" : ""} deep` }) : null),
        node("span", { className: "part-tools" },
          node("button", { className: "linkish", type: "button", textContent: "Go deeper", onclick: toggle }),
          node("button", { className: "linkish", type: "button", textContent: "Search", title: p.search, onclick: () => search(p.search) }))), holder];
    }).flat(),
    node("div", { className: "part" }, node("span", { className: `dot ${solid ? "explained" : ""}` }),
      node("span", {}, node("b", { textContent: "How these fit together" }), node("small", { textContent: solid ? "Explained: you put it together" : "Put the whole answer together once you've explained most of it" })), null));
}

// Put it into practice: the one small thing the librarian suggested, and whether you tried it.
function practice(a) {
  const pr = a.practice;
  const box = node("div", { className: "block", id: "practice-item" });
  if (!pr) { box.append(node("p", { className: "muted", textContent: "When you talk it through, the librarian may suggest one small way to use what you've learned. It shows up here." })); return box; }
  const draw = () => box.replaceChildren(node("div", { className: "practice-item" },
    node("span", { className: "kind", textContent: pr.triedAt ? "You tried it" : "To try" }),
    node("b", { textContent: pr.title }),
    pr.why ? node("p", { className: "muted", textContent: pr.why }) : null,
    pr.triedAt && pr.note ? node("p", { className: "muted", textContent: `“${pr.note}”` }) : null,
    pr.triedAt ? node("div", { className: "actions" }, btn("Talk about how it went", "tonal", () => goTo("https://www.youtube.com/#aim-talk")))
      : node("div", { className: "actions" },
          btn("Find a project video", "", async () => { await send({ type: "practice-set", aimId: id, practice: pr }); search(pr.search); }),
          btn("I tried it", "text", tried))));
  const tried = () => {
    const note = node("textarea", { className: "field", rows: 3, placeholder: "How did it go? What would you change? (optional)", ariaLabel: "How it went" });
    box.replaceChildren(node("div", { className: "practice-item" }, node("span", { className: "kind", textContent: "You tried it" }), node("b", { textContent: pr.title }), note,
      node("div", { className: "actions", style: "margin-top:10px" },
        btn("Save", "", async () => { const r = await send({ type: "practice-set", aimId: id, tried: true, note: note.value }); if (r?.practice) Object.assign(pr, r.practice); draw(); }),
        btn("Cancel", "text", draw))));
    note.focus();
  };
  draw();
  return box;
}

// Scenarios run for this aim, with what each debrief said to work on.
function scenarios(a, field, refs) {
  if (!field) return null;
  const list = a.scenarios || [];
  return node("div", { className: "block", id: "scenarios" }, node("h3", { textContent: "Scenarios" }),
    list.length ? node("ul", { className: "learned" }, list.map(x => node("li", {}, node("span", { className: "kind", textContent: "Done" }),
      node("span", {}, node("b", { textContent: x.title }), node("span", { className: "muted", textContent: ` · ${x.happening || "debriefed"}${x.missed?.length ? ` To work on: ${x.missed[0]}` : ""}`.replace(/\s?\[R\d{1,2}(?:\.\d{1,4})?\]/g, "") })))))
      : node("p", { className: "muted", textContent: refs ? "Work a situation as it unfolds, from your references." : "Work a situation as it unfolds. Add your references first, so it uses your own numbers and steps." }),
    node("div", { className: "actions", style: "margin-top:10px" }, btn("Run a scenario", "tonal", () => (location.href = `scenario.html?aim=${encodeURIComponent(id)}`)),
      refs ? null : node("a", { href: "references.html", textContent: field === "aviation" ? "Add your POH" : "Add your references" })));
}

// Where you are: what you watched, what you explained, what you did. Never mixed into one score.
function evidence(a) {
  const explainedParts = (a.map?.parts || []).filter(p => p.status === "explained").length;
  const shown = (a.study?.topics || []).reduce((n, t) => n + (t.check?.objectives || []).filter(o => o.status === "demonstrated").length, 0);
  const explained = a.learned.length + explainedParts + shown;
  const done = (a.practice?.triedAt ? 1 : 0) + (a.scenarios || []).length;
  const mins = Math.round((a.usedSec || 0) / 60);
  return { explained, done, watched: a.videos || 0, mins };
}
function ledger(e) {
  const cell = (n, label) => node("div", {}, node("b", { textContent: String(n) }), node("span", { textContent: label }));
  return node("div", { className: "ledger", ariaLabel: "Where you are" },
    cell(e.watched, `explored: ${e.watched === 1 ? "video" : "videos"} watched${e.mins ? ` · ${e.mins} min` : ""}`),
    cell(e.explained, `explained: ${e.explained === 1 ? "idea" : "ideas"} in your own words`),
    cell(e.done, `applied: practice and scenarios you tried`));
}

// Learn, Explain, Apply: the three things you can do with an aim, each with its next step here, and
// the one that fits best right now marked. Not steps in order: you pick.
function ways(a, refs) {
  const field = a.scenarioDomain; // medical, aviation, general, or null when scenarios don't fit
  const map = a.map, parts = map?.parts || [];
  const nextPart = parts.find(p => p.status === "new") || parts.find(p => p.status === "explored");
  const study = a.study?.of ? a.study : null;
  const learn = { key: "learn", title: "Learn", what: "Find the right material and watch.",
    next: study ? ["Your study session", `${study.checked} of ${study.of} topics checked`] : nextPart ? [nextPart.title, nextPart.brief || "Not explored yet"] : a.recent?.length ? ["Pick up where you left off", a.recent[0].title] : ["Find a first video", "Aim keeps the search on your aim"],
    buttons: [nextPart && !study ? btn("Search for it", "", () => search(nextPart.search)) : btn(study ? "Continue studying" : "Continue on YouTube", "", () => goTo())] };
  const ready = a.understanding?.ready && map?.synthesis?.verdict !== "solid";
  const explain = { key: "explain", title: "Explain", what: "Teach it back, and find what you don't know yet.",
    next: ready ? ["Put the whole answer together", "You've explained most of what this takes"] : map?.synthesis?.verdict === "solid" ? ["You put it together", "Go deeper on any part, or talk it through again"] : ["Talk it through", "The librarian asks what you'd tell a friend"],
    buttons: [ready ? btn("Put it together", "", () => goTo("https://www.youtube.com/#aim-put-together")) : btn("Talk it through", "", () => goTo("https://www.youtube.com/#aim-talk")),
      parts.length ? node("button", { className: "linkish", type: "button", textContent: "Go deeper", onclick: () => document.getElementById("understand")?.scrollIntoView({ behavior: "smooth" }) }) : null] };
  const pr = a.practice;
  const apply = { key: "apply", title: "Apply", what: "Use it: a project, an exercise or a scenario.",
    next: field ? ["Scenario", "Work a situation as it unfolds, from your references"] : pr && !pr.triedAt ? [pr.title, "One small thing to try"] : pr ? ["You tried it", pr.title] : ["One small thing to try", "Talk it through, and the librarian may suggest one"],
    buttons: [field ? btn("Run a scenario", "", () => (location.href = `scenario.html?aim=${encodeURIComponent(id)}`)) : null,
      pr ? btn(field ? "See practice" : pr.triedAt ? "See practice" : "Find a project video", field ? "tonal" : "", () => (pr.triedAt || field ? document.getElementById("practice")?.scrollIntoView({ behavior: "smooth" }) : search(pr.search))) : null,
      !field && !pr ? btn("Talk it through", "tonal", () => goTo("https://www.youtube.com/#aim-talk")) : null] };
  const pick = ready ? "explain" : pr && !pr.triedAt ? "apply" : study && study.checked < study.of ? "learn" : field ? "apply" : !a.videos ? "learn" : "explain";
  return node("div", { className: "ways", id: "ways" }, [learn, explain, apply].map(w => node("div", { className: `way${w.key === pick ? " best" : ""}`, title: w.title },
    w.key === pick ? node("span", { className: "pill strong", textContent: "Next for this aim" }) : null,
    node("h3", { textContent: w.title }), node("span", { className: "what", textContent: w.what }),
    node("span", { className: "next", textContent: w.next[0] }, node("small", { textContent: w.next[1] })),
    node("div", { className: "go" }, ...w.buttons.filter(Boolean)))));
}

// What a conversation found you couldn't yet explain, and whether you've followed up.
function gapsBlock(a) {
  const gaps = (a.gaps || []).slice().reverse();
  if (!gaps.length) return null;
  return node("div", { className: "block", id: "gaps" }, node("h3", { textContent: "Still to explain" }),
    node("ul", { className: "learned" }, gaps.map(g => node("li", {},
      node("span", { className: "kind", textContent: g.resolvedAt ? "Followed up" : g.watchedAt ? "Watched" : "Gap" }),
      node("span", {}, node("b", { textContent: g.title }), g.what ? node("span", { className: "muted", textContent: ` · ${g.what}` }) : null,
        g.resolvedAt ? null : node("button", { className: "linkish", type: "button", style: "margin-left:8px", textContent: "Find a video", onclick: () => search(g.search) }))))));
}

// What you've shown, kind by kind: explained in conversation, shown in a check, worked out in a scenario.
function learned(a) {
  const row = (kind, b, rest) => node("li", {}, node("span", { className: "kind", textContent: kind }), node("span", {}, node("b", { textContent: b }), rest ? node("span", { className: "muted", textContent: rest }) : null));
  const items = [
    ...a.learned.map(m => row("Explained", `${m.subject}: `, `${m.idea}${m.understood === "shaky" ? " (still working on it)" : ""}`)),
    ...(a.map?.parts || []).filter(p => p.status === "explained").map(p => row("Explained", p.title, " · in your own words")),
    ...(a.study?.topics || []).filter(t => t.check).map(t => row("Checked", t.title,
      ` · ${t.check.objectives.filter(o => o.status === "demonstrated").length} of ${t.check.objectives.length} shown in a check`))];
  return node("div", { className: "block", id: "learned" }, node("h3", { textContent: "What you've learned" }),
    items.length ? node("ul", { className: "learned" }, items) : node("p", { className: "muted", textContent: "What you explain to the librarian about this aim shows up here, apart from what you watched." }));
}

function videos(a) {
  const vids = a.recent || [];
  const play = async v => {
    const r = await send({ type: "purpose-resume", id });
    if (!r || r.result !== "applied") return toast(r?.message || "Couldn't do that. Try again.");
    await send({ type: "purpose-allow", query: "", videos: [{ id: v.id, title: v.title, channel: v.channel }], lists: [] });
    location.href = `https://www.youtube.com/watch?v=${encodeURIComponent(v.id)}${v.t > 5 && !(v.d && v.t > v.d - 15) ? `&t=${Math.floor(v.t)}s` : ""}`;
  };
  return node("div", { className: "block", id: "videos" }, node("h3", { textContent: "Key videos" }),
    vids.length ? node("div", { className: "vids" }, vids.map(v => {
      const th = node("span", { className: "thumb" }, v.d > 0 && v.t > 0 ? node("i", { style: `width:${Math.min(100, Math.round((v.t / v.d) * 100))}%` }) : null);
      th.style.backgroundImage = `url("https://i.ytimg.com/vi/${encodeURIComponent(v.id)}/mqdefault.jpg")`;
      return node("button", { className: "vid", type: "button", title: `Play “${v.title}”`, onclick: () => play(v) }, th,
        node("span", { className: "t", textContent: v.title }), node("span", { className: "c", textContent: v.channel }));
    })) : node("p", { className: "muted", textContent: "Videos you watch for this aim show up here." }),
    a.trail?.length > 1 ? node("p", { className: "muted", style: "margin:14px 0 0", textContent: `Your path: ${a.trail.join(" → ")}` }) : null);
}

function notes(a) {
  const area = node("textarea", { value: a.notes || "", placeholder: "Questions, discoveries, things to remember…", ariaLabel: "Notes" });
  const status = node("span", { className: "muted" });
  return node("div", { className: "block notes" }, area,
    node("div", { className: "actions", style: "margin-top:10px" },
      btn("Save notes", "tonal", async () => { const r = await send({ type: "aim-notes", id, text: area.value }); status.textContent = r?.result === "applied" ? "Saved." : "Couldn't save."; }), status));
}

function related(list) {
  return node("div", { className: "block", id: "related" }, node("h3", { textContent: "Related aims" }),
    list.length ? node("div", { className: "related" }, list.map(r => node("a", { href: `aim.html?id=${encodeURIComponent(r.id)}`, title: r.text }, cover(r)))) :
      node("p", { className: "muted", textContent: "Aims about the same things show up here." }));
}

const chapter = (id, eyebrow, title, sub, ...kids) => node("section", { className: "chapter", id },
  node("header", {}, node("span", { className: "eyebrow", textContent: eyebrow }), node("h2", { textContent: title }), sub ? node("p", { textContent: sub }) : null), ...kids);

async function render() {
  const [d, refList] = await Promise.all([send({ type: "aim-get", id }), send({ type: "ref-list" })]);
  refLevel = (refList || []).find(r => r.level)?.level || "";
  const refs = (refList || []).length;
  const page = document.getElementById("page");
  if (!d || d.result !== "applied") { page.replaceChildren(node("p", { className: "error", textContent: d?.message || "Couldn't load this aim." }), node("a", { href: "targets.html", textContent: "Back to your library" })); return; }
  const a = d.aim;
  document.title = `${a.text} · ${BRAND}`;
  const e = evidence(a);
  const folio = node("article", { className: "folio" },
    node("section", { id: "overview" },
      node("div", { className: "aim-head" },
        node("div", {},
          node("span", { className: `state${a.state === "completed" ? " done" : ""}`, textContent: a.exploring ? (a.state === "completed" ? "Explored" : "Exploring") : STATE[a.state] }),
          node("h1", { textContent: a.text }),
          node("p", { className: "lede", textContent: a.librarianNote || [`Started ${when(a.startedAt)}`, a.subject?.name].filter(Boolean).join(" · ") })),
        node("div", { className: "actions" },
          btn(a.state === "active" ? "Continue on YouTube" : a.state === "paused" ? "Pick it up" : "Start again", "accent", () => goTo()))),
      ledger(e),
      ways(a, refs)),
    chapter("learn", "Learn", "Videos and where to look next", "What you've watched for this aim, and the path you took.", videos(a)),
    chapter("understand", "Explain", "What you can explain", "What this aim takes, what you've explained in your own words, what you couldn't yet, and the why behind each part.",
      understanding(a), learned(a), gapsBlock(a)),
    chapter("practice", "Apply", "Putting it to use", "Small things to try, so it sticks because you used it.", practice(a), scenarios(a, a.scenarioDomain, refs)),
    chapter("notes", "Notes", "Your notes", "Your own discoveries, questions and useful references.", notes(a), related(d.related)));
  const ribbon = (k, label, n) => node("a", { href: `#${k}` }, label, n ? node("small", { textContent: String(n) }) : null);
  const ribbons = node("nav", { className: "ribbons", ariaLabel: "This aim" },
    ribbon("overview", "Overview"), ribbon("learn", "Learn", e.watched), ribbon("understand", "Explain", e.explained), ribbon("practice", "Apply", e.done), ribbon("notes", "Notes"));
  const side = node("aside", { className: "aim-side" }, node("a", { className: "back", href: "targets.html", textContent: "← Back to library" }), cover(a, "large"), ribbons);
  page.replaceChildren(node("div", { className: "aim-layout" }, side, folio));
  // The ribbon for the chapter you're reading.
  const links = [...ribbons.querySelectorAll("a")];
  const spy = () => {
    let on = links[0];
    for (const l of links) { const s = document.getElementById(l.hash.slice(1)); if (s && s.getBoundingClientRect().top < 160) on = l; }
    for (const l of links) l.classList.toggle("on", l === on);
  };
  addEventListener("scroll", spy, { passive: true });
  spy();
}

render();
