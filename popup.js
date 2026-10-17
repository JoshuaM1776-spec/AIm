// Aim — toolbar popup: quick controls for the current purpose or break, and your activity.
// Reads and changes data through the background worker.

function el(tag, attrs = {}, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === "class") n.className = v;
    else if (k.startsWith("on")) n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v === true ? "" : v);
  }
  for (const k of kids) if (k != null && k !== false) n.append(k);
  return n;
}
const BRAND = chrome.runtime.getManifest().name; // the product name lives in manifest.json
for (const n of document.querySelectorAll("[data-brand]")) n.textContent = BRAND;
const send = msg => chrome.runtime.sendMessage(msg).catch(() => null);
const mins = sec => Math.max(0, Math.ceil(sec / 60));
// 80 → "1h 20m", 45 → "45 min"
const dur = m => (m >= 60 ? `${Math.floor(m / 60)}h${m % 60 ? ` ${m % 60}m` : ""}` : `${m} min`);

// Small line icons, drawn like the ones on YouTube.
const SVG = "http://www.w3.org/2000/svg";
function ico(paths) {
  const s = document.createElementNS(SVG, "svg");
  s.setAttribute("viewBox", "0 0 24 24"); s.setAttribute("class", "ico"); s.setAttribute("aria-hidden", "true");
  for (const d of paths) {
    const p = document.createElementNS(SVG, "path");
    for (const [k, v] of Object.entries({ d, fill: "none", stroke: "currentColor", "stroke-width": "1.8", "stroke-linecap": "round", "stroke-linejoin": "round" })) p.setAttribute(k, v);
    s.append(p);
  }
  return s;
}
const ICONS = {
  coffee: ["M5 9.5h11v4.5a4.5 4.5 0 0 1-4.5 4.5h-2A4.5 4.5 0 0 1 5 14z", "M16 11h1.5a2.5 2.5 0 0 1 0 5H16", "M8.5 3.5c-.9 1 .9 2 0 3.2M11.5 3.5c-.9 1 .9 2 0 3.2"],
  change: ["M4 12a8 8 0 0 1 14-5.3L20 9", "M20 4v5h-5", "M20 12a8 8 0 0 1-14 5.3L4 15", "M4 20v-5h5"],
  check: ["M5 12.5l4.5 4.5L19 7.5"],
  chevron: ["M9 6l6 6-6 6"]
};

let st = null;
let open = null; // which inline control is open: "break" | "pivot" | "done"

// A ring showing how much of a limit is left.
function ring(left, total) {
  const r = 19, c = 2 * Math.PI * r, frac = total ? Math.max(0, Math.min(1, left / total)) : 0;
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("class", "ring");
  svg.setAttribute("width", "48"); svg.setAttribute("height", "48"); svg.setAttribute("viewBox", "0 0 48 48");
  for (const [cls, extra] of [["track", {}], ["fill", { "stroke-dasharray": c, "stroke-dashoffset": c * (1 - frac), "stroke-linecap": "round" }]]) {
    const ci = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    for (const [k, v] of Object.entries({ cx: 24, cy: 24, r, fill: "none", "stroke-width": 5, class: cls, ...extra })) ci.setAttribute(k, v);
    svg.append(ci);
  }
  return svg;
}

async function act(msg) {
  const r = await send(msg);
  if (r?.result === "error") alert(r.message);
  open = null;
  render();
}

// ---------------- the current purpose or break ----------------
function breakControls() {
  if (open !== "break") return el("button", { class: "btn wide", onclick: () => { open = "break"; renderCurrent(); } }, ico(ICONS.coffee), "Take a Break");
  const left = st.leisureLeftMin, used = left !== null && left < 1;
  const custom = el("input", { class: "field", type: "number", min: "1", placeholder: "Minutes", "aria-label": "Custom break length in minutes", style: "width:96px;margin:0" });
  return el("div", {},
    el("div", { class: "muted" }, used ? "Today's leisure time is used up." : left !== null ? `${left} min of leisure time left today.` : "Take a break:"),
    el("div", { class: "chips" },
      ...[15, 30, 60].map(m => el("button", { class: "chip", disabled: used, onclick: () => act({ type: "break-start", minutes: m }) }, m === 60 ? "1h" : `${m}m`)),
      used ? null : custom,
      used ? null : el("button", { class: "chip", onclick: () => custom.value && act({ type: "break-start", minutes: parseInt(custom.value, 10) }) }, "Start"),
      el("button", { class: "link", onclick: () => { open = null; renderCurrent(); } }, "Cancel")));
}

