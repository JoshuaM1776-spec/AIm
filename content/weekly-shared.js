// Aim — the Weekly Challenge's rules (0.76): a story of chapters, each a decision, played the same way
// on YouTube's homepage (content/weekly.js) and in the editor's playtest. The story's own rules decide
// what happens; the AI only narrates and talks it through (supabase/functions/ai/weekly.ts). Pure
// functions, no DOM: loaded by the YouTube content scripts, Aim's pages and tests/store.test.js.
//
// A story: { title, premise, minutes, impact, image, facts[], topics[{ name, icon, hints[{ q, search }] }],
//   start: { budget, days }, labels: { budget, days }, chapters[], endings[], sources[] }
// A chapter: { id, area, title, scene, kind: "calculate" | "choose" | "allocate", event?: { text, effects },
//   when? (the chapter happens only if this holds, judged as you reach it: a consequence of earlier choices),
//   data[] (what the team knows), rubric[] (what good reasoning weighs), explain (the reasoning prompt),
//   calculate: question, givens[], answer, unit, tolerance (a fraction), method, right/wrong: { text, effects },
//   choose: options[{ id, label, detail, effects, outcome }], allocate: buckets[{ id, label, need, short, effects }]
//   (a part given less than its need: flag short-<id>, and its effects) }
// Effects: { budget?: number (+/-), days?: number (+/-), flag?: string }. A `when` holds when all of it
// does: flags (all), anyFlags, noFlags, minDays, maxDays, minBudget. An ending matches when its `when`
// holds; the last one is the default.

const WK_MAX_CHAPTERS = 10;

function wkHolds(w, play) {
  return !w || ((w.flags || []).every(f => play.flags.includes(f)) && (!w.anyFlags?.length || w.anyFlags.some(f => play.flags.includes(f))) &&
    !(w.noFlags || []).some(f => play.flags.includes(f)) && (w.minDays == null || play.vars.days >= w.minDays) && (w.maxDays == null || play.vars.days <= w.maxDays) &&
    (w.minBudget == null || play.vars.budget >= w.minBudget));
}

const WK_KINDS = ["calculate", "choose", "allocate"];

// A new playthrough: the story's starting budget and time, nothing decided yet.
function wkStart(story) {
  return wkSkip(story, { chapter: 0, vars: { budget: Number(story?.start?.budget) || 0, days: Number(story?.start?.days) || 0 }, flags: [], log: [], entered: -1, tries: 0, done: false });
}
const wkCopy = play => JSON.parse(JSON.stringify(play));
function wkApply(play, effects) {
  if (!effects) return play;
  for (const k of ["budget", "days"]) if (Number.isFinite(Number(effects[k]))) play.vars[k] += Number(effects[k]);
  if (effects.flag && !play.flags.includes(effects.flag)) play.flags.push(String(effects.flag));
  return play;
}
const wkChapterOf = (story, play) => (story?.chapters || [])[play.chapter] || null;

// Arriving at a chapter: its event happens once (a price rises, a storm comes).
function wkEnter(story, play) {
  const p = wkCopy(play), ch = wkChapterOf(story, p);
  if (!ch || p.entered === p.chapter) return p;
  p.entered = p.chapter; p.tries = 0;
  if (ch.event?.effects) wkApply(p, ch.event.effects);
  return p;
}

// What a choice would spend; a choice can't spend money you don't have.
const wkCost = effects => Math.max(0, -(Number(effects?.budget) || 0));
const wkAffordable = (play, option) => wkCost(option.effects) <= play.vars.budget;

// Past the chapters that don't happen on this path, to the next one that does (or the end).
function wkSkip(story, play) {
  const chs = story?.chapters || [];
  while (play.chapter < chs.length && chs[play.chapter].when && !wkHolds(chs[play.chapter].when, play)) play.chapter += 1;
  if (play.chapter >= chs.length) play.done = true;
  return play;
}
function wkNext(story, play) {
  play.chapter += 1;
  play.tries = 0;
  return wkSkip(story, play);
}
// "Chapter n of m": the chapters played so far, and those still ahead on this path as it stands.
function wkProgress(story, play) {
  const done = (play.log || []).length;
  if (play.done) return { n: done, of: done };
  const ahead = (story?.chapters || []).slice(play.chapter).filter(c => !c.when || wkHolds(c.when, play)).length;
  return { n: done + 1, of: done + ahead };
}

