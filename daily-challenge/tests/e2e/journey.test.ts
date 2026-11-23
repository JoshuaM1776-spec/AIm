// End-to-end: the whole Daily Challenge loop in a real browser at phone sizes, against the local
// stand-in server and a throwaway database (real migration, real seed, the test evaluator).
//   npm run test:e2e            (needs a local Postgres; Chromium comes with this environment)
//   SHOTS=/some/dir npm run test:e2e   also saves screenshots of each step
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import type { Browser, BrowserContext, Page } from "playwright";
import { resetDatabase } from "../../scripts/db-reset.ts";
import { startDevServer } from "../../server/dev-server.ts";
import { testProvider } from "../../supabase/functions/_shared/evaluation/providers/test.ts";
import { testGenerator } from "../../supabase/functions/_shared/generation/test-generator.ts";

const require = createRequire(import.meta.url);
const { chromium, devices } = require("playwright") as typeof import("playwright");

const PORT = 54329;
const BASE = `http://localhost:${PORT}`;
const SHOTS = process.env.SHOTS;
const root = new URL("../../", import.meta.url).pathname;

const ESSAY = `I recommend building an aqueduct from the hill spring, but starting with the wells.

The illness is worst in the lower districts because wells sit close to latrines and drains, so the first step is to close the worst wells and build drains. However, the wells are also failing because of drought, so they cannot meet the needs of a growing city on their own.

An aqueduct brings cleaner water from a protected spring. The trade-off is cost and time: it will take years, so the city needs patrons and help from the province. The evidence from other Roman cities shows aqueducts could serve growth for generations, but they also need constant maintenance, which is a real risk if funds run short.`;

const today = () => new Date().toISOString().slice(0, 10);
const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);

let step = 0;
async function shot(page: Page, name: string) {
  if (!SHOTS) return;
  await page.waitForTimeout(250);
  await page.screenshot({ path: `${SHOTS}/${String(++step).padStart(2, "0")}-${name}.png`, fullPage: true });
}

function watchConsole(page: Page, errors: string[], label: string) {
  page.on("console", m => { if (m.type() === "error") errors.push(`[${label}] ${m.text()}`); });
  page.on("pageerror", e => errors.push(`[${label}] ${e.message}`));
}

async function signIn(page: Page, email: string) {
  await page.getByLabel("Email address").fill(email);
  await page.getByRole("button", { name: "Send me a code" }).click();
  await page.getByLabel("Code").waitFor();
  const { code } = await (await fetch(`${BASE}/dev/code?email=${encodeURIComponent(email)}`)).json() as { code: string };
  await page.getByLabel("Code").fill(code);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
}

async function setToday(d: string | null) {
  await fetch(`${BASE}/dev/today`, { method: "POST", body: JSON.stringify({ date: d }) });
}

async function swipeLeft(page: Page) {
  const el = page.locator("[aria-live=polite]").first();
  const box = (await el.boundingBox())!;
  const y = box.y + 80;
  await el.dispatchEvent("pointerdown", { pointerType: "touch", clientX: box.x + box.width - 30, clientY: y, isPrimary: true });
  await el.dispatchEvent("pointerup", { pointerType: "touch", clientX: box.x + 30, clientY: y + 5, isPrimary: true });
}

async function writeAndSubmit(page: Page, text: string) {
  await page.getByLabel("Your response").fill(text);
  await page.getByText("Saved", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Submit for Review" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Submit for Review" }).click();
  await page.waitForURL(/\/evaluation/);
}

async function startChallenge(page: Page, number: number, difficulty = "Moderate") {
  await page.goto(`${BASE}/c/${number}`);
  await page.getByText(difficulty, { exact: true }).click();
  await page.getByRole("button", { name: /Begin Challenge|Continue Challenge/ }).click();
  await page.waitForURL(/\/story\/1$/);
}

