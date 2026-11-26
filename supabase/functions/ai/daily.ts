// The Daily Challenge (0.75): one challenge a day, the same for everyone, written for curious adults.
// Aim's server drafts a few days at a time; an editor (the owner, listed in AIM_DAILY_EDITORS) checks
// every one against its sources, edits it, and publishes it. Everyone, signed in or not, gets only the
// published challenge for the day they ask about. Each one: a real moment from history, a problem that
// takes reasoning rather than recall, three choices, an "explain why" for a right answer, a short video
// for a miss, then a second try that moves the same idea into today. Facts come with two sources.

import { type AiRequest, TaskError } from "./teachback.ts";

export interface DailyRow { day: string; status: "draft" | "published"; data: Record<string, unknown>; updatedAt?: string }
export interface DailyStore {
  list(from: string, to: string, publishedOnly: boolean): Promise<DailyRow[]>;
  save(day: string, status: "draft" | "published", data: Record<string, unknown>): Promise<void>;
  remove(day: string): Promise<void>;
}

// Seven areas, in turn, so the days range widely (docs/HOMESCHOOL.md's areas).
export const DAILY_AREAS = ["Math and logic", "Science and how things work", "History and civics", "Language and communication",
  "Practical life", "Arts and making", "People and character"] as const;
export const DAILY_LIMITS = { draftDays: 7, aheadDays: 60 };

