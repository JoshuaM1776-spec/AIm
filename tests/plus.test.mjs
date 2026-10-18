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
const srv = { deletedUsers: [], rankCalls: 0, lastAskPrompt: "",
  ask: [
    { target: "Replace the alternator on my 2014 Tacoma", kind: "project", note: "The steps differ between the 2.7L and 4.0L engines.",
      searches: ["2014 tacoma alternator replacement", "tacoma alternator removal tools"], question: "Which engine does it have?",
      options: ["2.7L four-cylinder", "4.0L V6"], same_target: true },
    { target: "Replace the alternator on my 2014 Tacoma", kind: "project", note: "Here are V6-specific walkthroughs.",
      searches: ["2014 tacoma 4.0 v6 alternator replacement"], question: "", options: [], same_target: true }
  ],
  rank: req => ({ groups: [{ label: "Start here", videos: [{ id: "alt1aaa", reason: "Covers the 2014 Tacoma specifically" }, { id: "alt2bbb", reason: "Shows the tools you need" }] }] }),
  director: [
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
      : props.includes("topics") ? (srv.studyPrompt = req.prompt, { title: "Cellular respiration", scope_note: "",
          topics: [{ title: "Glycolysis", brief: "Glucose is split into pyruvate in the cytoplasm.", searches: ["glycolysis explained"] },
            { title: "Krebs cycle", brief: "Pyruvate's carbon is released as CO2 in the mitochondria.", searches: ["krebs cycle explained"] }] })
      // Pathways (pathways.ts), told apart by their schemas.
      : props.includes("regulated") ? (srv.videoCalls = (srv.videoCalls || 0) + 1, srv.videoPrompt = req.prompt, { subject: "Biology", regulated: false, references: [],
          concepts: [{ name: "Glycolysis", summary: "Glucose is split into two pyruvate.", chapter: 1, basis: "listed",
              contexts: [{ label: "Glycolysis in sprinting muscles", search: "glycolysis during sprinting" }, { label: "Fermentation in bread dough", search: "yeast fermentation bread glycolysis" }] },
            { name: "ATP yield", summary: "The energy glycolysis makes.", chapter: -1, basis: "likely", contexts: [] }] })
      : props.includes("uses") ? (srv.wherePrompt = req.prompt, { intro: "Algebra is how people find an unknown.",
          uses: [{ field: "Aviation", how: "Pilots plan fuel.", problem: "A plane burns 9 gallons an hour. How long do 45 gallons last?", hint: "Divide.", answer: "5 hours" }] })
      : props.includes("themes") ? { themes: [{ name: "aviation", offer: "You've been exploring aviation. Want to see some of the careers connected to it?",
          evidence: [...req.prompt.matchAll(/^(\d+)\. [^\n]*: (yes|maybe)/gm)].map(m => Number(m[1])) }] }
      : props.includes("careers") ? (srv.careersPrompt = req.prompt, { careers: [{ title: "Aircraft Mechanic", what: "Inspects and repairs aircraft.", connection: "You like how planes work." },
          { title: "Air Traffic Controller", what: "Guides aircraft safely.", connection: "Flight, from the ground." }] })
      : props.includes("tagline") ? { tagline: "Keep aircraft safe and ready to fly.", environment: "Hangars and shops", physical: "Moderate to high: lifting, ladders",
          education: "Certificate, apprenticeship or military", enjoy_if: ["You enjoy hands-on problem solving", "You like tools and machinery", "You like exact, careful work"], overview_search: "aircraft mechanic explained" }
      : props.includes("realities") ? { summary: "Inspections, repairs and a lot of paperwork.", realities: ["Every step is logged", "Night shifts happen"], searches: ["aircraft mechanic day in the life", "what I wish I knew before becoming an aircraft mechanic"] }
      : props.includes("client") ? { title: "Inspect a bicycle like an aircraft", client: "A cycling club", brief: "They want every bike checked before a race.",
          constraints: ["One hour per bike", "Every step logged"], deliverable: "A signed inspection log", materials: ["A bicycle", "A notebook"],
          steps: ["Write the checklist", "Inspect", "Log it"], rubric: [{ criterion: "Complete log", good: "Every item checked and signed" }],
          time: "One afternoon", together: true, together_reason: "Uses tools on a real bike.", skills: ["Attention to detail"] }
      : props.length === 1 && props[0] === "questions" ? { questions: ["Which steps make the most ATP?", "Where does each stage happen?"] }
      : props.includes("questions") ? { questions: ["What surprised you most?", "What does a hard day look like?"], ways: ["Ask family friends"], searches: ["aircraft hangar tour"] }
      : props.includes("routes") ? { skills: ["Troubleshooting"], knowledge: ["Aircraft systems"], study_next: ["Basic electricity"],
          routes: [{ route: "Aviation maintenance school", what: "An approved program, then exams.", time: "18 to 24 months" }] }
      : props.includes("searches") ? (srv.lastAskPrompt = req.prompt, srv.ask.shift())
      : props.includes("groups") ? (srv.rankCalls++, srv.rank(req))
      : { summary: "You explained what photosynthesis produces. Light and location weren't covered yet.", strengths: ["What photosynthesis produces"],
          objectives: [{ index: 1, note: "Clear and accurate.", explanation: "", search: "" },
            { index: 2, note: "Skipped.", explanation: "Light supplies the energy that drives the reactions.", search: "role of light in photosynthesis" }],
          next_step: "Review the light-dependent reactions." });
    return { ok: true, text: reply, model: "test", inputTokens: 20, outputTokens: 5 };
  },
  db: memDb(),
  account: {
    exportData: async () => ({ profile: { plan: srv.plan }, aiUsage: usage.map(() => ({ task: "x" })), learners: [...deps.db.learners.keys()].map(id => ({ id })),
      assessments: [...deps.db.assessments.values()], assessmentTurns: [], progress: deps.db.progress }),
    deleteUser: async id => { srv.deletedUsers.push(id); for (const v of srv.sessions.values()) v.live = false; }
  },
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
await new Promise(r => setTimeout(r, 500));
await sw.evaluate(() => serial(() => setOnboarding({ seenAll: true }))); // first-time tips are checked in browser.test.js
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

