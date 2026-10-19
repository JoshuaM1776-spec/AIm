// A smoke test against the real youtube.com: loads Aim in Chromium and checks the parts most likely
// to break when YouTube changes its pages (the selectors in content/youtube.js), plus every channel
// in Learn something's list. It reports what matched and what didn't; it doesn't change anything.
// Needs network access to YouTube (see TESTING.md → Real-YouTube check).
//
//   PLAYWRIGHT=… CHROMIUM_PATH=… node tools/real-youtube-check.mjs [out-dir]
//
// Writes report.json and screenshots to out-dir (default: ./real-youtube-report). Exit code 0 when
// every check passed, 1 when some failed, 2 when YouTube couldn't be reached at all.
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { join } from "node:path";
import vm from "node:vm";

const root = fileURLToPath(new URL("..", import.meta.url));
const out = process.argv[2] || join(process.cwd(), "real-youtube-report");
mkdirSync(out, { recursive: true });
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT || "playwright");

// Aim's selector map and channel list, read from the extension's own files.
const ytSrc = readFileSync(root + "content/youtube.js", "utf8");
const YT = vm.runInNewContext(ytSrc.slice(ytSrc.indexOf("const YT = {") + "const YT = ".length, ytSrc.indexOf("};", ytSrc.indexOf("const YT = {")) + 1).replace(/^/, "(") + ")");
const ctx = vm.createContext({});
vm.runInContext(readFileSync(root + "content/topics.js", "utf8") + "\n;globalThis.T = LEARN_TOPICS;", ctx);
const TOPICS = ctx.T;

const report = { at: new Date().toISOString(), checks: [], selectors: {}, channels: [] };
const check = (name, ok, detail = "") => { report.checks.push({ name, ok: !!ok, detail: String(detail).slice(0, 300) }); console.log(`  ${ok ? "ok  " : "FAIL"} ${name}${detail ? `  — ${String(detail).slice(0, 160)}` : ""}`); };
const sels = v => (Array.isArray(v) ? v : [v]);

const proxy = process.env.HTTPS_PROXY || process.env.https_proxy;
const context = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), "aim-real-")), {
  executablePath: process.env.CHROMIUM_PATH, headless: true, ignoreHTTPSErrors: true, locale: "en-US",
  viewport: { width: 1400, height: 900 }, ...(proxy ? { proxy: { server: proxy } } : {}),
  args: [`--disable-extensions-except=${root}`, `--load-extension=${root}`, "--disable-blink-features=AutomationControlled"]
});
const page = await context.newPage();
let sw = context.serviceWorkers()[0];
const worker = async () => (sw ||= await context.waitForEvent("serviceworker"));
const errors = [];
page.on("pageerror", e => errors.push(e.message));

// Which of a page's selectors match, recorded per page.
async function selectorsOn(pageName, keys) {
  const found = {};
  for (const k of keys) found[k] = await page.evaluate(list => list.map(s => { try { return document.querySelectorAll(s).length; } catch { return -1; } }), sels(YT[k]));
  report.selectors[pageName] = found;
  for (const [k, counts] of Object.entries(found)) check(`${pageName}: selector ${k}`, counts.some(n => n > 0), counts.join(" / "));
}