const dyObj = (x: unknown): Record<string, unknown> => (x && typeof x === "object" && !Array.isArray(x) ? x as Record<string, unknown> : {});
const dyText = (x: unknown, max: number) => (typeof x === "string" ? x.replace(/\s+/g, " ").trim().slice(0, max) : "");
const dyList = (x: unknown) => (Array.isArray(x) ? x : []);
const isDay = (x: unknown): x is string => typeof x === "string" && /^\d{4}-\d{2}-\d{2}$/.test(x) && !Number.isNaN(Date.parse(`${x}T00:00:00Z`));
export const dayOf = (d: Date) => d.toISOString().slice(0, 10);
export const dayPlus = (day: string, n: number) => dayOf(new Date(Date.parse(`${day}T00:00:00Z`) + n * 864e5));
const safeUrl = (x: unknown) => { const u = dyText(x, 300); return /^https:\/\/[^\s"'<>]+$/.test(u) ? u : ""; };

// One question with three choices and the right one.
function tidyAsk(x: unknown) {
  const o = dyObj(x);
  const question = dyText(o.question, 300), choices = dyList(o.choices).map(c => dyText(c, 140)).filter(Boolean).slice(0, 3);
  const answer = Math.round(Number(o.answer));
  if (question.length < 8 || choices.length !== 3 || !(answer >= 0 && answer <= 2)) return null;
  return { question, choices, answer, why: dyText(o.why, 500) };
}

// A challenge, tidied and bounded; null when it isn't usable (an editor's save says why).
export function tidyDaily(x: unknown): Record<string, unknown> | null {
  const o = dyObj(x);
  const first = tidyAsk(o), second = tidyAsk(o.second);
  const title = dyText(o.title, 90), scene = dyText(o.scene, 600);
  if (!first || !second || title.length < 4 || scene.length < 20) return null;
  const area = DAILY_AREAS.includes(o.area as typeof DAILY_AREAS[number]) ? o.area as string : DAILY_AREAS[0];
  const plan = dyObj(o.plan);
  return {
    area, title, moment: dyText(o.moment, 80), scene, ...first,
    explain: dyText(o.explain, 200),
    learn: { search: dyText(dyObj(o.learn).search, 120), note: dyText(dyObj(o.learn).note, 200) },
    second,
    sources: dyList(o.sources).map(s => ({ title: dyText(dyObj(s).title, 140), url: safeUrl(dyObj(s).url) })).filter(s => s.title).slice(0, 4),
    plan: dyText(plan.interest, 60) ? { interest: dyText(plan.interest, 60), goal: dyText(plan.goal, 160) } : null
  };
}

const ASK = { type: "object", properties: { question: { type: "string" }, choices: { type: "array", items: { type: "string" } }, answer: { type: "integer" }, why: { type: "string" } },
  required: ["question", "choices", "answer", "why"], additionalProperties: false };
const DAILY_ONE = {
  type: "object",
  properties: {
    area: { type: "string", enum: [...DAILY_AREAS] }, title: { type: "string" }, moment: { type: "string" }, scene: { type: "string" },
    question: { type: "string" }, choices: { type: "array", items: { type: "string" } }, answer: { type: "integer" }, why: { type: "string" },
    explain: { type: "string" },
    learn: { type: "object", properties: { search: { type: "string" }, note: { type: "string" } }, required: ["search", "note"], additionalProperties: false },
    second: ASK,
    sources: { type: "array", items: { type: "object", properties: { title: { type: "string" }, url: { type: "string" } }, required: ["title", "url"], additionalProperties: false } },
    plan: { type: "object", properties: { interest: { type: "string" }, goal: { type: "string" } }, required: ["interest", "goal"], additionalProperties: false }
  },
  required: ["area", "title", "moment", "scene", "question", "choices", "answer", "why", "explain", "learn", "second", "sources", "plan"],
  additionalProperties: false
};
const DAILY_SCHEMA = { type: "object", properties: { days: { type: "array", items: DAILY_ONE } }, required: ["days"], additionalProperties: false };

const DAILY_SYSTEM = `You draft the Daily Challenge for Aim, which helps people learn on YouTube. Everyone gets the same one each day: curious adults with three to five minutes. An editor checks every draft against its sources before anyone sees it, so accuracy matters more than anything else.

Each challenge:
- Opens on a real moment from history: a time and place (moment, e.g. "AD 10, Rome"), then a short scene (2 to 4 sentences) that sets up a problem someone there faced.
- Asks one question that takes reasoning, not recall: estimate, work the numbers, spot the flaw, weigh two sources, or decide. Three choices (choices), exactly one right (answer: its index, 0 to 2). The wrong ones are the mistakes people really make, not jokes.
- why: what's right and why, in 1 to 3 plain sentences, so someone who missed it understands.
- explain: one short "explain why" question for someone who got it right, so a lucky guess doesn't count.
- learn: a YouTube search (search) for a short, good video on the idea, and what to look for in it (note).
- second: a second try on the same idea, moved into today's world (a bill, a recipe, a news claim, a phone plan), with its own three choices, answer and why. It tests the idea, not memory of the first answer.
- sources: two sources a careful editor can check every fact against: reputable and findable (an encyclopedia, a textbook such as OpenStax, a government or museum page, a university page), with their real URLs. Never invent a source, quote, number or event. If you aren't sure of a detail, choose a different moment.
- plan: a natural interest and goal for someone this sparks, for "Want a plan for this?" (e.g. interest "Ancient Rome", goal "Explain how the Roman Republic kept power from one man").
- title: under 60 characters, the problem as a hook ("The inheritance tax"), not a lesson name.

Fit the AREA given for each day. Keep it fun: a real problem, a little surprise, no trick questions. Nothing to act on for health, money, law or flying (understanding only). On contested questions, ask about evidence, never which side is right. Each day different from the others and from RECENT.`;

// The editors' tasks. The handler checks the account is an editor before any of these run.
export async function dailyDraft(ctx: { input: unknown; now: Date; daily: DailyStore; ai(task: string, req: AiRequest): Promise<string> }) {
  const input = dyObj(ctx.input), today = dayOf(ctx.now);
  const from = isDay(input.from) ? input.from : dayPlus(today, 1);
  const n = Math.max(1, Math.min(DAILY_LIMITS.draftDays, Math.round(Number(input.days) || DAILY_LIMITS.draftDays)));
  if (from < today || from > dayPlus(today, DAILY_LIMITS.aheadDays)) throw new TaskError(400, "input", "Pick a day from today to two months ahead.");
  const only = isDay(input.day) ? input.day : null; // redraft one day
  const days = only ? [only] : Array.from({ length: n }, (_, i) => dayPlus(from, i));
  const existing = await ctx.daily.list(dayPlus(days[0], -30), days[days.length - 1], false);
  const taken = new Set(existing.map(r => r.day));
  const todo = only ? days : days.filter(d => !taken.has(d)); // never overwrite: redraft is one day, on purpose
  if (!todo.length) return { drafted: [] };
  if (only && existing.some(r => r.day === only && r.status === "published")) throw new TaskError(409, "published", "That day is published. Unpublish it first.");
  const recent = existing.filter(r => !todo.includes(r.day)).map(r => dyText(r.data.title, 90)).filter(Boolean).slice(-20);
  const areaOf = (day: string) => DAILY_AREAS[Math.floor(Date.parse(`${day}T00:00:00Z`) / 864e5) % DAILY_AREAS.length];
  const prompt = `${todo.map((d, i) => `DAY ${i + 1}: ${d} · AREA: ${areaOf(d)}`).join("\n")}\n${recent.length ? `RECENT (don't repeat): ${recent.join(" | ")}\n` : ""}Write exactly ${todo.length} challenge${todo.length === 1 ? "" : "s"}, in this order.`;
  let r: Record<string, unknown>;
  try {
    r = dyObj(JSON.parse(await ctx.ai("daily-draft", { tier: "main", maxTokens: 2200 * todo.length + 600, schema: DAILY_SCHEMA, system: DAILY_SYSTEM, prompt })));
  } catch (e) {
    if (e instanceof TaskError) throw e;
    throw new TaskError(502, "upstream", "Couldn't draft just now. Try again.");
  }
  const made = dyList(r.days).map(tidyDaily);
  const drafted: DailyRow[] = [];
  for (const [i, day] of todo.entries()) {
    const data = made[i];
    if (!data) continue;
    await ctx.daily.save(day, "draft", data);
    drafted.push({ day, status: "draft", data });
  }
  if (!drafted.length) throw new TaskError(502, "upstream", "The drafts came back unusable. Try again.");
  return { drafted };
}

export async function dailyList(ctx: { input: unknown; now: Date; daily: DailyStore }) {
  const input = dyObj(ctx.input), today = dayOf(ctx.now);
  const from = isDay(input.from) ? input.from : dayPlus(today, -7);
  const to = isDay(input.to) ? input.to : dayPlus(today, 21);
  if (to < from || Date.parse(to) - Date.parse(from) > 120 * 864e5) throw new TaskError(400, "input", "Pick up to four months at a time.");
  return { today, days: await ctx.daily.list(from, to, false) };
}

// Save an editor's version; publish only once it's complete.
export async function dailySave(ctx: { input: unknown; daily: DailyStore }) {
  const input = dyObj(ctx.input);
  if (!isDay(input.day)) throw new TaskError(400, "input", "Which day?");
  const status = input.status === "published" ? "published" : "draft";
  const data = tidyDaily(input.challenge);
  if (!data) throw new TaskError(400, "input", "It needs a title, a scene, a question with three choices and the right one, and a second try the same way.");
  if (status === "published" && ((data.sources as unknown[]).length < 2 || !data.why || !(data.second as { why: string }).why))
    throw new TaskError(400, "input", "Before publishing: two sources, and a why for both tries.");
  await ctx.daily.save(input.day, status, data);
  return { day: input.day, status, challenge: data };
}

export async function dailyRemove(ctx: { input: unknown; daily: DailyStore }) {
  const day = dyObj(ctx.input).day;
  if (!isDay(day)) throw new TaskError(400, "input", "Which day?");
  await ctx.daily.remove(day);
  return { removed: day };
}

// For everyone, no account needed: the published challenge for the day the browser is on. A day or so
// either side of the server's date, for time zones, and never further ahead.
export async function dailyToday(ctx: { input: unknown; now: Date; daily: DailyStore }) {
  const day = dyObj(ctx.input).day, today = dayOf(ctx.now);
  if (!isDay(day) || day < dayPlus(today, -2) || day > dayPlus(today, 1)) throw new TaskError(400, "input", "Ask for today.");
  const [row] = await ctx.daily.list(day, day, true);
  return { day, challenge: row?.data ?? null };
}