// ---------- the librarian on a stand-in YouTube ----------
const ytPage = body => `<!doctype html><html><head><title>YouTube</title></head><body>
<ytd-masthead><div id="center"></div><div id="end"></div></ytd-masthead>${body}</body></html>`;
const ytResults = q => ytPage(`<ytd-search><div><ytd-section-list-renderer>${[["alt1aaa", `Tacoma alternator replacement (${q})`, "Truck Shop"],
  ["alt2bbb", "Alternator tools you need", "DIY Garage"], ["alt3ccc", "Funny truck fails", "Clips"]].map(([id, t, c]) =>
  `<ytd-video-renderer><a id="video-title" href="/watch?v=${id}">${t}</a><ytd-channel-name><a href="/@${c.replace(/ /g, "")}">${c}</a></ytd-channel-name>
   <div id="metadata-line">120K views · 2 years ago</div><div class="metadata-snippet-text">How to replace it step by step</div></ytd-video-renderer>`).join("")}
</ytd-section-list-renderer></div></ytd-search>`);
const ytWatch = id => ytPage(`<ytd-watch-flexy video-id="${id}"><ytd-watch-metadata><h1 class="ytd-watch-metadata"><yt-formatted-string>Video ${id}</yt-formatted-string></h1>
  <div id="owner"><div id="channel-name"><a href="/@chan">Chan</a></div></div>
  <div id="description-inline-expander" style="white-space:pre-line">How cells break down glucose.
0:00 Intro
2:15 Glucose comes in
6:40 Pyruvate goes out</div></ytd-watch-metadata>
  <div id="movie_player"><video class="html5-main-video" muted></video></div><div id="secondary"><div id="related">related</div></div></ytd-watch-flexy>`);
