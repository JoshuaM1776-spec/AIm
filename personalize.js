// Aim — Personalize your YouTube (docs/SPEC.md §2–3): three short, skippable steps. 1. Why you use
// YouTube. 2. What you already follow, in groups you keep, rename, merge or skip (a channel can be in two
// groups; each has a source preference). 3. Your first aims, as books, one of them current. Groups are
// interests (Aviation); aims are goals (Understand how airplane stalls work). Nothing here changes your
// actual YouTube subscriptions; it all stays in this browser, except the channel names sent to Aim's AI
// if you ask it to suggest groups.

const BRAND = chrome.runtime.getManifest().name;
for (const n of document.querySelectorAll("[data-brand]")) n.textContent = BRAND;
const send = msg => chrome.runtime.sendMessage(msg).catch(() => null);
const $ = id => document.getElementById(id);
function node(tag, props = {}, ...kids) {
  const n = Object.assign(document.createElement(tag), props);
  n.append(...kids.flat().filter(k => k != null && k !== false));
  return n;
}
const btn = (label, cls, onclick, extra = {}) => node("button", { className: `btn ${cls}`.trim(), type: "button", textContent: label, onclick, ...extra });
function toast(msg) {
  const t = $("toast"); t.textContent = msg; t.style.display = "block";
  clearTimeout(toast.timer); toast.timer = setTimeout(() => (t.style.display = "none"), 3200);
}

const REASONS = [
  ["skills", "Learning skills", "Hands-on how-tos and techniques"],
  ["interests", "Exploring interests", "Following your curiosity"],
  ["problems", "Solving problems", "Quick answers and fixes"],
  ["study", "Structured study", "Courses, exams, certifications"],
  ["unwinding", "Unwinding", "Entertainment, on your terms"]
];

// Suggested groups without AI: hand-picked channels Aim already knows (Learn something), then words in
// channel names. Rough on purpose: everything is editable, and the AI can do better if you ask.
const KEYWORDS = [
  ["Aviation", "Flight, aircraft and pilot training", /\b(aviat|pilot|flight|flying|fly\b|aircraft|airplane|plane|cessna|cfi|aero)/i],
  ["Woodworking", "Hand tools, joinery and furniture", /\b(wood|joinery|carpent|furniture|lathe|cabinet|sellers)/i],
  ["History", "History and documentaries", /\b(histor|ancient|empire|war\b|wars\b|medieval|documentar|historia)/i],
  ["Science", "Physics, chemistry, biology and space", /\b(scien|physic|chemi|biolog|space|astro|nasa|veritasium|kurzgesagt|vsauce|smarter every)/i],
  ["Math", "Mathematics", /\b(math|calculus|3blue1brown|numberphile|algebra)/i],
  ["Engineering", "How things are built and work", /\b(engineer|maker|electronic|robot|machin|diy)/i],
  ["Cooking", "Cooking and baking", /\b(cook|kitchen|chef|recipe|baking|bake|food)/i],
  ["Coding", "Programming and software", /\b(code|coding|program|developer|dev\b|python|javascript|software|tech with)/i],
  ["Cars", "Cars and repair", /\b(car\b|cars\b|auto|motor|garage|mechanic|truck)/i],
  ["Health", "Health, fitness and medicine", /\b(fitness|workout|health|nutrition|medic|nurse|emt\b|paramedic|doctor)/i],
  ["Money", "Personal finance and investing", /\b(money|financ|invest|budget|stock)/i],
  ["Languages", "Learning languages", /\b(spanish|french|german|japanese|language|english with)/i],
  ["Music", "Learning an instrument", /\b(guitar|piano|drum lesson|music lesson|music theory)/i],
  ["Faith", "Faith and theology", /\b(bible|church|theolog|apologetic|sermon|ministr)/i],
  ["Unwinding", "Entertainment and casual viewing", /\b(gaming|games|plays\b|comedy|vlog|asmr|react|funny|entertainment|podcast|music\b|official)/i, "unwind"]
];
const CURATED = new Map(LEARN_TOPICS.flatMap(t => t.channels.map(c => [c.handle.toLowerCase(), t.name])));
function keywordGroups(channels) {
  const groups = new Map();
  const add = (name, about, kind, key) => { if (!groups.has(name)) groups.set(name, { name, about, kind, keep: true, keys: new Set() }); groups.get(name).keys.add(key); };
  for (const c of channels) {
    const curated = CURATED.get(c.key.slice(1).toLowerCase());
    if (curated) { add(curated, LEARN_TOPICS.find(t => t.name === curated)?.blurb || "", "learn", c.key); continue; }
    const hit = KEYWORDS.find(([, , re]) => re.test(c.name));
    if (hit) add(hit[0], hit[1], hit[3] || "learn", c.key);
  }
  return [...groups.values()].filter(g => g.keys.size >= 1).sort((a, b) => (a.kind === "unwind") - (b.kind === "unwind") || b.keys.size - a.keys.size);
}

