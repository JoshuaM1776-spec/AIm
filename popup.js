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

function renderSession(s) {
  const box = document.getElementById("session");
  box.replaceChildren();
  if (!s) {
    box.append(el("div", { class: "card" },
      el("div", { class: "strong" }, "No session running"),
      el("div", { class: "muted" }, "Start one from the Aim button in YouTube's top bar.")));
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
      el("button", { class: "btn ghost", onclick: async () => { await send({ type: "session-end", outcome: null }); render(); } }, "End session"))));
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

function renderToday(todaySec, reminderMin) {
  const wrap = document.getElementById("today");
  const used = Math.floor(todaySec / 60);
  wrap.replaceChildren(el("div", { class: "row" },
    el("span", {}, "Time on YouTube"),
    el("span", { class: "muted" }, reminderMin ? `${used} min · reminder at ${reminderMin}` : `${used} min`)));
}

function renderHistory(sessions) {
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

async function render() {
  const st = await send({ type: "state" });
  if (!st) return;
  renderSession(st.session);
  renderSaved(st.saved);
  renderToday(st.todaySec, st.settings.reminderMin);
  renderHistory(st.sessions);
}

document.getElementById("settings").addEventListener("click", () => chrome.runtime.openOptionsPage());
document.getElementById("clear").addEventListener("click", async () => {
  if (!confirm("Clear your session history?")) return;
  await send({ type: "history-clear" });
  render();
});
render();
send({ type: "theme", dark: matchMedia("(prefers-color-scheme: dark)").matches });