await ctx.route(/^https:\/\/www\.youtube\.com\//, route => {
  const u = new URL(route.request().url());
  if (u.pathname === "/oembed") return route.fulfill({ contentType: "application/json", body: '{"title":"x","author_name":"y","author_url":"https://www.youtube.com/@y"}' });
  const body = u.pathname === "/results" ? ytResults(u.searchParams.get("search_query") || "")
    : u.pathname === "/watch" ? ytWatch(u.searchParams.get("v"))
    : ytPage(`<ytd-browse page-subtype="home"><div id="primary"><ytd-rich-grid-renderer></ytd-rich-grid-renderer></div></ytd-browse>`);
  route.fulfill({ contentType: "text/html", body, headers: { "content-security-policy": "require-trusted-types-for 'script'" } });
});
const yt = await ctx.newPage();
// The librarian folds away unless it has something new for this search; open it when it's folded.
async function openLibrarian() {
  await yt.waitForSelector("#wp-results-bar [aria-label='Ask the librarian'], .wp-lib-input");
  if (!(await yt.$(".wp-lib-input"))) await yt.click("#wp-results-bar [aria-label='Ask the librarian']");
  await yt.waitForSelector(".wp-lib-input");
}
await yt.goto("https://www.youtube.com/");
await yt.waitForSelector("#wp-home");
step("signed in, the homepage invites requests for the librarian", (await yt.textContent("#wp-home")).includes("It'll help you find it"));
await yt.fill(".wp-home-input", "I need to replace the alternator on my 2014 Tacoma");
await yt.press(".wp-home-input", "Enter");
await yt.waitForURL(/results\?search_query=2014%20tacoma%20alternator%20replacement/);
await yt.waitForSelector("#wp-lib .wp-lib-note");
let bar = await yt.textContent("#wp-results-bar");
step("the request becomes a Target and the librarian's best search runs on YouTube",
  bar.includes("Replace the alternator on my 2014 Tacoma") && bar.includes("The steps differ between the 2.7L and 4.0L engines."), bar.slice(0, 160));
step("one question, as choices, plus its other search", bar.includes("Which engine does it have?") && bar.includes("4.0L V6") && bar.includes("tacoma alternator removal tools"));
await yt.waitForSelector("#wp-picks .wp-pick");
const picks = await yt.textContent("#wp-picks");
step("the librarian's picks from YouTube's results, with reasons", picks.includes("Start here") && picks.includes("Covers the 2014 Tacoma specifically") &&
  !picks.includes("Funny truck fails"), picks.slice(0, 160));
step("YouTube's own results stay below", await yt.isVisible("text=Funny truck fails"));
if (process.env.SHOTS) { await yt.setViewportSize({ width: 1100, height: 760 }); await yt.screenshot({ path: `${process.env.SHOTS}/librarian-results.png` }); }
const rankAfterFirst = srv.rankCalls;
await yt.reload();
await yt.waitForSelector("#wp-picks .wp-pick");
step("picks are remembered for that search (no second AI call)", srv.rankCalls === rankAfterFirst);
await yt.click("#wp-lib button:text-is('4.0L V6')");
await yt.waitForURL(/search_query=2014%20tacoma%204\.0%20v6/);
await yt.waitForSelector("#wp-lib .wp-lib-note:text('V6-specific')");
step("answering the question continues the same Target, with context", srv.lastAskPrompt.includes("CURRENT TARGET: Replace the alternator on my 2014 Tacoma") &&
  srv.lastAskPrompt.includes("Which engine does it have?") && srv.lastAskPrompt.includes("THE PERSON NOW SAYS: 4.0L V6"));
const libState = await sw.evaluate(() => chrome.storage.local.get("purpose").then(d => d.purpose));
step("the conversation is kept with the Target, in this browser", libState.librarian.thread.length === 4 && libState.text === "Replace the alternator on my 2014 Tacoma");
step("the results bar is one compact row: Target, Change, done and the librarian", bar.includes("Change") &&
  !!(await yt.$("#wp-results-bar [aria-label='Target complete']")) && !!(await yt.$("#wp-results-bar [aria-label='Hide the librarian']")));
