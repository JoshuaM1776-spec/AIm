// Aim — the Weekly Challenge editor (0.76): last week, this week and the next eight. Open a week to
// start its story (from the sample, or drafted by Aim with an optional theme), edit every part of it,
// from the card everyone sees to the rules that decide what happens, add its picture, check it,
// playtest it on YouTube, and publish it (or take it back). Everything goes through Aim's server,
// which lets in only the accounts listed in AIM_EDITORS (supabase/functions/ai/weekly.ts).
// The story's shape and its checks are content/weekly-shared.js, the same rules the player uses.

const send = msg => chrome.runtime.sendMessage(msg).catch(() => null);
const $ = id => document.getElementById(id);
const ICONS = ["people", "calendar", "mountain", "money", "clock", "compass", "drop", "layers", "tool", "chart", "globe", "book"];
const KINDS = { calculate: "Work something out", choose: "Choose", allocate: "Share out the budget" };
function node(tag, props = {}, ...kids) {
  const n = Object.assign(document.createElement(tag), props);
  n.append(...kids.flat().filter(k => k != null && k !== false));
  return n;
}
function toast(msg) {
  const t = $("toast");
  t.textContent = msg; t.style.display = "block";
  clearTimeout(toast.timer); toast.timer = setTimeout(() => (t.style.display = "none"), 3000);
}
const call = async (task, input) => {
  const r = await send({ type: "plus-call", task, input });
  if (!r || r.error) throw Object.assign(new Error(r?.error || "Couldn't reach Aim's server."), { code: r?.code || "" });
  return r;
};
const addDays = (day, n) => new Date(Date.parse(`${day}T00:00:00Z`) + n * 864e5).toISOString().slice(0, 10);
const label = day => new Date(`${day}T12:00:00Z`).toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" });
const imageUrl = src => (String(src || "").startsWith("bundled:") ? chrome.runtime.getURL(`scenes/${src.slice(8)}`) : src || "");

let thisWeek = "", rows = new Map(), openWeek = "", cur = null, problems = null;
function busy(text) { $("busy").textContent = text || ""; for (const b of document.querySelectorAll("button")) b.disabled = !!text; }
// What's missing, said plainly: the sign-in, the server's code, the editors secret (with the email the
// server sees, so a different address shows), or the SQL.
async function fail(e) {
  busy("");
  const who = e.code === "editor" ? (await send({ type: "plus-status" }))?.email || "" : "";
  $("err").textContent = e.code === "editor"
    ? `Aim's server doesn't list ${who || "this account"} as an editor. In Supabase, open Edge Functions → Secrets and set AIM_EDITORS to ${who ? "exactly that email" : "the email you sign in to Aim with"} (several: separated by commas). Then reload this page.`
    : e.code === "auth" ? "Sign in to Aim first (Settings → Account), then reload this page."
    : e.code === "task" ? "Aim's server is running older code than this page. In Supabase, paste the latest server code into the ai function and deploy it, then reload this page."
    : e.code === "weekly" || e.code === "server" ? "Aim's server couldn't open the challenges. If you haven't yet, run the SQL from the server code page in Supabase's SQL Editor, then reload this page."
    : e.message;
}

async function load() {
  $("err").textContent = "";
  try {
    const r = await call("weekly-list", {});
    thisWeek = r.thisWeek;
    rows = new Map(r.weeks.map(w => [w.week, w]));
    // What everyone sees this week (0.82.1): published for it, the latest one carried forward, or the first story.
    const e = r.everyone;
    $("everyone").textContent = !e ? "" : e.from === "week" ? `Everyone sees this week: ${e.title}.`
      : e.from === "carried" ? `Nothing is published for this week, so everyone still sees ${e.title} (from the week of ${label(e.since)}). Publish one below to replace it.`
      : `Nothing is published yet, so everyone sees Aim's first story, ${e.title}, built in. Publish one below to replace it.`;
    draw();
  } catch (e) { fail(e); }
}

