// Aim Homeschool, parent website — small helpers shared by the pages, and the family's data.

import { call, ApiError } from "./api.js";

export function h(tag, props = {}, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === "class") n.className = v;
    else if (k.startsWith("on") && typeof v === "function") n.addEventListener(k.slice(2), v);
    else if (k === "html") throw new Error("no html");
    else if (k in n && typeof v !== "string") n[k] = v;
    else n.setAttribute(k, v === true ? "" : v);
  }
  n.append(...kids.flat(Infinity).filter(k => k != null && k !== false).map(k => (k instanceof Node ? k : String(k))));
  return n;
}
export const btn = (label, cls, onclick, extra = {}) => h("button", { class: `btn ${cls || ""}`.trim(), type: "button", onclick, ...extra }, label);

// A short message. Errors stay until closed, so there's time to read (and copy) them.
export function toast(text, { error = false } = {}) {
  const t = document.getElementById("toast");
  t.classList.toggle("error", error);
  t.replaceChildren(h("span", {}, text), error ? h("button", { type: "button", class: "toast-x", "aria-label": "Close", onclick: () => (t.hidden = true) }, "✕") : "");
  t.hidden = false;
  clearTimeout(toast.timer);
  if (!error) toast.timer = setTimeout(() => (t.hidden = true), 3500);
}

// The family's data, from Aim's server, and which student the pages are about.
export const S = { home: null, learnerId: null };
export async function reload() {
  const r = await call("hs-home");
  S.home = r;
  if (!r.learners.some(l => l.id === S.learnerId)) S.learnerId = r.learners[0]?.id || null;
  return r;
}
export const learner = () => S.home?.learners.find(l => l.id === S.learnerId) || null;

// Runs a change on the server, then reloads and redraws. A conflict (changed in another tab) reloads.
export async function act(task, input, { done, quiet } = {}) {
  try {
    const r = await call(task, input);
    if (done) toast(done);
    await reload();
    window.dispatchEvent(new Event("aim:render"));
    return r;
  } catch (e) {
    if (e instanceof ApiError && e.code === "conflict") { await reload(); window.dispatchEvent(new Event("aim:render")); }
    if (!quiet) toast(e.message || "Something went wrong.", { error: true });
    throw e;
  }
}

// A button that shows it's working while its action runs.
export function busyBtn(label, cls, run, extra = {}) {
  const b = btn(label, cls, async () => {
    if (b.disabled) return;
    b.disabled = true;
    const was = b.textContent;
    b.textContent = extra.working || "Working…";
    try { await run(); } catch {} finally { if (b.isConnected) { b.disabled = false; b.textContent = was; } }
  }, extra.attrs || {});
  return b;
}

export const fmtDate = (iso, opts = { month: "short", day: "numeric" }) => new Date(iso + (iso.length === 10 ? "T12:00:00" : "")).toLocaleDateString(undefined, opts);
export const addDays = (date, n) => { const d = new Date(date + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
export const minutes = m => (m >= 60 ? `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ""}` : `${m} min`);
export const STATUS_WORDS = { demonstrated: "Demonstrated", developing: "Developing", needs_review: "Needs review", not_assessed: "Not assessed" };
export const KIND_WORDS = { video: "Video lesson", reading: "Reading", activity: "Activity", teachback: "TeachBack", project: "Project" };

// Suggested channels for a subject: Learn something's hand-picked, checked channels (shared/topics.js).
const SUBJECT_TOPICS = [[/scien|biolog|chemi|physic|earth/i, ["science", "space"]], [/math|algebra|geometr|calcul/i, ["math"]], [/histor|social stud/i, ["history"]],
  [/engineer|technolog|stem/i, ["engineering"]], [/cod|comput|program/i, ["coding"]], [/financ|econom|money/i, ["money"]], [/aviat|flight/i, ["aviation"]], [/space|astronom/i, ["space"]]];
export function suggestedChannels(subject) {
  const ids = SUBJECT_TOPICS.filter(([re]) => re.test(subject)).flatMap(([, t]) => t);
  const seen = new Set();
  return (typeof LEARN_TOPICS === "undefined" ? [] : LEARN_TOPICS).filter(t => ids.includes(t.id)).flatMap(t => t.channels)
    .filter(c => !seen.has(c.handle) && seen.add(c.handle)).slice(0, 5).map(c => ({ name: c.name, handle: c.handle, id: c.id || "" }));
}
// A channel link a parent pastes: youtube.com/@handle or /channel/UC… (the stable id).
export function parseChannel(text) {
  const t = String(text || "").trim();
  const id = t.match(/channel\/(UC[\w-]{22})/)?.[1] || (/^UC[\w-]{22}$/.test(t) ? t : "");
  const handle = t.match(/(@[\w.-]{1,60})/)?.[1] || "";
  return id || handle ? { id, handle, name: handle || id } : null;
}