try {
  // ---------- reachable at all? ----------
  let reached = false;
  try { const r = await page.goto("https://www.youtube.com/", { waitUntil: "domcontentloaded", timeout: 30000 }); reached = !!r && r.status() < 400; } catch (e) { report.unreachable = e.message; }
  if (!reached) { console.log("YouTube couldn't be reached from here. Allow it in the environment's network settings (TESTING.md)."); writeFileSync(join(out, "report.json"), JSON.stringify(report, null, 2)); await context.close(); process.exit(2); }
  // The cookie consent page some regions get first.
  if (/consent\./.test(page.url())) {
    for (const label of ["Reject all", "Accept all"]) { const b = page.getByRole("button", { name: label }).first(); if (await b.count()) { await b.click(); break; } }
    await page.waitForURL(/www\.youtube\.com/, { timeout: 15000 }).catch(() => {});
  }

  // ---------- home ----------
  await page.goto("https://www.youtube.com/", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(4000);
  await page.screenshot({ path: join(out, "home.png") });
  check("home: Aim's card replaces the feed", await page.$("#wp-home"));
  check("home: the feed itself is hidden", await page.evaluate(sel => { const g = document.querySelector(sel); return !g || g.offsetParent === null || getComputedStyle(g).visibility === "hidden"; }, "ytd-rich-grid-renderer"));
  check("home: Aim's button in the top bar", await page.$("#wp-chip"));
  await selectorsOn("home", ["mastheadCenter", "mastheadEnd", "homeBrowse", "searchBox"]);

  // ---------- results ----------
  await page.goto("https://www.youtube.com/results?search_query=how+do+jet+engines+work", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(5000);
  await page.screenshot({ path: join(out, "results.png") });
  // Lengths are drawn as rows scroll into view.
  for (let i = 0; i < 6; i++) { await page.evaluate(() => window.scrollBy(0, 1200)); await page.waitForTimeout(700); }
  await page.evaluate(() => window.scrollTo(0, 0));
  await selectorsOn("results", ["results", "resultsList", "resultVideos", "resultTitleLabel", "resultMeta", "resultChannel", "itemWatchLink", "itemTitle"]);
  report.selectors.results.ads = await page.evaluate(sel => document.querySelectorAll(sel).length, YT.ads); // often none; recorded only
  const results = await page.evaluate(([vids, link, title, chan, len, label]) => [...document.querySelectorAll(vids)].slice(0, 20).map(n => ({
    link: !!n.querySelector(link), title: !!(n.querySelector(title[0]) || n.querySelector(title[1]))?.textContent?.trim(),
    channel: chan.some(s => n.querySelector(s)),
    length: len.some(s => /\d:\d\d/.test(n.querySelector(s)?.textContent || "")) || / (hours?|minutes?|seconds?)$/.test(n.querySelector(label)?.getAttribute("aria-label") || "") })),
    [YT.resultVideos, YT.itemWatchLink, sels(YT.itemTitle), sels(YT.resultChannel), sels(YT.resultLength), YT.resultTitleLabel]);
  const share = k => (results.length ? results.filter(r => r[k]).length / results.length : 0);
  check("results: at least 5 videos found", results.length >= 5, `${results.length}`);
  check("results: each has a watch link", share("link") >= 0.9, share("link").toFixed(2));
  check("results: each has a title", share("title") >= 0.9, share("title").toFixed(2));
  check("results: each has a channel", share("channel") >= 0.8, share("channel").toFixed(2));
  check("results: most have a length (badge or spoken label)", share("length") >= 0.8, share("length").toFixed(2));
  check("results: Aim's results bar (or its question) appears", await page.$("#wp-results-bar"));
  const kept = (await (await worker()).evaluate(() => chrome.storage.local.get("purpose"))).purpose?.allowed || [];
  check("results: Aim keeps them for the Target, most with a length", kept.length >= 5 && kept.filter(v => v.length).length >= kept.length * 0.8,
    `${kept.filter(v => v.length).length} of ${kept.length}: ${kept.slice(0, 4).map(v => v.length).join(" ")}`);

  // ---------- watch ----------
  const firstId = await page.evaluate(sel => { const a = document.querySelector(`ytd-search ${sel}`); return a ? new URL(a.href).searchParams.get("v") : null; }, YT.itemWatchLink);
  check("results: a video to open", firstId, firstId);
  if (firstId) {
    await page.goto(`https://www.youtube.com/watch?v=${firstId}`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(6000);
    await page.screenshot({ path: join(out, "watch.png") });
    await selectorsOn("watch", ["watchFlexy", "watchTitle", "watchDescription", "videoChannelLink", "sidebarHost", "mainVideo", "player", "autoplayToggle", "watchActionButtons"]);
    check("watch: the page's video id matches", await page.evaluate(([sel, id]) => document.querySelector(sel)?.getAttribute("video-id") === id, [YT.watchFlexy, firstId]));
    check("watch: Aim's Up next in the sidebar", await page.$("#wp-upnext"));
    check("watch: not stopped by a bot check", !(await page.getByText(/confirm you.re not a bot/i).count()));
  }

  // ---------- Learn something: every curated channel, through Aim's own code ----------
  // Every topic and Shorts from your topics on; the home page then fetches each channel (feed, or
  // channel page when the feed fails) and the background caches what it found.
  await worker();
  const handles = [...new Set(TOPICS.flatMap(t => t.channels.map(c => c.handle)))];
  // The search above started a Target, and Learn something only shows without one.
  await sw.evaluate(async ids => { await serial(() => finishPurpose("yes")); await serial(() => setOnboarding({ seenAll: true }));
    await serial(() => setSetting("learnTopics", ids)); await serial(() => setSetting("learnShorts", true)); }, TOPICS.map(t => t.id));
  await page.goto("https://www.youtube.com/", { waitUntil: "domcontentloaded" });
  const until = Date.now() + 240_000;
  let cache = {};
  while (Date.now() < until) {
    cache = (await sw.evaluate(() => chrome.storage.local.get("learn"))).learn?.channels || {};
    if (handles.every(h => cache[h])) break;
    await page.waitForTimeout(3000);
  }
  await page.waitForTimeout(3000);
  await page.screenshot({ path: join(out, "learn.png"), fullPage: true });
  for (const t of TOPICS) for (const c of t.channels) {
    const r = cache[c.handle];
    report.channels.push({ topic: t.name, name: c.name, handle: c.handle, hintId: c.id || null, id: r?.id || null,
      videos: r?.videos?.length ?? null, shorts: r?.shorts?.length ?? null, newest: r?.videos?.[0]?.title || null });
    check(`channel: ${c.name} (${c.handle})`, r && !r.failed && r.videos.length > 0,
      !r ? "not fetched" : r.failed ? "not found: check the handle" : `${r.videos.length} videos, ${r.shorts?.length ?? 0} Shorts, id ${r.id}${c.id && c.id !== r.id ? ` (hint was ${c.id})` : ""}`);
  }
  check("Shorts found for most channels", report.channels.filter(c => c.shorts > 0).length >= report.channels.length / 2,
    `${report.channels.filter(c => c.shorts > 0).length} of ${report.channels.length}`);
  check("home: Learn something shows a row", await page.$("#wp-home .wp-learn-row .wp-learn-item"));
  check("home: Quick review shows Shorts", await page.$("#wp-home .wp-review-item"));
  // A Short from the review plays; one YouTube picks (its /shorts page) waits behind Aim's card.
  if (await page.$("#wp-home .wp-review-item")) {
    await page.click("#wp-home .wp-review-item");
    await page.waitForURL(/\/shorts\//, { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(5000);
    await page.screenshot({ path: join(out, "short-review.png") });
    check("shorts: a review Short plays, with Aim's review bar", /\/shorts\//.test(page.url()) && !(await page.$(".wp-player-card")) && !!(await page.$(".wp-notice")), page.url());
    const reviewUrl = page.url();
    await page.mouse.move(770, 450);
    await page.mouse.wheel(0, 900); // YouTube's "next Short", like a swipe
    await page.waitForTimeout(3000);
    if (page.url() === reviewUrl) { await page.keyboard.press("ArrowDown"); await page.waitForTimeout(3000); }
    report.swipedTo = page.url();
    await page.screenshot({ path: join(out, "short-other.png") });
    if (page.url() === reviewUrl) console.log("  --   shorts: YouTube didn't move to another Short here (it often won't play video for cloud servers); check by hand");
    else check("shorts: a Short YouTube picked waits, offering the next review", !!(await page.$(".wp-player-card")) && (await page.textContent(".wp-player-card")).includes("Only Shorts from your topics"), `${reviewUrl} → ${page.url()}`);
  }
  check("no page errors from Aim", !errors.some(e => /wp-|Aim/.test(e)), errors.join(" | "));
} finally {
  writeFileSync(join(out, "report.json"), JSON.stringify(report, null, 2));
  await context.close();
}
const failed = report.checks.filter(c => !c.ok).length;
console.log(failed ? `${failed} of ${report.checks.length} checks failed (see ${out}/report.json)` : `all ${report.checks.length} checks passed`);
process.exit(failed ? 1 : 0);
