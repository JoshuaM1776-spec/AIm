// Aim Homeschool's parent website end to end: the site (web/) in Chromium against a local stand-in
// for Supabase (Auth, plus the real AI endpoint and Homeschool logic from supabase/functions/ai/ with a
// scripted Claude and in-memory storage). Setup from the first step, the curriculum, a week from
// proposal to approval, changes after approval, projects and materials, and progress.
// Set SHOTS=/some/dir to save screenshots.
// Run: node --experimental-strip-types tests/web.test.mjs   (needs Playwright, like browser.test.js)
import { createRequire } from "node:module";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { handle } from "../supabase/functions/ai/handler.ts";
import { memDb, memHs } from "./helpers/memdb.mjs";
import { stale } from "../tools/build-web.mjs";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT || "playwright");
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const SHOTS = process.env.SHOTS;
const step = (name, ok, extra = "") => { console.log(`${ok ? "  ok  " : "  FAIL"} ${name}${extra ? "  — " + extra : ""}`); if (!ok) process.exitCode = 1; };

step("web/shared is current with the extension's files (node tools/build-web.mjs)", stale().length === 0, stale().join(", "));

// ---------- stand-in server ----------
const user = { id: "00000000-0000-4000-8000-0000000000a1", email: "parent@example.com" };
const srv = { sessions: new Set(), plan: "homeschool", prompts: [] };
// Claude, scripted: organizing a curriculum, and planning or revising a week (from the objective ids
// the prompt lists, as the real one would).
const CURRICULUM = { note: "", subjects: [{ name: "Science", units: [
  { title: "Earth Systems", weeks: 2, weeks_inferred: false, objectives: [{ text: "Explain how volcanoes form", inferred: false }, { text: "Describe the three kinds of plate boundaries", inferred: true }], requires: [], project: "Build a volcano model" },
  { title: "Weather and Water", weeks: 3, weeks_inferred: true, objectives: [{ text: "Explain the water cycle", inferred: false }], requires: ["Earth Systems"], project: "" }] },
  { name: "Math", units: [{ title: "Fractions", weeks: 3, weeks_inferred: false, objectives: [{ text: "Add fractions with unlike denominators", inferred: false }], requires: [], project: "" }] }] };