// What you choose, kept as you go.
const S = { step: 1, reasons: new Set(), channels: [], groups: [], sources: {}, open: null, aims: [], signedIn: false, ai: "idle", aiAims: [] };

async function load() {
  const [page, st] = await Promise.all([send({ type: "channels-page" }), send({ type: "plus-status" })]);
  S.signedIn = !!st?.signedIn;
  S.channels = (page?.subs?.channels || []).slice().sort((a, b) => a.name.localeCompare(b.name));
  for (const r of page?.personal?.reasons || []) S.reasons.add(r);
  for (const [k, c] of Object.entries(page?.avoid || {})) if (c.source) S.sources[k] = c.source;
  if (!S.groups.length && S.channels.length) S.groups = keywordGroups(S.channels);
}

function frame(title, lede, body, foot) {
  $("page").replaceChildren(
    node("div", { className: "stepper" }, node("span", { className: "eyebrow", style: "font:600 11px/16px var(--font);letter-spacing:.16em;text-transform:uppercase;color:var(--brass)", textContent: "Personalize your YouTube" }),
      node("span", { className: "of", textContent: `Step ${S.step} of 3` })),
    node("div", { className: "bar3" }, [1, 2, 3].map(i => node("i", { className: i <= S.step ? "on" : "" }))),
    node("h1", { textContent: title }), node("p", { className: "lede", textContent: lede }), body, foot);
}
const footer = (...right) => node("div", { className: "foot" },
  node("a", { href: "https://www.youtube.com/", textContent: "Skip for now", className: "muted" }),
  node("div", { className: "right" }, ...right));

// ---------- 1. Why you use YouTube ----------
function step1() {
  S.step = 1;
  frame("What brings you to YouTube?", "Pick any that fit. They shape what Aim suggests; you can change them anytime.",
    node("div", { className: "choices" }, REASONS.map(([k, label, sub]) => node("button", { className: "choice", type: "button", ariaPressed: String(S.reasons.has(k)),
      onclick: e => { S.reasons.has(k) ? S.reasons.delete(k) : S.reasons.add(k); e.currentTarget.ariaPressed = String(S.reasons.has(k)); } },
      node("b", { textContent: label }), node("span", { textContent: sub })))),
    footer(btn("Continue", "", () => step2())));
}

