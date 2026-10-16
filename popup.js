// Aim — toolbar popup. Reads and changes data through the background worker.

function el(tag, attrs = {}, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null) continue;
    if (k === "class") n.className = v;
    else if (k.startsWith("on")) n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v);
  }
  for (const k of kids) if (k != null) n.append(k);
  return n;
}
const mins = sec => Math.max(0, Math.ceil(sec / 60));
const send = msg => chrome.runtime.sendMessage(msg).catch(() => null);

function renderCurrent(st) {
  const box = document.getElementById("session");
  box.replaceChildren();
  const p = st.purpose, b = st.brk;
  if (b) {
    const left = b.durationMin ? Math.max(0, b.durationMin * 60 - b.usedSec) : null;
    box.append(el("div", { class: "card" },
      el("div", { class: "tag" }, "On a break"),
      el("div", { class: "strong" }, b.oneVideoId ? "Just this video" : `${mins(left)} min left`),
      left !== null ? el("div", { class: "bar" }, el("i", { style: `width:${Math.min(100, (left / (b.durationMin * 60)) * 100)}%` })) : null,
      p ? el("div", { class: "muted" }, `Your purpose is waiting: ${p.text}`) : null,
      el("div", { class: "row", style: "margin-top:8px" }, el("span"),
        el("button", { class: "btn", onclick: async () => { await send({ type: "break-end" }); render(); } }, p ? "Back to my purpose" : "End break"))));
    return;
  }
  if (p) {
    const left = p.limitMin ? Math.max(0, p.limitMin * 60 - p.usedSec) : null;
    box.append(el("div", { class: "card" },
      el("div", { class: "tag" }, "Your purpose"),
      el("div", { class: "strong" }, p.text),
      left !== null ? el("div", { class: "bar" }, el("i", { style: `width:${Math.min(100, (left / (p.limitMin * 60)) * 100)}%` })) : null,
      el("div", { class: "row", style: "margin-top:8px" },
        el("span", { class: "muted" }, [left !== null ? `${mins(left)} min left` : `${mins(p.usedSec)} min so far`,
          p.searches.length ? `${p.searches.length} search${p.searches.length > 1 ? "es" : ""}` : null,
          p.pivots ? `${p.pivots} pivot${p.pivots > 1 ? "s" : ""}` : null].filter(Boolean).join(" · ")),
        el("button", { class: "btn", onclick: async () => { await send({ type: "purpose-done", outcome: null }); render(); } }, "Done"))));
    return;
  }
  box.append(el("div", { class: "card" },
    el("div", { class: "strong" }, "No purpose set"),
    el("div", { class: "muted" }, "Search on YouTube and your search becomes your purpose. Or take a break from Aim's button in YouTube's top bar.")));
}

function renderSaved(saved) {
  const box = document.getElementById("saved");
  box.replaceChildren();
  if (!saved.length) { box.append(el("div", { class: "muted" }, "Nothing saved. When a video deserves your attention, just not right now, save it here.")); return; }
  for (const v of saved.slice().reverse()) {
    box.append(el("div", { class: "item row" },
      el("a", { href: `https://www.youtube.com/watch?v=${encodeURIComponent(v.id)}`, target: "_blank" },
        el("div", {}, v.title), el("div", { class: "muted" }, v.channel)),
      el("button", { class: "x", title: "Remove", onclick: async () => { await send({ type: "saved-remove", id: v.id }); render(); } }, "×")));
  }
}

function renderToday(st) {
  const wrap = document.getElementById("today");
  const t = st.today || { purpose: 0, leisure: 0, other: 0 };
  const S = st.settings;
  const line = (label, value) => el("div", { class: "row item" }, el("span", {}, label), el("span", { class: "muted" }, value));
  wrap.replaceChildren(
    line("On purpose", `${mins(t.purpose)} min`),
    line("Breaks", S.leisureMin ? `${mins(t.leisure)} of ${S.leisureMin} min` : `${mins(t.leisure)} min`),
    line("All YouTube", S.totalMin ? `${mins(t.purpose + t.leisure + t.other)} of ${S.totalMin} min` : `${mins(t.purpose + t.leisure + t.other)} min`));
}

function renderHistory(history) {
  const box = document.getElementById("history");
  box.replaceChildren();
  const recent = history.slice(-5).reverse();
  if (!recent.length) { box.append(el("div", { class: "muted" }, "Finished purposes and breaks show up here.")); return; }
  const OUT = { yes: "Found it", partly: "Partly", no: "Didn't find it" };
  for (const h of recent) {
    const m = `${Math.max(1, Math.round(h.usedSec / 60))} min`;
    const videos = h.videos?.length ? `${h.videos.length} video${h.videos.length > 1 ? "s" : ""}` : null;
    box.append(el("div", { class: "item" },
      el("div", {}, h.type === "break" ? (h.oneVideo ? "Break: one video" : "Break") : h.path?.length > 1 ? h.path.map(p => p.text).join(" → ") : h.text),
      el("div", { class: "muted" }, [m, videos, h.outcome ? OUT[h.outcome] : null].filter(Boolean).join(" · "))));
  }
}

async function render() {
  const st = await send({ type: "state" });
  if (!st) return;
  renderCurrent(st);
  renderSaved(st.saved);
  renderToday(st);
  renderHistory(st.history);
}

document.getElementById("settings").addEventListener("click", () => chrome.runtime.openOptionsPage());
document.getElementById("clear").addEventListener("click", async () => {
  if (!confirm("Clear your session history?")) return;
  await send({ type: "history-clear" });
  render();
});
render();
send({ type: "theme", dark: matchMedia("(prefers-color-scheme: dark)").matches });
