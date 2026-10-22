// Aim — one aim's page (aim.html?id=…): its book, where you are with it (Your understanding, a question
// to explore, Put it into practice), what you've learned and explained, its key videos, your notes,
// its path and related aims. Doing anything goes back to YouTube, picking the aim up first.

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
function understanding(a) {
  const map = a.map;
  if (!map?.parts?.length) return null;
  const solid = map.synthesis?.verdict === "solid";
  return node("section", { className: "card", id: "understanding" },
    node("h2", { textContent: "Your understanding so far" }),
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
          saved ? node("small", { className: "muted", textContent: ` · ${saved.levels.length} level${saved.levels.length > 1 ? "s" : ""} deep` }) : null),
        node("span", { className: "part-tools" },
          node("button", { className: "linkish", type: "button", textContent: "Go deeper", onclick: toggle }),
          node("button", { className: "linkish", type: "button", textContent: "Search", title: p.search, onclick: () => search(p.search) }))), holder];
    }).flat(),
    node("div", { className: "part" }, node("span", { className: `dot ${solid ? "explained" : ""}` }),
      node("span", {}, node("b", { textContent: "How these fit together" }), node("small", { textContent: solid ? "Explained: you put it together" : "Next connection" })), null));
}

// The next useful step: putting it together, or the part not yet explored.
function nextQuestion(a) {
  const map = a.map;
  if (!map?.parts?.length) return null;
  if (map.synthesis?.verdict === "solid") return node("div", { className: "tile" }, node("span", { className: "label", textContent: "You put it together" }),
    node("span", { className: "muted", textContent: "Your explanation covered the main parts. Done here, or go on to where people disagree." }));
  if (a.understanding?.ready) return node("div", { className: "tile" }, node("span", { className: "label", textContent: "Ready to put it together" }),
    node("span", { className: "muted", textContent: "You've explained most of what this takes. Try telling the librarian the whole answer, in a few sentences." }),
    node("div", {}, btn("Put it together", "", () => goTo("https://www.youtube.com/#aim-put-together"))));
  const next = map.parts.find(p => p.status === "new") || map.parts.find(p => p.status === "explored");
  if (!next) return null;
  return node("div", { className: "tile" }, node("span", { className: "label", textContent: "A question to explore" }),
    node("span", { textContent: next.brief ? `${next.title}: ${next.brief}` : next.title }),
    node("div", {}, btn("Search for it", "tonal", () => search(next.search))));
}

function practice(a) {
  const pr = a.practice;
  const box = node("section", { className: "card", id: "practice" }, node("h2", { textContent: "Put it into practice" }));
  if (!pr) { box.append(node("p", { className: "muted", textContent: "When you talk it through, the librarian may suggest one small way to use what you've learned. It shows up here." })); return box; }
  const draw = () => box.replaceChildren(node("h2", { textContent: pr.triedAt ? "You tried it" : "Put it into practice" }),
    node("p", {}, node("b", { textContent: pr.title })),
    pr.why ? node("p", { className: "muted", textContent: pr.why }) : null,
    pr.triedAt && pr.note ? node("p", { className: "muted", textContent: `“${pr.note}”` }) : null,
    pr.triedAt ? node("div", { className: "actions" }, btn("Talk about how it went", "tonal", () => goTo("https://www.youtube.com/#aim-talk")))
      : node("div", { className: "actions" },
          btn("Find a project video", "", async () => { await send({ type: "practice-set", aimId: id, practice: pr }); search(pr.search); }),
          btn("I tried it", "text", tried)));
  const tried = () => {
    const note = node("textarea", { className: "field", rows: 3, placeholder: "How did it go? What would you change? (optional)", ariaLabel: "How it went" });
    box.replaceChildren(node("h2", { textContent: "You tried it" }), node("p", {}, node("b", { textContent: pr.title })), note,
      node("div", { className: "actions", style: "margin-top:10px" },
        btn("Save", "", async () => { const r = await send({ type: "practice-set", aimId: id, tried: true, note: note.value }); if (r?.practice) Object.assign(pr, r.practice); draw(); }),
        btn("Cancel", "text", draw)));
    note.focus();
  };
  draw();
  return box;
}

