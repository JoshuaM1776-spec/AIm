// Aim Plus end to end: loads a copy of the extension pointed at a local stand-in for Supabase
// (Auth plus the real AI endpoint and TeachBack logic from supabase/functions/ai/, with a scripted
// Claude and an in-memory database), signs in through Settings, and runs a TeachBack session.
// Set SHOTS=/some/dir to save screenshots of the TeachBack page.
// Run: node --experimental-strip-types tests/plus.test.mjs   (needs Playwright, like browser.test.js)
import { createRequire } from "node:module";
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { handle } from "../supabase/functions/ai/handler.ts";
import { memDb } from "./helpers/memdb.mjs";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT || "playwright");
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

// ---------- stand-in server ----------
const CODE = "123456";
const LINK_TOKEN = "b3c1f0e2a9d84c7f9e6a5b4c3d2e1f00aabbccdd";
const ev = (rating, evidence) => ({ rating, evidence, misconception: "", applied: false, note: "" });
const srv = { director: [
    { evaluation: ev("sound", "glucose and oxygen"), next: { action: "follow_up", objective: 1, student: "ivy", kind: "application", question: "So what does the plant do with that glucose later?" } },
    { evaluation: ev("partial", "stores the glucose as starch"), next: { action: "next_objective", objective: 2, student: "reese", kind: "question", question: "How do we know light is needed at all?" } },
    { evaluation: ev("unclear", ""), next: { action: "next_objective", objective: 3, student: "grant", kind: "question", question: "Which part of the cell, exactly?" } }
  ], sent: [], refreshes: 0, revoked: 0, aiCalls: 0, plan: "free", expiresIn: 3600, sessions: new Map(), n: 0 };
const user = { id: "u1", email: "learner@example.com" };
function issue() {
  const access = `acc-${++srv.n}`, refresh = `ref-${srv.n}`;
  srv.sessions.set(access, { refresh, live: true });
  return { access_token: access, refresh_token: refresh, token_type: "bearer", expires_in: srv.expiresIn,
    expires_at: Math.floor(Date.now() / 1000) + srv.expiresIn, user };
}
const usage = [];
const deps = {
  getUser: async t => (srv.sessions.get(t)?.live ? user : null),
  getPlan: async () => srv.plan,
  usageSince: async () => ({ calls: usage.length, tokens: usage.length * 25 }),
  begin: async () => (usage.push(1), { usageId: usage.length, limited: null }),
  finish: async () => {},
  callClaude: async req => {
    srv.aiCalls++;
    const props = Object.keys(req.schema?.properties || {});
    const reply = !req.schema ? "ready" : JSON.stringify(
      props.includes("first_question") ? { type: "concepts", first_question: "What does a plant actually make during photosynthesis?",
          objectives: ["Explain what photosynthesis produces", "Explain the role of light", "Explain where it happens in the cell"] }
      : props.includes("evaluation") ? srv.director.shift()
      : props.includes("hint") ? { hint: "Think about what the plant keeps for later." }
      : { summary: "You explained what photosynthesis produces. Light and location weren't covered yet.", strengths: ["What photosynthesis produces"],
          objectives: [{ index: 1, note: "Clear and accurate.", explanation: "", search: "" },
            { index: 2, note: "Skipped.", explanation: "Light supplies the energy that drives the reactions.", search: "role of light in photosynthesis" }],
          next_step: "Review the light-dependent reactions." });
    return { ok: true, text: reply, model: "test", inputTokens: 20, outputTokens: 5 };
  },
  db: memDb(),
  now: () => new Date(),
  config: { origins: [], limits: { dayCalls: 300, dayTokens: 400000, minuteCalls: 20 }, maxBodyBytes: 16384 }
};