const asksBefore = srv.ask.length, callsBefore = srv.aiCalls;
await yt.fill(".wp-lib-input", "serpentine belt");
await yt.press(".wp-lib-input", "Enter");
await yt.waitForURL(/search_query=serpentine%20belt/);
step("a plain search goes straight to YouTube, no AI", srv.aiCalls === callsBefore && srv.ask.length === asksBefore);
// It shares no word with the Target, so Aim asks first, as with any search.
await yt.click("button:text-is(\"Yes, it's part of it\")");
// When the librarian can't help, the request still searches YouTube.
srv.ask.push(undefined);
step("with nothing new to say, the librarian stays folded away", await (async () => {
  await yt.waitForSelector("#wp-results-bar [aria-label='Ask the librarian']"); return !(await yt.$("#wp-lib")); })());
await openLibrarian();
await yt.fill(".wp-lib-input", "what socket size do I need for the tensioner bolt?");
await yt.press(".wp-lib-input", "Enter");
await yt.waitForURL(/search_query=what%20socket%20size/);
step("if the librarian fails, the request is searched on YouTube as typed", true);

// ---------- a study session ----------
srv.ask.push({ target: "Cellular respiration exam Friday", kind: "learn", note: "Start with glycolysis, then the Krebs cycle.",
  searches: ["cellular respiration explained"], question: "", options: [], same_target: false });
await yt.goto("https://www.youtube.com/results?search_query=serpentine%20belt");
await openLibrarian();
await yt.fill(".wp-lib-input", "I'm struggling with cellular respiration and have an exam Friday");
await yt.press(".wp-lib-input", "Enter");
await yt.waitForURL(/search_query=cellular%20respiration%20explained/);
await yt.waitForSelector("button:text-is('Organize a study session')");
step("a learning goal offers a study session (Plus)", (await yt.textContent("#wp-results-bar")).includes("Studying this?"));
await yt.click("button:text-is('Organize a study session')");
await yt.fill(".wp-dialog textarea", "Unit 3\n- glycolysis\n- Krebs cycle");
await yt.click(".wp-dialog button:text-is('Start')");
await yt.waitForURL(/search_query=glycolysis%20explained/);
step("the study guide shapes the plan", srv.studyPrompt.includes("Unit 3\n- glycolysis"));
await yt.waitForSelector(".wp-study-bar");
bar = await yt.textContent("#wp-results-bar");
step("a topic's results lead with the topic and its brief", bar.includes("Topic 1 of 2") && bar.includes("Glucose is split into pyruvate"));
await yt.waitForSelector("#wp-picks .wp-pick");
await yt.waitForTimeout(400);
let study = (await sw.evaluate(() => chrome.storage.local.get("purpose").then(d => d.purpose))).study;
step("the librarian's picks become the topic's videos", study.topics[0].videos.map(v => v.id).join() === "alt1aaa,alt2bbb", JSON.stringify(study.topics[0].videos));
await yt.goto("https://www.youtube.com/watch?v=alt1aaa");
await yt.waitForSelector("#wp-study");
const panel = await yt.textContent("#wp-study");
step("on the video, the study plan replaces Up next", panel.includes("Study session") && panel.includes("Topic 1 of 2") && panel.includes("Krebs cycle") &&
  !(await yt.$("#wp-upnext")));
// ---------- In this video ----------
await yt.waitForSelector("#wp-concepts .wp-concept");
const conceptsText = await yt.textContent("#wp-concepts");
step("In this video: the concepts, from the title, description and chapters", conceptsText.includes("Glycolysis") && conceptsText.includes("2:15") &&
  conceptsText.includes("not its audio") && conceptsText.includes("likely") && srv.videoPrompt.includes("1. 2:15 Glucose comes in") && srv.videoPrompt.includes("THE STUDENT'S GOAL:"));
