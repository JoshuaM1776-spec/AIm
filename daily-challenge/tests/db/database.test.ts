import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addDays, type Db, essay, freshDb, today } from "./helpers.ts";

let db: Db;
beforeAll(async () => { db = await freshDb("dc_test_db"); });
afterAll(async () => { await db?.close(); });

const err = async (p: Promise<unknown>) => {
  try { await p; } catch (e) { return (e as Error).message; }
  throw new Error("expected an error");
};

async function submitted(user: string, number = 1, body = essay()) {
  const a = await db.call(user, "start_attempt", { p_number: number, p_difficulty: "moderate" });
  return db.call(user, "submit_response", { p_attempt: a.id, p_kind: "initial", p_body: body, p_key: randomUUID() });
}

async function evaluate(user: string, submissionId: string, scores = { understanding: 80, reasoning: 70, clarity: 90, organization: 61 }) {
  const claim = await db.sql("select public.eval_claim($1, $2) as r", [user, submissionId]);
  expect(claim[0].r.state).toBe("claimed");
  await db.sql("select public.eval_complete($1, $2, $3, 'test', 'test-evaluator')",
    [claim[0].r.evaluation_id, JSON.stringify(scores), JSON.stringify({ summary: "s", did_well: ["a"], consider_further: ["b"], keep_growing: "c" })]);
}

describe("today's challenge", () => {
  it("is the same published challenge for everyone, including people who aren't signed in", async () => {
    const t = await db.call(null, "get_today");
    expect(t.today).toBe(today());
    expect(t.challenge.number).toBe(1);
    expect(t.challenge.title).toBe("The Water Decision");
    expect(t.challenge.cards).toHaveLength(5);
    expect(t.challenge.investigation.length).toBeGreaterThanOrEqual(3);
    const u = await db.user();
    expect((await db.call(u, "get_today")).challenge.id).toBe(t.challenge.id);
  });

  it("never includes the evaluator's reference material", async () => {
    const t = JSON.stringify(await db.call(null, "get_today"));
    expect(t).not.toContain("misconceptions");
    expect(t).not.toContain("evaluator_notes");
    expect(t).not.toContain("Frontinus");
  });

  it("changes at the UTC day boundary: one open challenge, earlier ones closed", async () => {
    const tomorrow = addDays(today(), 1);
    const t = await db.call(null, "get_today", {}, tomorrow);
    expect(t.challenge.number).toBe(2);
    expect(t.challenge.is_open).toBe(true);
    expect(t.closes_at).toBe(`${addDays(today(), 2)}T00:00:00+00:00`);
    expect(await err(db.call(null, "get_challenge", { p_number: 2 }))).toBe("challenge_not_found"); // not yet
    expect(await err(db.call(null, "get_challenge", { p_number: 1 }, tomorrow))).toBe("challenge_not_found"); // closed
    const u = await db.user();
    expect(await err(db.call(u, "start_attempt", { p_number: 1, p_difficulty: "easy" }, tomorrow))).toBe("challenge_not_found");
  });

  it("stays open until the next challenge is released", async () => {
    const last = addDays(today(), 4); // Day 5 is the last scheduled
    const t = await db.call(null, "get_today", {}, addDays(last, 3));
    expect(t.challenge.number).toBe(5);
    expect(t.challenge.is_open).toBe(true);
    expect(t.closes_at).toBeNull();
  });

  it("keeps a draft (unpublished) challenge hidden even on its date", async () => {
    await db.sql("update challenges set status = 'draft' where number = 2");
    const tomorrow = addDays(today(), 1);
    expect((await db.call(null, "get_today", {}, tomorrow)).challenge.number).toBe(1);
    expect(await err(db.call(null, "get_challenge", { p_number: 2 }, tomorrow))).toBe("challenge_not_found");
    await db.sql("update challenges set status = 'published' where number = 2");
  });
});

