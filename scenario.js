// Aim — Scenarios (Aim Plus): work a situation as it unfolds, from your own references. The page
// keeps the scenario (in this tab only) and sends it to Aim's server each turn with the passages
// that matter; the server keeps nothing (supabase/functions/ai/scenario.ts). A finished scenario's
// debrief is kept with its aim.

const BRAND = chrome.runtime.getManifest().name;
for (const n of document.querySelectorAll("[data-brand]")) n.textContent = BRAND;
const params = new URLSearchParams(location.search);
const aimId = params.get("aim") || "";
const send = msg => chrome.runtime.sendMessage(msg).catch(() => null);
const $ = id => document.getElementById(id);
function node(tag, props = {}, ...kids) {
  const n = Object.assign(document.createElement(tag), props);
  n.append(...kids.flat().filter(k => k != null && k !== false));
  return n;
}
const btn = (label, cls, onclick) => node("button", { className: `btn ${cls}`.trim(), type: "button", textContent: label, onclick });
function toast(msg) {
  const t = $("toast"); t.textContent = msg; t.style.display = "block";
  clearTimeout(toast.timer); toast.timer = setTimeout(() => (t.style.display = "none"), 3000);
}
const page = (...kids) => $("page").replaceChildren(...kids);
// The fields scenarios fit: what to call things, the levels, and the safety line.
const FIELDS = {
  medical: { name: "Medical (EMS, nursing)", levels: ["EMR", "EMT", "AEMT", "Paramedic", "Nursing", "Other"], region: "Agency or region", regionHint: "e.g. Region 5",
    placeholder: "e.g. Anaphylaxis at a picnic; an opioid overdose", act: "e.g. \"Check her airway and listen to lung sounds\"", start: "Dispatch is calling…", refsWord: "protocols",
    safety: ["Practice for learning, not guidance for patient care.", "Medications and doses come only from your references, and any dose that isn't in them is left out. For real patients, follow your current protocols and medical direction."] },
  aviation: { name: "Aviation (in-flight emergencies)", levels: ["Student pilot", "Private pilot", "Instrument rated", "Commercial pilot", "Flight instructor", "Airline pilot", "Other"],
    region: "Aircraft", regionHint: "e.g. Cessna 172S", placeholder: "e.g. Engine failure after takeoff; an electrical fire at night", act: "e.g. \"Pitch for best glide and pick a field\"",
    start: "Climbing out…", refsWord: "POH and checklists",
    safety: ["Practice for learning, not flight instruction.", "Procedure speeds and limits come only from your POH and checklists; any that aren't in them are left out. In the airplane, follow your POH, your checklists and your instructor."] },
  general: { name: "Another emergency or incident", levels: [], region: "Agency or setting", regionHint: "e.g. volunteer fire company",
    placeholder: "e.g. A capsized kayak in cold water; a ransomware alert at 2 a.m.", act: "e.g. \"Size up the scene and call it in\"", start: "Setting the scene…", refsWord: "procedures",
    safety: ["Practice for learning, not real-world guidance.", "Procedures and amounts come only from your references. In a real situation, follow your training, your procedures and the people in charge."] }
};
const KEY = `scenario:${aimId}`;

// The scenario in progress, kept in this tab so a reload doesn't lose it.
let s = null;
const save = () => { try { sessionStorage.setItem(KEY, JSON.stringify(s)); } catch {} };
const load = () => { try { return JSON.parse(sessionStorage.getItem(KEY) || "null"); } catch { return null; } };

async function call(input) {
  let r;
  try { r = await chrome.runtime.sendMessage({ type: "plus-call", task: "scenario-turn", input }); }
  catch { r = { error: "Aim was updated or reloaded. Reload this page." }; }
  if (r && !r.error) return r;
  if (r?.code === "auth" || r?.code === "plan") { gate(); return null; }
  toast(r?.error || "Something went wrong. Try again.");
  return null;
}