// ---------- 2. What you already follow ----------
function memberList(g) {
  const inGroup = c => g.keys.has(c.key);
  const list = S.channels.slice().sort((a, b) => inGroup(b) - inGroup(a) || a.name.localeCompare(b.name));
  return node("div", { className: "members" },
    node("p", { className: "note-line", textContent: `Tick the channels in ${g.name}. A channel can be in more than one group. Preferred channels come first in suggestions; excluded ones are never suggested for learning.` }),
    ...list.slice(0, 400).map(c => {
      const box = node("input", { type: "checkbox", checked: inGroup(c), onchange: () => { box.checked ? g.keys.add(c.key) : g.keys.delete(c.key); draw2(); } });
      const src = g.kind === "unwind" ? null : node("select", { ariaLabel: `${c.name} as a source`, onchange: () => { S.sources[c.key] = src.value; } },
        ...[["preferred", "Preferred"], ["normal", "Normal"], ["exclude", "Exclude from learning"]].map(([v, t]) => node("option", { value: v, textContent: t, selected: (S.sources[c.key] || "preferred") === v })));
      return node("div", { className: "member" },
        node("label", {}, box, c.avatar ? node("img", { src: c.avatar, alt: "" }) : null, node("span", { textContent: c.name })),
        inGroup(c) ? src : null);
    }));
}
function groupCard(g, i) {
  const name = node("input", { className: "gname", type: "text", value: g.name, ariaLabel: "Group name", onchange: () => { g.name = name.value.trim() || g.name; } });
  return node("div", { className: `group${g.keep ? "" : " off"}` },
    name,
    g.about ? node("span", { className: "about", textContent: g.about }) : null,
    node("div", { className: "meta" },
      node("button", { className: "btn text", type: "button", textContent: `${g.keys.size} channel${g.keys.size === 1 ? "" : "s"}`, onclick: () => { S.open = S.open === i ? null : i; draw2(); } }),
      node("span", { className: "pill", textContent: g.kind === "unwind" ? "For breaks" : "Learning" }),
      node("label", { style: "display:flex;gap:6px;align-items:center;font-size:13px" },
        node("input", { type: "checkbox", checked: g.keep, onchange: e => { g.keep = e.target.checked; draw2(); } }), "Keep")));
}
async function suggestWithAI() {
  S.ai = "busy"; draw2();
  let r;
  try { r = await chrome.runtime.sendMessage({ type: "plus-call", task: "channels-organize", input: { channels: S.channels.map(c => c.name), reasons: [...S.reasons] } }); }
  catch { r = null; }
  if (!r || r.error) { S.ai = "idle"; draw2(); return toast(r?.error || "Couldn't suggest groups just now. The keyword groups are still here."); }
  S.groups = r.groups.map(g => ({ name: g.name, about: g.about, kind: g.kind, keep: true, keys: new Set(g.channels.map(n => S.channels[n]?.key).filter(Boolean)) })).filter(g => g.keys.size);
  S.aiAims = r.aims || [];
  S.ai = "done"; S.open = null; draw2();
}
function draw2() {
  const none = !S.channels.length;
  const grouped = new Set(S.groups.filter(g => g.keep).flatMap(g => [...g.keys]));
  const body = none
    ? node("section", { className: "card" }, node("h2", { textContent: "Bring in what you already follow" }),
        node("p", { className: "muted", textContent: "Aim reads the list of channels you subscribe to from YouTube's own page, in your browser, while you're signed in to YouTube. It's kept here; your subscriptions on YouTube don't change." }),
        node("div", { className: "row" }, btn("Read my subscriptions", "", () => chrome.tabs.create({ url: "https://www.youtube.com/feed/channels?aim=import" })),
          node("span", { className: "muted", textContent: "Come back here when it's done." })))
    : node("div", {},
        node("div", { className: "row", style: "justify-content:space-between" },
          node("span", { className: "muted", textContent: `${S.channels.length} channels · ${grouped.size} in a group you're keeping` }),
          S.signedIn
            ? (S.ai === "done" ? node("span", { className: "muted", textContent: "Suggested by Aim's AI from your channel names." })
              : btn(S.ai === "busy" ? "Suggesting…" : "Suggest better groups", "tonal", suggestWithAI, { disabled: S.ai === "busy", title: "Sends only your channel names to Aim's AI. Nothing is stored there." }))
            : node("span", { className: "muted", textContent: "Sign in to Aim to have its AI suggest groups." })),
        S.signedIn && S.ai !== "done" ? node("p", { className: "note-line", textContent: "Better groups: Aim's AI sees only your channel names, nothing else, and keeps nothing." }) : null,
        node("div", { className: "groups" }, S.groups.flatMap((g, i) => [groupCard(g, i), S.open === i ? memberList(g) : null]),
          node("button", { className: "group", type: "button", style: "align-items:center;justify-content:center;cursor:pointer;color:var(--muted)",
            onclick: () => { S.groups.push({ name: "New group", about: "", kind: "learn", keep: true, keys: new Set() }); S.open = S.groups.length - 1; draw2(); } }, "+ New group")),
        node("p", { className: "note-line", textContent: "Groups are your interests. Specific goals come next. Channels you don't group stay as they are." }));
  frame("Organize what you already follow", none ? "Start from the channels you've chosen over the years." : "We've suggested a few groups. Keep, rename or skip any of them.",
    body, footer(btn("Back", "text", step1), btn("Skip this step", "text", () => step3()), none ? null : btn("Keep these and continue", "", apply2)));
}
async function step2() { S.step = 2; await load(); draw2(); }
async function apply2() {
  const kept = S.groups.filter(g => g.keep && g.keys.size);
  const byKey = new Map(S.channels.map(c => [c.key, c]));
  const channels = [...new Set(kept.flatMap(g => [...g.keys]))].map(k => ({ key: k, name: byKey.get(k)?.name || k, groups: kept.filter(g => g.keys.has(k)).map(g => g.name), source: S.sources[k] || "preferred" }));
  const r = await send({ type: "organize-apply", reasons: [...S.reasons], groups: kept.map(g => ({ name: g.name, kind: g.kind })), channels });
  if (r?.result !== "applied") return toast(r?.message || "Couldn't save that. Try again.");
  step3();
}