describe("privacy", () => {
  it("doesn't let anonymous visitors use personal functions or read tables", async () => {
    expect(await err(db.call(null, "my_state"))).toMatch(/permission denied/);
    expect(await err(db.as(null, "select * from attempts"))).toMatch(/permission denied/);
    expect(await err(db.as(null, "select * from challenge_reference"))).toMatch(/permission denied/);
  });

  it("keeps drafts, submissions and evaluations private to their author", async () => {
    const a = await db.user();
    const b = await db.user();
    const att = await db.call(a, "start_attempt", { p_number: 1, p_difficulty: "easy" });
    await db.call(a, "save_draft", { p_attempt: att.id, p_kind: "initial", p_body: "My private thoughts" });
    expect(await db.as(a, "select body from drafts")).toEqual([{ body: "My private thoughts" }]);
    expect(await db.as(b, "select * from drafts")).toEqual([]);
    expect(await db.as(b, "select * from attempts")).toEqual([]);
    expect(await err(db.call(b, "save_draft", { p_attempt: att.id, p_kind: "initial", p_body: "overwrite" }))).toBe("attempt_not_found");
    expect(await err(db.call(b, "update_attempt", { p_attempt: att.id, p_card_position: 2 }))).toBe("attempt_not_found");
  });

  it("doesn't let browsers write tables directly or call the evaluation functions", async () => {
    const a = await db.user();
    expect(await err(db.as(a, "insert into evaluations (submission_id, user_id) values ($1, $2)", [randomUUID(), a]))).toMatch(/permission denied/);
    expect(await err(db.as(a, "update profiles set is_admin = true"))).toMatch(/permission denied/);
    expect(await err(db.call(a, "eval_claim", { p_user: a, p_submission: randomUUID() }))).toMatch(/permission denied/);
    expect(await err(db.as(a, "select * from challenge_reference"))).toMatch(/permission denied/);
    expect(await err(db.as(a, "select * from ai_calls"))).toMatch(/permission denied/);
  });
});

describe("attempts", () => {
  it("closes unfinished work when its challenge closes, keeping the draft readable", async () => {
    const u = await db.user();
    const a = await db.call(u, "start_attempt", { p_number: 1, p_difficulty: "hard" });
    expect(a.status).toBe("active");
    expect((await db.call(u, "start_attempt", { p_number: 1, p_difficulty: "easy" })).id).toBe(a.id); // resumes
    await db.call(u, "save_draft", { p_attempt: a.id, p_kind: "initial", p_body: "Half an idea" });
    const tomorrow = addDays(today(), 1);
    // the next day: nothing more can be written or submitted on Day 1, but the draft is kept
    expect(await err(db.call(u, "save_draft", { p_attempt: a.id, p_kind: "initial", p_body: "more" }, tomorrow))).toBe("challenge_closed");
    expect(await err(db.call(u, "submit_response", { p_attempt: a.id, p_kind: "initial", p_body: essay(), p_key: randomUUID() }, tomorrow))).toBe("challenge_closed");
    const old = await db.call(u, "get_attempt", { p_number: 1 }, tomorrow);
    expect(old.status).toBe("expired");
    expect(old.drafts.initial.body).toBe("Half an idea");
    expect((await db.call(u, "get_challenge", { p_number: 1 }, tomorrow)).is_open).toBe(false); // still readable to them
    expect((await db.call(u, "my_state", {}, tomorrow)).attempts["1"].status).toBe("expired");
    // starting the new challenge needs no confirmation, and marks the old attempt expired
    const next = await db.call(u, "start_attempt", { p_number: 2, p_difficulty: "easy" }, tomorrow);
    expect(next.status).toBe("active");
    expect((await db.as(u, "select status from attempts order by started_at")).map(r => r.status)).toEqual(["expired", "active"]);
    const lib = await db.call(u, "my_library", {}, tomorrow);
    expect(lib).toHaveLength(1);
    expect(lib[0]).toMatchObject({ number: 1, unfinished: true });
  });

  it("finishes evaluations of work submitted in time, but closes revisions with the challenge", async () => {
    const u = await db.user();
    const att = await submitted(u);
    const tomorrow = addDays(today(), 1);
    const claim = (await db.sql("select public.eval_claim($1, $2) as r", [u, att.submissions[0].id]))[0].r;
    expect(claim.state).toBe("claimed");
    await db.sql("select public.eval_complete($1, $2, $3, 'test', 'm')", [claim.evaluation_id,
      JSON.stringify({ understanding: 70, reasoning: 70, clarity: 70, organization: 70 }), JSON.stringify({ summary: "x" })]);
    expect(await err(db.call(u, "submit_response", { p_attempt: att.id, p_kind: "revision", p_body: essay(), p_key: randomUUID() }, tomorrow))).toBe("challenge_closed");
    const later = await db.call(u, "get_attempt", { p_number: 1 }, tomorrow);
    expect(later.status).toBe("submitted");
    expect(later.submissions[0].evaluation.overall).toBe(70);
    expect((await db.call(u, "list_community", { p_number: 1 }, tomorrow)).items.length).toBeGreaterThan(0); // participants keep reading
  });

  it("remembers the story position", async () => {
    const u = await db.user();
    const a = await db.call(u, "start_attempt", { p_number: 1, p_difficulty: "easy" });
    expect((await db.call(u, "update_attempt", { p_attempt: a.id, p_card_position: 3 })).card_position).toBe(3);
    expect(await err(db.call(u, "update_attempt", { p_attempt: a.id, p_card_position: 9 }))).toBe("invalid_position");
  });
});

