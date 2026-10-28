// Aim — the Aim Plus page. Before Plus: what it does, and the next step (sign in, or upgrade). With
// Plus: every Plus feature in one place, what it's for and where it starts, with what's going on now
// (a study session, the learning record). Opened once as a welcome when an account becomes Plus.

const BRAND = chrome.runtime.getManifest().name;
for (const n of document.querySelectorAll("[data-brand]")) n.textContent = BRAND;
const send = msg => chrome.runtime.sendMessage(msg).catch(() => null);
const welcome = new URLSearchParams(location.search).has("welcome");

function node(tag, props = {}, ...kids) {
  const n = Object.assign(document.createElement(tag), props);
  n.append(...kids.flat().filter(k => k != null && k !== false));
  return n;
}
const btn = (label, cls, onclick) => node("button", { className: `btn ${cls}`.trim(), type: "button", textContent: label, onclick });
const open = path => chrome.tabs.create({ url: chrome.runtime.getURL(path) });
const youtube = () => chrome.tabs.create({ url: "https://www.youtube.com/" });

// Each feature: what it's for, where it starts, and (with Plus) a way in.
// Line icons drawn like the rest of Aim's (24×24, round strokes).
const LINE_ICONS = {
  study: ["M5 4.5h11a3 3 0 0 1 3 3v12H8a3 3 0 0 1-3-3z", "M5 16.5a3 3 0 0 1 3-3h11", "M9 8h6"],
  teach: ["M5 18.5l1.2-3.4A7.5 7.5 0 1 1 9 18.1z", "M9.8 9.6a2.3 2.3 0 1 1 3.2 2.1c-.6.3-1 .8-1 1.5", "M12 15.6h.01"],
  practice: ["M14.5 5.5a4 4 0 0 0 4.7 5.2l-8.6 8.6a2 2 0 0 1-2.9-2.9l8.6-8.6a4 4 0 0 0-1.8-2.3z"],
  video: ["M4 6.5h16v11H4z", "M10.5 9.5v5l4-2.5z"],
  librarian: ["M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z", "M15.5 8.5l-2 5-5 2 2-5z"],
  path: ["M5 19c4 0 3-7 7-7s3-7 7-7", "M5 19h.01M19 5h.01", "M16 5h3v3"],
  record: ["M6 3.5h9l3 3v14H6z", "M9 10h6M9 13.5h6M9 17h4"],
  sync: ["M4 12a8 8 0 0 1 14-5.3L20 9", "M20 4v5h-5", "M20 12a8 8 0 0 1-14 5.3L4 15", "M4 20v-5h5"]
};
function lineIcon(name) {
  const NS = "http://www.w3.org/2000/svg", s = document.createElementNS(NS, "svg");
  s.setAttribute("viewBox", "0 0 24 24"); s.setAttribute("width", "18"); s.setAttribute("height", "18"); s.setAttribute("aria-hidden", "true");
  for (const d of LINE_ICONS[name] || []) {
    const p = document.createElementNS(NS, "path");
    for (const [k, v] of Object.entries({ d, fill: "none", stroke: "currentColor", "stroke-width": "1.8", "stroke-linecap": "round", "stroke-linejoin": "round" })) p.setAttribute(k, v);
    s.append(p);
  }
  return s;
}