async function gate() {
  const st = await send({ type: "plus-status" });
  page(node("section", { className: "card" }, node("h2", { textContent: "Scenarios are part of Aim Plus" }),
    node("p", { className: "muted", textContent: !st?.configured ? "Scenarios aren't available in this version of Aim."
      : !st?.signedIn ? `Sign in to ${BRAND} Plus in Settings to run scenarios.` : `Scenarios are part of ${BRAND} Plus. Your references stay yours either way.` }),
    st?.configured ? node("div", { className: "row" }, btn("Open Settings", "", () => chrome.runtime.openOptionsPage())) : null));
}

// ---------- passages from your references ----------
// The passages that matter for what's happening now, and everything seen so far (for the citation chips).
async function passagesFor(about, maxChars) {
  const r = await send({ type: "ref-excerpts", ids: s.refIds, about, maxChars });
  for (const p of r?.passages || []) s.seen[p.cite] = { ref: p.ref, heading: p.heading, text: p.text };
  return { refs: r?.refs || [], passages: (r?.passages || []).map(p => ({ cite: p.cite, heading: p.heading, text: p.text })) };
}

// Text with [R1.4] citations as chips that open the passage underneath.
function withCites(text, holder) {
  const out = [];
  let last = 0;
  for (const m of text.matchAll(/\[(R\d{1,2}(?:\.\d{1,4})?)\]/g)) {
    out.push(text.slice(last, m.index));
    const cite = m[1], p = s.seen[cite];
    out.push(node("button", { className: "cite", type: "button", textContent: cite, title: p ? `${p.ref}${p.heading ? ` · ${p.heading}` : ""}` : "Your references",
      onclick: () => {
        const open = holder.querySelector(`.passage[data-cite="${cite}"]`);
        if (open) return open.remove();
        const box = node("div", { className: "passage", textContent: p ? `${p.ref}${p.heading ? ` · ${p.heading}` : ""}\n${p.text}` : "This passage isn't loaded any more." });
        box.setAttribute("data-cite", cite);
        holder.append(box);
      } }));
    last = m.index + m[0].length;
  }
  out.push(text.slice(last));
  return out;
}

// ---------- the monitor ----------
// One beat of ECG on a 100-wide strip: baseline, P, QRS, T.
const BEAT = "l18 0 q3 -6 6 0 l5 0 l2 4 l3 -30 l3 36 l2 -10 l6 0 q5 -9 10 0 l45 0";
function trace(color, hr, kind) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 800 54"); svg.setAttribute("preserveAspectRatio", "none"); svg.setAttribute("aria-hidden", "true");
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  const beat = kind === "pleth" ? "l20 0 q8 -24 18 -20 q6 2 8 8 q4 -4 8 0 q10 10 46 12" : BEAT;
  path.setAttribute("d", hr > 0 ? `M0 34 ${Array(8).fill(beat).join(" ")}` : "M0 34 L800 34");
  for (const [k, v] of Object.entries({ fill: "none", stroke: color, "stroke-width": "1.6", "stroke-linejoin": "round", "vector-effect": "non-scaling-stroke" })) path.setAttribute(k, v);
  svg.append(path);
  // Eight beats on a strip twice the width: half of it (four beats) passes at the patient's rate.
  const box = node("div", { className: `trace${hr > 0 ? "" : " off"}` }, svg);
  if (hr > 0) box.style.setProperty("--dur", `${(4 * 60 / hr).toFixed(2)}s`);
  return box;
}
function monitor(v, prev = {}) {
  const val = x => (x >= 0 ? String(x) : "--");
  const num = (cls, label, value, changed) => node("div", { className: `num ${cls}${changed ? " changed" : ""}` }, node("span", { textContent: label }), node("b", { textContent: value }));
  const ch = k => prev[k] !== undefined && prev[k] !== v[k];
  return node("aside", { className: "monitor", ariaLabel: "Patient monitor" },
    trace("#4ade80", v.hr, "ecg"), trace("#38bdf8", v.spo2 >= 0 ? v.hr : -1, "pleth"),
    node("div", { className: "nums" },
      num("hr", "HR", val(v.hr), ch("hr")), num("spo2", "SpO₂ %", val(v.spo2), ch("spo2")),
      num("bp", "BP", v.sbp >= 0 ? `${v.sbp}/${v.dbp >= 0 ? v.dbp : "--"}` : "--/--", ch("sbp") || ch("dbp")), num("rr", "Resp", val(v.rr), ch("rr")),
      num("etco2", "EtCO₂", val(v.etco2), ch("etco2")), num("gcs", "GCS", val(v.gcs), ch("gcs")),
      num("bgl", "Glucose", val(v.glucose), ch("glucose")), num("gcs", "Actions", String(s.thread.filter(t => t.role === "you").length), false),
      v.rhythm ? num("wide hr", "Rhythm", v.rhythm, ch("rhythm")) : null,
      v.skin ? num("wide gcs", "Skin", v.skin, ch("skin")) : null));
}

