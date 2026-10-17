// Aim — a study session's overview and summary: each topic, its videos, whether you watched
// them, and what your TeachBack checks showed, with links to review. Read-only apart from
// moving between topics and ending the session.

const BRAND = chrome.runtime.getManifest().name;
for (const n of document.querySelectorAll("[data-brand]")) n.textContent = BRAND;
const send = msg => chrome.runtime.sendMessage(msg).catch(() => null);
const screen = document.getElementById("screen");
const STATUS = { demonstrated: ["Demonstrated", "strong"], partial: ["Partly shown", ""], needs_review: ["Needs review", ""], not_assessed: ["Not assessed", ""] };
const yt = path => `https://www.youtube.com${path}`;

function node(tag, props = {}, ...kids) {
  const n = Object.assign(document.createElement(tag), props);
  n.append(...kids.flat().filter(k => k != null && k !== false));
  return n;
}
const btn = (label, cls, onclick) => node("button", { className: `btn ${cls}`.trim(), type: "button", textContent: label, onclick });

function topicCard(st, t, i) {
  const watched = t.videos.filter(v => t.watched.includes(v.id)).length;
  const weak = t.check?.objectives.filter(o => o.status !== "demonstrated") || [];
  return node("div", { className: "card" },
    node("div", { className: "topic-head" },
      node("h2", { textContent: `${i + 1}. ${t.title}` }),
      node("span", {},
        t.videos.length ? node("span", { className: "pill", textContent: `Watched ${watched} of ${t.videos.length}` }) : null,
        t.check ? node("span", { className: `pill ${weak.length ? "" : "strong"}`, textContent: weak.length ? "Review" : "Checked" })
          : node("span", { className: "pill", textContent: "Not checked yet" }))),
    t.brief ? node("p", { className: "small", textContent: t.brief }) : null,
    t.videos.length ? node("div", { className: "videos" }, t.videos.map(v =>
      node("a", { href: yt(`/watch?v=${encodeURIComponent(v.id)}`), textContent: `${t.watched.includes(v.id) ? "✓ " : ""}${v.title || "Video"}${v.channel ? ` · ${v.channel}` : ""}` })))
      : node("p", { className: "muted small", textContent: "Videos are picked when you open this topic." }),
    t.check ? node("div", {}, node("p", { className: "muted small", style: "margin:12px 0 4px", textContent: "What your check showed (an estimate)" }),
      t.check.objectives.map(o => node("div", { className: "obj" },
        node("span", { className: `pill ${STATUS[o.status][1]}`, textContent: STATUS[o.status][0] }),
        node("span", { textContent: o.text }),
        o.status !== "demonstrated" && o.search ? node("a", { href: yt(`/results?search_query=${encodeURIComponent(o.search)}`), textContent: "Review", className: "small" }) : null))) : null,
    st.endedAt ? null : node("div", { className: "row" },
      btn("Go to this topic", "tonal", async () => { await send({ type: "study-update", current: i }); location.href = yt(`/results?search_query=${encodeURIComponent(t.searches[0])}`); }),
      btn(t.check ? "Check again" : "Check yourself", "text", () => send({ type: "open-teachback", topic: `${t.title} (${st.title})`,
        notes: [t.brief, st.notes].filter(Boolean).join("\n\n").slice(0, 3000), study: t.id }))));
}

async function render() {
  const s = await send({ type: "status" });
  const st = s?.purpose?.study;
  if (!st) {
    screen.replaceChildren(node("h1", { textContent: "No study session" }),
      node("p", { className: "muted", textContent: `Study sessions start from a learning Target's results on YouTube, with ${BRAND} Plus.` }));
    return;
  }
  const checked = st.topics.filter(t => t.check).length;
  const review = st.topics.filter(t => t.check?.objectives.some(o => o.status !== "demonstrated"));
  screen.replaceChildren(...[
    node("p", { className: "muted small", textContent: s.purpose.text }),
    node("h1", { textContent: st.title }),
    st.endedAt ? node("p", {}, node("span", { className: "pill", textContent: "Session ended" })) : null,
    node("p", { className: "muted", textContent: `${st.topics.length} topics · ${checked} checked${review.length ? ` · ${review.length} to review` : ""}` }),
    st.scopeNote ? node("p", { className: "note", textContent: st.scopeNote }) : null,
    review.length ? node("div", { className: "note" }, node("b", { textContent: "Worth reviewing: " }), review.map(t => t.title).join(", ")) : null,
    st.topics.map((t, i) => topicCard(st, t, i)),
    st.endedAt ? null : node("div", { className: "row" },
      btn("Continue studying", "", () => { const t = st.topics[st.current] || st.topics[0]; location.href = yt(`/results?search_query=${encodeURIComponent(t.searches[0])}`); }),
      btn("End study session", "text", async () => {
        if (!confirm("End this study session? Your Target stays, and this summary remains here.")) return;
        await send({ type: "study-update", end: true });
        render();
      })),
    node("p", { className: "muted small", style: "margin-top:20px",
      textContent: "Checks are estimates from TeachBack conversations, based only on what you wrote. They aren't grades." })
  ].flat().filter(Boolean));
}

render();
// Stay current while the session goes on in other tabs.
chrome.storage.onChanged.addListener((changes, area) => { if (area === "local" && changes.purpose) render(); });
