// Aim — the welcome tour, opened once when Aim is installed (and from Settings any time after).
// Three short screens: what Aim is and how it works, the few switches that matter (with the full
// designer, design.html, one button away), and where to find it.

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

// The three ideas, each with a small drawing of what you'll see.
function how() {
  const arrow = node("span", { className: "go", textContent: "›" });
  return node("div", {},
    node("div", { className: "hero" },
      node("div", {}, ...MARK().map(i => (i.classList.add("mark"), i))),
      node("h1", { textContent: `Welcome to ${BRAND}` }),
      node("p", { className: "tag" }, "YouTube helps you find something to watch. ", node("b", { textContent: `${BRAND} helps you find what you need.` }))),
    node("div", { className: "steps" },
      node("div", { className: "how" },
        node("div", { className: "num", textContent: "1" }),
        node("div", {}, node("b", { textContent: "Say what you're here for" }),
          node("p", { textContent: `YouTube's homepage asks what brings you here. Ask the way you'd ask a librarian. That becomes your aim.` })),
        node("div", { className: "mock" }, node("div", { className: "field" }, node("span", { textContent: "Help me study for my biology exam." }), arrow))),
      node("div", { className: "how" },
        node("div", { className: "num", textContent: "2" }),
        node("div", {}, node("b", { textContent: `${BRAND} keeps YouTube on your aim` }),
          node("p", { textContent: "Shorts, the feed and recommendations step aside. If a video doesn't fit your aim, Aim asks first. You can always say yes." })),
        node("div", { className: "mock" }, node("div", { className: "bar" },
          node("span", { className: "muted", textContent: "Your aim" }), node("span", { className: "grow", textContent: "Study for my biology exam" }),
          node("span", { className: "lnk", textContent: "Change" }), node("span", { textContent: "✓" })))),
      node("div", { className: "how" },
        node("div", { className: "num", textContent: "3" }),
        node("div", {}, node("b", { textContent: "Take a break whenever you like" }),
          node("p", { textContent: "Breaks are free browsing, from a daily allowance you choose. When a break ends, you're right back where you were." })),
        node("div", { className: "mock" }, node("span", { className: "muted", textContent: "Take a Break" }),
          ...["15 min", "30 min", "1 hour"].map(t => node("span", { className: "pill", textContent: t }))))));
}

// Thirty seconds: the few switches that matter, already set the way most people like them, each
// saved the moment it changes. The full designer, with its live preview, is one button away.
const QUICK = [
  ["hideShorts", "Hide Shorts", "Opening one while you're on an aim asks first."],
  ["hideRecs", "Hide recommendations", "Beside a video and at its end."],
  ["hideFeeds", "Hide the subscriptions and trending feeds", "They come back on a break."],
  ["noAutoplay", "Turn autoplay off", "Back on during breaks if you had it on."]
];
function choices() {
  return node("div", {},
    node("h1", { textContent: "Make it yours" }),
    node("p", { className: "lede", textContent: "These start on. Switch off anything you'd rather keep." }),
    node("div", { className: "quick" }, ...QUICK.map(([key, label, hint]) => {
      const box = node("input", { type: "checkbox", checked: settings[key] !== false, onchange: () => setSetting(key, box.checked) });
      return node("label", { className: "quick-row" }, box, node("span", {}, node("b", { textContent: label }), node("span", { className: "hint", textContent: hint })));
    })),
    node("div", { className: "callout quick-more" },
      node("span", { textContent: "Want to see it first, or choose your homepage and Shorts?" }),
      node("button", { className: "btn tonal", type: "button", id: "design", textContent: "Customize with a preview",
        onclick: () => send({ type: "open-design" }) })));
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
      node("li", { textContent: "Your aim, breaks and time live in the Aim button at the top of YouTube." }),
      node("li", { textContent: "We'll point out a couple of things the first time you use them." })),
    node("div", { className: "opt-label", style: "margin-top:16px", textContent: "Keep Aim one click away" }),
    node("div", { className: "pin" },
      node("span", { className: "tb", ariaHidden: "true" }, svg(PUZZLE), node("span", { className: "muted", textContent: "→" }), svg(PIN), MARK()),
      node("span", { textContent: `Click the puzzle piece in Chrome's toolbar, then the pin next to ${BRAND}.` })));
}

// ---------- moving through ----------

const screens = () => [how, choices, plusAvailable ? librarian : null, ready].filter(Boolean);

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
