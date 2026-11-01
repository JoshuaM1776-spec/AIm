// Aim — getting started, as one conversation (0.68). Opened once when Aim is installed, and from the
// library's Personalize any time after (?again=1). Aim asks one thing at a time and answers what you
// said before asking the next: why you use YouTube, how much of YouTube should step aside, the
// channels you already follow (in groups), what you're working toward (your first aims), and,
// optionally, an account. Chips for quick answers; typing always works. No step counter; Skip and
// "That's enough for now" are always there, and every answer is saved as you go.
//
// Nothing here changes your actual YouTube subscriptions. Everything stays in this browser, except the
// channel names sent to Aim's AI if you ask it to suggest groups.

const BRAND = chrome.runtime.getManifest().name;
for (const n of document.querySelectorAll("[data-brand]")) n.textContent = BRAND;
const send = msg => chrome.runtime.sendMessage(msg).catch(() => null);
const $ = id => document.getElementById(id);
const params = new URLSearchParams(location.search);
const AGAIN = params.has("again");
const CALM = matchMedia("(prefers-reduced-motion: reduce)").matches;

function node(tag, props = {}, ...kids) {
  const n = Object.assign(document.createElement(tag), props);
  n.append(...kids.flat().filter(k => k != null && k !== false));
  return n;
}
const MARK = () => [node("img", { className: "for-light", src: "icons/48.png", alt: "" }), node("img", { className: "for-dark", src: "icons/light/48.png", alt: "" })];

// Chrome's toolbar icons, drawn: the puzzle piece (extensions) and the pin.
const PUZZLE = "M10 3.5a2 2 0 0 1 4 0V5h3a1 1 0 0 1 1 1v3h-1.5a2 2 0 0 0 0 4H18v3a1 1 0 0 1-1 1h-3v-1.5a2 2 0 0 0-4 0V17H7a1 1 0 0 1-1-1v-3h1.5a2 2 0 0 0 0-4H6V6a1 1 0 0 1 1-1h3z";
const PIN = "M14.5 3.5l6 6-2.2.7-3.6 3.6.4 4.2-1.6 1.6-3.8-3.8L5 20.5l-.5-.5 4.7-4.7-3.8-3.8 1.6-1.6 4.2.4 3.6-3.6z";
function svg(d) {
  const s = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  s.setAttribute("viewBox", "0 0 24 24"); s.setAttribute("width", "18"); s.setAttribute("height", "18");
  const p = document.createElementNS("http://www.w3.org/2000/svg", "path");
  for (const [k, v] of Object.entries({ d, fill: "none", stroke: "currentColor", "stroke-width": "1.6", "stroke-linejoin": "round" })) p.setAttribute(k, v);
  s.append(p);
  return s;
}

// ---------- what Aim knows ----------

