// Aim — the librarian on YouTube, for anyone signed in to an Aim account. It feels like a search
// box that can hold a conversation: plain searches go straight to YouTube; requests and goals ("I
// need to replace the alternator on my 2014 Tacoma") go to the librarian, which writes better
// searches, adds a one- or two-sentence note, and maybe one question as tappable choices. On the
// results page it groups the videos YouTube showed, with a reason for each. It never blocks
// videos: whenever it can't help, the search goes to YouTube as typed. Signed out, none of this runs.

let account = { checkedAt: 0, on: false, plus: false };

async function librarianOn() {
  if (Date.now() - account.checkedAt > 60_000) {
    const r = await send({ type: "plus-brief" });
    account = { checkedAt: Date.now(), on: !!r?.account, plus: !!r?.plus };
  }
  return account.on;
}

// Plain searches ("sourdough starter") go to YouTube; requests and goals go to the librarian.
function looksLikeRequest(text) {
  const t = String(text || "").trim().toLowerCase();
  if (!t) return false;
  if (/\?$/.test(t)) return true;
  if (/^(i |i'm |im |i’m |i've |my |help |how |what |why |where |which |when |can |could |should |need |want |find |explain |teach |show me|looking for|trying to|is there|are there|best way)/.test(t)) return true;
  return t.split(/\s+/).length >= 6;
}

// What the librarian knows about the current Target: kept in this browser, sent with each request.
// Recent Targets (set aside or finished), so "something fun to watch" can lean toward them.
const recentTargets = () => [...(status.paused || []).map(t => t.text), ...(status.recent || [])].filter(t => t !== activePurpose()?.text).slice(0, 5);

function librarianContext(p) {
  if (!p) return { recent: recentTargets() };
  const L = p.librarian || {};
  const thread = (L.thread || []).slice(-8).map(m => ({ role: m.role, text: m.text }));
  if (L.refine) thread.push({ role: "aim", text: L.refine.question });
  return {
    target: p.text, thread,
    searches: (p.searches || []).map(s => s.q).slice(-10),
    watched: (p.videos || []).slice(-8).map(v => ({ title: v.title, channel: v.channel })),
    last: p.last?.title ? { title: p.last.title } : null,
    recent: recentTargets()
  };
}

// Search the way Aim's own boxes do: a request goes to the librarian (when signed in), anything
// else straight to YouTube. `busy` shows progress while the librarian thinks.
async function aimSearch(text, busy) {
  text = String(text || "").trim();
  if (!text) return;
  if (!looksLikeRequest(text) || !(await librarianOn())) return goSearch(text);
  return librarianAsk(text, busy);
}

async function librarianAsk(request, busy) {
  const p = activePurpose();
  busy?.(true);
  const r = await send({ type: "librarian", task: "librarian-ask", input: { request, ...librarianContext(p) } });
  if (!r || r.error) {
    busy?.(false);
    if (r?.code === "limit") toast("That's today's Aim searches. Searching YouTube directly.");
    return goSearch(request);
  }
  // "I just want to enjoy…": a break with a theme. The Target, if any, waits, as with any break.
  if (r.kind === "relax") {
    const b = await send({ type: "break-start", minutes: 30, theme: { text: r.target, note: r.note, searches: r.searches } });
    busy?.(false);
    if (b?.result !== "applied") return toast(b?.message || "Couldn't start a break.");
    toast(b.capped ? `Relaxing: ${r.target}. ${b.capped} min, what's left of today's leisure time.` : `Relaxing: ${r.target}. 30 min of leisure time; add more from ${BRAND}'s menu.`);
    location.href = `/results?search_query=${encodeURIComponent(r.searches[0])}`;
    return;
  }
  const applied = await send({ type: "librarian-apply", request, answer: r, newTarget: !!p && r.sameTarget === false });
  if (applied?.result !== "applied") { busy?.(false); return goSearch(r.searches?.[0] || request); }
  location.href = applied.url;
}

// ---------- on the results page ----------

