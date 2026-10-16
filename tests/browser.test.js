// Loads the real extension in Chromium and drives it on a fake youtube.com served by Playwright.
// It checks Aim's own wiring, not YouTube's real page structure: run TESTING.md on real YouTube too.
// Run: node tests/browser.test.js   (needs Playwright: npm i -g playwright && npx playwright install chromium)
// Optional: PLAYWRIGHT=/path/to/playwright CHROMIUM_PATH=/path/to/chrome
const { chromium } = require(process.env.PLAYWRIGHT || "playwright");
const path = require("path"), fs = require("fs"), os = require("os");
const EXT = path.join(__dirname, "..");

const page = (body, title = "YouTube") => `<!doctype html><html><head><title>${title}</title></head><body>
<ytd-masthead><div id="end"></div></ytd-masthead>${body}
<script>
  // Mimic YouTube's in-app navigation event.
  window.ytNav = url => {
    history.pushState({}, "", url);
    const id = new URL(location.href).searchParams.get("v"), f = document.querySelector("ytd-watch-flexy");
    if (id && f) {
      f.setAttribute("video-id", id);
      f.querySelector("yt-formatted-string").textContent = "Video " + id;
      f.querySelector("#channel-name a").href = "/@chan" + id;
      f.querySelector("#channel-name a").textContent = "Chan " + id;
    }
    window.dispatchEvent(new Event("yt-navigate-finish"));
  };
</script></body></html>`;
const WATCH = id => page(`<ytd-watch-flexy video-id="${id}">
  <ytd-watch-metadata><h1 class="ytd-watch-metadata"><yt-formatted-string>Video ${id}</yt-formatted-string></h1>
  <div id="owner"><div id="channel-name"><a href="/@chan${id}">Chan ${id}</a></div></div>
  <div id="description-inline-expander">About ${id}</div></ytd-watch-metadata>
  <div id="movie_player"><video class="html5-main-video" src="data:video/mp4;base64," muted></video></div>
</ytd-watch-flexy>`, `Video ${id} - YouTube`);
const HOME = page(`<ytd-browse page-subtype="home"><div id="primary"><ytd-rich-grid-renderer>
  <ytd-rich-item-renderer id="i1"><a href="/watch?v=v1">One</a><a href="/@hideme">Hide Me</a></ytd-rich-item-renderer>
  <ytd-rich-item-renderer id="i2"><a href="/watch?v=v2">Two</a><a href="/@keepme">Keep Me</a></ytd-rich-item-renderer>
</ytd-rich-grid-renderer></div></ytd-browse>`);
const RESULTS = page(`<ytd-search><div><ytd-section-list-renderer>results</ytd-section-list-renderer></div></ytd-search>`);