// ---------- 3. Your first aims ----------
function step3() {
  S.step = 3;
  const learn = S.groups.filter(g => g.keep && g.kind !== "unwind" && g.keys.size);
  if (!S.aims.length) {
    const fromAI = S.aiAims.map(a => ({ text: a.text, group: a.group, on: true }));
    const covered = new Set(fromAI.map(a => a.group.toLowerCase()));
    const blanks = learn.filter(g => !covered.has(g.name.toLowerCase())).slice(0, Math.max(0, 3 - fromAI.length)).map(g => ({ text: "", group: g.name, on: false }));
    S.aims = [...fromAI, ...blanks];
    if (!S.aims.length) S.aims = [{ text: "", group: "", on: false }];
  }
  let active = Math.max(0, S.aims.findIndex(a => a.on));
  const rows = S.aims.map((a, i) => {
    const box = node("input", { type: "checkbox", checked: a.on, ariaLabel: "Create this aim", onchange: () => { a.on = box.checked; } });
    const text = node("input", { type: "text", value: a.text, placeholder: a.group ? `A specific goal in ${a.group}, like “Understand how …”` : "A specific goal, like “Learn to sharpen a chisel”",
      oninput: () => { a.text = text.value; if (text.value.trim()) { a.on = true; box.checked = true; } } });
    return node("div", { className: "aim-row" }, box, node("div", {}, text, a.group ? node("small", { textContent: a.group }) : null),
      node("label", { className: "active" }, node("input", { type: "radio", name: "active", checked: i === active, onchange: () => { active = i; } }), "Start with this"));
  });
  frame("Choose your first aims", learn.length ? "Turn your interests into a few specific goals. Each becomes a book in your library; one is where you start." : "A few specific goals to start with. Each becomes a book in your library; one is where you start.",
    node("div", {}, node("div", { className: "aims" }, rows),
      node("button", { className: "btn text", type: "button", textContent: "+ Add another", onclick: () => { S.aims.push({ text: "", group: "", on: false }); step3(); } })),
    footer(btn("Back", "text", () => step2()), btn(`Create aims`, "", async () => {
      const chosen = S.aims.map((a, i) => ({ ...a, i })).filter(a => a.on && a.text.trim().length >= 3);
      if (!chosen.length) return (location.href = "https://www.youtube.com/");
      const r = await send({ type: "aims-create", texts: chosen.map(a => a.text), active: Math.max(0, chosen.findIndex(a => a.i === active)) });
      if (r?.result !== "applied") return toast(r?.message || "Couldn't create those. Try again.");
      done(r);
    })));
}

function done(r) {
  $("page").replaceChildren(node("section", { className: "card empty-state" }, node("div", { className: "empty-icon" }),
    node("h1", { textContent: "Your library is ready" }),
    node("p", { textContent: `${r.created} new book${r.created > 1 ? "s" : ""} on your shelf. You're starting with “${r.purpose.text}”.` }),
    node("p", { className: "why", textContent: "Everything here can be changed later, under Library → Your subscriptions." }),
    node("div", { className: "row" }, Object.assign(document.createElement("a"), { className: "btn", href: `https://www.youtube.com/results?search_query=${encodeURIComponent(r.purpose.text)}`, textContent: "Start on YouTube" }),
      Object.assign(document.createElement("a"), { className: "btn tonal", href: "targets.html", textContent: "See my library" }))));
}

// Subscriptions read in another tab arrive here.
chrome.storage.onChanged.addListener((ch, area) => { if (area === "local" && ch.subs && S.step === 2) step2(); });
step1();