const REASONS = [
  ["skills", "Learning skills", /\b(skill|how.?to|learn(ing)? to|diy|fix|build|craft|technique|tutorial)/i],
  ["interests", "Exploring interests", /\b(curio|interest|explor|documentar|fascinat|history|science|space)/i],
  ["problems", "Solving problems", /\b(problem|answer|quick|fix|repair|troubleshoot|figure)/i],
  ["study", "Studying", /\b(stud(y|ying)|school|class|course|exam|test|cert|degree|college|homework)/i],
  ["unwinding", "Unwinding", /\b(relax|unwind|fun|entertain|music|gaming|games|chill|comedy|laugh|night|break)/i]
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
const CURATED = new Map((self.LEARN_TOPICS || []).flatMap(t => t.channels.map(c => [c.handle.toLowerCase(), t.name])));
function keywordGroups(channels) {
  const groups = new Map();
  const add = (name, about, kind, key) => { if (!groups.has(name)) groups.set(name, { name, about, kind, keep: true, keys: new Set() }); groups.get(name).keys.add(key); };
  for (const c of channels) {
    const curated = CURATED.get(c.key.slice(1).toLowerCase());
    if (curated) { add(curated, LEARN_TOPICS.find(t => t.name === curated)?.blurb || "", "learn", c.key); continue; }
    const hit = KEYWORDS.find(([, , re]) => re.test(c.name));
    if (hit) add(hit[0], hit[1], hit[3] || "learn", c.key);
  }
  return [...groups.values()].sort((a, b) => (a.kind === "unwind") - (b.kind === "unwind") || b.keys.size - a.keys.size);
}

const QUICK = [
  ["hideShorts", "Hide Shorts", "Opening one while you're on an aim asks first."],
  ["hideRecs", "Hide recommendations", "None beside a video or at its end."],
  ["noAutoplay", "Stop autoplay", "You choose what's next."],
  ["hideFeeds", "Quiet the subscriptions and trending feeds", "They come back on a break."]
];

const S = { settings: {}, reasons: [], channels: [], groups: [], aiAims: [], signedIn: false, plusAvailable: false, aims: [], made: null };

async function setSetting(key, value) {
  const r = await send({ type: "setting", key, value });
  if (r?.result === "applied") S.settings[key] = value;
}

// ---------- the conversation's parts ----------

const thread = $("thread"), composer = $("composer");
const sleep = ms => new Promise(r => setTimeout(r, CALM ? 0 : ms));
const scrollDown = () => requestAnimationFrame(() => window.scrollTo({ top: document.body.scrollHeight, behavior: CALM ? "auto" : "smooth" }));

// Aim says something (text, or nodes), after a short pause that reads like thinking.
async function say(...kids) {
  if (skipped) throw new Skip();
  const dots = node("div", { className: "msg aim typing", ariaLabel: `${BRAND} is typing` }, node("i"), node("i"), node("i"));
  thread.append(dots); scrollDown();
  await sleep(Math.min(900, 250 + kids.filter(k => typeof k === "string").join(" ").length * 6));
  dots.remove();
  const m = node("div", { className: "msg aim" }, ...kids.map(k => (typeof k === "string" ? node("p", { textContent: k }) : k)));
  thread.append(m); scrollDown();
  return m;
}
function you(text) {
  thread.append(node("div", { className: "msg you" }, text)); scrollDown();
}

class Skip extends Error {}
let pending = null;   // the question waiting for an answer, so Skip can end it
let skipped = false;  // Skip pressed: the next thing Aim would say or ask ends the conversation instead

// One question: chips (choose one, or several with multi) and, unless text is false, a box to type in.
// Resolves to { value, values, text }. The answer is shown on your side of the thread.
function ask({ chips = [], multi = false, text = "Or type it…", done = "Continue", prefill = "" } = {}) {
  if (skipped) return Promise.reject(new Skip());
  return new Promise((resolve, reject) => {
    const picked = new Set();
    const finish = answer => {
      pending = null;
      composer.replaceChildren();
      you(answer.text || (answer.values?.length ? answer.values.map(v => chips.find(c => c.value === v)?.label).join(", ") : chips.find(c => c.value === answer.value)?.label || ""));
      resolve(answer);
    };
    pending = { reject };
    const input = text === false ? null : node("input", { type: "text", className: "say", placeholder: text, value: prefill, ariaLabel: "Your answer", maxLength: 300 });
    const go = node("button", { className: "btn", type: "button", textContent: multi ? done : "Send", onclick: () => {
      const t = input?.value.trim() || "";
      if (multi && (picked.size || t)) return finish({ values: [...picked], text: t || "" });
      if (t) return finish({ text: t });
      input?.focus();
    } });
    const row = node("div", { className: "chips" }, ...chips.map(c => {
      const b = node("button", { className: `chip${c.primary ? " primary" : ""}`, type: "button", textContent: c.label, ariaPressed: multi ? "false" : null, onclick: () => {
        if (!multi) return finish({ value: c.value });
        picked.has(c.value) ? picked.delete(c.value) : picked.add(c.value);
        b.ariaPressed = String(picked.has(c.value));
        go.disabled = false;
      } });
      return b;
    }));
    input?.addEventListener("keydown", e => { if (e.key === "Enter") go.click(); });
    composer.replaceChildren(...[row, input || multi ? node("div", { className: "type" }, input, go) : null].filter(Boolean));
    (input && (prefill || !chips.length) ? input : composer.querySelector("button"))?.focus({ preventScroll: true });
    if (prefill) input.select();
    scrollDown();
  });
}

// ---------- the conversation ----------

async function why() {
  const a = await ask({ chips: REASONS.map(([value, label]) => ({ value, label })), multi: true, done: "That's it", text: "Or say it in your own words…" });
  S.reasons = [...new Set([...a.values, ...REASONS.filter(([, , re]) => re.test(a.text)).map(([k]) => k)])];
  await send({ type: "personal-reasons", reasons: S.reasons });
  const r = new Set(S.reasons), learning = ["skills", "interests", "problems", "study"].some(k => r.has(k));
  await say(r.has("unwinding") && learning ? "Good mix. I'll keep learning focused, and leave unwinding for breaks, which are free browsing."
    : r.has("unwinding") ? "Fair enough. I'll stay out of the way on breaks, and help when you come looking for something."
    : r.has("study") ? "Studying, then. I'll keep YouTube on what you're working on, and help you check what's sticking."
    : r.has("problems") && r.size === 1 ? "Quick answers it is. Say what you need and I'll keep the search on it."
    : learning ? "Then I'll keep YouTube on what you're learning, and help you make it stick."
    : "Noted. Whatever it is, you say what you're here for and I'll keep YouTube on it.");
}

async function distractions() {
  await say("While you're on something, I hide Shorts and recommendations, stop autoplay and quiet the feeds. They come back on breaks. Sound right?");
  const a = await ask({ chips: [{ value: "yes", label: "Sounds good", primary: true }, { value: "choose", label: "Let me choose" }, { value: "leave", label: "Leave YouTube as it is" }], text: false });
  if (a.value === "leave") {
    for (const [k] of QUICK) await setSetting(k, false);
    return say("Okay, YouTube stays as it is. I'll still keep track of your aim, and you can change this any time in Settings.");
  }
  if (a.value === "choose") {
    const limit = node("select", { className: "quick-limit", ariaLabel: "Daily YouTube limit", hidden: !S.settings.totalMin,
      onchange: () => setSetting("totalMin", parseInt(limit.value, 10)) },
      ...[60, 90, 120, 180].map(m => node("option", { value: String(m), textContent: m === 60 ? "1 hour" : `${m / 60} hours`, selected: S.settings.totalMin === m })));
    const limitBox = node("input", { type: "checkbox", checked: !!S.settings.totalMin, onchange: () => {
      limit.hidden = !limitBox.checked;
      setSetting("totalMin", limitBox.checked ? parseInt(limit.value, 10) : 0);
    } });
    await say("Here they are. Each saves the moment you change it.",
      node("div", { className: "quick" }, ...QUICK.map(([key, label, hint]) => {
        const box = node("input", { type: "checkbox", checked: S.settings[key] !== false, onchange: () => setSetting(key, box.checked) });
        return node("label", { className: "quick-row" }, box, node("span", {}, node("b", { textContent: label }), node("span", { className: "hint", textContent: hint })));
      }), node("label", { className: "quick-row" }, limitBox, node("span", {}, node("b", { textContent: "A daily time limit" }),
        node("span", { className: "hint", textContent: "A hard stop for all of YouTube until midnight." }), limit))),
      node("button", { className: "btn tonal", type: "button", id: "design", textContent: "Or design it with a preview", onclick: () => send({ type: "open-design" }) }));
    await ask({ chips: [{ value: "done", label: "Done", primary: true }], text: false });
  }
  await say("Done. Breaks are free browsing, from a daily allowance you choose. When one ends, you're right back where you were.");
}

// The channels you follow: read from YouTube's own page (in your browser), grouped, and saved.
async function channels() {
  let page = await send({ type: "channels-page" });
  S.channels = (page?.subs?.channels || []).slice().sort((a, b) => a.name.localeCompare(b.name));
  for (const [k, c] of Object.entries(page?.avoid || {})) if (c.source) (S.sources ||= {})[k] = c.source;
  if (!S.channels.length) {
    await say("Want me to look at the channels you already follow? I read only their names, here in your browser. Your subscriptions on YouTube don't change.");
    const a = await ask({ chips: [{ value: "yes", label: "Sure", primary: true }, { value: "no", label: "Not now" }], text: false });
    if (a.value === "no") return say("No problem. You can bring them in later from your library.");
    chrome.tabs.create({ url: "https://www.youtube.com/feed/channels?aim=import" });
    await say("I've opened your subscriptions in a YouTube tab and I'm reading them. Come back here when it says it's done.");
    const arrived = new Promise(resolve => {
      const on = (ch, area) => { if (area === "local" && ch.subs?.newValue?.channels?.length) { chrome.storage.onChanged.removeListener(on); resolve("subs"); } };
      chrome.storage.onChanged.addListener(on);
    });
    const waiting = ask({ chips: [{ value: "skip", label: "Skip this" }], text: false }).then(() => "skip", e => { if (e instanceof Skip) throw e; return "gone"; });
    const waited = await Promise.race([arrived, waiting]);
    if (waited === "skip") return say("Okay. You can bring them in later from your library.");
    pending?.reject(new Error("answered")); pending = null; composer.replaceChildren();
    page = await send({ type: "channels-page" });
    S.channels = (page?.subs?.channels || []).slice().sort((a, b) => a.name.localeCompare(b.name));
    if (!S.channels.length) return say("I couldn't find any subscriptions there. No problem; you can try again later from your library.");
  }
  S.groups = keywordGroups(S.channels);
  for (;;) {
    const grouped = new Set(S.groups.flatMap(g => [...g.keys]));
    if (!S.groups.length) {
      await say(`You follow ${S.channels.length} channels. Their names don't say much about what they cover, so I've left them as they are.`);
      if (!S.signedIn) return;
    } else {
      await say(`You follow ${S.channels.length} channels. Here's how I'd group ${grouped.size === S.channels.length ? "them" : `${grouped.size} of them`}. Tap any group you'd rather leave out.`, groupChips());
    }
    const chips = [S.groups.length ? { value: "ok", label: "Looks good", primary: true } : null,
      S.signedIn && S.ai !== "done" ? { value: "ai", label: "Suggest better groups" } : null, { value: "skip", label: S.groups.length ? "Skip this" : "Leave them" }].filter(Boolean);
    const a = await ask({ chips, text: false });
    if (a.value === "skip") return say("Okay, I'll leave them as they are. Your subscriptions page in the library has them when you want them.");
    if (a.value === "ok") break;
    await say("Asking Aim's AI. It sees only your channel names, and keeps nothing.");
    let r;
    try { r = await chrome.runtime.sendMessage({ type: "plus-call", task: "channels-organize", input: { channels: S.channels.map(c => c.name), reasons: S.reasons } }); } catch { r = null; }
    S.ai = "done";
    if (!r || r.error) { await say(r?.error || "That didn't work just now. The groups I made are still here."); continue; }
    S.groups = r.groups.map(g => ({ name: g.name, about: g.about, kind: g.kind, keep: true, keys: new Set(g.channels.map(n => S.channels[n]?.key).filter(Boolean)) })).filter(g => g.keys.size);
    S.aiAims = r.aims || [];
  }
  const kept = S.groups.filter(g => g.keep && g.keys.size);
  const byKey = new Map(S.channels.map(c => [c.key, c]));
  const list = [...new Set(kept.flatMap(g => [...g.keys]))].map(k => ({ key: k, name: byKey.get(k)?.name || k, groups: kept.filter(g => g.keys.has(k)).map(g => g.name), source: S.sources?.[k] || "preferred" }));
  const r = await send({ type: "organize-apply", reasons: S.reasons, groups: kept.map(g => ({ name: g.name, kind: g.kind })), channels: list });
  if (r?.result !== "applied") return say("I couldn't save those groups just now. You can sort them later under Your subscriptions.");
  const unwind = kept.some(g => g.kind === "unwind");
  await say(`Saved. Those channels come first when I suggest videos${unwind ? ", and the ones for unwinding wait for your breaks" : ""}. You can fine-tune any of them under Your subscriptions.`);
}
function groupChips() {
  return node("div", { className: "groups" }, ...S.groups.map(g => {
    const b = node("button", { className: "group-chip", type: "button", ariaPressed: String(g.keep), title: g.about || g.name, onclick: () => { g.keep = !g.keep; b.ariaPressed = String(g.keep); } },
      node("b", { textContent: g.name }), node("span", { textContent: `${g.keys.size} channel${g.keys.size === 1 ? "" : "s"}${g.kind === "unwind" ? " · for breaks" : ""}` }));
    return b;
  }));
}

// What you're working toward: your first aims, said in your own words, made into goals.
async function goals() {
  await say("Is there something you're working toward right now? Say it however you like.");
  const ideas = S.aiAims.map(a => a.text).slice(0, 3);
  for (let n = 0; n < 3; n++) {
    const a = await ask({ chips: [...ideas.filter(t => !S.aims.includes(t)).map(t => ({ value: t, label: t })),
      { value: "none", label: n ? "That's it" : "Nothing specific yet" }], text: n ? "Something else…" : "Like “Pass my private pilot checkride this spring”" });
    if (a.value === "none") break;
    const said = a.text || a.value;
    const c = await send({ type: "goal-check", text: said }) || { goal: true, suggestion: said };
    let text = c.name || said;
    if (c.goal) await say("That's a real goal. I'll make it an aim, a book in your library:", node("p", { className: "goal", textContent: text }));
    else {
      await say("That sounds like a topic. As a goal, maybe:", node("p", { className: "goal", textContent: c.suggestion }));
      text = c.suggestion;
    }
    const b = await ask({ chips: [{ value: "ok", label: c.goal ? "Make it an aim" : "Use that", primary: true }, { value: "edit", label: "Change the wording" }, { value: "drop", label: "Never mind" }], text: false });
    if (b.value === "edit") {
      await say("How would you put it?");
      text = (await ask({ text: "Your goal", prefill: text })).text;
    }
    if (b.value !== "drop") S.aims.push(text);
    if (S.aims.length >= 3) break;
    await say(S.aims.length ? "Anything else you're working toward?" : "Anything else?");
  }
  if (!S.aims.length) return say("That's fine. When you search, I'll keep you on it, and if you keep coming back to something, I'll offer to make it an aim.");
  const r = await send({ type: "aims-create", texts: S.aims, active: 0 });
  if (r?.result !== "applied") return say("I couldn't save those just now. Say them on YouTube's homepage and they'll become aims.");
  S.made = r;
  await say(`On your shelf: ${r.created === 1 ? "one book" : `${r.created} books`}. We'll start with “${r.purpose.text}”.`);
}

async function account() {
  await say(`Last thing: with a free ${BRAND} account, I can turn what you ask into good searches, point out the best videos, and talk things through with you after. Optional; I work without one.`);
  const a = await ask({ chips: [{ value: "yes", label: "Create a free account", primary: true }, { value: "no", label: "Maybe later" }], text: false });
  if (a.value === "yes") { send({ type: "open-options", section: "account" }); await say("I've opened it in a new tab. Come back here when you're done."); }
}

async function wrapUp() {
  composer.replaceChildren();
  await say(S.made ? "You're set. YouTube's homepage will pick up where we left off." : "You're set. On YouTube's homepage, just say what you're here for.",
    node("ul", { className: "done-list" },
      node("li", { textContent: "Your aim, breaks and time live in the Aim button at the top of YouTube." }),
      node("li", { textContent: "I'll point out a couple of things the first time you use them." })),
    node("div", { className: "pin" },
      node("span", { className: "tb", ariaHidden: "true" }, svg(PUZZLE), node("span", { className: "muted", textContent: "→" }), svg(PIN), MARK()),
      node("span", { textContent: `Keep me one click away: the puzzle piece in Chrome's toolbar, then the pin next to ${BRAND}.` })));
  composer.replaceChildren(node("div", { className: "chips" },
    node("button", { className: "btn", type: "button", id: "open", textContent: "Open YouTube", onclick: finish }),
    node("a", { className: "btn tonal", href: "targets.html", textContent: "See my library", onclick: () => send({ type: "onboarding", welcomed: true }) })));
  $("skip").hidden = true;
  composer.querySelector("#open").focus({ preventScroll: true });
}

async function finish() {
  await send({ type: "onboarding", welcomed: true });
  location.href = "https://www.youtube.com/";
}

async function conversation() {
  try {
    if (AGAIN) await say("Let's tune me to you. Same few questions; skip any of them.");
    else {
      await say(`Hi, I'm ${BRAND}. I help you use YouTube on purpose: you say what you're here for, and I keep YouTube on it.`);
    }
    await say("What do you mostly come to YouTube for? Pick any.");
    await why();
    if (!AGAIN) await distractions();
    await channels();
    await goals();
    if (S.plusAvailable) await account();
  } catch (e) {
    if (!(e instanceof Skip)) console.error(e);
  }
  skipped = false;
  composer.replaceChildren();
  if ($("skip").hidden && thread.lastElementChild?.classList.contains("typing")) thread.lastElementChild.remove();
  await wrapUp();
}

$("skip").onclick = () => {
  $("skip").hidden = true;
  skipped = true;
  if (pending) { const p = pending; pending = null; p.reject(new Skip()); }
};

(async () => {
  const [st, plus] = await Promise.all([send({ type: "state" }), send({ type: "plus-status" })]);
  S.settings = { ...(st?.settings || {}) };
  S.signedIn = !!plus?.signedIn;
  S.plusAvailable = !!plus?.configured && !plus.signedIn;
  document.title = AGAIN ? `${BRAND} · Personalize` : `Welcome to ${BRAND}`;
  conversation();
})();
