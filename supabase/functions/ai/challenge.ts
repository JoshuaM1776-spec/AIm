// A challenge's shape (docs/SPEC.md §4, §8, §9): a specific, achievable outcome with a success
// condition decided up front, a short plan and, for hands-on ones, materials and safety. Each lesson on
// a learning plan is one (path.ts drafts them); this is its schema and its tidying. Each step is one
// way of learning (0.79): watch, read, try, explain, and last, show (the Final Challenge itself).
const CH_KINDS = ["understand", "build", "investigate"] as const;
export const STEP_DO = ["watch", "read", "try", "explain", "show"] as const;
// Trusted free sources a Read step can point at. Aim builds the search link; the AI never writes one.
export const READ_SOURCES = ["wikipedia", "openstax", "khan", "faa", "medlineplus", "gutenberg"] as const;
const CH_LEVELS = ["intro", "intermediate", "advanced"] as const;

const cObject = (x: unknown): Record<string, unknown> => (x && typeof x === "object" && !Array.isArray(x) ? x as Record<string, unknown> : {});
const cText = (x: unknown, max: number) => (typeof x === "string" ? x.replace(/\s+/g, " ").trim().slice(0, max) : "");
const cList = (x: unknown) => (Array.isArray(x) ? x : []);
const cOne = <T extends string>(x: unknown, list: readonly T[], d: T): T => (list.includes(x as T) ? x as T : d);

const STEP = { type: "object", properties: { do: { type: "string", enum: [...STEP_DO] }, title: { type: "string" }, look: { type: "string" }, minutes: { type: "integer" },
    search: { type: "string" }, source: { type: "string", enum: [...READ_SOURCES, "none"] }, guess: { type: "string" } },
  required: ["do", "title", "look", "minutes", "search", "source", "guess"], additionalProperties: false };
export const CHALLENGE_ONE = {
  type: "object",
  properties: {
    title: { type: "string" }, kind: { type: "string", enum: [...CH_KINDS] }, minutes: { type: "integer" }, difficulty: { type: "string", enum: [...CH_LEVELS] },
    why: { type: "string" }, success: { type: "string" }, plan: { type: "array", items: STEP },
    materials: { type: "array", items: { type: "object", properties: { item: { type: "string" }, required: { type: "boolean" } }, required: ["item", "required"], additionalProperties: false } },
    safety: { type: "string" }
  },
  required: ["title", "kind", "minutes", "difficulty", "why", "success", "plan", "materials", "safety"],
  additionalProperties: false
};

// One challenge, tidied and bounded; null when it isn't usable.
export function tidyChallenge(x: unknown, minutes: number) {
  const o = cObject(x), title = cText(o.title, 100), success = cText(o.success, 220);
  if (title.length < 6 || success.length < 10) return null;
  const kind = cOne(o.kind, CH_KINDS, "understand");
  const raw = cList(o.plan).map(s => cObject(s)).filter(st => cText(st.title, 60)).slice(0, 6);
  const plan = raw.map((st, i) => {
    const search = cText(st.search, 150);
    // Older plans have no "do": a step with a search is a video, and the last without one is the challenge.
    let d = cOne(st.do, STEP_DO, search ? "watch" : i === raw.length - 1 ? "show" : "try");
    if ((d === "watch" || d === "read") && !search) d = "try"; // nothing to find without a search
    if (d === "show" && i !== raw.length - 1) d = "explain"; // the challenge comes last
    return { do: d, title: cText(st.title, 60), look: cText(st.look, 200), minutes: Math.max(1, Math.min(60, Math.round(Number(st.minutes) || 5))),
      search: d === "watch" || d === "read" ? search : "", source: d === "read" ? cOne(st.source, READ_SOURCES, "wikipedia") : "",
      guess: d === "watch" ? cText(st.guess, 140) : "" };
  }).slice(0, 5);
  if (plan.length < 2 || !plan.some(s => s.do === "watch" || s.do === "read")) return null;
  return {
    title, kind, success, plan,
    minutes: Math.max(5, Math.min(minutes, Math.round(Number(o.minutes) || minutes))),
    difficulty: cOne(o.difficulty, CH_LEVELS, "intro"),
    why: cText(o.why, 160),
    materials: kind === "build" ? cList(o.materials).map(m => { const mo = cObject(m); return { item: cText(mo.item, 80), required: mo.required !== false }; }).filter(m => m.item).slice(0, 6) : [],
    safety: cText(o.safety, 200)
  };
}