function pivotControls() {
  const input = el("input", { class: "field", placeholder: "What do you want to focus on instead?", "aria-label": "New Target" });
  const go = () => input.value.trim() && act({ type: "purpose-pivot", text: input.value });
  input.addEventListener("keydown", e => { if (e.key === "Enter") go(); });
  setTimeout(() => input.focus(), 0);
  return el("div", { class: "stack" }, input,
    ...(st.recent || []).slice(0, 4).map(t => el("button", { class: "link muted", onclick: () => { input.value = t; input.focus(); } }, `↺ ${t}`)),
    el("div", { class: "pair" },
      el("button", { class: "btn", onclick: () => { open = null; renderCurrent(); } }, "Cancel"),
      el("button", { class: "btn primary", onclick: go }, "Change Target")));
}

function doneControls() {
  return el("div", { class: "stack" },
    el("div", { class: "strong" }, "Did you find what you were looking for?"),
    el("button", { class: "btn primary", onclick: () => act({ type: "purpose-done", outcome: "yes" }) }, "Yes, I'm done"),
    el("div", { class: "pair", style: "margin-top:0" },
      el("button", { class: "btn", onclick: () => act({ type: "purpose-done", outcome: "partly" }) }, "Partly"),
      el("button", { class: "btn", onclick: () => act({ type: "purpose-done", outcome: "no" }) }, "Not really")),
    el("button", { class: "link", onclick: () => { open = null; renderCurrent(); } }, "Keep going"));
}

function renderCurrent() {
  const box = document.getElementById("session");
  box.replaceChildren();
  const p = st.purpose, b = st.brk;
  if (b) {
    const left = b.durationMin ? mins(b.durationMin * 60 - b.usedSec) : null;
    box.append(el("div", { class: "card" },
      el("div", { class: "tag" }, "On a break"),
      el("div", { class: "ring-row" },
        left !== null ? ring(left, b.durationMin) : null,
        el("div", {}, el("div", { class: "big" }, b.oneVideoId ? "Just this video" : `${dur(left)} left`),
          left !== null ? el("div", { class: "muted" }, `of ${dur(b.durationMin)}`) : null)),
      p ? el("div", { class: "muted" }, `Your Target is waiting: ${p.text}`) : null,
      el("div", { class: "pair" },
        el("button", { class: "btn primary", onclick: () => act({ type: "break-end" }) }, p ? "Back on Target" : "End break"),
        b.durationMin && !(st.leisureLeftMin !== null && st.leisureLeftMin < 1)
          ? el("button", { class: "btn", onclick: () => act({ type: "break-extend", minutes: 15 }) }, "+15 min") : null)));
    return;
  }
  if (p) {
    const left = p.limitMin ? mins(p.limitMin * 60 - p.usedSec) : null;
    box.append(el("div", { class: "card" },
      el("button", { class: "cur-head", title: "All Targets", onclick: () => send({ type: "open-targets" }) },
        el("div", { style: "min-width:0" }, el("div", { class: "tag" }, "Current Target"), el("div", { class: "strong big" }, p.text)),
        el("span", { class: "chev" }, ico(ICONS.chevron))),
      el("div", { class: "ring-row" },
        left !== null ? ring(left, p.limitMin) : null,
        el("div", {}, el("div", { class: "big" }, left !== null ? `${dur(left)} left` : "No time limit"),
          el("div", { class: "muted" }, left !== null ? `of ${dur(p.limitMin)}` : `${dur(mins(p.usedSec))} so far`))),
      open === "pivot" ? pivotControls() : open === "done" ? doneControls() : el("div", {},
        breakControls(),
        open === "break" ? null : el("div", { class: "pair" },
          el("button", { class: "btn", onclick: () => { open = "pivot"; renderCurrent(); } }, ico(ICONS.change), "Change Target"),
          el("button", { class: "btn", onclick: () => { open = "done"; renderCurrent(); } }, ico(ICONS.check), "Target complete")),
        open === "break" ? null : el("div", { class: "foot", style: "padding:8px 0 0;text-align:left;border:0" },
          el("a", { id: "setAside", onclick: () => act({ type: "purpose-pause" }) }, "Set aside for later"))),
      el("button", { class: "limits", onclick: () => send({ type: "open-options", section: "advanced" }) }, "Daily limits", el("span", { class: "chev" }, ico(ICONS.chevron)))));
    return;
  }
  box.append(el("div", { class: "card" },
    el("div", { class: "strong" }, "No Target set"),
    el("div", { class: "muted", style: "margin-bottom:10px" }, "Search on YouTube and your search becomes your Target."),
    breakControls()));
}