// ---------- fields bound to the story being edited (cur) ----------
function field(obj, key, text, { area = false, num = false, full = false, placeholder = "" } = {}) {
  const input = node(area ? "textarea" : "input", { value: obj[key] ?? "", placeholder });
  if (!area) input.type = num ? "number" : "text";
  if (num) input.step = "any";
  input.addEventListener("input", () => { obj[key] = num ? (input.value === "" ? null : Number(input.value)) : input.value; });
  return node("label", { className: full ? "full" : "" }, text, input);
}
// A list of short lines, one per line.
function lines(obj, key, text, { full = true } = {}) {
  const input = node("textarea", { value: (obj[key] || []).join("\n"), placeholder: "One per line" });
  input.addEventListener("input", () => { obj[key] = input.value.split("\n").map(s => s.trim()).filter(Boolean); });
  return node("label", { className: full ? "full" : "" }, text, input);
}
function words(obj, key, text) {
  const input = node("input", { type: "text", value: (obj[key] || []).join(", "), placeholder: "Separated by commas" });
  input.addEventListener("input", () => { obj[key] = input.value.split(",").map(s => s.trim()).filter(Boolean); });
  return node("label", {}, text, input);
}
function choice(obj, key, text, options, onchange) {
  const sel = node("select", {}, ...Object.entries(options).map(([v, t]) => node("option", { value: v, textContent: t, selected: obj[key] === v })));
  sel.addEventListener("change", () => { obj[key] = sel.value; onchange?.(); });
  return node("label", {}, text, sel);
}
const iconChoice = (obj, key) => choice(obj, key, "Icon", Object.fromEntries(ICONS.map(i => [i, i])));
// What a decision does: money (+/-), days (+/-), and a flag for the endings to look at.
function effects(obj, key, text) {
  obj[key] = obj[key] || {};
  const e = obj[key];
  return node("div", { className: "grid three full" },
    field(e, "budget", `${text}: budget change`, { num: true, placeholder: "e.g. -9000" }),
    field(e, "days", "Days change", { num: true, placeholder: "e.g. -35" }),
    field(e, "flag", "Flag (for the endings)", { placeholder: "e.g. underRated" }));
}
// A list with Add and Remove; redraw() re-renders the week after a change.
function many(arr, { title, max, make, render }) {
  return node("div", { className: "full", style: "display:flex;flex-direction:column;gap:8px" },
    ...arr.map((x, i) => node("div", { className: "item" },
      node("div", { className: "item-head" }, `${title} ${i + 1}`,
        node("button", { className: "btn text danger", type: "button", textContent: "Remove", onclick: () => { arr.splice(i, 1); redraw(); } })),
      render(x, i))),
    arr.length < max ? node("button", { className: "btn text", type: "button", textContent: `Add ${title.toLowerCase()}`, onclick: () => { arr.push(make()); redraw(); } }) : null);
}

// ---------- the story ----------
function blankStory() {
  return { title: "", premise: "", minutes: "35–45 min", impact: "", image: "", facts: [], topics: [], start: { budget: 0, days: 0 }, labels: { budget: "Budget", days: "Days left" },
    chapters: [], endings: [], sources: [] };
}
// Everything the form edits exists, so fields can bind to it.
function shape(s) {
  const st = { ...blankStory(), ...JSON.parse(JSON.stringify(s || {})) };
  st.start = { budget: 0, days: 0, ...st.start }; st.labels = { budget: "Budget", days: "Days left", ...st.labels };
  for (const k of ["facts", "topics", "chapters", "endings", "sources"]) st[k] = Array.isArray(st[k]) ? st[k] : [];
  for (const t of st.topics) t.hints = Array.isArray(t.hints) ? t.hints : [];
  for (const c of st.chapters) {
    c.event = c.event || { text: "" };
    for (const k of ["data", "rubric", "givens", "options", "buckets"]) c[k] = Array.isArray(c[k]) ? c[k] : [];
    c.right = c.right || { text: "" }; c.wrong = c.wrong || { text: "" };
  }
  for (const e of st.endings) e.when = e.when || {};
  return st;
}
// What's sent: an empty event or empty effects drop out (wkTidy does the rest, on the server too).
function clean(s) {
  const st = JSON.parse(JSON.stringify(s));
  for (const c of st.chapters) if (!c.event?.text?.trim()) delete c.event;
  return st;
}

