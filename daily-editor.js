// Aim — the Daily Challenge editor (0.75): today and the next three weeks, each day empty, a draft or
// published. Draft the next seven empty days, or one day; open a day to check it, edit any part, and
// publish it (or take it back). Everything goes through Aim's server, which lets in only the accounts
// listed in AIM_DAILY_EDITORS (supabase/functions/ai/daily.ts).

const send = msg => chrome.runtime.sendMessage(msg).catch(() => null);
const AREAS = ["Math and logic", "Science and how things work", "History and civics", "Language and communication", "Practical life", "Arts and making", "People and character"];
const $ = id => document.getElementById(id);
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
const addDay = (day, n) => new Date(Date.parse(`${day}T00:00:00Z`) + n * 864e5).toISOString().slice(0, 10);
const label = day => new Date(`${day}T12:00:00Z`).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });

let today = "", rows = new Map(), open = new Set();
function busy(text) { $("busy").textContent = text || ""; for (const b of document.querySelectorAll("button")) b.disabled = !!text; }
function fail(e) {
  busy("");
  $("err").textContent = e.code === "editor" ? "This page is for Aim's editors. Add your account's email to AIM_DAILY_EDITORS in Supabase (Edge Functions → Secrets)."
    : e.code === "auth" ? "Sign in to Aim first (Settings → Account)." : e.message;
}

async function load() {
  $("err").textContent = "";
  try {
    const r = await call("daily-list", {});
    today = r.today;
    rows = new Map(r.days.map(d => [d.day, d]));
    draw();
  } catch (e) { fail(e); }
}

// One day's form: every part of the challenge, as everyone will see it.
function form(day, data = {}) {
  const f = node("form", { onsubmit: e => e.preventDefault() });
  const field = (name, text, value, { area = false, full = false } = {}) => {
    const input = node(area ? "textarea" : "input", { name, value: value ?? "" });
    if (!area) input.type = "text";
    return node("label", { className: full ? "full" : "" }, text, input);
  };
  const choices = (prefix, ask = {}) => node("div", { className: "choices full" }, node("span", { className: "small muted", textContent: "Choices (pick the right one)" }),
    ...[0, 1, 2].map(i => node("div", { className: "choice" },
      Object.assign(node("input", { type: "radio", name: `${prefix}answer`, value: String(i), ariaLabel: `Choice ${"ABC"[i]} is right` }), { checked: ask.answer === i }),
      node("input", { type: "text", name: `${prefix}choice${i}`, value: ask.choices?.[i] ?? "", ariaLabel: `Choice ${"ABC"[i]}` }))));
  const area = node("select", { name: "area" }, ...AREAS.map(a => node("option", { value: a, textContent: a, selected: a === (data.area || AREAS[0]) })));
  const s = data.sources || [];
  f.append(
    node("label", {}, "Area", area), field("moment", "Moment (time and place)", data.moment),
    field("title", "Title (the hook)", data.title, { full: true }),
    field("scene", "Scene", data.scene, { area: true, full: true }),
    field("question", "Question", data.question, { area: true, full: true }),
    choices("", data),
    field("why", "Why (what's right, and why)", data.why, { area: true, full: true }),
    field("explain", "Explain-why question (asked when someone gets it right)", data.explain, { full: true }),
    field("learnSearch", "Video search (when someone misses it)", data.learn?.search), field("learnNote", "What to look for in it", data.learn?.note),
    node("h3", { className: "group-h", textContent: "Second try: the same idea, today" }),
    field("q2", "Question", data.second?.question, { area: true, full: true }),
    choices("s", data.second),
    field("why2", "Why", data.second?.why, { area: true, full: true }),
    node("h3", { className: "group-h", textContent: "How do we know? (at least two sources to publish)" }),
    ...[0, 1, 2].flatMap(i => [field(`srcT${i}`, `Source ${i + 1}`, s[i]?.title), field(`srcU${i}`, "Link (https://…)", s[i]?.url)]),
    node("h3", { className: "group-h", textContent: "Want a plan for this?" }),
    field("planI", "Interest", data.plan?.interest), field("planG", "Goal", data.plan?.goal));
  return f;
}
function read(f) {
  const v = n => (f.elements[n]?.value ?? "").trim();
  const pick = prefix => { const r = f.querySelector(`input[name="${prefix}answer"]:checked`); return r ? Number(r.value) : -1; };
  return {
    area: v("area"), moment: v("moment"), title: v("title"), scene: v("scene"), question: v("question"),
    choices: [0, 1, 2].map(i => v(`choice${i}`)), answer: pick(""), why: v("why"), explain: v("explain"),
    learn: { search: v("learnSearch"), note: v("learnNote") },
    second: { question: v("q2"), choices: [0, 1, 2].map(i => v(`schoice${i}`)), answer: pick("s"), why: v("why2") },
    sources: [0, 1, 2].map(i => ({ title: v(`srcT${i}`), url: v(`srcU${i}`) })).filter(x => x.title),
    plan: { interest: v("planI"), goal: v("planG") }
  };
}

