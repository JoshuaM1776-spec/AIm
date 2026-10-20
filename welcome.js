// Aim — the welcome tour, opened once when Aim is installed (and from Settings any time after).
// Four short screens: what Aim is, how it works, an invitation to design your YouTube (design.html),
// and where to find it.

const BRAND = chrome.runtime.getManifest().name;
for (const n of document.querySelectorAll("[data-brand]")) n.textContent = BRAND;
const send = msg => chrome.runtime.sendMessage(msg).catch(() => null);
const $ = id => document.getElementById(id);

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

let settings = null;
let plusAvailable = false;
let at = 0;

async function setSetting(key, value) {
  const r = await send({ type: "setting", key, value });
  if (r?.result === "applied") settings[key] = value;
}

// ---------- the screens ----------

function hello() {
  return node("div", { className: "hero" },
    node("div", {}, ...MARK().map(i => (i.classList.add("mark"), i))),
    node("h1", { textContent: `Welcome to ${BRAND}` }),
    node("p", { className: "tag" }, "YouTube helps you find something to watch. ", node("b", { textContent: `${BRAND} helps you find what you need.` })),
    node("p", { className: "lede", textContent: "Here's how it works. It takes about a minute." }));
}

// The three ideas, each with a small drawing of what you'll see.
function how() {
  const arrow = node("span", { className: "go", textContent: "›" });
  return node("div", {},
    node("h1", { textContent: "How it works" }),
    node("div", { className: "steps" },
      node("div", { className: "how" },
        node("div", { className: "num", textContent: "1" }),
        node("div", {}, node("b", { textContent: "Say what you're here for" }),
          node("p", { textContent: `YouTube's homepage asks what brings you here. Ask the way you'd ask a librarian. That becomes your Target.` })),
        node("div", { className: "mock" }, node("div", { className: "field" }, node("span", { textContent: "Help me study for my biology exam." }), arrow))),
      node("div", { className: "how" },
        node("div", { className: "num", textContent: "2" }),
        node("div", {}, node("b", { textContent: `${BRAND} keeps YouTube on Target` }),
          node("p", { textContent: "Shorts, the feed and recommendations step aside. If a video doesn't fit your Target, Aim asks first. You can always say yes." })),
        node("div", { className: "mock" }, node("div", { className: "bar" },
          node("span", { className: "muted", textContent: "Target" }), node("span", { className: "grow", textContent: "Study for my biology exam" }),
          node("span", { className: "lnk", textContent: "Change" }), node("span", { textContent: "✓" })))),
      node("div", { className: "how" },
        node("div", { className: "num", textContent: "3" }),
        node("div", {}, node("b", { textContent: "Take a break whenever you like" }),
          node("p", { textContent: "Breaks are free browsing, from a daily allowance you choose. When a break ends, you're right back where you were." })),
        node("div", { className: "mock" }, node("span", { className: "muted", textContent: "Take a Break" }),
          ...["15 min", "30 min", "1 hour"].map(t => node("span", { className: "pill", textContent: t }))))));
}

// The choices themselves live in Design your YouTube (design.html): a live preview beats a list.
function choices() {
  return node("div", {},
    node("h1", { textContent: "Design your YouTube" }),
    node("p", { className: "lede", textContent: "Choose what greets you on YouTube, what happens to Shorts, and what steps aside while you watch. A preview of YouTube changes as you choose." }),
    node("div", { className: "callout" },
      node("button", { className: "btn", type: "button", id: "design", textContent: "Design your YouTube",
        onclick: () => send({ type: "open-design" }) }),
      node("div", { className: "hint", style: "margin:8px 0 0", textContent: "About two minutes. Or skip it: Aim starts with good defaults, and you can design it any time from Settings." })));
}

// Only when this version of Aim has accounts: the librarian is free with an account.
function librarian() {
  return node("div", {},
    node("h1", { textContent: "Want help finding the right video?" }),
    node("p", { className: "lede", textContent: `With a free ${BRAND} account, the librarian turns what you ask into the right searches and points out the best videos in YouTube's results.` }),
    node("div", { className: "callout" }, node("q", { textContent: "Find a good tutorial for building a timber frame porch." }),
      node("div", { className: "hint", style: "margin:6px 0 0", textContent: "→ Aim searches for you, asks a quick question if it needs to, and marks where to start." })),
    node("div", { style: "display:flex;gap:8px;flex-wrap:wrap;margin-top:12px" },
      node("button", { className: "btn tonal", type: "button", id: "account", textContent: "Create a free account",
        onclick: () => send({ type: "open-options", section: "account" }) }),
      node("span", { className: "hint", style: "align-self:center;margin:0", textContent: "Optional. Aim works without one." })));
}

function ready() {
  return node("div", {},
    node("h1", { textContent: "You're all set" }),
    node("ul", { className: "done-list" },
      node("li", { textContent: "Say what you're here for on YouTube's homepage." }),
      node("li", { textContent: "Your Target, breaks and time live in the Aim button at the top of YouTube." }),
      node("li", { textContent: "We'll point out a couple of things the first time you use them." })),
    node("div", { className: "opt-label", style: "margin-top:16px", textContent: "Keep Aim one click away" }),
    node("div", { className: "pin" },
      node("span", { className: "tb", ariaHidden: "true" }, svg(PUZZLE), node("span", { className: "muted", textContent: "→" }), svg(PIN), MARK()),
      node("span", { textContent: `Click the puzzle piece in Chrome's toolbar, then the pin next to ${BRAND}.` })));
}

// ---------- moving through ----------

const screens = () => [hello, how, choices, plusAvailable ? librarian : null, ready].filter(Boolean);

function show(i) {
  const list = screens();
  at = Math.max(0, Math.min(i, list.length - 1));
  const last = at === list.length - 1;
  $("screen").replaceChildren(node("div", { className: "screen" }, list[at]()));
  $("dots").replaceChildren(...list.map((_, j) => node("i", { className: j === at ? "on" : "" })));
  $("back").style.visibility = at ? "visible" : "hidden";
  $("skip").hidden = last;
  $("next").textContent = at === 0 ? "Let's go" : last ? "Open YouTube" : "Next";
  document.title = at === 0 ? `Welcome to ${BRAND}` : `${BRAND} · ${$("screen").querySelector("h1")?.textContent || ""}`;
  $("screen").querySelector("h1")?.setAttribute("tabindex", "-1");
  if (at) $("screen").querySelector("h1")?.focus({ preventScroll: true });
}

async function finish() {
  await send({ type: "onboarding", welcomed: true });
  location.href = "https://www.youtube.com/";
}

$("next").onclick = () => (at === screens().length - 1 ? finish() : show(at + 1));
$("back").onclick = () => show(at - 1);
$("skip").onclick = () => show(screens().length - 1);
addEventListener("keydown", e => {
  if (e.target.closest?.("button, input")) return;
  if (e.key === "ArrowRight") $("next").click();
  if (e.key === "ArrowLeft" && at) show(at - 1);
});

(async () => {
  const [st, plus] = await Promise.all([send({ type: "state" }), send({ type: "plus-status" })]);
  settings = { ...(st?.settings || {}) };
  plusAvailable = !!plus?.configured && !plus.signedIn;
  show(0);
})();