function cardPart(s) {
  const pic = s.image ? node("img", { src: imageUrl(s.image), alt: "" }) : node("div", { className: "none", textContent: "No picture" });
  const file = node("input", { type: "file", accept: "image/jpeg,image/png,image/webp" });
  file.addEventListener("change", () => file.files[0] && upload(file.files[0]));
  return [
    node("h3", { className: "sec-h", textContent: "The card" }),
    node("div", { className: "grid" },
      field(s, "title", "Title", { full: true }), field(s, "premise", "Premise (one or two sentences)", { area: true, full: true }),
      field(s, "minutes", "How long it takes"), field(s, "impact", "The Impact", { area: true })),
    node("div", { className: "pic" }, pic, node("div", { style: "display:flex;flex-direction:column;gap:6px" },
      node("label", {}, "Picture (JPEG, PNG or WebP; only one you own or are licensed to use)", file),
      node("p", { className: "hint", textContent: "It's resized here before it's sent. Square works best on the card." }))),
    node("h4", { className: "sub-h", textContent: "Facts (up to 4)" }),
    many(s.facts, { title: "Fact", max: 4, make: () => ({ icon: "people", text: "" }),
      render: f => node("div", { className: "grid" }, iconChoice(f, "icon"), field(f, "text", "Text", { placeholder: "~200 people" })) }),
    node("h4", { className: "sub-h", textContent: "Be familiar with (topics, each with up to 3 hints: a question and a video search, never the answer)" }),
    many(s.topics, { title: "Topic", max: 6, make: () => ({ name: "", icon: "compass", hints: [] }),
      render: t => node("div", { className: "grid" }, field(t, "name", "Topic"), iconChoice(t, "icon"),
        many(t.hints, { title: "Hint", max: 3, make: () => ({ q: "", search: "" }),
          render: h => node("div", { className: "grid" }, field(h, "q", "Question to look into"), field(h, "search", "YouTube search")) })) }),
    node("h4", { className: "sub-h", textContent: "How do we know? (two sources to publish)" }),
    many(s.sources, { title: "Source", max: 6, make: () => ({ title: "", url: "" }),
      render: r => node("div", { className: "grid" }, field(r, "title", "Title"), field(r, "url", "Link (https://…)")) })
  ];
}

function chapterPart(c) {
  const kind = node("div", { className: "grid" },
    choice(c, "kind", "Kind of decision", KINDS, redraw), field(c, "id", "Id (short, for flags and the record)"),
    field(c, "area", "Area (Mathematics, Physics…)"), field(c, "title", "Title"),
    field(c, "scene", "Scene", { area: true, full: true }),
    field(c.event, "text", "Event when the chapter starts (optional: a price rises, a storm comes)", { area: true, full: true }));
  c.when = c.when || {};
  const parts = [kind, effects(c.event, "effects", "Event"),
    node("div", { className: "grid three" }, words(c.when, "flags", "Only if all of these flags"), words(c.when, "anyFlags", "Only if any of these flags"),
      words(c.when, "noFlags", "Only if none of these flags")),
    node("p", { className: "hint", textContent: "Leave the three above empty for a chapter everyone plays. A chapter that depends on flags is a consequence of earlier choices (the first chapter never is)." })];
  if (c.kind === "calculate") {
    parts.push(node("div", { className: "grid" },
      lines(c, "givens", "Givens (one per line)"), field(c, "question", "Question", { area: true, full: true }),
      field(c, "answer", "Answer (a number)", { num: true }), field(c, "unit", "Unit"),
      field(c, "tolerance", "Tolerance (a fraction: 0.02 is 2%)", { num: true }), field(c, "method", "Method (shown after a second miss)", { area: true }),
      field(c.right, "text", "When right", { area: true }), field(c.wrong, "text", "When wrong twice", { area: true })),
      effects(c.right, "effects", "Right"), effects(c.wrong, "effects", "Wrong"));
  } else if (c.kind === "choose") {
    parts.push(many(c.options, { title: "Option", max: 5, make: () => ({ id: "", label: "", detail: "", outcome: "", effects: {} }),
      render: o => node("div", { className: "grid" }, field(o, "id", "Id"), field(o, "label", "Label"),
        field(o, "detail", "Detail (cost and time, as the team sees it)", { area: true, full: true }), field(o, "outcome", "What happens", { area: true, full: true }),
        effects(o, "effects", "Choosing it")) }));
  } else if (c.kind === "allocate") {
    parts.push(many(c.buckets, { title: "Part", max: 6, make: () => ({ id: "", label: "", need: 0, short: "", effects: {} }),
      render: b => node("div", { className: "grid" }, field(b, "id", "Id (flag: short-<id>)"), field(b, "label", "Label"),
        field(b, "need", "Needs (dollars)", { num: true }), field(b, "short", "If it gets less than it needs", { area: true }),
        effects(b, "effects", "Short")) }));
  }
  if (c.kind !== "calculate") parts.push(node("div", { className: "grid" }, field(c, "explain", "Reasoning prompt", { full: true }), lines(c, "rubric", "What a strong answer weighs (one per line)")));
  parts.push(node("div", { className: "grid" }, lines(c, "data", "What the team knows (one per line; the narrator answers only from this and the scene)")));
  return node("div", { className: "full", style: "display:flex;flex-direction:column;gap:10px" }, parts);
}