await yt.click("#wp-concepts .wp-concept >> nth=0");
step("each concept: another context to see it in, as a YouTube search", (await yt.getAttribute("#wp-concepts .wp-concept-context >> nth=0", "href")).includes("search_query=glycolysis%20during%20sprinting"));
if (process.env.SHOTS) { await yt.setViewportSize({ width: 1100, height: 760 }); await yt.addStyleTag({ content: "ytd-watch-flexy{display:grid;grid-template-columns:1fr 380px;gap:24px;padding:24px} #movie_player{aspect-ratio:16/9;background:#000;border-radius:12px} #secondary{grid-column:2;grid-row:1/4}" });
  await yt.screenshot({ path: `${process.env.SHOTS}/study-panel.png` }); }
await yt.evaluate(() => document.querySelector("video").dispatchEvent(new Event("ended")));
await yt.waitForSelector(".wp-notice:has-text('Test yourself on this video?')");
step("when the video ends (never during it), Aim offers a test on it", (await yt.textContent(".wp-notice")).includes("glycolysis"));
const [vtest] = await Promise.all([ctx.waitForEvent("page"), yt.click(".wp-notice button:text-is('Test me')")]);
await vtest.waitForSelector("#tbTopic");
step("Test me on this video: TeachBack on the video, its concepts as the notes", (await vtest.inputValue("#tbTopic")) === "Video alt1aaa" &&
  (await vtest.inputValue("#tbNotes")).includes("- Glycolysis: Glucose is split") && vtest.url().includes("video=alt1aaa") && vtest.url().includes("study="));
await vtest.close();
const callsBeforeReload = srv.videoCalls;
await yt.reload();
await yt.waitForSelector("#wp-concepts .wp-concept");
step("a video is looked at once (kept in this browser)", srv.videoCalls === callsBeforeReload);
srv.director.push({ evaluation: ev("sound", "pyruvate in the cytoplasm"), next: { action: "finish", objective: 0, student: "milo", kind: "question", question: "" } });
const [check] = await Promise.all([ctx.waitForEvent("page"), yt.click("#wp-study button:text-is('Check yourself')")]);
await check.waitForSelector("#tbTopic");
step("Check yourself opens TeachBack on the topic, with its brief as notes", (await check.inputValue("#tbTopic")).startsWith("Glycolysis") &&
  (await check.inputValue("#tbNotes")).includes("Glucose is split into pyruvate"));
await check.click("#tbStart");
await check.waitForSelector("#tbQuestion");
await check.fill("#tbAnswer", "Glucose becomes pyruvate in the cytoplasm.");
check.on("dialog", d => d.accept());
await check.click("#tbSend");
await check.waitForFunction(() => /Question 2/.test(document.getElementById("tbProgress")?.textContent || ""));
await check.click("button:text-is('End session')");
await check.waitForSelector("h1:text-is('What you showed')");
await check.waitForTimeout(500);
study = (await sw.evaluate(() => chrome.storage.local.get("purpose").then(d => d.purpose))).study;
step("the check's result goes back to the study session", !!study.topics[0].check && study.topics[0].check.objectives.length === 3, JSON.stringify(study.topics[0].check));
// ---------- Pathways pieces on TeachBack's results ----------
await check.click(".pw-interest button:text-is('Yes')");
await check.waitForTimeout(300);
let interests = (await sw.evaluate(() => chrome.storage.local.get("interests"))).interests || [];
step("Want more of this? is the student's own answer, kept in this browser", interests.length === 1 && interests[0].answer === "yes" && interests[0].source === "teachback" &&
  interests[0].topic.startsWith("Glycolysis"));
await check.click(".pw-where-btn:text-is('Where could this take me?')");
await check.waitForSelector(".pw-where .pw-use");
if (process.env.SHOTS) await check.screenshot({ path: `${process.env.SHOTS}/where-teachback.png`, fullPage: true });
step("Where could this take me? shows where it's used, with a problem to try and the answer hidden", (await check.textContent(".pw-where")).includes("Aviation") &&
  await check.isHidden(".pw-reveal >> nth=-1") && srv.wherePrompt.includes("SUBJECT OR TOPIC: Glycolysis"));