// ---------- the instrument panel (aviation) ----------
// A round gauge: a needle over a 270° scale, the value in the middle; no needle when it's unknown.
function dial(label, value, min, max, text, color = "#e5e7eb") {
  const NS = "http://www.w3.org/2000/svg", svg = document.createElementNS(NS, "svg");
  svg.setAttribute("viewBox", "0 0 100 100"); svg.setAttribute("class", "dial"); svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", `${label}: ${value === -1 ? "unknown" : text}`);
  const add = (tag, attrs) => { const n = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v); svg.append(n); return n; };
  add("circle", { cx: 50, cy: 50, r: 46, fill: "#111815", stroke: "#2b3a33", "stroke-width": 2 });
  for (let i = 0; i <= 10; i++) {
    const a = (-225 + i * 27) * Math.PI / 180, r1 = i % 5 ? 38 : 34;
    add("line", { x1: 50 + Math.cos(a) * r1, y1: 50 + Math.sin(a) * r1, x2: 50 + Math.cos(a) * 42, y2: 50 + Math.sin(a) * 42, stroke: "#9aa", "stroke-width": i % 5 ? 1 : 2 });
  }
  if (value !== -1) {
    const t = Math.max(0, Math.min(1, (value - min) / (max - min))), a = (-225 + t * 270) * Math.PI / 180;
    add("line", { x1: 50, y1: 50, x2: 50 + Math.cos(a) * 36, y2: 50 + Math.sin(a) * 36, stroke: color, "stroke-width": 3, "stroke-linecap": "round" });
  }
  add("circle", { cx: 50, cy: 50, r: 3, fill: color });
  const tx = add("text", { x: 50, y: 72, "text-anchor": "middle", fill: color, "font-size": 13, "font-weight": 600 }); tx.textContent = value === -1 ? "--" : text;
  const lb = add("text", { x: 50, y: 88, "text-anchor": "middle", fill: "#9aa", "font-size": 7.5, "letter-spacing": ".5" }); lb.textContent = label;
  return svg;
}
// An engine gauge: a bar with the value.
function bar(label, value, max, unit) {
  return node("div", { className: "eng" }, node("span", { textContent: label }),
    node("i", {}, node("b", { style: `width:${value === -1 ? 0 : Math.max(0, Math.min(100, value / max * 100))}%` })),
    node("em", { textContent: value === -1 ? "--" : `${value}${unit}` }));
}
function panel(v, prev = {}) {
  const ch = k => prev[k] !== undefined && prev[k] !== v[k];
  const fmt = n => (n === -1 ? "--" : n.toLocaleString());
  return node("aside", { className: "monitor panel", ariaLabel: "Instrument panel" },
    v.annunciator ? node("div", { className: `annunciator${ch("annunciator") ? " changed" : ""}`, role: "alert", textContent: v.annunciator }) : null,
    node("div", { className: "dials" },
      dial("AIRSPEED", v.ias, 0, 200, `${fmt(v.ias)} kt`, "#4ade80"),
      dial("ALTITUDE", v.alt === -1 ? -1 : v.alt % 1000, 0, 1000, `${fmt(v.alt)} ft`, "#e5e7eb"),
      dial("VERT SPEED", v.vsi, -2000, 2000, `${v.vsi > 0 ? "+" : ""}${fmt(v.vsi)}`, v.vsi < -1000 ? "#f87171" : "#e5e7eb"),
      dial("HEADING", v.hdg, 0, 360, v.hdg === -1 ? "--" : `${String(v.hdg).padStart(3, "0")}°`, "#facc15")),
    node("div", { className: "engine" },
      bar("RPM", v.rpm, 3000, ""), bar("Oil press", v.oilp, 115, " psi"), bar("Oil temp", v.oilt, 250, "°F"),
      bar("Fuel", v.fuel, 60, " gal"), bar("Volts", v.volts, 32, " V")),
    node("div", { className: "num gcs" }, node("span", { textContent: "Actions" }), node("b", { textContent: String(s.thread.filter(t => t.role === "you").length) })));
}

