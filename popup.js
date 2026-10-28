// Aim — toolbar popup: Focus or Explore, the current aim (Resume, Done, session tools, its limit),
// and your activity folded below.
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
  chevron: ["M9 6l6 6-6 6"],
  play: ["M8 5.5v13l10.5-6.5z"],
  target: ["M12 21a9 9 0 1 1 9-9", "M12 17a5 5 0 1 1 5-5", "M12 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2z", "M14 10l6.5-6.5M17 3.5h3.5V7"],
  compass: ["M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z", "M15.5 8.5l-2 5-5 2 2-5z"],
  hourglass: ["M7 3.5h10M7 20.5h10", "M8 3.5c0 5 8 5 8 8.5s-8 3.5-8 8.5", "M16 3.5c0 5-8 5-8 8.5s8 3.5 8 8.5"],
  talk: ["M5 18.5l1.2-3.4A7.5 7.5 0 1 1 9 18.1z"],
  bookmark: ["M7 3.5h10v17l-5-3.5-5 3.5z"],
  library: ["M4 5.5C6.5 4 9.5 4 12 6c2.5-2 5.5-2 8-.5V19c-2.5-1.5-5.5-1.5-8 .5-2.5-2-5.5-2-8-.5z", "M12 6v13.5"]
};

// Open YouTube at this address: in the YouTube tab you're on, otherwise in a new tab.
async function goYouTube(url) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true }).catch(() => []);
  const here = tab ? await chrome.tabs.sendMessage(tab.id, { type: "go", url }).catch(() => null) : null;
  if (!here?.ok) await chrome.tabs.create({ url });
  window.close();
}
// Ask the YouTube tab you're on to do something (talk it through, save the video). Null when it isn't one.
async function askTab(type) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true }).catch(() => []);
  return tab ? chrome.tabs.sendMessage(tab.id, { type }).catch(() => null) : null;
}

// Focus or Explore: which way you're in, and the way into the other.
function renderModes() {
  const p = st.purpose, exploring = !!p?.learn && !st.brk, focused = !!p && !p.learn && !st.brk;
  const mode = (on, icon, name, sub, go) => el("button", { class: `mode${on ? " on" : ""}`, "aria-pressed": String(on), onclick: go },
    ico(icon), el("span", {}, el("b", {}, name), el("small", {}, sub)));
  document.getElementById("modes").replaceChildren(
    mode(focused, ICONS.target, "Focus", "Learn something specific", () => goYouTube("https://www.youtube.com/")),
    mode(exploring, ICONS.compass, "Explore", "Follow your curiosity", () => goYouTube("https://www.youtube.com/#aim-explore")));
}

let st = null;
let open = null; // which inline control is open: "break" | "pivot"

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

// Back to where you left off: the last video at the moment you left it, or the last search.
async function resume(id) {
  const r = await send({ type: "purpose-resume", id });
  if (!r || r.result !== "applied") return alert(r?.message || "Couldn't resume that aim. Try again.");
  // On a YouTube tab, go there in place; anywhere else, open a new tab rather than leave the page you're on.
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true }).catch(() => []);
  const here = tab ? await chrome.tabs.sendMessage(tab.id, { type: "go", url: r.url }).catch(() => null) : null;
  if (!here?.ok) await chrome.tabs.create({ url: r.url });
  window.close();
}