async function act(day, what, f) {
  $("err").textContent = "";
  try {
    if (what === "redraft" || what === "draft") { busy(`Drafting ${label(day)}…`); await call("daily-draft", { day }); }
    else if (what === "delete") { if (!confirm(`Delete ${label(day)}?`)) return; busy("Deleting…"); await call("daily-remove", { day }); }
    else {
      const status = what === "publish" ? "published" : "draft";
      if (status === "published" && !f.querySelector(".check input").checked) { $("err").textContent = "Check it against its sources first, and tick the box."; return; }
      busy(status === "published" ? "Publishing…" : "Saving…");
      await call("daily-save", { day, status, challenge: read(f) });
      toast(status === "published" ? `Published for ${label(day)}.` : what === "unpublish" ? "Taken back: a draft again." : "Saved.");
    }
    busy("");
    open.add(day);
    await load();
  } catch (e) { fail(e); }
}

function draw() {
  const days = Array.from({ length: 22 }, (_, i) => addDay(today, i));
  $("days").replaceChildren(...days.map(day => {
    const row = rows.get(day), st = row?.status;
    const d = node("details", { className: "day", open: open.has(day) },
      node("summary", {},
        node("span", { className: "when" }, label(day), node("small", { textContent: day === today ? "Today" : day === addDay(today, 1) ? "Tomorrow" : "" })),
        node("span", { className: `pill ${st === "published" ? "pub" : st ? "draft" : ""}`, textContent: st === "published" ? "Published" : st ? "Draft" : "Empty" }),
        node("span", { className: `t${row ? "" : " none"}`, textContent: row?.data?.title || "Nothing yet" })));
    d.addEventListener("toggle", () => { d.open ? open.add(day) : open.delete(day); });
    if (!row) {
      d.append(node("div", { className: "row", style: "padding: 0 18px 16px" }, node("button", { className: "btn tonal", type: "button", textContent: "Draft this day", onclick: () => act(day, "draft") })));
      return d;
    }
    const f = form(day, row.data);
    f.append(
      node("label", { className: "check" }, node("span", {}, node("input", { type: "checkbox" }), " I checked every fact against its sources, and the right answers are right.")),
      node("div", { className: "actions" },
        st === "published"
          ? [node("button", { className: "btn", type: "button", textContent: "Save changes", onclick: () => act(day, "publish", f) }),
             node("button", { className: "btn tonal", type: "button", textContent: "Unpublish", onclick: () => act(day, "unpublish", f) })]
          : [node("button", { className: "btn", type: "button", textContent: "Publish", onclick: () => act(day, "publish", f) }),
             node("button", { className: "btn tonal", type: "button", textContent: "Save draft", onclick: () => act(day, "save", f) }),
             node("button", { className: "btn text", type: "button", textContent: "Redraft", onclick: () => act(day, "redraft") })],
        node("button", { className: "btn text danger", type: "button", textContent: "Delete", onclick: () => act(day, "delete") })));
    d.append(f);
    return d;
  }));
}

$("draft").addEventListener("click", async () => {
  $("err").textContent = "";
  try {
    busy("Drafting the next seven days. This takes a minute…");
    const r = await call("daily-draft", { from: addDay(today, 1), days: 7 });
    busy("");
    toast(r.drafted.length ? `Drafted ${r.drafted.length} day${r.drafted.length === 1 ? "" : "s"}. Check each before publishing.` : "Those days already have challenges.");
    await load();
  } catch (e) { fail(e); }
});
load();