// ---------- the situation board (other fields) ----------
function board(v, prev = {}) {
  const ch = k => prev[k] !== undefined && prev[k] !== v[k];
  return node("aside", { className: "monitor board", ariaLabel: "Situation board" },
    node("div", { className: `sev sev-${v.severity || "none"}${ch("severity") ? " changed" : ""}` }, node("span", { textContent: "Situation" }), node("b", { textContent: v.severity || "unknown" })),
    node("div", { className: "nums" },
      node("div", { className: "num gcs" }, node("span", { textContent: "Elapsed" }), node("b", { textContent: v.elapsed >= 0 ? `${v.elapsed} min` : "--" })),
      node("div", { className: "num gcs" }, node("span", { textContent: "Actions" }), node("b", { textContent: String(s.thread.filter(t => t.role === "you").length) })),
      v.status ? node("div", { className: `num wide gcs${ch("status") ? " changed" : ""}` }, node("span", { textContent: "Now" }), node("b", { textContent: v.status })) : null));
}

// ---------- setup ----------
let aim = null;
function safety(field) {
  const f = FIELDS[field] || FIELDS.medical;
  document.querySelector(".safety span:last-child").replaceChildren(node("b", { textContent: f.safety[0] }), ` ${f.safety[1]}`);
}
async function setup() {
  const refs = await send({ type: "ref-list" });
  let field = params.get("field") || aim?.scenarioDomain || "medical";
  const list = refs || [];
  const topic = node("input", { type: "text", value: aim?.text || "", ariaLabel: "What the scenario is about" });
  const fieldSel = node("select", { ariaLabel: "Field" }, ...Object.entries(FIELDS).map(([k, f]) => node("option", { value: k, textContent: f.name, selected: k === field })));
  const levelBox = node("span"), regionLabel = node("span");
  const region = node("input", { type: "text", value: list.find(r => r.region)?.region || "" });
  let level;
  const fit = () => {
    const f = FIELDS[field];
    safety(field);
    topic.placeholder = f.placeholder;
    regionLabel.textContent = f.region; region.placeholder = f.regionHint;
    const want = list.find(r => r.level && f.levels.includes(r.level))?.level || f.levels[1] || "";
    level = f.levels.length ? node("select", { ariaLabel: "Your level" }, ...f.levels.map(l => node("option", { value: l, textContent: l, selected: l === want })))
      : node("input", { type: "text", placeholder: "e.g. firefighter, incident responder (optional)", ariaLabel: "Your role or level" });
    levelBox.replaceChildren(level);
    refsNote.textContent = list.length ? "" : `No references yet. Without your ${f.refsWord}, the scenario runs on judgment and reasoning, and leaves numbers like doses and speeds out.`;
  };
  fieldSel.onchange = () => { field = fieldSel.value; fit(); };
  const checks = list.map(r => node("input", { type: "checkbox", checked: true, value: r.id }));
  const refsNote = node("p", { className: "muted" });
  page(node("section", { className: "card setup" },
    node("h2", { textContent: "Set up a scenario" }),
    node("p", { className: "muted", textContent: "You'll get the situation as it starts and say what you do. Things respond, the readings change, and at the end you get a debrief: what was happening, why, and what counteracted it." }),
    node("label", {}, "What it's about", topic),
    node("label", {}, "Field", fieldSel),
    node("label", {}, "Your level", levelBox),
    node("label", {}, regionLabel, region),
    node("div", { className: "refs" }, node("b", { textContent: "From your references" }),
      list.map((r, i) => node("label", {}, checks[i], `${r.name}${r.level ? ` (${r.level})` : ""}`)), refsNote,
      node("p", {}, node("a", { href: "references.html", textContent: list.length ? "Manage your references" : "Add your references" }))),
    node("div", { className: "row", style: "margin-top:14px" }, btn("Start the call", "accent", async e => {
      if (topic.value.trim().length < 3) return toast("Say what the scenario should be about.");
      e.target.disabled = true; e.target.textContent = FIELDS[field].start;
      s = { field, topic: topic.value.trim(), level: level.value.trim(), region: region.value.trim(), refIds: checks.filter(c => c.checked).map(c => c.value), thread: [], readings: {}, seen: {}, removed: 0 };
      const { refs: cited, passages } = await passagesFor(s.topic, 12000);
      s.refs = cited;
      const r = await call({ domain: s.field, topic: s.topic, level: s.level, region: s.region, refs: s.refs, passages });
      if (!r) { e.target.disabled = false; e.target.textContent = "Start the call"; return; }
      Object.assign(s, { title: r.title, dispatch: r.dispatch, readings: r.readings || r.vitals || {}, removed: r.removedDoses || 0 });
      s.thread.push({ role: "aim", text: r.message });
      save(); running();
    }))));
  fit();
}

