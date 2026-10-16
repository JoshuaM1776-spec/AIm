// Waypoint — toolbar popup

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

async function renderSession() {
  const s = await getSession();
  const box = document.getElementById("session");
  box.replaceChildren();
  if (!s) {
    box.append(el("div", { class: "card" },
      el("div", { class: "strong" }, "No session running"),
      el("div", { class: "muted" }, "Start one from the Waypoint button in YouTube's top bar.")));
    return;
  }
  if (s.mode === "quick") {
    box.append(el("div", { class: "card" },
      el("div", { class: "tag" }, "Quick answer"),
      el("div", { class: "strong" }, s.purpose),
      el("div", { class: "row" },
        el("span", { class: "muted" }, `${Math.round(s.usedSec / 60)} min so far${s.searches?.length > 1 ? ` · ${s.searches.length} searches` : ""}`),
        el("button", { class: "btn", onclick: async () => { await endSession("yes"); render(); } }, "Got my answer"))));
    return;
  }
  const left = Math.max(0, s.budgetMin * 60 - s.usedSec);
  const pct = Math.min(100, (left / (s.budgetMin * 60)) * 100);
  box.append(el("div", { class: "card" },
    el("div", { class: "tag" }, s.paused ? "Paused" : s.mode === "focus" ? "Focus session" : "Explore session"),
    el("div", { class: "strong" }, s.mode === "focus" ? s.purpose : `Exploring · ${s.budgetMin} minutes`),
    el("div", { class: "bar" }, el("i", { style: `width:${pct}%`, class: left === 0 ? "over" : null })),
    el("div", { class: "row" },
      el("span", { class: "muted" }, `${mins(left)} min left${s.pivots ? ` · ${s.pivots} pivot${s.pivots > 1 ? "s" : ""}` : ""}`),
      el("button", { class: "btn ghost", onclick: async () => { await endSession(null); render(); } }, "End session"))));
}

async function renderSaved() {
  const { saved = [] } = await chrome.storage.local.get("saved");
  const box = document.getElementById("saved");
  box.replaceChildren();
  if (!saved.length) { box.append(el("div", { class: "muted" }, "Nothing saved. When a video deserves your attention, just not right now, save it here.")); return; }
  for (const v of saved.slice().reverse()) {
    box.append(el("div", { class: "item row" },
      el("a", { href: `https://www.youtube.com/watch?v=${encodeURIComponent(v.id)}`, target: "_blank" },
        el("div", {}, v.title), el("div", { class: "muted" }, v.channel)),
      el("button", { class: "x", title: "Remove", onclick: async () => { await removeSaved(v.id); renderSaved(); } }, "×")));
  }
}

async function renderBuckets() {
  const state = await loadState();
  const L = state.limits;
  const wrap = document.getElementById("buckets");
  wrap.replaceChildren();
  const line = (label, used, cap) => {
    wrap.append(el("div", { class: "row" }, el("span", {}, label), el("span", { class: "muted" }, cap ? `${used} / ${cap} min` : `${used} min`)));
    if (cap) wrap.append(el("div", { class: "bar" },
      el("i", { style: `width:${Math.min(100, (used / cap) * 100)}%`, class: used >= cap ? "over" : null })));
  };
  const m = k => Math.floor(usedSec(state, k) / 60);
  line("Leisure", m("leisure"), L.leisureMin);
  line("Purposeful", m("purposeful"), 0);
  if (L.totalMin) line("All YouTube", m("total"), L.totalMin);
  wrap.append(el("div", { class: "muted", style: "margin-top:4px" },
    `Mode: ${state.level}${state.pending.length ? ` · ${state.pending.length} change(s) waiting` : ""}`));
}

async function renderHistory() {
  const { sessions = [] } = await chrome.storage.local.get("sessions");
  const box = document.getElementById("history");
  box.replaceChildren();
  const recent = sessions.slice(-4).reverse();
  if (!recent.length) { box.append(el("div", { class: "muted" }, "Finished sessions show up here.")); return; }
  const OUT = { yes: "Got it", partly: "Partly", no: "Didn't get it" };
  for (const s of recent) {
    const title = s.mode !== "explore" ? s.path.map(p => p.purpose).join(" → ") : "Exploring";
    box.append(el("div", { class: "item" },
      el("div", {}, title),
      el("div", { class: "muted" }, `${Math.max(1, Math.round(s.usedSec / 60))} min${s.outcome ? ` · ${OUT[s.outcome]}` : ""}`)));
  }
}

function render() { renderSession(); renderSaved(); renderBuckets(); renderHistory(); }

document.getElementById("settings").addEventListener("click", () => chrome.runtime.openOptionsPage());
document.getElementById("clear").addEventListener("click", async () => {
  await chrome.storage.local.set({ log: [], sessions: [] });
  render();
});
render();