describe("submitting", () => {
  it("rejects responses too short to evaluate", async () => {
    const u = await db.user();
    const a = await db.call(u, "start_attempt", { p_number: 1, p_difficulty: "easy" });
    expect(await err(db.call(u, "submit_response", { p_attempt: a.id, p_kind: "initial", p_body: "Build an aqueduct.", p_key: randomUUID() }))).toBe("too_short");
  });

  it("treats a repeated request as the same submission, and blocks a second one", async () => {
    const u = await db.user();
    const a = await db.call(u, "start_attempt", { p_number: 1, p_difficulty: "easy" });
    const key = randomUUID();
    const one = await db.call(u, "submit_response", { p_attempt: a.id, p_kind: "initial", p_body: essay(), p_key: key });
    const two = await db.call(u, "submit_response", { p_attempt: a.id, p_kind: "initial", p_body: essay(), p_key: key });
    expect(one.submissions).toHaveLength(1);
    expect(two.submissions[0].id).toBe(one.submissions[0].id);
    expect(one.status).toBe("submitted");
    expect(await err(db.call(u, "submit_response", { p_attempt: a.id, p_kind: "initial", p_body: essay(), p_key: randomUUID() }))).toBe("already_submitted");
    expect(await err(db.call(u, "save_draft", { p_attempt: a.id, p_kind: "initial", p_body: "late edit" }))).toBe("already_submitted");
  });

  it("strips control characters", async () => {
    const u = await db.user();
    const s = await submitted(u, 1, `${essay(50)}\u0007 end\r\nline`);
    expect(s.submissions[0].body).not.toContain("\u0007");
    expect(s.submissions[0].body).toContain("end\nline");
  });
});

describe("evaluation claims", () => {
  it("evaluates each submission once, and computes the overall score as the average", async () => {
    const u = await db.user();
    const s = (await submitted(u)).submissions[0];
    const c1 = (await db.sql("select public.eval_claim($1, $2) as r", [u, s.id]))[0].r;
    expect(c1.state).toBe("claimed");
    expect(c1.context.submission.body).toBe(s.body);
    expect(c1.context.reference.background).toContain("aqueduct");
    expect((await db.sql("select public.eval_claim($1, $2) as r", [u, s.id]))[0].r.state).toBe("in_progress");
    await db.sql("select public.eval_complete($1, $2, $3, 'test', 'm')", [c1.evaluation_id,
      JSON.stringify({ understanding: 80, reasoning: 70, clarity: 90, organization: 61 }), JSON.stringify({ summary: "x" })]);
    expect((await db.sql("select public.eval_claim($1, $2) as r", [u, s.id]))[0].r.state).toBe("complete");
    const att = await db.call(u, "get_attempt", { p_number: 1 });
    expect(att.submissions[0].evaluation.overall).toBe(75); // (80+70+90+61)/4 = 75.25
  });

  it("refuses another user's submission", async () => {
    const u = await db.user();
    const other = await db.user();
    const s = (await submitted(u)).submissions[0];
    expect((await db.sql("select public.eval_claim($1, $2) as r", [other, s.id]))[0].r.state).toBe("not_found");
  });

  it("lets a failed evaluation be retried, within the rate limit", async () => {
    const u = await db.user();
    const s = (await submitted(u)).submissions[0];
    for (let i = 0; i < 3; i++) {
      const c = (await db.sql("select public.eval_claim($1, $2, 3, 10) as r", [u, s.id]))[0].r;
      expect(c.state).toBe("claimed");
      await db.sql("select public.eval_fail($1, 'timeout')", [c.evaluation_id]);
    }
    const limited = (await db.sql("select public.eval_claim($1, $2, 3, 10) as r", [u, s.id]))[0].r;
    expect(limited.state).toBe("rate_limited");
    expect(limited.retry_after).toBeGreaterThan(0);
  });
});

describe("revision", () => {
  it("is allowed once, after the first evaluation is ready", async () => {
    const u = await db.user();
    const att = await submitted(u);
    expect(await err(db.call(u, "submit_response", { p_attempt: att.id, p_kind: "revision", p_body: essay(), p_key: randomUUID() }))).toBe("revision_not_ready");
    await evaluate(u, att.submissions[0].id);
    await db.call(u, "save_draft", { p_attempt: att.id, p_kind: "revision", p_body: "Better" });
    const r = await db.call(u, "submit_response", { p_attempt: att.id, p_kind: "revision", p_body: essay(90), p_key: randomUUID() });
    expect(r.submissions.map((s: { kind: string }) => s.kind)).toEqual(["initial", "revision"]);
    expect(await err(db.call(u, "submit_response", { p_attempt: att.id, p_kind: "revision", p_body: essay(), p_key: randomUUID() }))).toBe("already_submitted");
  });
});

