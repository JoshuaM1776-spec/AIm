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
const LEVELS = ["EMR", "EMT", "AEMT", "Paramedic", "Nursing", "Other"];
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

// ---------- setup ----------
let aim = null;
async function setup() {
  const refs = await send({ type: "ref-list" });
  const list = refs || [];
  const topic = node("input", { type: "text", value: aim?.text || "", placeholder: "e.g. Anaphylaxis at a picnic; an opioid overdose", ariaLabel: "What the scenario is about" });
  const level = node("select", { ariaLabel: "Your level" }, ...LEVELS.map(l => node("option", { value: l, textContent: l, selected: l === (list.find(r => r.level)?.level || "EMT") })));
  const checks = list.map(r => node("input", { type: "checkbox", checked: true, value: r.id }));
  page(node("section", { className: "card setup" },
    node("h2", { textContent: "Set up a scenario" }),
    node("p", { className: "muted", textContent: "You'll get a call, arrive on scene, and say what you do. The patient responds, the monitor changes, and at the end you get a debrief: what was happening, why, and what counteracted it." }),
    node("label", {}, "What it's about", topic),
    node("label", {}, "Your level", level),
    node("div", { className: "refs" }, node("b", { textContent: "From your references" }),
      list.length ? list.map((r, i) => node("label", {}, checks[i], `${r.name}${r.level ? ` (${r.level})` : ""}`))
        : node("p", { className: "muted", textContent: "No references yet. Without them, the scenario runs on assessment and reasoning, and leaves doses out." }),
      node("p", {}, node("a", { href: "references.html", textContent: list.length ? "Manage your references" : "Add your protocols" }))),
    node("div", { className: "row", style: "margin-top:14px" }, btn("Start the call", "accent", async e => {
      if (topic.value.trim().length < 3) return toast("Say what the scenario should be about.");
      e.target.disabled = true; e.target.textContent = "Dispatch is calling…";
      s = { topic: topic.value.trim(), level: level.value, refIds: checks.filter(c => c.checked).map(c => c.value), thread: [], vitals: {}, seen: {}, removed: 0 };
      const { refs: cited, passages } = await passagesFor(s.topic, 12000);
      s.refs = cited;
      s.region = list.find(r => s.refIds.includes(r.id) && r.region)?.region || "";
      const r = await call({ topic: s.topic, level: s.level, region: s.region, refs: s.refs, passages });
      if (!r) { e.target.disabled = false; e.target.textContent = "Start the call"; return; }
      Object.assign(s, { title: r.title, dispatch: r.dispatch, vitals: r.vitals, removed: r.removedDoses || 0 });
      s.thread.push({ role: "aim", text: r.message });
      save(); running();
    }))));
}

// ---------- the call ----------
function running(prev) {
  $("title").textContent = s.title || "Scenario";
  const feed = node("div", { className: "feed" },
    s.dispatch ? node("div", { className: "msg dispatch" }, node("span", { className: "tag", textContent: "Dispatch" }), s.dispatch) : null,
    s.thread.map(t => { const m = node("div", { className: `msg ${t.role}` }); m.append(...withCites(t.text, m)); return m; }));
  const box = node("textarea", { placeholder: "What do you do? (e.g. \"Check her airway and listen to lung sounds\")", ariaLabel: "What you do" });
  const busy = on => { for (const b of act.querySelectorAll("button")) b.disabled = on; box.disabled = on; };
  const turn = async input => {
    busy(true);
    const last = s.thread[s.thread.length - 1]?.text || "";
    const { passages } = await passagesFor(`${s.topic} ${s.title || ""} ${input.action || ""} ${last}`, 6000);
    // This turn's passages first, then the ones from the start, within the server's limit.
    const all = [...new Map([...passages, ...Object.entries(s.seen).map(([cite, p]) => ({ cite, heading: p.heading, text: p.text }))].map(p => [p.cite, p])).values()];
    const r = await call({ topic: s.topic, level: s.level, region: s.region, refs: s.refs, passages: all.slice(0, 30), thread: s.thread, vitals: s.vitals, ...input });
    if (!r) return busy(false);
    if (input.action) s.thread.push({ role: "you", text: input.action });
    s.thread.push({ role: "aim", text: r.message });
    const before = s.vitals;
    s.vitals = r.vitals; s.removed += r.removedDoses || 0;
    if (r.done) { s.debrief = r.debrief; save(); return finish(); }
    save(); running(before);
  };
  const act = node("div", { className: "act" }, box, node("div", { className: "row" },
    btn("Do it", "", () => { const a = box.value.trim(); if (!a) return box.focus(); turn({ action: a }); }),
    btn("I'm stuck", "tonal", () => turn({ hint: true })),
    btn("End and debrief", "text", () => turn({ end: true }))));
  box.addEventListener("keydown", e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); act.querySelector("button").click(); } });
  page(node("div", { className: "run" }, monitor(s.vitals, prev), node("div", { style: "display:flex;flex-direction:column;gap:14px" }, feed, act)));
  box.focus();
  act.scrollIntoView({ block: "nearest" });
}

// ---------- the debrief ----------
async function finish() {
  const b = s.debrief || {};
  if (aimId && !s.saved) {
    await send({ type: "scenario-save", aimId, scenario: { title: s.title, level: s.level, actions: s.thread.filter(t => t.role === "you").length, debrief: b } });
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
    s.removed ? node("p", { className: "removed", textContent: `Aim left out ${s.removed} dose${s.removed > 1 ? "s" : ""} that ${s.removed > 1 ? "aren't" : "isn't"} in your references. Look ${s.removed > 1 ? "them" : "it"} up in your protocol.` }) : null,
    node("div", { className: "row", style: "margin-top:16px;gap:8px" },
      btn("Run another", "", () => { try { sessionStorage.removeItem(KEY); } catch {} s = null; $("title").textContent = "Scenario"; setup(); }),
      aimId ? btn("Back to the aim", "tonal", () => (location.href = `aim.html?id=${encodeURIComponent(aimId)}`)) : null));
}

(async () => {
  const d = aimId ? await send({ type: "aim-get", id: aimId }) : null;
  aim = d?.aim || null;
  if (aim) { $("aimLink").textContent = aim.text; $("aimLink").href = `aim.html?id=${encodeURIComponent(aimId)}`; }
  s = load();
  if (s?.debrief) finish(); else if (s?.thread?.length) running(); else setup();
})();
