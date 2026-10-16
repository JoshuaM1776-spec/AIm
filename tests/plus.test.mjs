// Aim Plus end to end: loads a copy of the extension pointed at a local stand-in for Supabase
// (Auth plus the real AI endpoint logic from supabase/functions/ai/handler.ts) and signs in
// through the Settings page.
// Run: node --experimental-strip-types tests/plus.test.mjs   (needs Playwright, like browser.test.js)
import { createRequire } from "node:module";
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { handle } from "../supabase/functions/ai/handler.ts";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT || "playwright");
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

// ---------- stand-in server ----------
const CODE = "123456";
const srv = { sent: [], refreshes: 0, revoked: 0, aiCalls: 0, plan: "free", expiresIn: 3600, sessions: new Map(), n: 0 };
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
  callClaude: async () => (srv.aiCalls++, { ok: true, text: "ready", model: "test", inputTokens: 20, outputTokens: 5 }),
  now: () => new Date(),
  config: { origins: [], limits: { dayCalls: 300, dayTokens: 400000, minuteCalls: 20 }, maxBodyBytes: 8192 }
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
  if (req.headers.apikey !== "anon-test-key") return send(401, { message: "No API key found in request" });
  const data = JSON.parse(body || "{}");
  if (url.pathname === "/auth/v1/otp") { srv.sent.push(data.email); return send(200, {}); }
  if (url.pathname === "/auth/v1/verify") {
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
await opt.click("button:text-is('Send code')");
await opt.waitForFunction(() => /Check the email/.test(document.getElementById("plusMsg").textContent));
step("rejects a malformed email without contacting the server", srv.sent.length === 0);

await opt.fill("#plusEmail", " Learner@Example.com ");
await opt.click("button:text-is('Send code')");
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
await opt.click("button:text-is('Send code')");
await opt.fill("#plusCode", CODE);
await opt.click("button:text-is('Sign in')");
await opt.waitForSelector("button:text-is('Sign out')");
const revokedBefore = srv.revoked;
await opt.click("button:text-is('Sign out')");
await opt.waitForSelector("#plusEmail");
step("sign out clears the session and revokes it on the server", (await sw.evaluate(() => loadSession())) === null && srv.revoked === revokedBefore + 1);

// Aim Free keeps working alongside: the regular settings still save.
await opt.selectOption("#leisureMin", "30");
await opt.waitForTimeout(200);
step("regular settings still save", (await sw.evaluate(() => chrome.storage.local.get("settings"))).settings.leisureMin === 30);

await ctx.close();
server.close();
console.log(process.exitCode ? "\nSome checks failed." : "\nAll Plus checks passed.");
