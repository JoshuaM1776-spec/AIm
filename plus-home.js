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
function features(ctx) {
  const st = ctx.study;
  return [
    { icon: "▤", title: "Study sessions", text: "Turn a learning goal into a few topics in order, each with a clear video picked from your own searches. Upload your syllabus or study guide and the topics match your class.",
      how: "Starts on YouTube: set a learning aim, then Organize a study session above the results.",
      live: st ? `Now: ${st.title}, ${st.done} of ${st.of} topics checked` : null,
      action: st ? ["Open your session", () => open("study.html")] : ["Go to YouTube", youtube] },
    { icon: "?", title: "TeachBack", text: "Check your understanding by explaining it, the way you'd teach a friend. You get what you've shown, what to review, and a search for each gap. Not a grade.",
      how: "From a study topic, after a video, or here.",
      action: ["Test my understanding", () => open("teachback.html")] },
    { icon: "✎", title: "Put it into practice", text: "At the end of a study session, one small project that uses what you learned, aimed at what your checks say to practice.",
      how: "In a study session's summary, once a topic is checked." },
    { icon: "▶", title: "In this video", text: "Beside a video you're watching to learn: the ideas it covers, a jump to each chapter, the same idea in another context, and a test on the video when it ends.",
      how: "Appears on its own for learning aims." },
    { icon: "✦", title: "The librarian", text: "Ask YouTube's home box in a sentence (\"help me prepare for my flight review\"). The librarian turns it into better searches, picks the best results with a reason for each, and remembers your aim.",
      how: "Type a request instead of a search on YouTube's home page. Free accounts get a small daily allowance; Plus gets more." },
    { icon: "⇢", title: "Pathways", text: "What interests you, what you could do with it, and what it would take: careers connected to what you've been learning, with real ways to try them.",
      action: ["Open Pathways", () => open("pathways.html")] },
    { icon: "☰", title: "Learning record", text: "Everything you've worked on, with what your checks showed and what you made. Print it or save it as a PDF.",
      live: ctx.record ? `${ctx.record.targets} aims completed · ${ctx.record.topicsChecked} topics checked · ${ctx.record.projects} projects` : null,
      action: ["Open your record", () => open("record.html")] },
    { icon: "⇄", title: "Sync across devices", text: "Your aims, study sessions and learning record, saved videos and settings, on every computer where you sign in. Start at school, pick it up at home.",
      how: "Off until you turn it on in Settings → Aim Plus.",
      live: ctx.sync?.on ? (ctx.sync.lastAt ? "On" : "On, syncing") : null,
      action: ["Open Settings", () => open("options.html#plus")] }
  ];
}

function featureCard(f, plus) {
  return node("section", { className: "card feature" },
    node("h2", {}, node("span", { className: "icon", textContent: f.icon, ariaHidden: "true" }), f.title),
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
            : acct.billing?.available ? btn("Upgrade to Plus", "accent", async () => {
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