async function act(msg) {
  const r = await send(msg);
  if (!r) alert("Aim didn't answer. Try again.");
  else if (r.error || r.result === "error") alert(r.message || r.error);
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

// Change my aim: switch to one you have (it picks up where you left off), or start a new one. Either
// way the current aim is set aside. The same choice as the dialog on YouTube (content/session.js).
function pivotControls() {
  const input = el("input", { class: "field", placeholder: "What do you want to focus on instead?", "aria-label": "New aim" });
  const go = () => input.value.trim() && act({ type: "purpose-pivot", text: input.value });
  input.addEventListener("keydown", e => { if (e.key === "Enter") go(); });
  const switchBox = el("div", { class: "stack switch" });
  send({ type: "targets" }).then(d => {
    const list = (d?.paused || []).filter(a => a.id !== st.purpose?.id);
    if (!list.length) return;
    switchBox.replaceChildren(el("div", { class: "label", style: "margin:10px 0 4px" }, "Switch to one you have"),
      ...list.slice(0, 3).map(a => el("button", { class: "switch-item", onclick: () => resume(a.id) },
        el("span", { class: "switch-book" }, cover(a, "small")), el("span", { class: "switch-text" }, a.text), ico(ICONS.chevron))),
      el("button", { class: "link muted", onclick: () => send({ type: "open-targets" }) }, list.length > 3 ? `All ${list.length} in your library` : "Open my library"));
  });
  return el("div", { class: "stack" }, switchBox,
    el("div", { class: "label", style: "margin:10px 0 0" }, "Start a new aim"),
    input,
    ...(st.recent || []).slice(0, 3).map(t => el("button", { class: "link muted", onclick: () => { input.value = t; input.focus(); } }, `↺ ${t}`)),
    el("div", { class: "muted" }, "Your current aim is set aside, so you can pick it up again anytime."),
    el("div", { class: "pair" },
      el("button", { class: "btn", onclick: () => { open = null; renderCurrent(); } }, "Cancel"),
      el("button", { class: "btn primary", onclick: go }, "Start this aim")));
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
      p ? el("div", { class: "muted" }, `Your aim is waiting: ${p.text}`) : null,
      el("div", { class: "pair" },
        el("button", { class: "btn primary", onclick: () => act({ type: "break-end" }) }, p ? "Back to my aim" : "End break"),
        b.durationMin && !(st.leisureLeftMin !== null && st.leisureLeftMin < 1)
          ? el("button", { class: "btn", onclick: () => act({ type: "break-extend", minutes: 15 }) }, "+15 min") : null)));
    return;
  }
  if (p) {
    const parts = p.map?.parts || [];
    const sub = parts.length ? `${parts.filter(x => x.status === "explained").length} of ${parts.length} explained`
      : `${dur(Math.max(1, mins(p.usedSec)))} so far`;
    const left = p.limitMin ? mins(p.limitMin * 60 - p.usedSec) : null;
    const tools = el("div", { class: "tools" },
      el("button", { class: "tool", onclick: () => { open = open === "break" ? null : "break"; renderCurrent(); } }, ico(ICONS.hourglass), "Take a Break",
        el("small", {}, st.leisureLeftMin !== null && st.leisureLeftMin < 1 ? "None today" : "5–60 min")),
      el("button", { class: "tool", id: "askLibrarian", hidden: true, onclick: async () => {
        const r = await askTab("tab-talk");
        if (r?.ok) window.close(); else goYouTube("https://www.youtube.com/#aim-talk");
      } }, ico(ICONS.talk), "Librarian", el("small", {}, "Talk it through")),
      el("button", { class: "tool", onclick: () => send({ type: "open-targets" }) }, ico(ICONS.library), "My Library", el("small", {}, "Every aim")));
    const book = el("span", { class: "minibook" });
    // The aim's book, as on the library's shelf (its subject comes with the aim's summary).
    send({ type: "aim-get", id: p.id }).then(d => { if (d?.aim) book.replaceChildren(cover(d.aim, "small")); });
    box.append(el("div", { class: "card" },
      el("div", { class: "label" }, p.learn ? "Exploring" : "Your aim"),
      open === "pivot" ? el("div", {}, el("div", { class: "strong big cur-text" }, p.text), pivotControls()) : el("div", {},
        el("div", { class: "aimrow" },
          book,
          el("button", { class: "grow aimlink", title: "Open this aim's page", onclick: () => send({ type: "open-aim", id: p.id }) },
            el("div", { class: "title cur-text" }, p.text), el("div", { class: "muted" }, sub)),
          el("button", { class: "change", title: "Change my aim", onclick: () => { open = "pivot"; renderCurrent(); } }, "Change", ico(ICONS.chevron))),
        el("div", { class: "actions" },
          el("button", { class: "btn primary", id: "resume", onclick: () => resume(p.id) }, ico(ICONS.play), "Resume"),
          el("button", { class: "btn", title: "Done with this aim", onclick: () => act({ type: "purpose-done" }) }, ico(ICONS.check), "Done")),
        el("div", { class: "label", style: "margin:14px 0 0" }, "Session tools"),
        tools,
        open === "break" ? el("div", { style: "margin-top:10px" }, breakControls()) : null,
        left !== null ? el("div", { class: "limit" }, el("span", {}, `Session · ${Math.min(p.limitMin, mins(p.usedSec))} of ${p.limitMin} minutes`),
          el("div", { class: "bar" }, el("i", { style: `width:${Math.min(100, (mins(p.usedSec) / p.limitMin) * 100)}%` }))) : null,
        el("div", { class: "more" },
          el("button", { class: "link", onclick: () => { open = "pivot"; renderCurrent(); } }, "Change my aim"),
          el("button", { class: "link", id: "setAside", onclick: () => act({ type: "purpose-pause" }) }, "Set aside")))));
    send({ type: "plus-brief" }).then(r => { const b = document.getElementById("askLibrarian"); if (b) b.hidden = !r?.account; });
    return;
  }
  box.append(el("div", { class: "card" },
    el("div", { class: "strong" }, "No aim set"),
    el("div", { class: "muted", style: "margin-bottom:10px" }, "Open YouTube and tell Aim what you're looking for."),
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
    el("div", { class: "bars", title: "Time on your aim (dark) and on breaks (light), per day" },
      ...w.days.map(d => el("div", { class: "bar7", title: `${d.day}: ${mins(d.purpose)} min on your aims, ${mins(d.leisure)} min on breaks` },
        el("div", { class: "p", style: `height:${(d.purpose / max) * 100}%` }),
        el("div", { class: "l", style: `height:${(d.leisure / max) * 100}%` })))),
    el("div", { class: "days" }, ...w.days.map(d => el("span", {}, d.label))),
    el("div", { class: "row item" },
      el("span", {}, el("span", { class: "key", style: "background:var(--text)" }), "On your aims ", el("b", {}, dur(total("purpose")))),
      el("span", {}, el("span", { class: "key", style: "background:var(--muted)" }), "Breaks ", el("b", {}, dur(total("leisure"))))),
    el("div", { class: "muted" }, w.purposes
      ? `${w.purposes} aim${w.purposes > 1 ? "s" : ""} complete · found what you needed in ${w.found}`
      : "Completed aims show up here."));
}