function rulesPart(s) {
  return [
    node("h3", { className: "sec-h", textContent: "The story" }),
    node("div", { className: "grid four" },
      field(s.start, "budget", "Starting budget", { num: true }), field(s.labels, "budget", "Called"),
      field(s.start, "days", "Starting days", { num: true }), field(s.labels, "days", "Called")),
    many(s.chapters, { title: "Chapter", max: WK_MAX_CHAPTERS, make: () => shape({ chapters: [{ kind: "choose" }] }).chapters[0], render: c => chapterPart(c) }),
    node("h3", { className: "sec-h", textContent: "Endings" }),
    node("p", { className: "hint", textContent: "The first ending whose conditions all hold is the one that happens; the last is the default, so leave its conditions empty." }),
    many(s.endings, { title: "Ending", max: 6, make: () => ({ title: "", text: "", when: {} }),
      render: e => node("div", { className: "grid" }, field(e, "title", "Title"), field(e, "text", "Text", { area: true, full: true }),
        words(e.when, "flags", "All of these flags"), words(e.when, "anyFlags", "Any of these flags"), words(e.when, "noFlags", "None of these flags"),
        field(e.when, "maxDays", "Days left at most", { num: true }), field(e.when, "minDays", "Days left at least", { num: true }),
        field(e.when, "minBudget", "Budget left at least", { num: true })) })
  ];
}

// ---------- actions ----------
async function upload(file) {
  $("err").textContent = "";
  try {
    busy("Preparing the picture…");
    const data = await shrink(file);
    busy("Uploading…");
    const r = await call("weekly-image", { week: openWeek, type: "image/jpeg", data });
    cur.image = r.url;
    busy(""); toast("Picture added. Save to keep it.");
    redraw();
  } catch (e) { fail(e); }
}
// At most 1200 pixels across, as a JPEG under the server's 900 KB.
async function shrink(file) {
  const img = await createImageBitmap(file);
  for (const [max, q] of [[1200, .86], [1000, .8], [800, .74]]) {
    const k = Math.min(1, max / Math.max(img.width, img.height));
    const c = Object.assign(document.createElement("canvas"), { width: Math.round(img.width * k), height: Math.round(img.height * k) });
    c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
    const b64 = c.toDataURL("image/jpeg", q).split(",")[1];
    if (b64.length * .75 < 880 * 1024) return b64;
  }
  throw new Error("That picture is too large even after resizing. Try a smaller one.");
}

function check(forPublish) {
  const t = wkTidy(clean(cur), { forPublish });
  problems = t.problems;
  return t;
}

async function act(what) {
  $("err").textContent = "";
  const week = openWeek;
  try {
    if (what === "draft") {
      if (cur && !confirm("Replace what's here with a new draft from Aim?")) return;
      busy("Drafting the story. This takes a minute or two…");
      const r = await call("weekly-draft", { week, theme: $("theme")?.value || "" });
      cur = shape(r.story); problems = r.problems;
      busy(""); toast("Drafted. Check every fact and number before publishing.");
      return load();
    }
    if (what === "sample") {
      if (cur && !confirm("Replace what's here with the sample story?")) return;
      cur = shape(await (await fetch(chrome.runtime.getURL("weekly-sample.json"))).json());
      problems = null;
      return redraw();
    }
    if (what === "check") { check(true); return redraw(); }
    if (what === "playtest") {
      const t = check(false);
      if (!t.story) return redraw();
      await send({ type: "weekly-playtest-set", week, story: t.story });
      chrome.tabs.create({ url: "https://www.youtube.com/#aim-weekly-playtest" });
      return redraw();
    }
    if (what === "delete") {
      if (!confirm(`Delete the week of ${label(week)}?`)) return;
      busy("Deleting…"); await call("weekly-remove", { week });
      cur = null; problems = null;
      busy(""); return load();
    }
    const status = what === "publish" ? "published" : "draft";
    if (status === "published") {
      if (!document.querySelector(".check input")?.checked) { $("err").textContent = "Check it against its sources and playtest it first, then tick the box."; return; }
      if (!check(true).story) return redraw();
    }
    busy(status === "published" ? "Publishing…" : "Saving…");
    const r = await call("weekly-save", { week, status, story: clean(cur) });
    cur = shape(r.story); problems = r.problems?.length ? r.problems : null;
    busy("");
    toast(status === "published" ? `Published for the week of ${label(week)}.` : what === "unpublish" ? "Taken back: a draft again." : "Saved.");
    await load();
  } catch (e) { fail(e); }
}