describe("community", () => {
  it("opens only after you submit your own response, and shows labelled samples", async () => {
    const u = await db.user();
    expect(await err(db.call(u, "list_community", { p_number: 1 }))).toBe("submit_first");
    await submitted(u);
    const sel = await db.call(u, "list_community", { p_number: 1, p_tab: "selected" });
    expect(sel.items.map((i: { selected_label: string }) => i.selected_label)).toEqual(["The Infrastructure Plan", "The Conservation Plan", "The Integrated Plan"]);
    expect(sel.items.every((i: { is_sample: boolean }) => i.is_sample)).toBe(true);
    expect(JSON.stringify(sel)).not.toMatch(/overall|score/);
  });

  it("is private by default, shared only when chosen, and can be unshared", async () => {
    const a = await db.user();
    const b = await db.user();
    const att = await submitted(a);
    await submitted(b);
    const all = async () => (await db.call(b, "list_community", { p_number: 1, p_tab: "all", p_limit: 50 })).items as { display_name: string; is_mine: boolean }[];
    expect((await all()).some(i => i.display_name === "Ada L")).toBe(false);
    expect(await err(db.call(a, "publish_response", { p_attempt: att.id, p_display_name: "<script>" }))).toBe("invalid_display_name");
    const pub = await db.call(a, "publish_response", { p_attempt: att.id, p_display_name: "Ada L", p_title: "Phase it" });
    expect(pub.shared.display_name).toBe("Ada L");
    expect((await all()).find(i => i.display_name === "Ada L")?.is_mine).toBe(false);
    await db.call(a, "unpublish_response", { p_attempt: att.id });
    expect((await all()).some(i => i.display_name === "Ada L")).toBe(false);
  });

  it("hides a response after three people report it, and you can't report your own", async () => {
    const author = await db.user();
    const att = await submitted(author);
    const shared = (await db.call(author, "publish_response", { p_attempt: att.id, p_display_name: "Reported" })).shared;
    expect(await err(db.call(author, "report_response", { p_response: shared.id, p_reason: "spam" }))).toBe("own_response");
    const outsider = await db.user();
    expect(await err(db.call(outsider, "report_response", { p_response: shared.id, p_reason: "spam" }))).toBe("response_not_found");
    for (let i = 0; i < 3; i++) {
      const r = await db.user();
      await submitted(r);
      await db.call(r, "report_response", { p_response: shared.id, p_reason: "abusive", p_details: "rude" });
    }
    expect((await db.sql("select hidden, report_count from community_responses where id = $1", [shared.id]))[0]).toEqual({ hidden: true, report_count: 3 });
  });
});

describe("global results", () => {
  it("shows real counts, and an average only once enough people are evaluated", async () => {
    await db.sql("delete from attempts where challenge_id = (select id from challenges where number = 3)");
    const d3 = addDays(today(), 2);
    let stats = await db.call(null, "challenge_stats", { p_number: 3 }, d3);
    expect(stats).toMatchObject({ submitted: 0, evaluated: 0, average: null, distribution: null });
    const users: string[] = [];
    for (let i = 0; i < 10; i++) {
      const u = await db.user();
      users.push(u);
      const a = await db.call(u, "start_attempt", { p_number: 3, p_difficulty: "moderate" }, d3);
      const s = await db.call(u, "submit_response", { p_attempt: a.id, p_kind: "initial", p_body: essay(), p_key: randomUUID() }, d3);
      if (i < 9) await evaluate(u, s.submissions[0].id, { understanding: 60 + i, reasoning: 60 + i, clarity: 60 + i, organization: 60 + i });
    }
    stats = await db.call(users[0], "challenge_stats", { p_number: 3 }, d3);
    expect(stats).toMatchObject({ submitted: 10, evaluated: 9, average: null, your_score: 60 });
    const last = await db.as(users[9], "select id from submissions");
    await evaluate(users[9], last[0].id, { understanding: 90, reasoning: 90, clarity: 90, organization: 90 });
    stats = await db.call(users[0], "challenge_stats", { p_number: 3 }, d3);
    expect(stats.evaluated).toBe(10);
    expect(stats.average).toBe(Math.round((60 + 61 + 62 + 63 + 64 + 65 + 66 + 67 + 68 + 90) / 10));
    expect(stats.distribution).toHaveLength(10);
    expect(stats.distribution.reduce((n: number, b: { count: number }) => n + b.count, 0)).toBe(10);
  });
});