await check.close();
await yt.waitForTimeout(300);
await yt.click("#wp-study button:has-text('Next topic')");
await yt.waitForURL(/search_query=krebs%20cycle%20explained/);
await yt.waitForSelector(".wp-study-bar");
step("Next topic moves on", (await yt.textContent(".wp-study-bar")).includes("Topic 2 of 2"));

// ---------- Pathways ----------
const pw = await ctx.newPage();
pw.on("pageerror", e => console.log("pathways page error:", e.message));
pw.on("dialog", d => d.accept());
await pw.goto(`chrome-extension://${extId}/pathways.html`);
await pw.waitForSelector("button:text-is('Turn on Pathways')");
step("Pathways starts off, explains what it uses, and asks where you are", (await pw.textContent("main")).includes("Never your watch history") &&
  (await pw.textContent("main")).includes("What could I do with it?"));
await pw.click(".seg button:text-is('High school')");
await pw.click("button:text-is('Turn on Pathways')");
await pw.waitForSelector("h2:has-text(\"Explore something\")");
await pw.fill(".ask input", "aviation");
await pw.click(".ask button");
await pw.waitForSelector("button:text-is('Explore this path')");
if (process.env.SHOTS) { await pw.setViewportSize({ width: 1280, height: 900 }); await pw.screenshot({ path: `${process.env.SHOTS}/careers.png`, fullPage: true }); }
step("a typed interest shows connected careers", (await pw.textContent("main")).includes("Aircraft Mechanic") && srv.careersPrompt.includes("THE STUDENT'S INTEREST: aviation"));
await pw.click(".career-card:has-text('Aircraft Mechanic') button:text-is('Explore this path')");
await pw.waitForSelector(".hero h1");
await pw.waitForSelector(".enjoy");
const pathText = await pw.textContent("main");
step("a path: hero, four steps with Try it marked most important, quick facts with official figures, and 'you might enjoy this if'",
  pathText.includes("Aircraft Mechanic") && pathText.includes("Keep aircraft safe") && ["See it", "Try it", "Meet it", "Prepare for it", "Most important", "Hangars and shops", "See official figures on O*NET", "You might enjoy this if", "Related paths", "Air Traffic Controller"].every(t => pathText.includes(t)) &&
  !/\$\d/.test(pathText));
await pw.waitForSelector(".story");
if (process.env.SHOTS) { await pw.setViewportSize({ width: 1280, height: 1000 });
  for (const scheme of ["light", "dark"]) { await pw.emulateMedia({ colorScheme: scheme }); await pw.waitForTimeout(200); await pw.screenshot({ path: `${process.env.SHOTS}/path-${scheme}.png`, fullPage: true }); }
  await pw.emulateMedia({ colorScheme: "light" }); }
step("Real people, real stories: YouTube searches", (await pw.getAttribute(".story >> nth=0", "href")).includes("search_query=aircraft%20mechanic%20day%20in%20the%20life"));
await pw.click(".tabs button:has-text('Try it')");
await pw.waitForSelector(".brief");
if (process.env.SHOTS) await pw.screenshot({ path: `${process.env.SHOTS}/path-try.png`, fullPage: true });
const brief = await pw.textContent(".brief");
step("Try it is a real brief: client, constraints, deliverable, a professional's rubric, Do this together", ["For: A cycling club", "Constraints", "Every step logged", "How a professional would judge it", "Do this together"].every(t => brief.includes(t)));
await pw.click("button:text-is('I did it')");
await pw.fill(".reflect textarea >> nth=0", "Finding the loose brake cable");
await pw.fill(".reflect textarea >> nth=1", "Logging every single step got repetitive");
await pw.click(".reflect .seg button:text-is('Not for me')");
if (process.env.SHOTS) await pw.screenshot({ path: `${process.env.SHOTS}/path-reflect.png` });
await pw.click(".reflect button:text-is('Save')");
await pw.waitForSelector("h2:has-text(\"found out\")");
const pwState = await sw.evaluate(() => chrome.storage.local.get(["pathways", "interests"]));
const ex = pwState.pathways.explorations[0];
step("'Not for me' is saved as a result, in the student's words", ex.reflection.further === "no" && ex.done.try && !!ex.endedAt && ex.reflection.harder.includes("repetitive") &&
  pwState.interests.some(i => i.source === "path" && i.answer === "no") && (await pw.textContent("main")).includes("Not for me"));