// ---------- the page ----------
function weekPart(week) {
  const row = rows.get(week), st = row?.status;
  if (!cur) return node("div", { className: "edit" },
    node("div", { className: "start" },
      node("input", { type: "text", id: "theme", placeholder: "A theme, if you like (a place, a subject, a kind of problem)" }),
      node("button", { className: "btn", type: "button", textContent: "Draft with Aim", onclick: () => act("draft") }),
      node("button", { className: "btn tonal", type: "button", textContent: "Start from the sample story", onclick: () => act("sample") })));
  return node("div", { className: "edit" },
    ...cardPart(cur), ...rulesPart(cur),
    problems ? (problems.length ? node("ul", { className: "problems" }, ...problems.map(p => node("li", { textContent: p })))
      : node("ul", { className: "problems ok" }, node("li", { textContent: "Ready to publish." }))) : null,
    node("label", { className: "check" }, node("input", { type: "checkbox" }), " I checked every fact and number against its sources, and playtested every path."),
    node("div", { className: "actions" },
      st === "published"
        ? [node("button", { className: "btn", type: "button", textContent: "Save changes", onclick: () => act("publish") }),
           node("button", { className: "btn tonal", type: "button", textContent: "Unpublish", onclick: () => act("unpublish") })]
        : [node("button", { className: "btn", type: "button", textContent: "Publish", onclick: () => act("publish") }),
           node("button", { className: "btn tonal", type: "button", textContent: "Save draft", onclick: () => act("save") })],
      node("button", { className: "btn tonal", type: "button", textContent: "Check", onclick: () => act("check") }),
      node("button", { className: "btn tonal", type: "button", textContent: "Playtest on YouTube", onclick: () => act("playtest") }),
      st ? node("button", { className: "btn text danger", type: "button", textContent: "Delete", onclick: () => act("delete") }) : null));
}

// Redraw the open week where it is, keeping the scroll position.
function redraw() {
  const y = scrollY;
  draw();
  scrollTo(0, y);
}
function draw() {
  const weeks = Array.from({ length: 10 }, (_, i) => addDays(thisWeek, 7 * (i - 1)));
  $("weeks").replaceChildren(...weeks.map(week => {
    const row = rows.get(week), st = row?.status;
    const d = node("details", { className: "week", open: openWeek === week },
      node("summary", {},
        node("span", { className: "when" }, `Week of ${label(week)}`, node("small", { textContent: week === thisWeek ? "This week" : week === addDays(thisWeek, 7) ? "Next week" : week < thisWeek ? "Last week" : "" })),
        node("span", { className: `pill ${st === "published" ? "pub" : st ? "draft" : ""}`, textContent: st === "published" ? "Published" : st ? "Draft" : "Empty" }),
        node("span", { className: `t${row ? "" : " none"}`, textContent: row?.data?.title || "Nothing yet" })));
    d.addEventListener("toggle", () => {
      if (d.open && openWeek !== week) {
        if (cur && openWeek && !confirm("Leave this week? Changes you haven't saved will be lost.")) { d.open = false; return; }
        openWeek = week; cur = rows.get(week) ? shape(rows.get(week).data) : null; problems = null;
        redraw();
      } else if (!d.open && openWeek === week) { openWeek = ""; cur = null; problems = null; }
    });
    if (openWeek === week) d.append(weekPart(week));
    return d;
  }));
}
load();