// A calculation: right within its tolerance; one more try; then the answer and its method, and the
// cost of getting it wrong.
function wkCalculate(story, play, value) {
  const p = wkEnter(story, play), ch = wkChapterOf(story, p);
  if (!ch || ch.kind !== "calculate") return { play: p, error: "Not a calculation." };
  const v = Number(String(value).replace(/,/g, ""));
  if (!Number.isFinite(v)) return { play: p, error: "Enter a number." };
  const right = Math.abs(v - ch.answer) <= Math.max(Math.abs(ch.answer) * (ch.tolerance ?? 0.02), 1e-9);
  p.tries += 1;
  if (!right && p.tries < 2) return { play: p, right: false, again: true };
  const outcome = right ? ch.right : ch.wrong;
  wkApply(p, outcome?.effects);
  p.log.push({ ch: ch.id, kind: "calculate", value: v, right, tries: p.tries });
  wkNext(story, p);
  return { play: p, right, again: false, text: outcome?.text || "", method: right ? "" : ch.method || "", answer: right ? null : ch.answer };
}

// A choice, with the reasoning behind it.
function wkChoose(story, play, optionId, explanation = "") {
  const p = wkEnter(story, play), ch = wkChapterOf(story, p);
  const o = ch?.kind === "choose" ? (ch.options || []).find(x => x.id === optionId) : null;
  if (!o) return { play: p, error: "Pick one." };
  if (!wkAffordable(p, o)) return { play: p, error: "There isn't enough budget left for that." };
  wkApply(p, o.effects);
  p.log.push({ ch: ch.id, kind: "choose", option: o.id, label: o.label, explanation: String(explanation).slice(0, 1200) });
  wkNext(story, p);
  return { play: p, text: o.outcome || "" };
}

// Sharing out the budget: every amount whole and not negative, the total within what's left. A part
// given less than it needs is noted, and its consequence shows up later.
function wkAllocate(story, play, amounts = {}, explanation = "") {
  const p = wkEnter(story, play), ch = wkChapterOf(story, p);
  if (ch?.kind !== "allocate") return { play: p, error: "Not an allocation." };
  const given = Object.fromEntries((ch.buckets || []).map(b => [b.id, Math.max(0, Math.round(Number(amounts[b.id]) || 0))]));
  const total = Object.values(given).reduce((s, x) => s + x, 0);
  if (total > p.vars.budget) return { play: p, error: `That's ${total - p.vars.budget} more than the budget left.` };
  p.vars.budget -= total;
  const short = (ch.buckets || []).filter(b => given[b.id] < b.need);
  for (const b of short) { wkApply(p, { flag: `short-${b.id}` }); wkApply(p, b.effects); }
  p.log.push({ ch: ch.id, kind: "allocate", amounts: given, short: short.map(b => b.id), explanation: String(explanation).slice(0, 1200) });
  wkNext(story, p);
  return { play: p, short: short.map(b => ({ id: b.id, label: b.label, text: b.short || "" })) };
}

// How it ends: the first ending whose conditions hold, else the last.
function wkEnding(story, play) {
  const ends = story?.endings || [];
  return ends.find((e, i) => i < ends.length - 1 && e.when && wkHolds(e.when, play)) || ends[ends.length - 1] || null;
}