const server = http.createServer(async (req, res) => {
  const body = await new Promise(r => { let b = ""; req.on("data", c => (b += c)); req.on("end", () => r(b)); });
  const url = new URL(req.url, "http://x");
  if (url.pathname === "/functions/v1/ai") {
    const r = await handle(new Request("http://x" + req.url, { method: req.method, headers: req.headers, body: req.method === "POST" ? body : undefined }), deps);
    res.writeHead(r.status, Object.fromEntries(r.headers));
    return res.end(await r.text());
  }
  // Supabase Auth answers browsers from any origin.
  const cors = { "Access-Control-Allow-Origin": req.headers.origin || "*", "Access-Control-Allow-Headers": "apikey, authorization, content-type, x-client-info", "Access-Control-Allow-Methods": "POST, OPTIONS" };
  if (req.method === "OPTIONS") { res.writeHead(204, cors); return res.end(); }
  const send = (status, data) => { res.writeHead(status, { ...cors, "Content-Type": "application/json" }); res.end(JSON.stringify(data)); };
  const isEmailLink = url.pathname === "/auth/v1/verify" && req.method === "GET"; // opened from the email, no key
  if (!isEmailLink && req.headers.apikey !== "anon-test-key") return send(401, { message: "No API key found in request" });
  const data = JSON.parse(body || "{}");
  // Supabase's default email: a link to /auth/v1/verify, which redirects back with the session in the #fragment.
  if (url.pathname === "/auth/v1/verify" && req.method === "GET") {
    const to = url.searchParams.get("redirect_to");
    if (url.searchParams.get("token") !== LINK_TOKEN) { res.writeHead(303, { Location: `${to}#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired` }); return res.end(); }
    const t = issue();
    res.writeHead(303, { Location: `${to}#access_token=${t.access_token}&refresh_token=${t.refresh_token}&expires_in=3600&token_type=bearer&type=magiclink` });
    return res.end();
  }
  if (url.pathname === "/auth/v1/user" && req.method === "GET") {
    const t = (req.headers.authorization || "").replace("Bearer ", "");
    return srv.sessions.get(t)?.live ? send(200, user) : send(401, { msg: "invalid JWT" });
  }
  if (url.pathname === "/auth/v1/otp") { srv.sent.push(data.email); srv.redirect = url.searchParams.get("redirect_to"); return send(200, {}); }
  if (url.pathname === "/auth/v1/verify") {
    if (data.token_hash) return data.token_hash === LINK_TOKEN && data.type === "magiclink" ? send(200, issue()) : send(403, { code: 403, error_code: "otp_expired", msg: "Token has expired or is invalid" });
    return data.token === CODE && data.email === user.email ? send(200, issue()) : send(403, { code: 403, error_code: "otp_expired", msg: "Token has expired or is invalid" });
  }
  if (url.pathname === "/auth/v1/token" && url.searchParams.get("grant_type") === "refresh_token") {
    const s = [...srv.sessions.entries()].find(([, v]) => v.refresh === data.refresh_token && v.live);
    if (!s) return send(400, { error: "invalid_grant", error_description: "Invalid Refresh Token" });
    s[1].live = false;
    srv.refreshes++;
    return send(200, issue());
  }
  if (url.pathname === "/auth/v1/logout") {
    const t = (req.headers.authorization || "").replace("Bearer ", "");
    if (srv.sessions.get(t)) { srv.sessions.get(t).live = false; srv.revoked++; }
    return send(204, {});
  }
  send(404, {});
});
await new Promise(r => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${server.address().port}`;

// ---------- the extension, configured for the stand-in ----------
const ext = fs.mkdtempSync(path.join(os.tmpdir(), "aim-ext-"));
for (const f of fs.readdirSync(ROOT)) if (!["tests", "supabase", "docs", "tools", ".git"].includes(f)) fs.cpSync(path.join(ROOT, f), path.join(ext, f), { recursive: true });
fs.writeFileSync(path.join(ext, "config.js"), `self.AIM_PLUS = { supabaseUrl: ${JSON.stringify(base)}, supabaseAnonKey: "anon-test-key" };`);

const userData = fs.mkdtempSync(path.join(os.tmpdir(), "aim-"));
const ctx = await chromium.launchPersistentContext(userData, {
  executablePath: process.env.CHROMIUM_PATH || undefined,
  headless: true, args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`]
});
let [sw] = ctx.serviceWorkers();
if (!sw) sw = await ctx.waitForEvent("serviceworker");
const extId = sw.url().split("/")[2];
const step = (name, ok, extra = "") => { console.log(`${ok ? "  ok  " : "  FAIL"} ${name}${extra ? "  — " + extra : ""}`); if (!ok) process.exitCode = 1; };

const opt = await ctx.newPage();
await opt.goto(`chrome-extension://${extId}/options.html`);
await opt.waitForSelector("#plus:not([hidden]) #plusEmail");
step("Settings shows Aim Plus when a server is configured", true);

await opt.fill("#plusEmail", "not an email");
await opt.click("button:text-is('Send sign-in email')");
await opt.waitForFunction(() => /Check the email/.test(document.getElementById("plusMsg").textContent));
step("rejects a malformed email without contacting the server", srv.sent.length === 0);