// The librarian's part of the results bar: its note, the one question as choices, its other
// searches, and a box to ask, search or refine.
function librarianBlock(p) {
  const L = p.librarian || null;
  const query = searchQuery().toLowerCase();
  const input = el("input", { class: "wp-input wp-lib-input", type: "text", placeholder: "Ask, search, or refine your Target…",
    "aria-label": "Ask, search, or refine your Target" });
  const go = el("button", { class: "wp-btn wp-btn-tonal", "aria-label": "Search" }, icon("search"));
  const busy = on => {
    input.disabled = on; go.disabled = on;
    note.textContent = on ? "Looking…" : L?.note || "";
  };
  const note = el("div", { class: "wp-lib-note" }, L?.note || "");
  const submit = () => aimSearch(input.value, busy);
  go.onclick = submit;
  keepKeys(input, submit);
  const others = (L?.searches || []).filter(q => q.toLowerCase() !== query);
  return el("div", { class: "wp-lib", id: "wp-lib" },
    L?.note ? note : null,
    L?.refine ? el("div", { class: "wp-lib-refine" },
      el("span", { class: "wp-muted" }, L.refine.question),
      ...L.refine.options.map(o => el("button", { class: "wp-chip", onclick: () => librarianAsk(o, busy) }, o))) : null,
    others.length ? el("div", { class: "wp-lib-refine" },
      el("span", { class: "wp-muted" }, "Also try"),
      ...others.map(q => el("button", { class: "wp-chip", onclick: () => goSearch(q) }, q))) : null,
    L?.kind === "learn" && account.plus && !activeStudy(p) ? el("div", { class: "wp-lib-refine" },
      el("span", { class: "wp-muted" }, "Studying this?"),
      studyOffer(p),
      el("button", { class: "wp-chip", onclick: () => send({ type: "open-teachback", topic: p.text }) }, "Test my understanding")) : null,
    el("div", { class: "wp-lib-ask" }, input, go));
}

// The librarian's picks among the results YouTube showed, grouped, each with a reason. Asked once
// per search and kept with the Target; YouTube's own results stay below.
let picksInFlight = null;
async function librarianPicks() {
  const p = activePurpose();
  const query = searchQuery();
  if (location.pathname !== "/results" || !(p?.librarian || activeStudy(p)) || brk || searchPending || !query) return removePicks();
  // Picks run for the librarian's searches and for a study session's topic searches.
  const topic = activeStudy(p)?.topics.find(t => t.searches.some(q => q.toLowerCase() === query.toLowerCase())) || null;
  if (!topic && !(p.librarian?.searches || []).some(q => q.toLowerCase() === query.toLowerCase())) return removePicks();
  if (!(await librarianOn())) return removePicks();
  let groups = p.librarian?.picks?.[query] || p._picks?.[query];
  if (!groups) {
    if (picksInFlight === query) return;
    picksInFlight = query;
    let results = searchResults().videos;
    for (let i = 0; i < 12 && results.length < 3; i++) { await sleep(400); results = searchResults().videos; }
    if (searchQuery() !== query) { picksInFlight = null; return; }
    const r = await send({ type: "librarian", task: "librarian-rank",
      input: { target: topic ? `${topic.title}, as part of: ${p.text}` : p.text, query, results: results.slice(0, 24).map(v => ({ id: v.id, title: v.title, channel: v.channel, length: v.length, meta: v.meta, snippet: v.snippet })) } });
    picksInFlight = null;
    if (!r || r.error || !r.groups?.length || searchQuery() !== query) return;
    const byId = new Map(results.map(v => [v.id, v]));
    groups = r.groups.map(g => ({ label: g.label, videos: g.videos.map(v => ({ ...v, title: byId.get(v.id)?.title || "", channel: byId.get(v.id)?.channel || "", length: byId.get(v.id)?.length || "" })) }));
    if (p.librarian) { send({ type: "librarian-picks", query, groups }); (p.librarian.picks ||= {})[query] = groups; }
    else p._picks = { ...(p._picks || {}), [query]: groups };
  }
  // A topic's videos are the librarian's top picks for its search.
  if (topic && !topic.videos.length) {
    const videos = groups.flatMap(g => g.videos).slice(0, 3);
    if (videos.length) { topic.videos = videos; send({ type: "study-update", topicId: topic.id, videos }); }
  }
  renderPicks(groups);
}

function removePicks() { $("#wp-picks")?.remove(); }

function renderPicks(groups) {
  const bar = $("#wp-results-bar");
  if (!bar || !groups?.length) return;
  const section = el("div", { id: "wp-picks", class: "wp wp-picks" },
    el("div", { class: "wp-label" }, `${BRAND}'s picks from these results`),
    ...groups.map(g => el("div", { class: "wp-picks-group" },
      el("div", { class: "wp-strong" }, g.label),
      el("div", { class: "wp-picks-row" }, ...g.videos.map(v => el("a", { class: "wp-pick", href: `/watch?v=${encodeURIComponent(v.id)}` },
        el("div", { class: "wp-pick-thumb", style: `background-image:url("https://i.ytimg.com/vi/${encodeURIComponent(v.id)}/mqdefault.jpg")` }),
        el("div", { class: "wp-pick-title" }, v.title || "Video"),
        el("div", { class: "wp-muted wp-pick-meta" }, v.channel || ""),
        v.reason ? el("div", { class: "wp-pick-why" }, v.reason) : null))))));
  const old = $("#wp-picks");
  if (old) old.replaceWith(section);
  else bar.after(section);
}