// ---------------- activity ----------------
function renderWeek() {
  const w = st.week;
  const box = document.getElementById("week");
  if (!w) return box.replaceChildren();
  const max = Math.max(1, ...w.days.map(d => d.purpose + d.leisure));
  const total = k => Math.round(w.days.reduce((s, d) => s + d[k], 0) / 60);
  box.replaceChildren(
    el("div", { class: "bars", title: "Time on Target (dark) and on breaks (light), per day" },
      ...w.days.map(d => el("div", { class: "bar7", title: `${d.day}: ${mins(d.purpose)} min on Target, ${mins(d.leisure)} min on breaks` },
        el("div", { class: "p", style: `height:${(d.purpose / max) * 100}%` }),
        el("div", { class: "l", style: `height:${(d.leisure / max) * 100}%` })))),
    el("div", { class: "days" }, ...w.days.map(d => el("span", {}, d.label))),
    el("div", { class: "row item" },
      el("span", {}, el("span", { class: "key", style: "background:var(--text)" }), "On Target ", el("b", {}, dur(total("purpose")))),
      el("span", {}, el("span", { class: "key", style: "background:var(--muted)" }), "Breaks ", el("b", {}, dur(total("leisure"))))),
    el("div", { class: "muted" }, w.purposes
      ? `${w.purposes} Target${w.purposes > 1 ? "s" : ""} complete · found what you needed in ${w.found}`
      : "Completed Targets show up here."));
}

function renderToday() {
  const t = st.today || { purpose: 0, leisure: 0, other: 0 };
  const S = st.settings;
  const line = (label, value) => el("div", { class: "row item" }, el("span", {}, label), el("span", { class: "muted" }, value));
  const all = t.purpose + t.leisure + t.other;
  document.getElementById("today").replaceChildren(
    line("On Target", `${mins(t.purpose)} min`),
    line("Breaks", S.leisureMin ? `${mins(t.leisure)} of ${S.leisureMin} min` : `${mins(t.leisure)} min`),
    line("All YouTube", S.totalMin ? `${mins(all)} of ${S.totalMin} min` : `${mins(all)} min`));
}

function renderSaved() {
  const box = document.getElementById("saved");
  box.replaceChildren();
  if (!st.saved.length) { box.append(el("div", { class: "muted" }, "Nothing saved. When a video deserves your attention, just not right now, save it here.")); return; }
  for (const v of st.saved.slice().reverse()) {
    box.append(el("div", { class: "item row" },
      el("a", { href: `https://www.youtube.com/watch?v=${encodeURIComponent(v.id)}`, target: "_blank" },
        el("div", {}, v.title), el("div", { class: "muted" }, v.channel)),
      el("button", { class: "x", title: "Remove", onclick: async () => { await send({ type: "saved-remove", id: v.id }); render(); } }, "×")));
  }
}

function renderHistory() {
  const box = document.getElementById("history");
  box.replaceChildren();
  const recent = st.history.slice(-5).reverse();
  if (!recent.length) { box.append(el("div", { class: "muted" }, "Completed Targets and breaks show up here.")); return; }
  const OUT = { yes: "Found it", partly: "Partly", no: "Didn't find it" };
  for (const h of recent) {
    const videos = h.videos?.length ? `${h.videos.length} video${h.videos.length > 1 ? "s" : ""}` : null;
    box.append(el("div", { class: "item" },
      el("div", {}, h.type === "break" ? (h.oneVideo ? "Break: one video" : "Break") : h.path?.length > 1 ? h.path.map(p => p.text).join(" → ") : h.text),
      el("div", { class: "muted" }, [dur(Math.max(1, Math.round(h.usedSec / 60))), videos, h.outcome ? OUT[h.outcome] : null].filter(Boolean).join(" · "))));
  }
}

async function render() {
  st = await send({ type: "state" });
  if (!st) return;
  renderCurrent();
  renderWeek();
  renderToday();
  renderSaved();
  renderHistory();
}

document.getElementById("settings").addEventListener("click", () => chrome.runtime.openOptionsPage());
document.getElementById("allTargets").addEventListener("click", () => send({ type: "open-targets" }));
document.getElementById("clear").addEventListener("click", async () => {
  if (!confirm("Clear your history of Targets and breaks?")) return;
  await send({ type: "history-clear" });
  render();
});
render();
send({ type: "theme", dark: matchMedia("(prefers-color-scheme: dark)").matches });