(async () => {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), "aim-"));
  const ctx = await chromium.launchPersistentContext(userData, {
    executablePath: process.env.CHROMIUM_PATH || undefined,
    headless: true, args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`]
  });
  const errors = [];
  await ctx.route(/^https:\/\/www\.youtube\.com\//, route => {
    const u = new URL(route.request().url());
    if (u.pathname === "/oembed") {
      const id = new URL(u.searchParams.get("url")).searchParams.get("v");
      return route.fulfill({ contentType: "application/json", body: JSON.stringify({ title: `Video ${id}`, author_name: `Chan ${id}`, author_url: `https://www.youtube.com/@chan${id}` }) });
    }
    const body = u.pathname === "/watch" ? WATCH(u.searchParams.get("v")) : u.pathname === "/results" ? RESULTS : HOME;
    // Same Trusted Types policy YouTube sends, so string-to-HTML writes would fail here too.
    route.fulfill({ contentType: "text/html", body, headers: { "content-security-policy": "require-trusted-types-for 'script'" } });
  });
  await ctx.route(/^https:\/\/api\.anthropic\.com\//, r => r.abort());

  let [sw] = ctx.serviceWorkers();
  if (!sw) sw = await ctx.waitForEvent("serviceworker");
  const extId = sw.url().split("/")[2];
  const store = () => sw.evaluate(() => chrome.storage.local.get(null));
  const step = (name, ok, extra = "") => { console.log(`${ok ? "  ok  " : "  FAIL"} ${name}${extra ? "  — " + extra : ""}`); if (!ok) process.exitCode = 1; };
  await new Promise(r => setTimeout(r, 500));

  const setLocal = obj => sw.evaluate(o => chrome.storage.local.set(o), obj);
  const patchLocal = (key, fields) => sw.evaluate(async ([k, f]) => {
    const cur = (await chrome.storage.local.get(k))[k];
    await chrome.storage.local.set({ [k]: { ...cur, ...f } });
  }, [key, fields]);
  const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
  const text = async sel => ((await p.$(sel)) ? (await p.textContent(sel)).replace(/\s+/g, " ") : "");

  step("service worker started and migrated", (await store()).schemaVersion === 3);

  const p = await ctx.newPage();
  p.on("pageerror", e => errors.push("page: " + e.message));
  p.on("console", m => { if (m.type() === "error") errors.push("console: " + m.text()); });

  // ---------- homepage ----------
  await p.goto("https://www.youtube.com/", { waitUntil: "domcontentloaded" });
  step("feed hidden before Aim's main scripts run", await p.evaluate(() =>
    document.documentElement.classList.contains("wp-boot") || document.documentElement.classList.contains("wp-home")));
  await p.waitForSelector("#wp-chip .wp-pill", { timeout: 5000 });
  step("indicator invites a purpose", (await text("#wp-chip")).includes("Set a purpose"));
  await p.waitForSelector("#wp-home", { timeout: 5000 });
  step("homepage card replaces the feed", await p.isHidden("ytd-rich-grid-renderer"));
  step("early hide hands over to the card", await p.evaluate(() =>
    !document.documentElement.classList.contains("wp-boot") && document.documentElement.classList.contains("wp-home")));
  step("homepage card offers a search and a break", (await text("#wp-home")).includes("What brings you here?") &&
    (await p.$$("#wp-home .wp-chip")).length === 3, await text("#wp-home"));
  step("Aim mark renders as SVG under Trusted Types", (await p.$$("#wp-chip svg path")).length >= 5);
  step("toolbar icon follows dark mode", await sw.evaluate(async () => (await setToolbarTheme(true)).result === "applied" && (await setToolbarTheme(false)).result === "applied"));

  // ---------- a video with neither a purpose nor a break ----------
  await p.goto("https://www.youtube.com/watch?v=aaa");
  await p.waitForSelector("#movie_player .wp-player-card", { timeout: 6000 });
  let card = await text(".wp-player-card");
  step("video with no purpose shows the choice card on the player", card.includes("What brings you here?") && card.includes("Just this video") && card.includes("Video aaa"), card.slice(0, 120));
  step("no page-wide dialog for it", !(await p.$(".wp-scrim")));

  await p.click('.wp-player-card button:text-is("Just this video")');
  await p.waitForTimeout(600);
  let st = await store();
  step("Just this video starts a one-video break", st.brk?.oneVideoId === "aaa" && !(await p.$(".wp-player-card")));
  step("indicator shows the break", (await text("#wp-chip")).includes("Break") && (await text("#wp-chip")).includes("1 video"));

  await p.evaluate(() => ytNav("/watch?v=bbb"));
  await p.waitForSelector(".wp-player-card", { timeout: 6000 });
  st = await store();
  step("moving to another video ends the one-video break", !st.brk && st.history.some(h => h.type === "break" && h.oneVideo));

  await p.fill(".wp-player-card input", "Learn how sourdough starters work");
  await p.click('.wp-player-card button:text-is("Set purpose")');
  await p.waitForTimeout(800);
  st = await store();
  step("setting a purpose from the card plays the video", st.purpose?.text === "Learn how sourdough starters work" && st.purpose.limitMin === null && !(await p.$(".wp-player-card")));
  step("indicator shows the purpose", (await text("#wp-chip")).includes("Learn how sourdough"));

  // ---------- the menu ----------
  await p.click("#wp-chip .wp-pill");
  let menu = await text(".wp-dropdown");
  step("menu: purpose, no time limit, break choices, Done, Change purpose",
    ["Your purpose", "No time limit", "Take a break", "Done", "Change purpose", "Save this video", "Hide or warn"].every(t => menu.includes(t)) &&
    !/Pause|Explore|Add 15/.test(menu), menu.slice(0, 200));

  // ---------- take a break and come back ----------
  await p.click('.wp-dropdown .wp-chip:text-is("15m")');
  await p.waitForTimeout(600);
  st = await store();
  step("a break from the menu keeps the purpose waiting", st.brk?.durationMin === 15 && st.purpose?.suspended === true);
  await p.click("#wp-chip .wp-pill");
  menu = await text(".wp-dropdown");
  step("break menu offers going back to the purpose", menu.includes("Back to my purpose") && menu.includes("Your purpose is waiting"));
  await p.click('.wp-dropdown button:has-text("Back to my purpose")');
  await p.waitForTimeout(600);
  st = await store();
  step("ending the break resumes the purpose", !st.brk && st.purpose?.suspended === false);

  // ---------- a break running out ----------
  await p.click("#wp-chip .wp-pill");
  await p.click('.wp-dropdown .wp-chip:text-is("15m")');
  await p.waitForTimeout(500);
  await patchLocal("brk", { usedSec: 15 * 60 - 3 });
  await p.waitForFunction(() => !document.querySelector("#wp-chip")?.textContent.includes("Break"), null, { timeout: 15000 });
  st = await store();
  step("a break that runs out ends and the purpose resumes", !st.brk && st.purpose && !st.purpose.suspended && st.stop?.kind === "break");

  // ---------- a purpose time limit ----------
  await p.click("#wp-chip .wp-pill");
  await p.click('.wp-dropdown button.wp-link:text-is("Set one")');
  await p.click('.wp-dialog .wp-chip:text-is("15m")');
  await p.click('.wp-dialog button:text-is("Save")');
  await p.waitForTimeout(500);
  st = await store();
  step("a time limit can be set on the purpose", st.purpose.limitMin >= 15);
  await sw.evaluate(async () => { const { purpose } = await chrome.storage.local.get("purpose"); await chrome.storage.local.set({ purpose: { ...purpose, usedSec: purpose.limitMin * 60 - 3 } }); });
  await p.waitForSelector(".wp-player-card", { timeout: 15000 });
  card = await text(".wp-player-card");
  step("time up shows a card on the player", card.includes("Time's up") && card.includes("Done") && card.includes("Add 15 minutes"), card.slice(0, 100));
  await p.click('.wp-player-card button:text-is("Add 15 minutes")');
  await p.waitForTimeout(800);
  st = await store();
  step("Add 15 minutes clears it", !st.purpose.timeUp && !(await p.$(".wp-player-card")));

  // ---------- Done ----------
  await p.click("#wp-chip .wp-pill");
  await p.click('.wp-dropdown button:has-text("Done")');
  await p.waitForURL("https://www.youtube.com/", { timeout: 5000 });
  await p.waitForSelector(".wp-notice", { timeout: 5000 });
  step("Done lands on the homepage and asks once", (await text(".wp-notice")).includes("Did you find what you needed?"));
  await p.click('.wp-notice button:text-is("Yes")');
  await p.waitForTimeout(400);
  st = await store();
  const done = st.history.filter(h => h.type === "purpose").pop();
  step("the purpose is in the history with its videos and answer", !st.purpose && done?.outcome === "yes" && done.path.length === 1);

  // ---------- search becomes the purpose ----------
  await p.goto("https://www.youtube.com/results?search_query=how+to+fix+a+leaky+faucet");
  await p.waitForSelector("#wp-results-bar", { timeout: 5000 });
  st = await store();
  step("a search with no purpose becomes the purpose (no time limit)", st.purpose?.text === "how to fix a leaky faucet" && st.purpose.limitMin === null && st.purpose.searches[0].q === "how to fix a leaky faucet");
  step("results bar shows the purpose and Done", (await text("#wp-results-bar")).includes("how to fix a leaky faucet") && (await text("#wp-results-bar")).includes("Done"));
  await sw.evaluate(() => finishPurpose(null));

  // ---------- leisure used up ----------
  await setLocal({ settings: { ...(await store()).settings, leisureMin: 15 }, usage: { [today()]: { purpose: 0, leisure: 900, other: 0 } } });
  await p.goto("https://www.youtube.com/watch?v=ccc");
  await p.waitForSelector(".wp-player-card", { timeout: 6000 });
  card = await text(".wp-player-card");
  const disabled = await p.$$eval(".wp-player-card .wp-chip", bs => bs.every(b => b.disabled));
  step("with leisure used up, breaks are unavailable", disabled && card.includes("leisure time is used up"), card.slice(-80));

  // ---------- daily total ----------
  await setLocal({ settings: { ...(await store()).settings, leisureMin: 60, totalMin: 60 }, usage: { [today()]: { purpose: 3500, leisure: 0, other: 99 } } });
  await p.goto("https://www.youtube.com/watch?v=ddd");
  await p.waitForSelector(".wp-player-card", { timeout: 6000 });
  await p.waitForFunction(() => document.querySelector(".wp-player-card")?.textContent.includes("today's YouTube time"), null, { timeout: 15000 });
  step("the daily YouTube limit stops everything", true);
  await setLocal({ settings: { ...(await store()).settings, totalMin: 0 }, stop: null, usage: {} });

  // ---------- hidden channels ----------
  await setLocal({ avoid: { "/@hideme": { name: "Hide Me", action: "hide" } }, settings: { ...(await store()).settings, homeCard: false } });
  await p.goto("https://www.youtube.com/");
  await p.waitForTimeout(1500);
  step("hidden channel's video is removed from the feed", (await p.isHidden("#i1")) && (await p.isVisible("#i2")));

  // ---------- popup and settings ----------
  await sw.evaluate(() => startPurpose({ text: "learn to sharpen a chisel" }));
  const pop = await ctx.newPage();
  pop.on("pageerror", e => errors.push("popup: " + e.message));
  await pop.goto(`chrome-extension://${extId}/popup.html`);
  await pop.waitForTimeout(500);
  const popText = (await pop.textContent("body")).replace(/\s+/g, " ");
  step("popup shows the purpose, today's time and history", popText.includes("learn to sharpen a chisel") && popText.includes("Breaks") && popText.includes("On purpose") && popText.includes("Found it"), popText.slice(0, 160));

  const opt = await ctx.newPage();
  opt.on("pageerror", e => errors.push("options: " + e.message));
  await opt.goto(`chrome-extension://${extId}/options.html`);
  await opt.waitForTimeout(500);
  await opt.selectOption("#leisureMin", "90");
  await opt.click("summary");
  await opt.selectOption("#graceMin", "5");
  await opt.selectOption("#totalMin", "240");
  await opt.selectOption("#avoid select", "warn");
  await opt.check("#homeCard");
  await opt.waitForTimeout(600);
  st = await store();
  step("settings save through the background", st.settings.leisureMin === 90 && st.settings.graceMin === 5 && st.settings.totalMin === 240 &&
    st.settings.homeCard === true && st.avoid["/@hideme"].action === "warn", JSON.stringify(st.settings));

  // Extension reload: the orphaned tab must go quiet instead of throwing.
  const before = errors.length;
  await sw.evaluate(() => chrome.runtime.reload());
  await p.waitForTimeout(11000);
  const orphanErrors = errors.slice(before).filter(e => /context invalidated/i.test(e));
  step("orphaned tab shuts down cleanly after reload", orphanErrors.length === 0 && !(await p.$("#wp-chip")), orphanErrors[0] || "");

  const real = errors.filter(e => !/Failed to load resource|ERR_FAILED|net::/.test(e));
  step("no page errors", real.length === 0, real.slice(0, 3).join(" | "));
  await ctx.close();
})().catch(e => { console.error(e); process.exit(1); });
