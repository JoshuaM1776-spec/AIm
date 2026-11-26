// A challenge's shape (docs/SPEC.md §4, §8, §9): a specific, achievable outcome with a success
// condition decided up front, a short plan and, for hands-on ones, materials and safety. Each lesson on
// a learning plan is one (path.ts drafts them); this is its schema and its tidying.
const CH_KINDS = ["understand", "build", "investigate"] as const;
const CH_LEVELS = ["intro", "intermediate", "advanced"] as const;

const cObject = (x: unknown): Record<string, unknown> => (x && typeof x === "object" && !Array.isArray(x) ? x as Record<string, unknown> : {});
const cText = (x: unknown, max: number) => (typeof x === "string" ? x.replace(/\s+/g, " ").trim().slice(0, max) : "");
const cList = (x: unknown) => (Array.isArray(x) ? x : []);
const cOne = <T extends string>(x: unknown, list: readonly T[], d: T): T => (list.includes(x as T) ? x as T : d);

const STEP = { type: "object", properties: { title: { type: "string" }, look: { type: "string" }, minutes: { type: "integer" }, search: { type: "string" }, guess: { type: "string" } },
  required: ["title", "look", "minutes", "search", "guess"], additionalProperties: false };
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
  const plan = cList(o.plan).map(s => {
    const st = cObject(s);
    return { title: cText(st.title, 60), look: cText(st.look, 160), minutes: Math.max(1, Math.min(60, Math.round(Number(st.minutes) || 5))), search: cText(st.search, 150), guess: cText(st.guess, 140) };
  }).filter(s => s.title).slice(0, 4);
  if (plan.length < 2) return null;
  return {
    title, kind, success, plan,
    minutes: Math.max(5, Math.min(minutes, Math.round(Number(o.minutes) || minutes))),
    difficulty: cOne(o.difficulty, CH_LEVELS, "intro"),
    why: cText(o.why, 160),
    materials: kind === "build" ? cList(o.materials).map(m => { const mo = cObject(m); return { item: cText(mo.item, 80), required: mo.required !== false }; }).filter(m => m.item).slice(0, 6) : [],
    safety: cText(o.safety, 200)
  };
}