await sw.evaluate(() => serial(() => recordInterest({ topic: "How wings make lift", source: "study", answer: "yes" })));
await pw.click("button:text-is('Look again')");
await pw.waitForSelector(".theme-card");
if (process.env.SHOTS) await pw.screenshot({ path: `${process.env.SHOTS}/pathways-home.png`, fullPage: true });
step("themes come from what the student was keen on", (await pw.textContent(".theme-card")).includes("Aviation") && (await pw.textContent(".theme-card")).includes("How wings make lift"));
await yt.goto("https://www.youtube.com/");
await yt.waitForSelector(".wp-theme-offer");
if (process.env.SHOTS) { await yt.setViewportSize({ width: 1100, height: 760 }); await yt.screenshot({ path: `${process.env.SHOTS}/theme-offer.png` }); }
step("the homepage offers the theme once, lightly", (await yt.textContent(".wp-theme-offer")).includes("You've been exploring aviation"));
await yt.click(".wp-theme-offer button:text-is('Not now')");
await yt.waitForTimeout(500);
step("Not now: offered, and not shown again", !(await yt.$(".wp-theme-offer")) && !!(await sw.evaluate(() => chrome.storage.local.get("pathways"))).pathways.themes[0].offeredAt);
await pw.click("button:text-is('Turn off Pathways and delete its data')");
await pw.waitForSelector("button:text-is('Turn on Pathways')");
const gone = await sw.evaluate(() => chrome.storage.local.get(["pathways", "interests"]));
step("turning Pathways off deletes all of it", !gone.pathways && !gone.interests);
await pw.close();
await yt.goto("https://www.youtube.com/results?search_query=krebs%20cycle%20explained");
await yt.waitForSelector(".wp-study-bar");
const [overview] = await Promise.all([ctx.waitForEvent("page"), yt.click(".wp-study-bar button:text-is('See summary')")]);
await overview.waitForSelector("h1:text-is('Cellular respiration')");
const ov = await overview.textContent("main");
step("the summary shows topics, videos, checks and what to review", ov.includes("2 topics · 1 checked") && ov.includes("Glycolysis") &&
  ov.includes("What your check showed") && ov.includes("Worth reviewing") && !/null|\[object/.test(ov), ov.slice(0, 200));
overview.on("dialog", d => d.accept());
await overview.click("button:text-is('End study session')");
await overview.waitForSelector("text=Session ended");
step("ending the session keeps the summary", true);
await overview.close();

// ---------- notes on a Target ----------
await yt.click("#wp-chip .wp-pill");
await yt.click(".wp-dropdown button:has-text('Add notes')");
await yt.waitForSelector(".wp-notes-dialog textarea");
await yt.fill(".wp-notes-dialog textarea", "Exam Friday 9am.\n");
await yt.click(".wp-notes-dialog button:has-text('Suggest questions')");
await yt.waitForFunction(() => /most ATP/.test(document.querySelector(".wp-notes-dialog textarea")?.value || ""));
await yt.click(".wp-notes-dialog button:text-is('Done')");
await yt.waitForTimeout(700);
let notesNow = (await sw.evaluate(() => chrome.storage.local.get("purpose"))).purpose.notes;
step("notes on a Target save as you type, and Suggest questions adds to them", notesNow.startsWith("Exam Friday 9am.") && notesNow.includes("- Which steps make the most ATP?"), JSON.stringify(notesNow));
step("the results bar shows there are notes", !!(await yt.$("#wp-results-bar .wp-rb-icon.has[aria-label='Notes']")));

// ---------- relax with a theme ----------
srv.ask.push({ target: "Fun biology", kind: "relax", note: "Picked with your exam in mind.", searches: ["weird biology facts documentary", "amazing cells"], question: "", options: [], same_target: true });
await yt.goto("https://www.youtube.com/");
await yt.waitForSelector("#wp-home .wp-home-input");
await yt.fill(".wp-home-input", "I just want to enjoy some fun videos");
await yt.press(".wp-home-input", "Enter");
await yt.waitForURL(/search_query=weird%20biology/);
await yt.waitForSelector("#wp-results-bar.wp-rb-relax");
let relaxState = await sw.evaluate(() => chrome.storage.local.get(["brk", "purpose"]));
step("a request to relax starts a break with a theme, and the Target waits", relaxState.brk?.theme?.text === "Fun biology" && relaxState.brk.durationMin === 30 &&
  relaxState.purpose?.suspended === true && (await yt.textContent("#wp-chip")).includes("Relax: Fun biology"));
step("the librarian sees recent Targets, for a vague request", srv.lastAskPrompt.includes("THEIR RECENT TARGETS:"));
step("relaxing: no study offers, no picks to work through", !(await yt.$("button:text-is('Organize a study session')")) && (await yt.textContent("#wp-results-bar")).includes("Relaxing"));
await yt.waitForTimeout(500);
await yt.goto("https://www.youtube.com/watch?v=alt2bbb");
await yt.waitForSelector("#wp-theme-panel");
step("beside a video: More on the theme, from its searches", (await yt.textContent("#wp-theme-panel")).includes("More on fun biology") && !(await yt.$("#wp-concepts")));
await yt.click("#wp-chip .wp-pill");
await yt.click(".wp-dropdown button:has-text('Back on Target')");
await yt.waitForTimeout(600);
relaxState = await sw.evaluate(() => chrome.storage.local.get(["brk", "history"]));
step("back on Target: the themed break is over and recorded with its theme", !relaxState.brk && relaxState.history.some(h => h.type === "break" && h.theme === "Fun biology"));
await yt.close();

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

// ---------- your data ----------
// Still on the code step from the expired link above.
await opt.fill("#plusCode", CODE);
await opt.click("button:text-is('Sign in')");
await opt.waitForSelector("#plusExport");
const [download] = await Promise.all([opt.waitForEvent("download"), opt.click("#plusExport")]);
const exported = JSON.parse(fs.readFileSync(await download.path(), "utf8"));
step("Download my data: account, server data and this browser's data in one file", exported.format === "aim-export-1" &&
  exported.account.email === user.email && Array.isArray(exported.assessments) && exported.assessments.length > 0 &&
  !!exported.browser.settings && "history" in exported.browser, Object.keys(exported).join());
step("the download never includes the sign-in session", !/acc-\d|ref-\d/.test(JSON.stringify(exported)));
await opt.click("#plusDelete");
await opt.fill("#plusDeleteConfirm", "delete");
step("Delete stays disabled until DELETE is typed exactly", await opt.isDisabled("#plusDeleteGo"));
await opt.fill("#plusDeleteConfirm", "DELETE");
await opt.click("#plusDeleteGo");
await opt.waitForSelector("#plusEmail");
step("deleting the account removes it on the server and signs out here", srv.deletedUsers.join() === user.id && (await sw.evaluate(() => loadSession())) === null);

// Aim Free keeps working alongside: the regular settings still save.
await opt.selectOption("#leisureMin", "30");
await opt.waitForTimeout(200);
step("regular settings still save", (await sw.evaluate(() => chrome.storage.local.get("settings"))).settings.leisureMin === 30);

await ctx.close();
server.close();
console.log(process.exitCode ? "\nSome checks failed." : "\nAll Plus checks passed.");