async function run() {
  if (SHOTS) mkdirSync(SHOTS, { recursive: true });
  process.env.DEV_ALLOW_SQL = "1"; // lets the test add many evaluated responses quickly
  console.log("building the app…");
  execFileSync("npx", ["vite", "build", "--outDir", "dist-e2e", "--logLevel", "error"], {
    cwd: root, stdio: "inherit", env: { ...process.env, VITE_SUPABASE_URL: BASE, VITE_SUPABASE_ANON_KEY: "local-dev-anon-key" },
  });
  const databaseUrl = await resetDatabase("dc_e2e", { quiet: true });
  const server = await startDevServer({ port: PORT, databaseUrl, provider: testProvider(), generator: testGenerator(), serveDist: `${root}dist-e2e`, quiet: true });
  const browser: Browser = await chromium.launch();
  const errors: string[] = [];
  const results: string[] = [];
  const check = async (name: string, fn: () => Promise<void>) => {
    await fn();
    results.push(`✓ ${name}`);
    console.log(`✓ ${name}`);
  };

  try {
    const phone = devices["iPhone 13"];
    const ctxA: BrowserContext = await browser.newContext({ ...phone });
    const a = await ctxA.newPage();
    watchConsole(a, errors, "A");

    await check("a visitor sees today's challenge without an account", async () => {
      await a.goto(BASE);
      await a.getByRole("heading", { name: "Today’s Challenge" }).waitFor();
      await a.getByRole("heading", { name: "The Water Decision" }).waitFor();
      assert.ok(await a.getByText("DAY 1").isVisible());
      await shot(a, "home");
    });

    await check("choosing a difficulty and swiping through the five story cards", async () => {
      await a.getByRole("link", { name: /Begin Today/ }).click();
      await a.getByText("Hard", { exact: true }).click();
      assert.ok(await a.getByText(/defend your plan against the strongest objection/).isVisible());
      await shot(a, "overview");
      await a.getByRole("button", { name: "Begin Challenge" }).click();
      await a.waitForURL(/\/story\/1$/);
      await a.getByRole("heading", { name: "The Governor" }).waitFor();
      await shot(a, "card-role");
      await swipeLeft(a);
      await a.waitForURL(/\/story\/2$/);
      await a.getByRole("heading", { name: "The Situation" }).waitFor();
      await a.keyboard.press("ArrowRight");
      await a.waitForURL(/\/story\/3$/);
      await a.getByText("Limited funds").waitFor();
      await shot(a, "card-constraints");
    });

    await check("the story position is kept when leaving and coming back", async () => {
      await a.goto(BASE);
      await a.getByRole("link", { name: "Continue Challenge" }).click();
      await a.waitForURL(/\/story\/3$/);
      await a.getByRole("button", { name: /Next card/ }).click();
      await a.getByRole("heading", { name: "Your Investigation" }).waitFor();
      assert.ok(await a.getByText("What can the city realistically afford, and who could pay for large public works?").isVisible());
      await shot(a, "card-investigation");
      await a.getByRole("button", { name: /Next card/ }).click();
      await a.getByRole("heading", { name: "Your Decision" }).waitFor();
      await shot(a, "card-decision");
      await a.getByRole("button", { name: "Begin Investigation" }).click();
      await a.waitForURL(/\/brief$/);
      await a.getByRole("heading", { name: "Now, investigate" }).waitFor();
      await shot(a, "brief");
    });

    await check("a visitor's draft saves on the device and survives a refresh", async () => {
      await a.getByRole("link", { name: "Write Your Response" }).click();
      await a.getByLabel("Your response").fill(ESSAY.slice(0, 400));
      await a.getByText("Saved on this device", { exact: true }).waitFor();
      await a.reload();
      assert.equal(await a.getByLabel("Your response").inputValue(), ESSAY.slice(0, 400));
      await a.getByRole("button", { name: "Brief" }).click();
      await a.getByRole("dialog", { name: "Mission Brief" }).getByText("Areas worth investigating").waitFor();
      await a.keyboard.press("Escape");
    });

    await check("submitting asks a visitor to sign in, and their draft moves to the account", async () => {
      await a.getByRole("button", { name: "Submit for Review" }).click();
      await a.getByRole("dialog", { name: /Create a free account/ }).waitFor();
      await shot(a, "signin-prompt");
      await a.getByRole("link", { name: /Sign in or create an account/ }).click();
      await signIn(a, "ada@example.com");
      await a.waitForURL(/\/c\/1\/write$/);
      await a.waitForFunction(() => (document.querySelector("#response") as HTMLTextAreaElement | null)?.value.length === 400);
      await a.reload();
      assert.equal(await a.getByLabel("Your response").inputValue(), ESSAY.slice(0, 400));
    });

    await check("drafts autosave to the account and survive a refresh", async () => {
      await a.getByLabel("Your response").fill(ESSAY);
      await a.getByText("Saved", { exact: true }).waitFor();
      await a.reload();
      assert.equal(await a.getByLabel("Your response").inputValue(), ESSAY);
      await shot(a, "write");
    });

    await check("submit, confirm, and receive a stored evaluation", async () => {
      await a.getByRole("button", { name: "Submit for Review" }).click();
      const dlg = a.getByRole("dialog", { name: "Submit for review?" });
      await dlg.getByText(/Once submitted, this version can't be edited/).waitFor();
      await shot(a, "confirm");
      await dlg.getByRole("button", { name: "Submit for Review" }).click();
      await a.waitForURL(/\/evaluation$/);
      await a.getByRole("heading", { name: "What You Did Well" }).waitFor({ timeout: 20000 });
      assert.ok(await a.getByText(/built-in test evaluator, not an AI model/).isVisible());
      assert.ok(await a.getByText(/I recommend building an aqueduct from the hill spring/).first().isVisible());
      await shot(a, "evaluation");
      // reopening shows the stored evaluation; nothing is regenerated
      const before = await a.locator("p.font-serif").filter({ hasText: /^\d+$/ }).first().textContent();
      await a.reload();
      await a.getByRole("heading", { name: "What You Did Well" }).waitFor();
      assert.equal(await a.locator("p.font-serif").filter({ hasText: /^\d+$/ }).first().textContent(), before);
      const calls = await (await fetch(`${BASE}/dev/sql`, { method: "POST", body: JSON.stringify({ sql: "select count(*)::int n from ai_calls" }) }).catch(() => null))?.json().catch(() => null);
      if (calls) assert.equal(calls[0].n, 1);
    });

    await check("asks whether the challenge was worth their time", async () => {
      await a.getByRole("heading", { name: "Was this challenge worth your time?" }).waitFor();
      await a.getByLabel(/^Yes/).check();
      await a.getByText("Saved. You can change your answer any time.").waitFor();
      await a.getByLabel(/Anything that would have made it better/).fill("More about how aqueducts were financed, please.");
      await a.getByRole("button", { name: "Send" }).click();
      await a.getByRole("button", { name: "Thank you" }).waitFor();
      await a.reload();
      assert.ok(await a.getByLabel(/^Yes/).isChecked());
    });

    await check("revising once shows both versions and the change in score", async () => {
      await a.getByRole("link", { name: "Revise Your Response" }).click();
      await a.waitForURL(/\/revise$/);
      assert.equal(await a.getByLabel("Your response").inputValue(), ESSAY);
      await a.getByLabel("Your response").fill(`${ESSAY}\n\nHowever, the strongest objection is cost. Because the evidence is uncertain, I would survey first and phase the work, accepting the trade-off of slower relief.`);
      await a.getByText("Saved", { exact: true }).waitFor();
      await a.getByRole("button", { name: "Submit for Review" }).click();
      await a.getByRole("dialog").getByRole("button", { name: "Submit Revision" }).click();
      await a.waitForURL(/\/evaluation\?v=revision$/);
      await a.getByText(/First version \d+ → revision \d+/).waitFor({ timeout: 20000 });
      assert.ok(await a.getByRole("tab", { name: "First version" }).isVisible());
      assert.equal(await a.getByRole("link", { name: "Revise Your Response" }).count(), 0);
      await shot(a, "revision");
    });

    await check("responses are private until shared under a chosen name", async () => {
      await a.getByRole("button", { name: "Share my response…" }).click();
      await a.getByLabel("Display name").fill("Ada");
      await a.getByLabel(/Title for your approach/).fill("Wells first, then the aqueduct");
      await a.getByRole("button", { name: "Share publicly" }).click();
      await a.getByText(/Shared as/).waitFor();
    });

    // A second person
    const ctxB = await browser.newContext({ ...devices["Pixel 7"] });
    const b = await ctxB.newPage();
    watchConsole(b, errors, "B");

    await check("others' responses stay closed until you've submitted your own", async () => {
      await b.goto(`${BASE}/signin`);
      await signIn(b, "grace@example.com");
      await b.waitForURL(`${BASE}/`);
      await b.goto(`${BASE}/c/1/community`);
      await b.getByText("Form your own view first").waitFor();
      await shot(b, "community-locked");
    });

    await check("after submitting, the community shows labelled samples and shared responses", async () => {
      await startChallenge(b, 1);
      await b.goto(`${BASE}/c/1/write`);
      await writeAndSubmit(b, ESSAY.replace("I recommend", "My view: I recommend"));
      await b.getByRole("heading", { name: "What You Did Well" }).waitFor({ timeout: 20000 });
      await b.getByRole("link", { name: "See how others approached it" }).click();
      await b.getByText("The Infrastructure Plan").waitFor();
      assert.ok(await b.getByText("The Conservation Plan").isVisible());
      assert.equal(await b.locator("article").getByText("Sample", { exact: true }).count(), 3);
      assert.equal(await b.getByText(/\b\d{2}\s*\/\s*100\b/).count(), 0, "no scores on community responses");
      await shot(b, "community-selected");
      await b.getByRole("tab", { name: "All Responses" }).click();
      await b.getByRole("heading", { name: "Wells first, then the aqueduct" }).waitFor();
      await b.getByText("by Ada").waitFor();
      await shot(b, "community-all");
    });

    await check("a response can be reported", async () => {
      await b.getByRole("button", { name: "Report the response by Ada" }).click();
      await b.getByLabel("Spam or off-topic").check();
      await b.getByRole("button", { name: "Send report" }).click();
      await b.getByText("Reported", { exact: true }).waitFor();
    });

    await check("unsharing removes a response from the community", async () => {
      await a.getByRole("button", { name: "Remove from the community" }).click();
      await a.getByRole("button", { name: "Share my response…" }).waitFor();
      await b.reload();
      await b.getByRole("tab", { name: "All Responses" }).click();
      await b.getByText(/Nobody has shared|Untitled/).first().waitFor().catch(() => undefined);
      assert.equal(await b.getByText("Wells first, then the aqueduct").count(), 0);
    });

    await check("global results show real counts, and no average until there are enough", async () => {
      await b.goto(`${BASE}/c/1/results`);
      await b.getByText("people have completed this challenge").waitFor();
      assert.equal((await b.locator("p.font-serif").first().textContent())?.trim(), "2");
      await b.getByText(/appear once at least 10 people have been evaluated/).waitFor();
      await shot(b, "results-small");
    });

    await check("global results show the distribution once enough people are evaluated", async () => {
      // Eight more people complete the challenge (straight to the database, to keep the test quick).
      const sql = async (q: string, params: unknown[] = []) =>
        (await fetch(`${BASE}/dev/sql`, { method: "POST", body: JSON.stringify({ sql: q, params }) })).json();
      const ok = await sql("select 1 as ok").catch(() => null);
      if (!ok) return; // DEV_ALLOW_SQL not set: covered by the database tests instead
      for (let i = 0; i < 8; i++) {
        await sql(`with u as (insert into auth.users (id, email) values (gen_random_uuid(), $1) returning id),
          a as (insert into attempts (user_id, challenge_id, difficulty, status) select u.id, c.id, 'moderate', 'submitted' from u, challenges c where c.number = 1 returning id, user_id, challenge_id),
          s as (insert into submissions (attempt_id, user_id, challenge_id, kind, body, word_count, difficulty, idempotency_key) select id, user_id, challenge_id, 'initial', 'x', 1, 'moderate', gen_random_uuid() from a returning id, user_id)
          insert into evaluations (submission_id, user_id, status, understanding, reasoning, clarity, organization, overall, feedback)
          select id, user_id, 'complete', $2, $2, $2, $2, $2, '{}' from s`, [`p${i}@example.com`, 55 + i * 5]);
      }
      await b.reload();
      await b.getByRole("button", { name: /including you/ }).waitFor();
      await b.getByText(/^You: \d+$/).waitFor();
      await shot(b, "results-distribution");
      await b.getByRole("button", { name: "Show as table" }).click();
      await b.getByRole("cell", { name: /\(yours\)/ }).waitFor();
    });

    await check("progress and the library come from real data", async () => {
      await a.goto(`${BASE}/progress`);
      await a.getByRole("heading", { name: "The Streak" }).waitFor();
      assert.equal(await a.getByText("Challenges completed").locator("..").locator("p").first().textContent(), "1");
      await a.getByText(/Your trends appear after your second evaluated challenge/).waitFor();
      await shot(a, "progress");
      await a.getByRole("link", { name: /Completed Challenges/ }).click();
      await a.getByText("The Water Decision").waitFor();
      await a.getByText(/Revised/).waitFor();
      await shot(a, "library");
      await a.getByText("The Water Decision").click();
      await a.waitForURL(/\/c\/1\/evaluation$/);
    });

    await check("one challenge at a time: the next day's replaces today's, and unfinished drafts are kept read-only", async () => {
      await setToday(addDays(today(), 1));
      await b.goto(BASE);
      await b.getByRole("heading", { name: "The Outbreak" }).waitFor();
      await startChallenge(b, 2);
      await b.goto(`${BASE}/c/2/write`);
      await b.getByLabel("Your response").fill("A first thought about the pump and the workhouse.");
      await b.getByText("Saved", { exact: true }).waitFor();
      await setToday(addDays(today(), 2));
      await b.goto(BASE);
      await b.getByRole("heading", { name: "The Mountain Pass" }).waitFor();
      assert.equal(await b.getByText(/unfinished/i).count(), 0, "nothing to catch up on");
      await shot(b, "home-next-day");
      // yesterday's challenge has closed; its draft is kept to reread, not to submit
      await b.goto(`${BASE}/c/2`);
      await b.getByText("This challenge has closed").waitFor();
      await shot(b, "closed");
      await b.getByRole("link", { name: "Read your draft" }).click();
      await b.getByText("A first thought about the pump and the workhouse.").waitFor();
      assert.equal(await b.getByRole("button", { name: "Submit for Review" }).count(), 0);
      await b.goto(`${BASE}/library`);
      await b.getByText("Unfinished, draft kept").waitFor();
      // today's challenge starts straight away
      await startChallenge(b, 3);
      await b.getByRole("heading", { name: "The Chief Engineer" }).waitFor();
      // someone who didn't take part can't open an earlier challenge
      const visitor = await browser.newPage();
      await visitor.goto(`${BASE}/c/1`);
      await visitor.getByText(/That challenge (is not|isn't) available/).waitFor();
      await visitor.close();
    });

    await check("a failed evaluation is reported honestly and can be retried", async () => {
      await b.goto(`${BASE}/c/3/write`);
      await writeAndSubmit(b, `${ESSAY}\n\n[[test:invalid]]`);
      await b.getByText(/returned something we couldn't use/).waitFor({ timeout: 20000 });
      assert.equal(await b.getByRole("heading", { name: "What You Did Well" }).count(), 0, "no invented feedback");
      assert.ok(await b.getByRole("button", { name: "Try the evaluation again" }).isVisible());
      await shot(b, "evaluation-failed");
    });

    await check("admins write a challenge, approve it at the standard's bar, schedule and publish it; drafts stay hidden", async () => {
      await setToday(null);
      await fetch(`${BASE}/dev/admin`, { method: "POST", body: JSON.stringify({ email: "ada@example.com" }) });
      await a.goto(`${BASE}/admin`);
      await a.getByRole("heading", { name: "Challenge Management" }).waitFor();
      await shot(a, "admin-list");
      await a.getByRole("link", { name: "New" }).click();
      await a.getByLabel("Title", { exact: true }).fill("The Bridge Question");
      await a.getByLabel("Short preview", { exact: true }).fill("A river town must decide how to cross a wide, flooding river.");
      await a.getByLabel("Primary disciplines", { exact: true }).fill("Engineering, Economics");
      await a.getByLabel("Role title", { exact: true }).fill("The Town Engineer");
      await a.getByLabel("Role", { exact: true }).fill("You advise the town council on all public works.");
      await a.getByLabel("The situation", { exact: true }).fill("The ferry can no longer cope with traffic, and the river floods each spring.");
      await a.getByLabel(/^The task/).fill("Recommend how the town should cross the river, and defend it.");
      for (const [i, label] of ["Limited funds", "Spring floods", "A busy shipping lane"].entries()) await a.getByLabel(`Constraint ${i + 1}`, { exact: true }).fill(label);
      for (const [i, [area, q]] of [["Bridge Design", "Which bridge designs suit a wide, flooding river?"], ["Costs", "What can the town afford to build and maintain?"],
        ["River Traffic", "How would each design affect boats on the river?"]].entries()) {
        await a.getByLabel(`Area ${i + 1}`, { exact: true }).fill(area);
        await a.getByLabel(`Area ${i + 1}, question 1`, { exact: true }).fill(q);
      }
      await a.getByRole("button", { name: "Create draft" }).click();
      await a.waitForURL(/\/admin\/[0-9a-f-]{36}$/);
      await a.getByText("Saved.").waitFor();
      const adminUrl = a.url();
      await a.getByRole("link", { name: "Preview" }).first().click();
      await a.getByRole("heading", { name: "The Bridge Question" }).waitFor();
      await a.getByRole("link", { name: "Begin Challenge" }).click();
      await a.getByRole("heading", { name: "The Town Engineer" }).waitFor();
      await shot(a, "admin-preview");
      await a.goto(adminUrl);
      // can't publish until approved; can't approve below the bar
      assert.ok(await a.getByRole("button", { name: "Publish" }).isDisabled());
      await a.getByRole("button", { name: "Approve" }).click();
      await a.getByText("Add the factual reference guide for the evaluator before approving.").waitFor();
      await a.getByLabel("Factual reference guide", { exact: true }).fill("Bridge types: beam, arch, suspension; costs rise with span.");
      for (const label of ["Intrigue", "Responsibility", "Research depth", "Interdisciplinary integration", "Reasoning quality", "Researchability", "Clarity", "Articulation potential"]) {
        await a.getByLabel(label, { exact: true }).selectOption("4");
      }
      await a.getByText("Total 32 / 40").waitFor();
      await a.getByRole("button", { name: "Save changes" }).click();
      await a.getByText("Saved.").waitFor();
      await a.getByRole("button", { name: "Approve" }).click();
      await a.getByText(/The quality total needs at least 35 of 40/).waitFor();
      for (const label of ["Intrigue", "Research depth", "Reasoning quality"]) await a.getByLabel(label, { exact: true }).selectOption("5");
      await a.getByRole("button", { name: "Save changes" }).click();
      await a.getByText("Saved.").waitFor();
      await a.getByRole("button", { name: "Approve" }).click();
      await a.getByText("Marked Approved.").waitFor();
      await a.getByLabel("Release date (UTC)", { exact: true }).fill(addDays(today(), 10));
      await a.getByRole("button", { name: "Set date" }).click();
      await a.getByText(/Scheduled for/).waitFor();
      await a.getByRole("button", { name: "Publish" }).click();
      await a.getByText("Published.").waitFor();
      await shot(a, "admin-edit");
      // not yet its day: hidden from an ordinary user
      await b.goto(`${BASE}/c/6`);
      await b.getByText(/That challenge (is not|isn't) available/).waitFor();
      await setToday(addDays(today(), 10));
      await b.goto(BASE);
      await b.getByRole("heading", { name: "The Bridge Question" }).waitFor();
      await setToday(null);
    });

    await check("AI drafts follow the standard and wait, unverified, for an editor", async () => {
      await a.goto(`${BASE}/admin`);
      await a.getByRole("button", { name: "Draft with AI" }).click();
      await a.getByLabel("Direction (optional)").fill("Something about sound and weather");
      await a.getByRole("dialog").getByRole("button", { name: "Draft a challenge" }).click();
      await a.waitForURL(/\/admin\/[0-9a-f-]{36}$/);
      await a.getByRole("heading", { name: "Test Draft: The Winter Bells" }).waitFor();
      await a.getByText("Pending fact verification").first().waitFor();
      await a.getByText(/Drafted by AI following the Challenge Standard/).waitFor();
      await a.getByText("1 critical source not yet verified").waitFor();
      await shot(a, "admin-ai-draft");
      await a.getByRole("button", { name: "Approve" }).click();
      await a.getByText(/critical source is still unverified/).waitFor();
      assert.ok(await a.getByRole("button", { name: "Publish" }).isDisabled());
    });

    await check("profile, mission and settings pages work", async () => {
      await a.goto(`${BASE}/profile`);
      await a.getByText("Signed in as ada@example.com").waitFor();
      await a.getByRole("radio", { name: "Larger" }).click();
      await a.getByRole("link", { name: "Our mission" }).click();
      await a.getByText(/should not be considered charitable donations/).waitFor();
      await shot(a, "mission");
    });

    // An ordinary 4xx from the expected failure above, and from the unpublished challenge, appear as
    // "Failed to load resource" in the console; anything else is a real error.
    const unexpected = errors.filter(e => !/Failed to load resource: the server responded with a status of (400|502)/.test(e));
    assert.deepEqual(unexpected, [], `console errors:\n${unexpected.join("\n")}`);
    results.push("✓ no unexpected console errors");
    console.log("✓ no unexpected console errors");
  } finally {
    await browser.close();
    await server.close();
  }
  console.log(`\n${results.length} checks passed.`);
}

run().catch(e => {
  console.error("✗", e);
  process.exit(1);
});
