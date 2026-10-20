// Aim — the learning record: every aim with something to show, newest first, with the time and
// videos behind it, and for study sessions the topics, what each check showed, and the project you
// did. Read-only; printable. Checks are estimates from TeachBack, not grades.

const BRAND = chrome.runtime.getManifest().name;
for (const n of document.querySelectorAll("[data-brand]")) n.textContent = BRAND;
const send = msg => chrome.runtime.sendMessage(msg).catch(() => null);
const STATUS = { demonstrated: ["Demonstrated", "strong"], partial: ["Developing", ""], needs_review: ["Needs review", ""], not_assessed: ["Not assessed", ""] };
const OUTCOME = { yes: "Found what you needed", partly: "Partly found it", no: "Didn't find it" };
const STATE = { active: "Current", paused: "Set aside", completed: "Completed" };
let filter = "all";

function node(tag, props = {}, ...kids) {
  const n = Object.assign(document.createElement(tag), props);
  n.append(...kids.flat().filter(k => k != null && k !== false));
  return n;
}
const date = ts => (ts ? new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "");
const hours = sec => (sec >= 3600 ? `${(sec / 3600).toFixed(1)} h` : `${Math.round(sec / 60)} min`);

function entryCard(e) {
  const st = e.study;
  return node("section", { className: "card entry" },
    node("h2", { textContent: e.text }),
    node("div", { className: "meta", textContent: [STATE[e.state], e.state === "completed" ? date(e.endedAt) : `since ${date(e.startedAt)}`,
      hours(e.usedSec), e.videoCount ? `${e.videoCount} video${e.videoCount > 1 ? "s" : ""}` : null, e.outcome ? OUTCOME[e.outcome] : null].filter(Boolean).join(" · ") }),
    st ? node("div", {},
      node("h3", { textContent: `Study session: ${st.title}` }),
      st.topics.map((t, i) => node("div", {},
        node("div", { className: "obj" }, node("b", { textContent: `${i + 1}. ${t.title}` }),
          node("span", { className: "muted small", textContent: t.check ? `checked ${date(t.check.at)}` : "not checked" })),
        t.check ? t.check.objectives.map(o => node("div", { className: "obj" },
          node("span", { className: `pill ${STATUS[o.status]?.[1] || ""}`, textContent: STATUS[o.status]?.[0] || o.status }), node("span", { textContent: o.text }))) : null)),
      st.apply ? node("div", { className: "project" },
        node("b", { textContent: `${st.apply.doneAt ? "Put it to work" : "Project suggested"}: ${st.apply.title}` }),
        node("div", { className: "small", textContent: st.apply.task }),
        st.apply.doneAt ? node("div", { className: "small" }, node("span", { className: "pill ok", textContent: `Done ${date(st.apply.doneAt)}` }), st.apply.note ? `“${st.apply.note}”` : null) : null) : null) : null,
    e.videos.length ? node("ul", { className: "vids" }, e.videos.map(v => node("li", { textContent: `${v.title || "Video"}${v.channel ? ` · ${v.channel}` : ""}` }))) : null);
}

async function render() {
  const r = await send({ type: "record" });
  const box = document.getElementById("record");
  if (!r) { box.replaceChildren(node("p", { className: "error", textContent: "Couldn't load your record. Reload this page." })); return; }
  const t = r.totals;
  const shown = r.entries.filter(e => filter === "all" || (filter === "study" ? e.study : e.state === "completed"));
  box.replaceChildren(
    node("div", { className: "totals" },
      [[t.targets, "Aims completed"], [hours(t.learningSec), "time on aims"], [t.topicsChecked, "study topics checked"],
        [t.demonstrated, "ideas demonstrated"], [t.projects, "projects done"]].map(([n, l]) => node("div", {}, node("b", { textContent: String(n) }), node("span", { textContent: l })))),
    node("div", { className: "filters no-print seg" }, [["all", "Everything"], ["study", "Study sessions"], ["completed", "Completed"]].map(([k, l]) =>
      node("button", { type: "button", textContent: l, ariaPressed: String(filter === k), onclick: () => { filter = k; render(); } }))),
    ...(shown.length ? shown.map(entryCard) : [node("p", { className: "muted", textContent: r.entries.length ? "Nothing here yet." :
      "Nothing yet. Set an aim on YouTube; what you work on shows up here." })]),
    node("p", { className: "muted small", style: "margin-top:20px", textContent: "Checks are estimates from TeachBack conversations, based only on what you wrote. They aren't grades." }));
}

document.getElementById("print").onclick = () => print();
render();