// Ways to practice: the tools Aim has for learning something, what each is best for, and the one
// that fits this aim best right now. You pick.
function ways(a, refs) {
  const field = a.scenarioDomain; // medical, aviation, general, or null when scenarios don't fit
  const SCENARIO_BEST = { medical: "Calls, patients and medications: work a situation as it unfolds, using your own protocols.",
    aviation: "In-flight emergencies: fly the problem as it unfolds, using your own POH and checklists.",
    general: "Emergencies and incidents: work a situation as it unfolds, using your own procedures." };
  const tools = [
    { key: "talk", title: "Talk it through", best: "Checking you understand: the librarian asks what you'd tell a friend, then what you'd ask next.",
      go: () => goTo("https://www.youtube.com/#aim-talk"), label: "Talk it through" },
    a.map?.parts?.length ? { key: "together", title: "Put it together", best: "Seeing how the parts connect: what's happening, why, and what counteracts it, in a few sentences of your own.",
      go: () => goTo("https://www.youtube.com/#aim-put-together"), label: "Put it together" } : null,
    a.study?.of ? { key: "check", title: "Check yourself", best: "Course material: short checks on each topic, so you know what's solid before a test.",
      go: () => goTo(), label: "Continue studying" } : null,
    { key: "practice", title: "Put it into practice", best: "Skills and projects: one small thing to try, so it sticks because you used it.",
      go: () => document.getElementById("practice")?.scrollIntoView({ behavior: "smooth" }), label: "See practice" },
    field ? { key: "scenario", title: "Scenario", best: `${SCENARIO_BEST[field]} Aim Plus.`,
      go: () => (location.href = `scenario.html?aim=${encodeURIComponent(id)}`), label: "Run a scenario",
      note: refs ? `From your ${refs} reference${refs > 1 ? "s" : ""}.` : field === "aviation" ? "Add your POH and checklists first, so it uses your airplane's numbers." : "Add your protocols or procedures first, so it uses your steps and numbers.",
      extra: refs ? null : node("a", { href: "references.html", textContent: field === "aviation" ? "Add your POH" : "Add your references" }) } : null
  ].filter(Boolean);
  const pick = a.understanding?.ready && a.map?.synthesis?.verdict !== "solid" ? "together"
    : a.practice && !a.practice.triedAt ? "practice"
    : a.study?.of && a.study.checked < a.study.of ? "check"
    : field ? "scenario" : "talk";
  return node("section", { className: "card", id: "ways" }, node("h2", { textContent: "Ways to practice" }),
    node("div", { className: "ways" }, tools.map(t => node("div", { className: `way${t.key === pick ? " best" : ""}`, title: t.title },
      t.key === pick ? node("span", { className: "pill strong", textContent: "Best for this aim" }) : null,
      node("b", { textContent: t.title }), node("span", { className: "muted", textContent: t.best }),
      t.note ? node("small", { className: "muted", textContent: t.note }) : null, t.extra || null,
      node("div", {}, btn(t.label, t.key === pick ? "" : "tonal", t.go))))));
}

function learned(a) {
  const items = [
    ...a.learned.map(m => node("li", {}, node("b", { textContent: `${m.subject}: ` }), m.idea, m.understood === "shaky" ? node("span", { className: "muted", textContent: " (still working on it)" }) : null)),
    ...(a.map?.parts || []).filter(p => p.status === "explained").map(p => node("li", {}, node("b", { textContent: p.title }), node("span", { className: "muted", textContent: " · explained in your own words" }))),
    ...(a.scenarios || []).map(x => node("li", {}, node("b", { textContent: `Scenario: ${x.title}` }),
      node("span", { className: "muted", textContent: ` · ${x.happening || "debriefed"}${x.missed?.length ? ` To work on: ${x.missed[0]}` : ""}`.replace(/\s?\[R\d{1,2}(?:\.\d{1,4})?\]/g, "") }))),
    ...(a.study?.topics || []).filter(t => t.check).map(t => node("li", {}, node("b", { textContent: t.title }),
      node("span", { className: "muted", textContent: ` · ${t.check.objectives.filter(o => o.status === "demonstrated").length} of ${t.check.objectives.length} shown in a check` })))];
  return node("section", { className: "card", id: "learned" }, node("h2", { textContent: "What you've learned" }),
    items.length ? node("ul", { className: "learned" }, items) : node("p", { className: "muted", textContent: "What you explain to the librarian about this aim shows up here." }));
}

