import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import type { EvalProvider } from "../../supabase/functions/_shared/evaluation/types.ts";
import {
  buildGenerationRequest, CONSTRAINT_ICON_NAMES, type GenDeps, type GenStore, GENERATION_SCHEMA, serveGenerate, validateDraft,
} from "../../supabase/functions/_shared/generation/generate.ts";
import { CHALLENGE_STANDARD } from "../../supabase/functions/_shared/generation/standard.ts";
import { TEST_DRAFT, testGenerator } from "../../supabase/functions/_shared/generation/test-generator.ts";

const clone = <T>(v: T): T => structuredClone(v);

describe("the standard", () => {
  it("is the drafting model's instructions, in sync with docs/challenge-standard.md", () => {
    const md = readFileSync(new URL("../../docs/challenge-standard.md", import.meta.url), "utf8");
    expect(CHALLENGE_STANDARD).toBe(md);
    const req = buildGenerationRequest({ recent: [] });
    expect(req.system.startsWith(CHALLENGE_STANDARD)).toBe(true);
    expect(req.system).toMatch(/Never claim approval/);
    expect(req.schema).toBe(GENERATION_SCHEMA);
  });

  it("asks for something different from recent challenges, and passes on the editor's direction", () => {
    const req = buildGenerationRequest({ direction: "Something about music and mathematics", type: "explain",
      recent: [{ title: "The Water Decision", type: "decide", subjects: ["Engineering"], setting: "fictionalized_historical", note: "", role: "The Governor" }] });
    expect(req.prompt).toContain("The Water Decision (decide; Engineering; fictionalized historical; role: The Governor)");
    expect(req.prompt).toContain("<editor_direction>\nSomething about music and mathematics\n</editor_direction>");
    expect(req.prompt).toContain("Challenge type: explain.");
    expect(buildGenerationRequest({ type: "nonsense", recent: [] }).prompt).not.toContain("Challenge type: nonsense");
  });

  it("offers the same constraint icons as the app", () => {
    const app = readFileSync(new URL("../../src/components/icons.tsx", import.meta.url), "utf8");
    const block = /CONSTRAINT_ICONS[^{]*\{([\s\S]*?)\};/.exec(app)![1];
    const keys = [...block.matchAll(/(?:^|[\s,])"?([a-z-]+)"?:/g)].map(m => m[1]);
    expect([...keys].sort()).toEqual([...CONSTRAINT_ICON_NAMES].sort());
  });
});

describe("validateDraft", () => {
  it("accepts a complete draft and shapes it for saving", () => {
    const v = validateDraft(clone(TEST_DRAFT));
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    const doc = v.doc as Record<string, any>;
    expect(doc.summary).toBe(TEST_DRAFT.preview);
    expect(doc.cards).toHaveLength(5);
    expect(doc.cards[1]).toEqual({ kind: "situation", image: null, direction: TEST_DRAFT.image_directions.situation });
    expect(doc.investigation[0].questions[0]).toEqual({ text: TEST_DRAFT.investigation[0].questions[0].text, priority: "essential" });
    expect(doc.quality.assessed_by).toBe("ai");
  });

  it("never treats an AI-listed source as verified, and drops URLs that aren't https", () => {
    const d = clone(TEST_DRAFT) as any;
    d.reference.sources = [{ title: "A real book", note: "", url: "javascript:alert(1)", critical: true, verified: true }];
    const v = validateDraft(d);
    expect(v.ok && (v.doc as any).reference.sources[0]).toEqual({ title: "A real book", note: "", url: "", verified: false, critical: true });
  });

  it("rejects drafts outside the standard instead of cutting them down", () => {
    const tooFewAreas = clone(TEST_DRAFT) as any;
    tooFewAreas.investigation = tooFewAreas.investigation.slice(0, 2);
    expect(validateDraft(tooFewAreas)).toMatchObject({ ok: false, reason: expect.stringContaining("investigation has 2 items") });
    const longSituation = clone(TEST_DRAFT) as any;
    longSituation.situation = "x ".repeat(700);
    expect(validateDraft(longSituation)).toMatchObject({ ok: false, reason: expect.stringContaining("situation is") });
    const badScore = clone(TEST_DRAFT) as any;
    badScore.quality.scores.clarity = 7;
    expect(validateDraft(badScore).ok).toBe(false);
    const approved = clone(TEST_DRAFT) as any;
    approved.quality.recommendation = "approved";
    expect(validateDraft(approved).ok).toBe(false);
    const badIcon = clone(TEST_DRAFT) as any;
    badIcon.constraints[0].icon = "skull";
    expect(validateDraft(badIcon).ok).toBe(false);
    expect(validateDraft("not json").ok).toBe(false);
  });
});

describe("serveGenerate", () => {
  const store = (claim: Awaited<ReturnType<GenStore["claim"]>> = { state: "claimed", call_id: 7, recent: [] }) => ({
    claim: vi.fn(async () => claim),
    save: vi.fn(async () => ({ id: "c-1", number: 9 })),
    fail: vi.fn(async () => {}),
  });
  const deps = (over: Partial<GenDeps> = {}): GenDeps => ({
    authenticate: async a => (a === "Bearer admin" ? "admin-1" : null),
    store: store(), provider: testGenerator(), perDay: 10, timeoutMs: 1000, allowedOrigins: ["*"], ...over,
  });
  const post = (body: unknown = {}, auth = "Bearer admin") =>
    new Request("http://x/functions/v1/generate", { method: "POST", headers: { authorization: auth }, body: JSON.stringify(body) });

  it("saves a valid draft and returns where it is", async () => {
    const s = store();
    const res = await serveGenerate(post({ direction: "music" }), deps({ store: s }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, id: "c-1", number: 9 });
    expect(s.claim).toHaveBeenCalledWith("admin-1", 10);
    expect((s.save.mock.calls[0] as unknown[])[1]).toBe(7);
  });

  it("checks sign-in, admin rights, limits and configuration", async () => {
    expect((await serveGenerate(post({}, "Bearer nope"), deps())).status).toBe(401);
    expect((await serveGenerate(post(), deps({ store: store({ state: "forbidden" }) }))).status).toBe(403);
    expect((await serveGenerate(post(), deps({ store: store({ state: "rate_limited", retry_after: 3600 }) }))).status).toBe(429);
    expect((await serveGenerate(post(), deps({ provider: null }))).status).toBe(503);
  });

  it("asks for a long, streamed answer, and records failures without saving anything", async () => {
    const run = vi.fn(async () => ({ ok: true as const, output: { title: "half a draft" }, model: "m", inputTokens: 1, outputTokens: 1 }));
    const s = store();
    const res = await serveGenerate(post(), deps({ store: s, provider: { name: "fake", model: "m", run } as EvalProvider }));
    expect(res.status).toBe(502);
    expect((await res.json()).error.code).toBe("invalid_output");
    expect(s.save).not.toHaveBeenCalled();
    expect(s.fail).toHaveBeenCalledWith(7, "invalid_output", "fake", "m");
    expect((run.mock.calls[0] as unknown[])[2]).toEqual({ maxTokens: 32000, effort: "medium", stream: true });
  });
});