function features(ctx) {
  const st = ctx.study;
  return [
    { icon: "study", title: "Study sessions", text: "Turn a learning goal into a few topics in order, each with a clear video picked from your own searches. Upload your syllabus or study guide and the topics match your class.",
      how: "Starts on YouTube: set a learning aim, then Organize a study session above the results.",
      live: st ? `Now: ${st.title}, ${st.done} of ${st.of} topics checked` : null,
      action: st ? ["Open your session", () => open("study.html")] : ["Go to YouTube", youtube] },
    { icon: "teach", title: "TeachBack", text: "Check your understanding by explaining it, the way you'd teach a friend. You get what you've shown, what to review, and a search for each gap. Not a grade.",
      how: "From a study topic, after a video, or here.",
      action: ["Test my understanding", () => open("teachback.html")] },
    { icon: "practice", title: "Put it into practice", text: "At the end of a study session, one small project that uses what you learned, aimed at what your checks say to practice.",
      how: "In a study session's summary, once a topic is checked." },
    { icon: "video", title: "In this video", text: "Beside a video you're watching to learn: the ideas it covers, a jump to each chapter, the same idea in another context, and a test on the video when it ends.",
      how: "Appears on its own for learning aims." },
    { icon: "librarian", title: "The librarian", text: "Ask YouTube's home box in a sentence (\"help me prepare for my flight review\"). The librarian turns it into better searches, picks the best results with a reason for each, and remembers your aim.",
      how: "Type a request instead of a search on YouTube's home page. Free accounts get a small daily allowance; Plus gets more." },
    { icon: "path", title: "Pathways", text: "What interests you, what you could do with it, and what it would take: careers connected to what you've been learning, with real ways to try them.",
      action: ["Open Pathways", () => open("pathways.html")] },
    { icon: "record", title: "Learning record", text: "Everything you've worked on, with what your checks showed and what you made. Print it or save it as a PDF.",
      live: ctx.record ? `${ctx.record.targets} aims completed · ${ctx.record.topicsChecked} topics checked · ${ctx.record.projects} projects` : null,
      action: ["Open your record", () => open("record.html")] },
    { icon: "sync", title: "Sync across devices", text: "Your aims, study sessions and learning record, saved videos and settings, on every computer where you sign in. Start at school, pick it up at home.",
      how: "Off until you turn it on in Settings → Aim Plus.",
      live: ctx.sync?.on ? (ctx.sync.lastAt ? "On" : "On, syncing") : null,
      action: ["Open Settings", () => open("options.html#plus")] }
  ];
}

function featureCard(f, plus) {
  return node("section", { className: "card feature" },
    node("h2", {}, node("span", { className: "icon" }, lineIcon(f.icon)), f.title),
    node("p", { textContent: f.text }),
    f.how ? node("div", { className: "how", textContent: f.how }) : null,
    plus && f.live ? node("div", { className: "live", textContent: f.live }) : null,
    plus && f.action ? node("div", { className: "row" }, btn(f.action[0], "tonal", f.action[1])) : null);
}

async function render() {
  const [acct, s, rec] = await Promise.all([send({ type: "plus-status" }), send({ type: "status" }), send({ type: "record" })]);
  const screen = document.getElementById("screen");
  if (!acct?.configured) {
    screen.replaceChildren(node("div", { className: "card" }, node("h1", { textContent: "Aim Plus" }),
      node("p", { className: "muted", textContent: `${BRAND} Plus isn't set up in this copy of ${BRAND}.` })));
    return;
  }
  const plus = acct.signedIn && (acct.plan === "plus" || acct.plan === "homeschool");
  const study = s?.purpose?.study && !s.purpose.study.endedAt
    ? { title: s.purpose.study.title, of: s.purpose.study.topics.length, done: s.purpose.study.topics.filter(t => t.check).length } : null;
  const ctx = { study, record: rec?.totals || null, sync: acct?.sync || null };
  const head = plus
    ? node("section", { className: `card${welcome ? " welcome" : ""}` },
        node("h1", { textContent: welcome ? `Welcome to ${BRAND} Plus` : `Your ${BRAND} Plus` }),
        node("p", { textContent: welcome ? "Here's everything you now have, and where each one starts. You can come back to this page from the popup or Settings."
          : "Everything in Plus, and where each one starts." }))
    : node("section", { className: "card" },
        node("h1", { textContent: `${BRAND} Plus` }),
        node("p", { className: "lede", textContent: `${BRAND} Free keeps YouTube on purpose. Plus helps you actually learn from it: plan, find the best videos, check yourself, use it, and keep a record.` }),
        node("div", { className: "row" },
          !acct.signedIn ? btn("Sign in to get started", "", () => chrome.tabs.create({ url: chrome.runtime.getURL("options.html#plus") }))
            : acct.billing?.available ? btn("Upgrade to Plus", "", async () => {
                const r = await send({ type: "plus-subscribe" });
                if (r?.error) toast(r.error);
              })
            : node("span", { className: "muted", textContent: "Subscriptions open soon." })));
  screen.replaceChildren(head, node("div", { className: "features" }, features(ctx).map(f => featureCard(f, plus))));
}

function toast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg; t.style.display = "block";
  clearTimeout(toast.timer); toast.timer = setTimeout(() => (t.style.display = "none"), 3500);
}

render();
// Back from Stripe in another tab: the plan may have changed.
window.addEventListener("focus", render);