function weekFor(prompt) {
  const ids = [...prompt.matchAll(/- \[(\w+)\] /g)].map(m => m[1]);
  const lighter = /lighter|outdoors/i.test(prompt);
  return { note: lighter ? "Moved the volcano reading outdoors." : "", days: [
    { day: "Mon", items: [{ kind: "video", subject: "Science", title: "How volcanoes form", objectiveId: ids[0], why: "Introduces the week's main idea.", detail: "Watch, then sketch a volcano and label the magma chamber.", minutes: 25, search: "how volcanoes form for kids", together: false },
      { kind: "video", subject: "Math", title: "Adding unlike fractions", objectiveId: ids[2], why: "The core skill this unit.", detail: "Watch and try three problems.", minutes: 20, search: "adding fractions unlike denominators", together: false }] },
    { day: "Tue", items: [{ kind: lighter ? "activity" : "reading", subject: "Science", title: lighter ? "Volcano walk outdoors" : "Plate boundaries reading", objectiveId: ids[1], why: "Builds on Monday.", detail: "Read and draw the three boundaries.", minutes: 20, search: "", together: true }] },
    { day: "Thu", items: [{ kind: "teachback", subject: "Science", title: "Explain how volcanoes form", objectiveId: ids[0], why: "A check of understanding.", detail: "Explain it in your own words.", minutes: 10, search: "", together: false }] }],
    project: { title: "Build a volcano model", subject: "Science", objectiveId: ids[0], day: "Fri", minutes: 60, involvement: "together",
      materials: [{ name: "Baking soda", qty: "3 tbsp", kind: "consumable" }, { name: "Vinegar", qty: "1 cup", kind: "consumable" }, { name: "Baking tray", qty: "1", kind: "reusable" }],
      deliverables: ["A photo of the eruption", "Three sentences explaining it"], prep: ["Cover the table"], safety: "Do it outside or on a tray; goggles on." } };
}
const db = memDb();
const deps = {
  getUser: async t => (srv.sessions.has(t) ? user : null),
  getPlan: async () => srv.plan,
  usageSince: async () => ({ calls: 0, tokens: 0 }),
  begin: async () => ({ usageId: 1, limited: null }),
  finish: async () => {},
  callClaude: async req => {
    srv.prompts.push(req.prompt);
    const props = Object.keys(req.schema?.properties || {});
    const reply = props.includes("subjects") ? CURRICULUM : props.includes("days") ? weekFor(req.prompt) : {};
    return { ok: true, text: JSON.stringify(reply), model: "test", inputTokens: 10, outputTokens: 10 };
  },
  db,
  hs: memHs(db, { videos: { dQw4w9WgXcQ: { title: "Volcanoes for Kids", channel: "SciShow Kids" } } }),
  account: { exportData: async () => ({}), deleteUser: async () => {} },
  now: () => new Date(),
  config: { origins: [], webOrigins: [], limits: { dayCalls: 300, dayTokens: 400000, minuteCalls: 50 }, maxBodyBytes: 200000 }
};
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".woff2": "font/woff2", ".txt": "text/plain" };
const server = http.createServer(async (req, res) => {
  const body = await new Promise(r => { let b = ""; req.on("data", c => (b += c)); req.on("end", () => r(b)); });
  const url = new URL(req.url, "http://x");
  if (url.pathname === "/functions/v1/ai") {
    const r = await handle(new Request("http://x" + req.url, { method: req.method, headers: req.headers, body: req.method === "POST" ? body : undefined }), deps);
    res.writeHead(r.status, Object.fromEntries(r.headers));
    return res.end(await r.text());
  }
  const send = (status, data) => { res.writeHead(status, { "Content-Type": "application/json" }); res.end(JSON.stringify(data)); };
  const issue = () => { const t = `acc-${Math.random().toString(36).slice(2)}`; srv.sessions.add(t); return { access_token: t, refresh_token: `ref-${t}`, expires_in: 3600, user }; };
  if (url.pathname === "/auth/v1/otp") return send(200, {});
  if (url.pathname === "/auth/v1/verify") { const d = JSON.parse(body || "{}"); return d.token === "123456" ? send(200, issue()) : send(403, { msg: "Token has expired or is invalid" }); }
  if (url.pathname === "/auth/v1/logout") return send(204, {});
  if (url.pathname.startsWith("/auth/")) return send(404, {});
  // The site, with config.js pointing here.
  let file = url.pathname.replace(/^\/web\/?/, "") || "index.html";
  if (file === "config.js") { res.writeHead(200, { "Content-Type": "text/javascript" }); return res.end(`window.AIM_WEB = { supabaseUrl: ${JSON.stringify(base)}, supabaseAnonKey: "anon" };`); }
  const full = path.join(ROOT, "web", file);
  if (!full.startsWith(path.join(ROOT, "web")) || !fs.existsSync(full)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { "Content-Type": TYPES[path.extname(full)] || "application/octet-stream" });
  res.end(fs.readFileSync(full));
});
await new Promise(r => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${server.address().port}`;
deps.config.webOrigins = [base];

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", e => errors.push(e.message));
if (process.env.DEBUG) page.on("response", async r => { if (r.url().includes("/functions/v1/ai")) { const b = r.request().postData(); console.log("   ", r.status(), (b || "").slice(0, 90), r.status() !== 200 ? (await r.text()).slice(0, 200) : ""); } });
const text = sel => page.textContent(sel);
const shot = async name => { if (SHOTS) await page.screenshot({ path: `${SHOTS}/web-${name}.png`, fullPage: true }); };

try {
  // ---------- sign in ----------
  await page.goto(`${base}/web/`);
  await page.fill("#email", "parent@example.com");
  await page.click("button:text-is('Send sign-in email')");
  await page.fill("#code", "000000");
  await page.click("button:text-is('Sign in')");
  await page.waitForSelector("text=didn't work");
  await page.fill("#code", "123456");
  await page.click("button:text-is('Sign in')");
  await page.waitForSelector("text=Welcome to Aim Homeschool");
  step("signing in with the emailed code; a new family starts setup", page.url().endsWith("#/setup"));
  await shot("setup-welcome");

  // ---------- setup ----------
  await page.click("button:text-is(\"Let's start\")");
  await page.waitForSelector("#studentName");
  await page.fill("#studentName", "Alex");
  for (const s of ["English", "History"]) await page.uncheck(`input[aria-label="Include ${s}"]`);
  await page.fill('input[aria-label="Science level"]', "Grade 5");
  await page.fill('input[aria-label="Math level"]', "Grade 6");
  await page.click("#saveStudent");
  await page.waitForSelector("text=Aim's role, and your curriculum");
  const learnerRow = [...db.learners.values()].find(l => l.name === "Alex");
  step("your student, with a level per subject", learnerRow?.levels.Science === "Grade 5" && learnerRow.levels.Math === "Grade 6");
  step("the whole-plan role isn't offered until Aim's own curriculum exists", await page.isDisabled('input[value="primary"]'));
  await page.fill('input[aria-label="Title"]', "Our Grade 5 plan");
  await page.fill('textarea[aria-label="Curriculum text"]', "Science. Unit 1: Earth Systems (2 weeks): how volcanoes form; plate boundaries. Project: volcano model. Unit 2: Weather and Water. Math. Unit 1: Fractions (3 weeks).");
  await page.click("#addUpload");
  await page.waitForSelector("#toast:has-text('Confirm that you have the right')");
  step("a curriculum isn't added without the parent confirming they may use it", deps.hs.store.uploads.size === 0);
  await page.check("#uploadConfirm");
  await page.click("#addUpload");
  await page.waitForSelector("text=Our Grade 5 plan");
  await page.click("#next");
  await page.waitForSelector("#build");
  await page.click("#build");
  await page.waitForSelector(".unit");
  step("Aim organizes the family's own curriculum (and only it) into subjects, units and objectives",
    (await page.$$(".unit")).length === 3 && srv.prompts.at(-1).includes("Unit 1: Earth Systems") && /Math, Science|Science, Math/.test(srv.prompts.at(-1)), `${(await page.$$(".unit")).length} ${srv.prompts.at(-1).slice(0, 160)}`);
  step("objectives Aim inferred are marked to check", (await page.$$(".inferred")).length === 1);
  await shot("big-picture");
  // Moving a unit above one it builds on: a warning, never a block.
  await page.click('button[aria-label="Move Weather and Water up"]');
  await page.waitForSelector(".note.warn:has-text('Worth checking')");
  step("a unit moved before one it builds on: Aim says so, and it still saves", (await text(".note.warn")).includes("comes before “Earth Systems”") && !!(await page.$(".unit.warned")));
  await page.click('button[aria-label="Move Earth Systems up"]');
  await page.waitForFunction(() => !document.querySelector(".unit.warned"));
  await page.waitForFunction(() => document.querySelector("#saveState")?.textContent === "Saved");
  await page.click("#approveCurriculum");
  await page.waitForSelector("text=Channels you trust");
  step("approving the big picture makes version 1", (await (await page.evaluate(() => 1))) === 1 && [...deps.hs.store.docs.values()].some(d => d.kind === "curriculum_version"));
  await page.click("button:text-is('Skip for now')");
  await page.waitForSelector("#proposeWeek");
  await page.click("#proposeWeek");
  await page.waitForSelector(".day .item");
  step("the first week, proposed from the approved curriculum: lessons by day, objectives, the project",
    (await page.$$(".day .item")).length >= 4 && (await text("main")).includes("Build a volcano model") && (await text("main")).includes("Explain how volcanoes form"));
  step("no preferred channel for Science or Math yet: one decision per subject, and the week can't be approved", (await page.$$("[data-gap]")).length === 2 && await page.isDisabled("#approveWeek"));
  await shot("first-week");
  await page.click('[data-gap="Science"] .chip:has-text("SciShow")');
  await page.waitForFunction(() => document.querySelectorAll("[data-gap]").length === 1);
  await page.click('[data-gap="Math"] button:has-text("Let Aim choose Math videos")');
  await page.waitForFunction(() => !document.querySelector("#gaps"));
  step("preferring a channel for Science, and letting Aim choose for Math, settles both", !(await page.isDisabled("#approveWeek")));
  await page.click("#approveWeek");
  await page.waitForSelector("text=Set up Alex's Chrome");
  await page.click("button:text-is(\"Connect Alex's Chrome\")");
  await page.waitForSelector("#pairCode");
  const code = (await text("#pairCode")).trim();
  step("connecting the student's Chrome: a one-time code, no email or password for the student", /^[A-Z2-9]{4}-[A-Z2-9]{4}$/.test(code), code);
  await page.click("#next");
  await page.waitForSelector("#attention");

  // ---------- overview ----------
  const att = await text("#attention");
  step("Overview: what needs you, in one place", att.includes("Connect Alex's Chrome") && !att.includes("Approve this week"), att.slice(0, 200));
  await shot("overview");

  // ---------- the week after approval ----------
  await page.click('nav a:text-is("Weekly Plan")');
  await page.waitForSelector("#weekStatus:has-text('Approved')");
  const first = page.locator(".item").first();
  await first.locator("button:text-is('Edit')").click();
  await first.locator('input[aria-label="Title"]').fill("How volcanoes really form");
  await first.locator("button:text-is('Save')").click();
  await page.waitForSelector("#weekStatus:has-text('Changed since you approved it')");
  step("editing an approved week marks it changed; the student keeps the approved copy", (await text("main")).includes("still sees the approved version"));
  await page.click("button:text-is('Undo my changes')");
  await page.waitForSelector("#weekStatus:has-text('Approved')");
  step("Undo my changes goes back to the approved week", true);
  // A specific video, by link.
  const vid = page.locator('.item:has-text("Adding unlike fractions")');
  await vid.locator("button:text-is('Pick a video')").click();
  await vid.locator('input[aria-label="Video link"]').fill("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
  await vid.locator("button:text-is('Use it')").click();
  await page.waitForSelector('.item:has-text("Volcanoes for Kids (SciShow Kids)")');
  step("a video chosen by its link, with YouTube's title and channel", (await text("#weekStatus")).includes("Changed"));
  await page.fill('textarea[aria-label="Ask for a change"]', "We're camping Tuesday, make science outdoors");
  await page.click("button:text-is('Ask Aim')");
  await page.waitForSelector(".item:has-text('Volcano walk outdoors')");
  step("asking in plain words revises the week, keeping the chosen video", srv.prompts.at(-1).includes("The parent asks: We're camping Tuesday") &&
    (await text("main")).includes("Volcanoes for Kids") && (await text("main")).includes("Moved the volcano reading outdoors"));
  await page.click("#approveWeek");
  await page.waitForSelector("#weekStatus:has-text('Approved')");
  await shot("week");

  // ---------- projects & materials ----------
  await page.click('nav a:text-is("Projects & Materials")');
  await page.waitForSelector("#materials li");
  step("Projects & Materials: this week's project, and a shopping list for the next weeks", (await page.$$("#materials li")).length === 3 && (await text("main")).includes("Plan this week to see its project"));
  await page.check('input[aria-label="We have Baking tray"]');
  await page.waitForSelector("#materials li.owned");
  step("ticking what you have crosses it off, and it's remembered", [...deps.hs.store.docs.values()].find(d => d.kind === "materials")?.data.owned.includes("baking tray"));
  await page.click("button:text-is('Materials ready')");
  await page.waitForSelector(".pill:text-is('Materials ready')");
  step("a project's status: materials ready", true);
  await shot("projects");

  // ---------- progress ----------
  await page.click('nav a:text-is("Progress")');
  await page.waitForSelector(".obj");
  step("Progress: every objective, not assessed until there's evidence", (await page.$$(".obj .pill:text-is('Not assessed')")).length === 4);
  const alex = [...db.learners].find(([, l]) => l.name === "Alex")[0];
  const objId = await page.getAttribute(".obj", "data-objective");
  db.progress.push({ learnerId: alex, source: "instructor", kind: "item_completed", topic: "How volcanoes form", planObjective: objId, planItem: "x", at: new Date().toISOString() });
  db.progress.push({ learnerId: alex, source: "teachback", kind: "developing", topic: "Volcanoes", objective: "Explain how volcanoes form", planObjective: objId, evidence: "the magma pushes up through cracks", at: new Date().toISOString() });
  await page.reload();
  await page.waitForSelector(`.obj[data-objective="${objId}"] .pill:text-is('Developing')`);
  const row = await text(`.obj[data-objective="${objId}"]`);
  step("a TeachBack check shows as Developing with its evidence; a lesson done counts as watched, not understood", row.includes("the magma pushes up through cracks") && row.includes("1 lesson watched or done"));
  await shot("progress");

  // ---------- curriculum changes after approval ----------
  await page.click('nav a:text-is("Curriculum")');
  await page.waitForSelector(".unit");
  await page.fill('.unit:has(input.title[value="Fractions"]) input[aria-label="Weeks"]', "4");
  await page.press('.unit:has(input.title[value="Fractions"]) input[aria-label="Weeks"]', "Tab");
  await page.waitForSelector("text=You have changes that aren't approved");
  await page.waitForFunction(() => document.querySelector("#saveState")?.textContent === "Saved");
  await page.click('nav a:text-is("Overview")');
  await page.waitForSelector("#attention");
  step("an unapproved curriculum change shows on Overview, and weeks keep using the approved version", (await text("#attention")).includes("The curriculum has changes to approve"));
  step("no page errors", errors.length === 0, errors.join(" | "));
} catch (e) {
  console.log("  FAIL", e.message.split("\n")[0], errors.length ? `\n    page errors: ${errors.join(" | ")}` : "");
  await page.screenshot({ path: path.join(process.env.SHOTS || "/tmp", "web-failure.png"), fullPage: true }).catch(() => {});
  process.exitCode = 1;
} finally {
  await browser.close();
  server.close();
}
console.log(process.exitCode ? "\nSome checks failed." : "\nAll website checks passed.");