// ---------- the call ----------
function running(prev) {
  $("title").textContent = s.title || "Scenario";
  const feed = node("div", { className: "feed" },
    s.dispatch ? node("div", { className: "msg dispatch" }, node("span", { className: "tag", textContent: s.field === "medical" || !s.field ? "Dispatch" : "The situation" }), s.dispatch) : null,
    s.thread.map(t => { const m = node("div", { className: `msg ${t.role}` }); m.append(...withCites(t.text, m)); return m; }));
  const box = node("textarea", { placeholder: `What do you do? (${(FIELDS[s.field] || FIELDS.medical).act})`, ariaLabel: "What you do" });
  const busy = on => { for (const b of act.querySelectorAll("button")) b.disabled = on; box.disabled = on; };
  const turn = async input => {
    busy(true);
    const last = s.thread[s.thread.length - 1]?.text || "";
    const { passages } = await passagesFor(`${s.topic} ${s.title || ""} ${input.action || ""} ${last}`, 6000);
    // This turn's passages first, then the ones from the start, within the server's limit.
    const all = [...new Map([...passages, ...Object.entries(s.seen).map(([cite, p]) => ({ cite, heading: p.heading, text: p.text }))].map(p => [p.cite, p])).values()];
    const r = await call({ domain: s.field, topic: s.topic, level: s.level, region: s.region, refs: s.refs, passages: all.slice(0, 30), thread: s.thread, readings: s.readings, ...input });
    if (!r) return busy(false);
    if (input.action) s.thread.push({ role: "you", text: input.action });
    s.thread.push({ role: "aim", text: r.message });
    const before = s.readings;
    s.readings = r.readings || r.vitals || {}; s.removed += r.removedDoses || 0;
    if (r.done) { s.debrief = r.debrief; save(); return finish(); }
    save(); running(before);
  };
  const act = node("div", { className: "act" }, box, node("div", { className: "row" },
    btn("Do it", "", () => { const a = box.value.trim(); if (!a) return box.focus(); turn({ action: a }); }),
    btn("I'm stuck", "tonal", () => turn({ hint: true })),
    btn("End and debrief", "text", () => turn({ end: true }))));
  box.addEventListener("keydown", e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); act.querySelector("button").click(); } });
  safety(s.field);
  const show = s.field === "aviation" ? panel : s.field === "general" ? board : monitor;
  page(node("div", { className: "run" }, show(s.readings, prev), node("div", { style: "display:flex;flex-direction:column;gap:14px" }, feed, act)));
  box.focus();
  act.scrollIntoView({ block: "nearest" });
}