await opt.fill("#plusEmail", " Learner@Example.com ");
await opt.click("button:text-is('Send sign-in email')");
await opt.waitForSelector("#plusCode");
step("sends a code to the normalized address", srv.sent[0] === "learner@example.com", srv.sent.join());

await opt.fill("#plusCode", "000000");
await opt.click("button:text-is('Sign in')");
await opt.waitForFunction(() => /didn't work/.test(document.getElementById("plusMsg").textContent));
step("a wrong code explains itself", true);

await opt.fill("#plusCode", CODE);
await opt.click("button:text-is('Sign in')");
await opt.waitForSelector("text=Plan: Aim Free");
step("signs in and shows the plan", (await opt.textContent("#plusBody")).includes(user.email));
step("free plan has no AI check", await opt.$("button:text-is('Check connection')") === null);

const local = await sw.evaluate(() => chrome.storage.local.get(null));
step("the session isn't in chrome.storage.local (YouTube tabs can read that)", !/acc-|ref-/.test(JSON.stringify(local)));

srv.plan = "plus";
await opt.reload();
await opt.waitForSelector("button:text-is('Check connection')");
step("plus plan shows AI use", (await opt.textContent("#plusBody")).includes("of 300 requests"));
await opt.click("button:text-is('Check connection')");
await opt.waitForFunction(() => /Connected/.test(document.getElementById("plusMsg").textContent));
step("Check connection reaches the AI endpoint", srv.aiCalls === 1);
step("Settings offers TeachBack on the Plus plan", await opt.isVisible("button:text-is('Test my understanding')"));

// ---------- TeachBack ----------
step("YouTube tabs are told Plus features can be offered", (await sw.evaluate(() => plusBrief())).plus === true);
const [tb] = await Promise.all([ctx.waitForEvent("page"), opt.click("button:text-is('Test my understanding')")]);
tb.on("dialog", d => d.accept());
await tb.waitForSelector("#tbTopic");
await tb.fill("#tbTopic", "Photosynthesis");
await tb.fill("#tbNotes", "Chapter 8: light reactions, Calvin cycle, chloroplasts");
await tb.click("#tbStart");
await tb.waitForSelector("#tbQuestion");
step("TeachBack starts with Milo's first question", (await tb.textContent("#tbQuestion")).includes("What does a plant actually make") &&
  (await tb.textContent("main")).includes("Milo"));
step("the study notes reach the server", [...deps.db.assessments.values()][0]?.notes?.includes("Calvin cycle"));
if (process.env.SHOTS) await tb.screenshot({ path: `${process.env.SHOTS}/teachback-question.png`, fullPage: true });
await tb.fill("#tbAnswer", "It makes glucose and oxygen from carbon dioxide and water.");
await tb.click("#tbSend");
await tb.waitForFunction(() => /glucose later/.test(document.getElementById("tbQuestion")?.textContent || ""));
step("a follow-up from Ivy, on the same objective", (await tb.textContent("#tbProgress")).includes("Objective 1 of 3 · Question 2"));
await tb.click("button:text-is('Give me a hint')");
await tb.waitForSelector("text=keeps for later");
step("a hint appears and the button counts down", await tb.isVisible("button:text-is('Another hint')"));
await tb.fill("#tbAnswer", "It stores the glucose as starch for energy.");
await tb.click("#tbSend");
await tb.waitForFunction(() => /How do we know/.test(document.getElementById("tbQuestion")?.textContent || ""));
await tb.click("button:text-is('Skip')");
await tb.waitForFunction(() => /Which part of the cell/.test(document.getElementById("tbQuestion")?.textContent || ""));
step("skipping moves on", (await tb.textContent("#tbProgress")).includes("Objective 3 of 3"));
await tb.click("button:text-is('End session')");
await tb.waitForSelector("h1:text-is('What you showed')");
const res = await tb.textContent("main");
step("results: demonstrated with evidence in your own words", res.includes("Demonstrated") && res.includes("You said: “glucose and oxygen”"));
step("results: hints and skipped parts are shown honestly", res.includes("With hints") && res.includes("Not assessed") && res.includes("Ended early"));
step("results: review links and next actions", res.includes("Review this on YouTube") && res.includes("Review weak areas") && res.includes("Try again"));
if (process.env.SHOTS) await tb.screenshot({ path: `${process.env.SHOTS}/teachback-results.png`, fullPage: true });
await tb.reload();
await tb.waitForSelector("h1:text-is('What you showed')");
step("results come back after reloading the page", true);
await tb.close();

// An expired access token refreshes quietly, once, even with calls racing.
await sw.evaluate(async () => { const s = await loadSession(); s.expiresAt = Date.now() - 1000; await saveSession(s); });
const tokens = await sw.evaluate(() => Promise.all([accessToken(), accessToken(), accessToken()]));
step("expired session refreshes once for racing calls", srv.refreshes === 1 && new Set(tokens).size === 1, `refreshes=${srv.refreshes}`);

// A revoked session (signed out elsewhere) falls back to signed out.
for (const v of srv.sessions.values()) v.live = false;
await sw.evaluate(async () => { const s = await loadSession(); s.expiresAt = Date.now() - 1000; await saveSession(s); });
await opt.reload();
await opt.waitForSelector("#plusEmail");
step("a revoked session shows the sign-in form again", (await sw.evaluate(() => loadSession())) === null);

// Sign in again, then sign out.
await opt.fill("#plusEmail", user.email);
await opt.click("button:text-is('Send sign-in email')");
await opt.fill("#plusCode", CODE);
await opt.click("button:text-is('Sign in')");
await opt.waitForSelector("button:text-is('Sign out')");
const revokedBefore = srv.revoked;
await opt.click("button:text-is('Sign out')");
await opt.waitForSelector("#plusEmail");
step("sign out clears the session and revokes it on the server", (await sw.evaluate(() => loadSession())) === null && srv.revoked === revokedBefore + 1);

// ---------- sign-in with the link in Supabase's default email ----------
const emailLink = token => `${base}/auth/v1/verify?token=${token}&type=magiclink&redirect_to=${encodeURIComponent(srv.redirect)}`;
await opt.fill("#plusEmail", user.email);
await opt.click("button:text-is('Send sign-in email')");
await opt.waitForSelector("#plusCode");
step("the email asks Supabase to send the link back to Aim's sign-in page",
  srv.redirect?.startsWith(`chrome-extension://${extId}/signin.html?state=`), srv.redirect);
// Clicking the link: Supabase's page redirects to the extension, which finishes the sign-in.
const landing = await ctx.newPage();
await landing.goto(emailLink(LINK_TOKEN));
await landing.waitForSelector("h1:text-is(\"You're signed in\")");
step("clicking the emailed link signs in", (await sw.evaluate(() => loadSession()))?.email === user.email);
step("the tokens don't stay in the address bar", !landing.url().includes("#") && !landing.url().includes("state="));
await opt.bringToFront();
await opt.evaluate(() => window.dispatchEvent(new Event("focus")));
await opt.waitForSelector("button:text-is('Sign out')");
step("Settings notices the sign-in from the other tab", true);
// The same link can't sign in twice, and a link this browser didn't start is refused.
await landing.goto(`chrome-extension://${extId}/signin.html?state=not-ours#access_token=x&refresh_token=y`);
await landing.waitForSelector("h1:text-is(\"Sign-in didn't work\")");
step("a link this browser didn't start is refused", (await landing.textContent("p")).includes("wasn't started here"));
await opt.click("button:text-is('Sign out')");
await opt.waitForSelector("#plusEmail");
// Pasting the link instead (when the email opens in another browser).
await opt.fill("#plusEmail", user.email);
await opt.click("button:text-is('Send sign-in email')");
await opt.waitForSelector("#plusCode");
await opt.fill("#plusCode", emailLink(LINK_TOKEN));
await opt.click("button:text-is('Sign in')");
await opt.waitForSelector("button:text-is('Sign out')");
step("pasting the emailed link signs in", (await sw.evaluate(() => loadSession()))?.email === user.email);
await opt.click("button:text-is('Sign out')");
await opt.waitForSelector("#plusEmail");
await opt.fill("#plusEmail", user.email);
await opt.click("button:text-is('Send sign-in email')");
await opt.fill("#plusCode", emailLink("expired0000000000000000"));
await opt.click("button:text-is('Sign in')");
await opt.waitForFunction(() => /didn't work/.test(document.getElementById("plusMsg").textContent));
step("an old or used link explains itself", true);
await landing.close();

// Aim Free keeps working alongside: the regular settings still save.
await opt.selectOption("#leisureMin", "30");
await opt.waitForTimeout(200);
step("regular settings still save", (await sw.evaluate(() => chrome.storage.local.get("settings"))).settings.leisureMin === 30);

await ctx.close();
server.close();
console.log(process.exitCode ? "\nSome checks failed." : "\nAll Plus checks passed.");