// A story, tidied and bounded (the editor's save and the server both check stories the same way);
// null when it can't be played. Problems are listed so the editor can say what's missing.
function wkTidy(x, { forPublish = false } = {}) {
  const problems = [];
  const t = (v, n) => (typeof v === "string" ? v.replace(/[ \t]+/g, " ").trim().slice(0, n) : "");
  const num = v => (Number.isFinite(Number(v)) && v !== "" && v != null ? Number(v) : null);
  const eff = e => {
    const o = {};
    if (num(e?.budget) != null) o.budget = Math.round(num(e.budget));
    if (num(e?.days) != null) o.days = Math.round(num(e.days));
    if (t(e?.flag, 40)) o.flag = t(e.flag, 40).replace(/[^\w-]/g, "");
    return Object.keys(o).length ? o : null;
  };
  const list = (v, n, len) => (Array.isArray(v) ? v : []).map(s => t(s, len)).filter(Boolean).slice(0, n);
  const when = w => {
    const o = { flags: list(w?.flags, 6, 40), anyFlags: list(w?.anyFlags, 6, 40), noFlags: list(w?.noFlags, 6, 40),
      minDays: num(w?.minDays), maxDays: num(w?.maxDays), minBudget: num(w?.minBudget) };
    for (const k of Object.keys(o)) if (o[k] == null || (Array.isArray(o[k]) && !o[k].length)) delete o[k];
    return Object.keys(o).length ? o : null;
  };
  const s = x && typeof x === "object" ? x : {};
  const story = {
    title: t(s.title, 80), premise: t(s.premise, 300), minutes: t(s.minutes, 20), impact: t(s.impact, 300),
    image: /^(https:\/\/|bundled:)[^\s"'<>]+$/.test(t(s.image, 400)) ? t(s.image, 400) : "",
    facts: (Array.isArray(s.facts) ? s.facts : []).map(f => ({ icon: t(f?.icon, 20) || "compass", text: t(f?.text, 40) })).filter(f => f.text).slice(0, 4),
    topics: (Array.isArray(s.topics) ? s.topics : []).map(p => ({ name: t(p?.name, 40), icon: t(p?.icon, 20) || "compass",
      hints: (Array.isArray(p?.hints) ? p.hints : []).map(h => ({ q: t(h?.q, 160), search: t(h?.search, 120) })).filter(h => h.q).slice(0, 3) })).filter(p => p.name).slice(0, 6),
    start: { budget: Math.round(num(s.start?.budget) ?? 0), days: Math.round(num(s.start?.days) ?? 0) },
    labels: { budget: t(s.labels?.budget, 30) || "Budget", days: t(s.labels?.days, 40) || "Days left" },
    chapters: [], endings: [],
    sources: (Array.isArray(s.sources) ? s.sources : []).map(r => ({ title: t(r?.title, 140), url: /^https:\/\/[^\s"'<>]+$/.test(t(r?.url, 300)) ? t(r.url, 300) : "" })).filter(r => r.title).slice(0, 6)
  };
  const ids = new Set();
  for (const [i, c] of (Array.isArray(s.chapters) ? s.chapters : []).slice(0, WK_MAX_CHAPTERS).entries()) {
    const kind = WK_KINDS.includes(c?.kind) ? c.kind : null;
    let id = t(c?.id, 24).replace(/[^\w-]/g, "") || `c${i + 1}`;
    while (ids.has(id)) id += "x";
    ids.add(id);
    const ch = { id, area: t(c?.area, 40), title: t(c?.title, 80), scene: t(c?.scene, 1200), kind,
      data: list(c?.data, 10, 300), rubric: list(c?.rubric, 6, 200), explain: t(c?.explain, 200) };
    const evText = t(c?.event?.text, 600);
    if (evText) ch.event = { text: evText, effects: eff(c.event.effects) };
    // Only if: never the first chapter, which everyone plays.
    const only = i ? when(c?.when) : null;
    if (only) ch.when = only;
    if (kind === "calculate") {
      Object.assign(ch, { question: t(c.question, 400), givens: list(c.givens, 8, 200), answer: num(c.answer), unit: t(c.unit, 20),
        tolerance: Math.min(0.2, Math.max(0.001, num(c.tolerance) ?? 0.02)), method: t(c.method, 600),
        right: { text: t(c.right?.text, 600), effects: eff(c.right?.effects) }, wrong: { text: t(c.wrong?.text, 600), effects: eff(c.wrong?.effects) } });
      if (ch.answer == null || !ch.question) problems.push(`Chapter ${i + 1}: a question and its answer.`);
    } else if (kind === "choose") {
      const oids = new Set();
      ch.options = (Array.isArray(c.options) ? c.options : []).map((o, j) => {
        let oid = t(o?.id, 24).replace(/[^\w-]/g, "") || "abcdef"[j];
        while (oids.has(oid)) oid += "x";
        oids.add(oid);
        return { id: oid, label: t(o?.label, 80), detail: t(o?.detail, 300), effects: eff(o?.effects), outcome: t(o?.outcome, 600) };
      }).filter(o => o.label).slice(0, 5);
      if (ch.options.length < 2) problems.push(`Chapter ${i + 1}: at least two options.`);
    } else if (kind === "allocate") {
      ch.buckets = (Array.isArray(c.buckets) ? c.buckets : []).map((b, j) => ({ id: t(b?.id, 24).replace(/[^\w-]/g, "") || `b${j + 1}`, label: t(b?.label, 60),
        need: Math.max(0, Math.round(num(b?.need) ?? 0)), short: t(b?.short, 300), effects: eff(b?.effects) })).filter(b => b.label).slice(0, 6);
      if (ch.buckets.length < 2) problems.push(`Chapter ${i + 1}: at least two parts to share the budget across.`);
    } else problems.push(`Chapter ${i + 1}: what kind of decision it is.`);
    if (!ch.title || !ch.scene) problems.push(`Chapter ${i + 1}: a title and a scene.`);
    story.chapters.push(ch);
  }
  story.endings = (Array.isArray(s.endings) ? s.endings : []).map(e => ({ title: t(e?.title, 80), text: t(e?.text, 900), when: when(e?.when) }))
    .filter(e => e.title).slice(0, 6);
  if (!story.title || !story.premise) problems.push("A title and a premise.");
  if (story.chapters.length < 2) problems.push("At least two chapters.");
  if (!story.endings.length) problems.push("At least one ending.");
  if (forPublish) {
    if (story.sources.length < 2) problems.push("Two sources, to check the facts against.");
    if (!story.image) problems.push("A picture.");
    if (!story.topics.length) problems.push("The topics to be familiar with.");
  }
  return { story: problems.length ? null : story, problems, draft: story };
}

// The Monday a day's week starts on (YYYY-MM-DD, in the browser's own calendar).
function wkWeekOf(day) {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}