describe("progress", () => {
  it("counts streaks from real submission days", async () => {
    const u = await db.user();
    const t = today();
    // three consecutive days ending yesterday, and one older day
    const days = [addDays(t, -10), addDays(t, -3), addDays(t, -2), addDays(t, -1)];
    for (const [i, d] of days.entries()) {
      const a = await db.sql("insert into attempts (user_id, challenge_id, difficulty, status) values ($1, (select id from challenges where number = $2), 'easy', 'submitted') returning id", [u, i + 1]);
      await db.sql("insert into submissions (attempt_id, user_id, challenge_id, kind, body, word_count, difficulty, idempotency_key, created_at) select $1, $2, challenge_id, 'initial', 'x', 1, 'easy', gen_random_uuid(), $3::date + time '12:00' from attempts where id = $1", [a[0].id, u, d]);
    }
    const p = await db.call(u, "my_progress");
    expect(p).toMatchObject({ completed: 4, current_streak: 3, longest_streak: 3, participated_today: false });
    expect(p.recent_days).toHaveLength(7);
    // a day without taking part breaks the current streak but never the longest
    const later = await db.call(u, "my_progress", {}, addDays(t, 1));
    expect(later).toMatchObject({ current_streak: 0, longest_streak: 3 });
  });
});

describe("challenge management", () => {
  const doc = {
    slug: "test-challenge", title: "The Test Bridge", summary: "A bridge needs building across a wide river.",
    subjects: ["Engineering"], scenario_kind: "fictional", scenario_note: "Invented.",
    role: { title: "The Engineer", body: "You design bridges for a living." },
    situation: "The ferry can no longer cope.", final_task: "Recommend a bridge design.",
    expectations: { easy: "e", moderate: "m", hard: "h" },
    cards: [{ kind: "role", image: { key: "survey", alt: "a" } }],
    constraints: [{ label: "Money", detail: "", icon: "coins" }, { label: "Time", detail: "", icon: "hourglass" }],
    investigation: [{ title: "Engineering", questions: ["Which designs?"] }, { title: "Economics", questions: ["What cost?"] }],
    reference: { background: "", approaches: [], misconceptions: [], evaluator_notes: "", sources: [] },
  };

  it("is for admins only", async () => {
    const u = await db.user();
    expect(await err(db.call(u, "admin_list_challenges"))).toBe("forbidden");
    expect(await err(db.call(u, "admin_save_challenge", { p_doc: doc }))).toBe("forbidden");
  });

  it("creates drafts that ordinary users can't see, and publishes them on a scheduled UTC date", async () => {
    const admin = await db.user();
    await db.sql("update profiles set is_admin = true where id = $1", [admin]);
    const saved = await db.call(admin, "admin_save_challenge", { p_doc: doc });
    expect(saved.number).toBe(6);
    expect(saved.status).toBe("draft");
    expect(saved.cards).toHaveLength(5);
    const user = await db.user();
    expect(await err(db.call(user, "get_challenge", { p_number: 6 }))).toBe("challenge_not_found");
    expect((await db.call(admin, "get_challenge", { p_number: 6 })).title).toBe("The Test Bridge"); // preview

    expect(await err(db.call(admin, "admin_set_status", { p_id: saved.id, p_status: "published" }))).toBe("needs_date");
    expect(await err(db.call(admin, "admin_schedule", { p_id: saved.id, p_date: today() }))).toBe("date_taken");
    expect(await err(db.call(admin, "admin_schedule", { p_id: saved.id, p_date: addDays(today(), -1) }))).toBe("date_in_past");
    const date = addDays(today(), 7);
    await db.call(admin, "admin_schedule", { p_id: saved.id, p_date: date });
    expect(await err(db.call(admin, "admin_set_status", { p_id: saved.id, p_status: "published" }))).toBe("needs_reference");
    await db.call(admin, "admin_save_challenge", { p_doc: { ...doc, id: saved.id, number: 6, reference: { ...doc.reference, background: "Facts." } } });
    await db.call(admin, "admin_set_status", { p_id: saved.id, p_status: "published" });

    expect(await err(db.call(user, "get_challenge", { p_number: 6 }))).toBe("challenge_not_found"); // not yet its day
    expect((await db.call(user, "get_today", {}, date)).challenge.number).toBe(6);
    expect((await db.call(null, "get_today", {}, date)).challenge.number).toBe(6);
  });
});