function videos(a) {
  const vids = a.recent || [];
  const play = async v => {
    const r = await send({ type: "purpose-resume", id });
    if (!r || r.result !== "applied") return toast(r?.message || "Couldn't do that. Try again.");
    await send({ type: "purpose-allow", query: "", videos: [{ id: v.id, title: v.title, channel: v.channel }], lists: [] });
    location.href = `https://www.youtube.com/watch?v=${encodeURIComponent(v.id)}${v.t > 5 && !(v.d && v.t > v.d - 15) ? `&t=${Math.floor(v.t)}s` : ""}`;
  };
  return node("section", { className: "card", id: "videos" }, node("h2", { textContent: "Key videos" }),
    vids.length ? node("div", { className: "vids" }, vids.map(v => {
      const th = node("span", { className: "thumb" }, v.d > 0 && v.t > 0 ? node("i", { style: `width:${Math.min(100, Math.round((v.t / v.d) * 100))}%` }) : null);
      th.style.backgroundImage = `url("https://i.ytimg.com/vi/${encodeURIComponent(v.id)}/mqdefault.jpg")`;
      return node("button", { className: "vid", type: "button", title: `Play “${v.title}”`, onclick: () => play(v) }, th,
        node("span", { className: "t", textContent: v.title }), node("span", { className: "c", textContent: v.channel }));
    })) : node("p", { className: "muted", textContent: "Videos you watch for this aim show up here." }),
    a.trail?.length > 1 ? node("p", { className: "muted", style: "margin:12px 0 0", textContent: `Your path: ${a.trail.join(" → ")}` }) : null);
}

function notes(a) {
  const area = node("textarea", { value: a.notes || "", placeholder: "Questions, ideas, things to remember…", ariaLabel: "Notes" });
  const status = node("span", { className: "muted" });
  return node("section", { className: "card notes", id: "notes" }, node("h2", { textContent: "Notes & ideas" }), area,
    node("div", { className: "actions", style: "margin-top:10px;align-items:center" },
      btn("Save notes", "tonal", async () => { const r = await send({ type: "aim-notes", id, text: area.value }); status.textContent = r?.result === "applied" ? "Saved." : "Couldn't save."; }), status));
}

function related(list) {
  return node("section", { className: "card", id: "related" }, node("h2", { textContent: "Related aims" }),
    list.length ? node("div", { className: "related" }, list.map(r => node("a", { href: `aim.html?id=${encodeURIComponent(r.id)}`, title: r.text }, cover(r)))) :
      node("p", { className: "muted", textContent: "Aims about the same things show up here." }));
}

async function render() {
  const [d, refList] = await Promise.all([send({ type: "aim-get", id }), send({ type: "ref-list" })]);
  refLevel = (refList || []).find(r => r.level)?.level || "";
  const page = document.getElementById("page");
  if (!d || d.result !== "applied") { page.replaceChildren(node("p", { className: "error", textContent: d?.message || "Couldn't load this aim." }), node("a", { href: "targets.html", textContent: "Back to your library" })); return; }
  const a = d.aim;
  document.title = `${a.text} · ${BRAND}`;
  const mins = Math.round((a.usedSec || 0) / 60);
  const main = node("div", {},
    node("section", { id: "overview" },
      node("div", { className: "aim-head" },
        node("div", {},
          node("span", { className: `state${a.state === "completed" ? " done" : ""}`, textContent: a.exploring ? (a.state === "completed" ? "Explored" : "Exploring") : STATE[a.state] }),
          node("h1", { textContent: a.text }),
          node("p", { className: "lede", textContent: a.librarianNote || [`Started ${when(a.startedAt)}`, mins ? `${mins} min` : null, a.videos ? `${a.videos} video${a.videos > 1 ? "s" : ""}` : null].filter(Boolean).join(" · ") })),
        node("div", { className: "actions" },
          btn(a.state === "active" ? "Continue on YouTube" : a.state === "paused" ? "Pick it up" : "Start again", "accent", () => goTo()))),
      node("div", { className: "overview" },
        node("div", {}, understanding(a) || learned(a)),
        node("div", {}, nextQuestion(a), practice(a)))),
    ways(a, (refList || []).length),
    a.map?.parts?.length ? learned(a) : null,
    videos(a), notes(a), related(d.related));
  const side = node("aside", { className: "aim-side" },
    node("a", { className: "back", href: "targets.html", textContent: "← Back to library" }),
    cover(a, "large"),
    node("nav", { className: "aim-nav", ariaLabel: "This aim" },
      [["overview", "Overview"], ["ways", "Ways to practice"], ["learned", "What you've learned"], ["videos", "Key videos"], ["notes", "Notes & ideas"], ["practice", "Practice"], ["related", "Related aims"]]
        .map(([k, label]) => node("a", { href: `#${k}`, textContent: label }))));
  page.replaceChildren(node("div", { className: "aim-layout" }, side, main));
  for (const s of main.querySelectorAll("section.card")) s.style.marginTop = "16px";
}

render();