function renderToday() {
  const t = st.today || { purpose: 0, leisure: 0, other: 0 };
  const S = st.settings;
  const line = (label, value) => el("div", { class: "row item" }, el("span", {}, label), el("span", { class: "muted" }, value));
  const all = t.purpose + t.leisure + t.other;
  document.getElementById("today").replaceChildren(
    line("On your aims", `${mins(t.purpose)} min`),
    line("Breaks", S.leisureMin ? `${mins(t.leisure)} of ${S.leisureMin} min` : `${mins(t.leisure)} min`),
    line("All YouTube", S.totalMin ? `${mins(all)} of ${S.totalMin} min` : `${mins(all)} min`));
}

// Strict mode's reasons, newest first: shown when there are any.
const REASON_LABEL = { "more-time": "More time", channel: "Warned channel", search: "Search", video: "Video" };
function renderReasons() {
  const list = st.reasons || [], box = document.getElementById("reasons");
  box.hidden = document.getElementById("reasonsHead").hidden = !list.length;
  box.replaceChildren(...list.map(r => el("div", { class: "item" },
    el("div", {}, `“${r.text}”`),
    el("div", { class: "muted" }, [REASON_LABEL[r.kind], r.detail, r.target ? `for ${r.target}` : null].filter(Boolean).join(" · ")))));
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
  if (!recent.length) { box.append(el("div", { class: "muted" }, "Completed aims and breaks show up here.")); return; }
  const OUT = { yes: "Found it", partly: "Partly", no: "Didn't find it" };
  for (const h of recent) {
    const videos = h.videos?.length ? `${h.videos.length} video${h.videos.length > 1 ? "s" : ""}` : null;
    box.append(el("div", { class: "item" },
      el("div", {}, h.type === "break" ? (h.oneVideo ? "Break: one video" : "Break") : h.path?.length > 1 ? h.path.map(p => p.text).join(" → ") : h.text),
      el("div", { class: "muted" }, [dur(Math.max(1, Math.round(h.usedSec / 60))), videos, h.outcome ? OUT[h.outcome] : null].filter(Boolean).join(" · "))));
  }
}

// The background may be waking up (or Aim was just reloaded): ask again before giving up.
async function sendRead(msg) {
  for (let i = 0; i < 3; i++) { const r = await send(msg); if (r) return r; await new Promise(res => setTimeout(res, 300 * (i + 1))); }
  return null;
}
async function render() {
  st = await sendRead({ type: "state" });
  if (!st) { document.getElementById("modes").replaceChildren(Object.assign(document.createElement("p"), { className: "muted", textContent: "Aim didn't answer. Close this and open it again." })); return; }
  renderModes();
  renderCurrent();
  renderWeek();
  renderToday();
  renderSaved();
  renderReasons();
  renderHistory();
}

document.getElementById("settings").addEventListener("click", () => chrome.runtime.openOptionsPage());
document.getElementById("limits").addEventListener("click", () => send({ type: "open-options", section: "advanced" }));
document.getElementById("record").addEventListener("click", () => send({ type: "open-record" }));
document.getElementById("plusPage").addEventListener("click", () => chrome.tabs.create({ url: chrome.runtime.getURL("plus.html") }));
// Only when this copy of Aim has a Plus server to talk to.
send({ type: "plus-brief" }).then(r => { document.getElementById("plusPage").hidden = !r?.configured; });
document.getElementById("clear").addEventListener("click", async () => {
  if (!confirm("Clear your history of aims and breaks?")) return;
  await send({ type: "history-clear" });
  render();
});
render();
send({ type: "theme", dark: matchMedia("(prefers-color-scheme: dark)").matches });