// ---------- the debrief ----------
async function finish() {
  const b = s.debrief || {};
  if (aimId && !s.saved) {
    await send({ type: "scenario-save", aimId, scenario: { title: s.title, field: s.field, level: s.level, actions: s.thread.filter(t => t.role === "you").length, debrief: b } });
    s.saved = true; save();
  }
  const card = (title, text) => { const c = node("section", { className: "card" }, node("h3", { textContent: title })); const p = node("p"); p.append(...withCites(text || "", c)); c.append(p); return c; };
  const listCard = (title, items, empty) => { const c = node("section", { className: "card" }, node("h3", { textContent: title })); const ul = node("ul");
    ul.append(...(items || []).map(x => { const li = node("li"); li.append(...withCites(x, c)); return li; })); c.append(items?.length ? ul : node("p", { className: "muted", textContent: empty })); return c; };
  const last = s.thread[s.thread.length - 1];
  page(
    last ? node("div", { className: "msg", style: "margin-bottom:14px" }, node("span", { className: "tag", textContent: "How it ended" }), last.text) : null,
    node("h2", { className: "serif", textContent: "Debrief" }),
    node("div", { className: "debrief" },
      card("What was happening", b.happening), card("Why", b.why), card("What counteracts it", b.counteracted),
      node("div", { className: "two" }, listCard("What you did well", b.well, "Nothing noted."), listCard("To work on", b.missed, "Nothing missed."))),
    b.why ? node("section", { className: "card", style: "margin-top:12px" }, node("h3", { textContent: "Go deeper" }),
      node("p", { className: "muted", textContent: "Follow the why down a level at a time: what's happening there, why, and what counteracts it." }),
      deeperLadder({ aimId, topic: s.topic, domain: s.field, level: s.level, root: (b.happening || s.title).slice(0, 200), brief: b.why.slice(0, 300), partId: null, chain: null, talk: null })) : null,
    s.removed ? node("p", { className: "removed", textContent: `Aim left out ${s.removed} ${s.field === "medical" ? "dose" : "number"}${s.removed > 1 ? "s" : ""} that ${s.removed > 1 ? "aren't" : "isn't"} in your references. Look ${s.removed > 1 ? "them" : "it"} up in your ${s.field === "aviation" ? "POH" : s.field === "medical" ? "protocol" : "reference"}.` }) : null,
    node("div", { className: "row", style: "margin-top:16px;gap:8px" },
      btn("Run another", "", () => { try { sessionStorage.removeItem(KEY); } catch {} s = null; $("title").textContent = "Scenario"; setup(); }),
      aimId ? btn("Back to the aim", "tonal", () => (location.href = `aim.html?id=${encodeURIComponent(aimId)}`)) : null));
}

(async () => {
  const d = aimId ? await send({ type: "aim-get", id: aimId }) : null;
  aim = d?.aim || null;
  if (aim) { $("aimLink").textContent = aim.text; $("aimLink").href = `aim.html?id=${encodeURIComponent(aimId)}`; } else $("aimCrumb").remove();
  s = load();
  if (s) { s.field ||= "medical"; s.readings ||= s.vitals || {}; }
  if (s?.debrief) finish(); else if (s?.thread?.length) running(); else setup();
})();
