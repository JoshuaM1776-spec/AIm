// Loads the real extension in Chromium and drives it on a fake youtube.com served by Playwright.
// It checks Aim's own wiring, not YouTube's real page structure: run TESTING.md on real YouTube too.
// Run: node tests/browser.test.js   (needs Playwright: npm i -g playwright && npx playwright install chromium)
// Optional: PLAYWRIGHT=/path/to/playwright CHROMIUM_PATH=/path/to/chrome
const { chromium } = require(process.env.PLAYWRIGHT || "playwright");
const path = require("path"), fs = require("fs"), os = require("os");
// A copy of the extension with Aim Plus switched off (empty config.js), so this tests Aim Free exactly
// as a Free-only build behaves and never contacts a real server. tests/plus.test.mjs covers Plus.
const EXT = (() => {
  const root = path.join(__dirname, ".."), dir = fs.mkdtempSync(path.join(os.tmpdir(), "aim-free-"));
  for (const f of fs.readdirSync(root)) if (!["tests", "supabase", "docs", "tools", ".git"].includes(f)) fs.cpSync(path.join(root, f), path.join(dir, f), { recursive: true });
  fs.writeFileSync(path.join(dir, "config.js"), 'self.AIM_PLUS = { supabaseUrl: "", supabaseAnonKey: "" };');
  return dir;
})();

const page = (body, title = "YouTube") => `<!doctype html><html><head><title>${title}</title></head><body>
<ytd-masthead><div id="end"></div></ytd-masthead>
<ytd-guide-entry-renderer id="guideShorts"><a title="Shorts" href="/shorts/">Shorts</a></ytd-guide-entry-renderer>
${body}
<script>
  // YouTube's autoplay toggle: a button whose inner element carries aria-checked.
  document.addEventListener("click", e => {
    const b = e.target.closest(".ytp-button");
    const t = b && b.querySelector(".ytp-autonav-toggle-button");
    if (t) t.setAttribute("aria-checked", String(t.getAttribute("aria-checked") !== "true"));
  });
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
  <div id="movie_player"><video class="html5-main-video" src="data:video/mp4;base64," muted></video>
    <div class="ytp-ce-element">end screen card</div>
    <button class="ytp-button"><div class="ytp-autonav-toggle-button" aria-checked="true"></div></button></div>
  <div id="secondary"><div id="related"><ytd-compact-video-renderer><a href="/watch?v=rel1">Related one</a></ytd-compact-video-renderer></div></div>
</ytd-watch-flexy>`, `Video ${id} - YouTube`);
const SHORTS = id => page(`<div id="shorts-player"><video class="html5-main-video"></video></div>
  <ytd-reel-player-overlay-renderer><div id="channel-name"><a href="/@short${id}">Short ${id}</a></div></ytd-reel-player-overlay-renderer>`);
const SUBS = page(`<ytd-browse page-subtype="subscriptions"><ytd-rich-grid-renderer id="subsGrid">subs</ytd-rich-grid-renderer></ytd-browse>`);
const HOME = page(`<ytd-browse page-subtype="home"><div id="primary"><ytd-rich-grid-renderer>
  <ytd-rich-item-renderer id="i1"><a href="/watch?v=v1">One</a><a href="/@hideme">Hide Me</a></ytd-rich-item-renderer>
  <ytd-rich-item-renderer id="i2"><a href="/watch?v=v2">Two</a><a href="/@keepme">Keep Me</a></ytd-rich-item-renderer>
</ytd-rich-grid-renderer></div></ytd-browse>`);
const RESULTS = page(`<ytd-search><div><ytd-section-list-renderer>
  <ytd-reel-shelf-renderer id="shortsShelf">Shorts shelf</ytd-reel-shelf-renderer>
  <ytd-video-renderer id="shortItem"><a href="/shorts/s9">A short</a></ytd-video-renderer>
  <ytd-video-renderer id="normalItem"><a id="video-title" href="/watch?v=n1">Fixing a leaky faucet</a><ytd-channel-name><a href="/@plumb">Plumb Co</a></ytd-channel-name></ytd-video-renderer>
  <ytd-video-renderer><a id="video-title" href="/watch?v=n2">Faucet cartridge swap</a><ytd-channel-name><a href="/@fixit">Fix It</a></ytd-channel-name></ytd-video-renderer>
  <ytd-playlist-renderer><a href="/watch?v=p0&list=PLfaucet">Faucet playlist</a></ytd-playlist-renderer>
</ytd-section-list-renderer></div></ytd-search>`);

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
    const body = u.pathname === "/watch" ? WATCH(u.searchParams.get("v")) : u.pathname === "/results" ? RESULTS
      : u.pathname.startsWith("/shorts/") ? SHORTS(u.pathname.split("/")[2]) : u.pathname === "/feed/subscriptions" ? SUBS : HOME;
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

  step("service worker started and migrated", (await store()).schemaVersion === 5);

  const p = await ctx.newPage();
  p.on("pageerror", e => errors.push("page: " + e.message));
  p.on("console", m => { if (m.type() === "error") errors.push("console: " + m.text()); });

  // ---------- homepage ----------
  await p.goto("https://www.youtube.com/", { waitUntil: "domcontentloaded" });
  step("feed hidden before Aim's main scripts run", await p.evaluate(() =>
    document.documentElement.classList.contains("wp-boot") || document.documentElement.classList.contains("wp-home")));
  await p.waitForSelector("#wp-chip .wp-pill", { timeout: 5000 });
  step("indicator invites a purpose", (await text("#wp-chip")).includes("Set Target") && !(await text("#wp-chip")).includes("null"));
  await p.waitForSelector("#wp-home", { timeout: 5000 });
  step("homepage card replaces the feed", await p.isHidden("ytd-rich-grid-renderer"));
  const card0 = await text("#wp-home");
  step("early hide hands over to the card", await p.evaluate(() =>
    !document.documentElement.classList.contains("wp-boot") && document.documentElement.classList.contains("wp-home")));
  step("homepage card offers a search, examples and a break", (await text("#wp-home")).includes("What brings you here?") &&
    (await p.getAttribute("#wp-home .wp-home-input", "placeholder")) === "Tell me what you're looking for…" && !card0.includes("Search YouTube") &&
    ["jet engines", "timber frame porch", "15m", "Custom"].every(t => card0.includes(t)), card0.slice(0, 160));
  step("tapping an example fills the search box", await (async () => {
    await p.click('#wp-home .wp-home-example:has-text("biology exam")');
    return (await p.inputValue("#wp-home .wp-home-input")) === "Help me study for my biology exam.";
  })());
  step("the mark (bullseye, no play triangle) renders as SVG under Trusted Types", (await p.$$("#wp-chip .wp-icon:first-child svg circle")).length === 1 && (await p.$$("#wp-chip .wp-icon:first-child svg path")).length === 4);
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
  await p.click('.wp-player-card button:text-is("Set Target")');
  await p.waitForTimeout(800);
  st = await store();
  step("setting a purpose from the card plays the video", st.purpose?.text === "Learn how sourdough starters work" && st.purpose.limitMin === null && !(await p.$(".wp-player-card")));
  step("indicator shows the purpose", (await text("#wp-chip")).includes("Learn how sourdough") && !(await text("#wp-chip")).includes("null"));
  step("with a purpose: sidebar recommendations and end screens hidden", (await p.isHidden("#related")) && (await p.isHidden(".ytp-ce-element")));
  step("with a purpose: autoplay switched off", (await p.getAttribute(".ytp-autonav-toggle-button", "aria-checked")) === "false" &&
    (await p.evaluate(() => localStorage.getItem("aim-autoplay-restore"))) === "1");
  step("with a purpose: Shorts link hidden", await p.isHidden("#guideShorts"));
  step("Up next shows what the purpose has so far (nothing searched yet)", (await text("#wp-upnext")).includes("Search toward your Target"));
  await p.evaluate(() => ytNav("/watch?v=elsewhere"));
  await p.waitForSelector(".wp-player-card", { timeout: 6000 });
  card = await text(".wp-player-card");
  step("a video your searches didn't find is not part of the purpose", card.includes("Not on your Target") && card.includes("Change Target") && !/watch anyway/i.test(card), card.slice(0, 140));
  await p.evaluate(() => ytNav("/watch?v=bbb"));
  await p.waitForTimeout(1500);
  step("going back to the purpose's video plays it", !(await p.$(".wp-player-card")));

  // ---------- the menu ----------
  await p.click("#wp-chip .wp-pill");
  let menu = await text(".wp-dropdown");
  step("menu: purpose, no time limit, what's hidden, break choices, Done, Change Target",
    ["Current Target", "No time limit", "Shorts, recommendations and feeds hidden · autoplay off", "Adjust", "Take a break", "Target complete", "Change Target", "Save this video", "Hide or warn"].every(t => menu.includes(t)) &&
    !/Pause|Explore|Add 15/.test(menu), menu.slice(0, 200));

  // ---------- take a break and come back ----------
  await p.click('.wp-dropdown button:has-text("Take a break")');
  await p.click('.wp-break-dialog .wp-opt:text-is("15 minutes")');
  await p.click('.wp-break-dialog button:text-is("Start Break")');
  await p.waitForTimeout(600);
  st = await store();
  step("a break from the menu keeps the purpose waiting", st.brk?.durationMin === 15 && st.purpose?.suspended === true);
  const chip1 = await text("#wp-chip");
  await p.waitForTimeout(2100);
  const chip2 = await text("#wp-chip");
  step("the indicator counts the break down by the second, with an end button", /Break1[45]:\d\d left/.test(chip1) && chip1 !== chip2 && !!(await p.$("#wp-chip .wp-chip-end")), `${chip1} → ${chip2}`);
  step("on a break: recommendations, Shorts and autoplay are back", (await p.isVisible("#related")) && (await p.isVisible("#guideShorts")) &&
    (await p.getAttribute(".ytp-autonav-toggle-button", "aria-checked")) === "true");
  await p.click("#wp-chip .wp-pill");
  menu = await text(".wp-dropdown");
  step("break menu offers going back to the purpose", menu.includes("Back on Target") && menu.includes("Your Target is waiting"));
  await p.click('.wp-dropdown button:has-text("Back on Target")');
  await p.waitForTimeout(600);
  st = await store();
  step("ending the break resumes the purpose", !st.brk && st.purpose?.suspended === false);

  // ---------- a break running out ----------
  await p.click("#wp-chip .wp-pill");
  await p.click('.wp-dropdown button:has-text("Take a break")');
  await p.click('.wp-break-dialog .wp-opt:text-is("15 minutes")');
  await p.click('.wp-break-dialog button:text-is("Start Break")');
  await p.waitForTimeout(500);
  await patchLocal("brk", { usedSec: 15 * 60 - 3 });
  await p.waitForFunction(() => !document.querySelector("#wp-chip")?.textContent.includes("Break"), null, { timeout: 15000 });
  st = await store();
  step("a break that runs out ends and the purpose resumes", !st.brk && st.purpose && !st.purpose.suspended && st.stop?.kind === "break");
  await p.waitForSelector(".wp-break-over", { timeout: 5000 });
  const over = await text(".wp-break-over");
  step("a \"Break time is up\" card offers the purpose or more break", over.includes("Break time is up") && over.includes("Back on Target") && over.includes("Extend break"), over);
  step("the break-over card also lets you keep browsing", over.includes("Keep browsing for now"));
  await p.click('.wp-break-over button:has-text("Back on Target")');

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
  step("time up shows a card on the player", card.includes("Time's up") && card.includes("Target complete") && card.includes("Add 15 minutes"), card.slice(0, 100));
  await p.click('.wp-player-card button:text-is("Add 15 minutes")');
  await p.waitForTimeout(800);
  st = await store();
  step("Add 15 minutes clears it", !st.purpose.timeUp && !(await p.$(".wp-player-card")));

  // ---------- Done ----------
  await p.click("#wp-chip .wp-pill");
  await p.click('.wp-dropdown button:has-text("Target complete")');
  await p.waitForSelector(".wp-done-dialog", { timeout: 3000 });
  const doneText = await text(".wp-done-dialog");
  step("Done asks first: found it, partly, not really, or keep going", ["Target complete?", "Yes, I'm done", "Partly", "Not really", "Keep going"].every(t => doneText.includes(t)));
  await p.click('.wp-done-dialog button:text-is("Yes, I\'m done")');
  await p.waitForURL("https://www.youtube.com/", { timeout: 5000 });
  await p.waitForSelector(".wp-toast", { timeout: 5000 });
  step("Done lands on the homepage with a short confirmation", (await text(".wp-toast")).includes("Glad you found it"));
  await p.click("#wp-chip .wp-pill");
  await p.click('.wp-dropdown button:has-text("Set Target")');
  await p.waitForSelector(".wp-dialog .wp-recent", { timeout: 3000 });
  step("setting a purpose offers recent ones", (await text(".wp-dialog .wp-recent")).includes("Learn how sourdough starters work"));
  await p.click('.wp-dialog .wp-recent-item');
  step("tapping a recent purpose fills the box", (await p.inputValue(".wp-dialog .wp-field input")) === "Learn how sourdough starters work");
  await p.keyboard.press("Escape");
  st = await store();
  const done = st.history.filter(h => h.type === "purpose").pop();
  step("the purpose is in the history with its videos and answer", !st.purpose && done?.outcome === "yes" && done.path.length === 1);

  // ---------- search becomes the purpose ----------
  await p.goto("https://www.youtube.com/results?search_query=how+to+fix+a+leaky+faucet");
  await p.waitForSelector("#wp-results-bar", { timeout: 5000 });
  st = await store();
  step("a search with no purpose becomes the purpose (no time limit)", st.purpose?.text === "how to fix a leaky faucet" && st.purpose.limitMin === null && st.purpose.searches[0].q === "how to fix a leaky faucet");
  step("results bar is a compact row: Target, Change and done", (await text("#wp-results-bar")).includes("how to fix a leaky faucet") &&
    (await text("#wp-results-bar")).includes("Change") && !!(await p.$("#wp-results-bar [aria-label='Target complete']")) && !(await text("#wp-results-bar")).includes("left"));
  step("in results: Shorts shelf and Shorts hidden, videos shown", (await p.isHidden("#shortsShelf")) && (await p.isHidden("#shortItem")) && (await p.isVisible("#normalItem")));
  await p.waitForTimeout(800);
  st = await store();
  step("the search's results become part of the purpose", ["n1", "n2"].every(id => st.purpose.allowed.some(v => v.id === id)) &&
    st.purpose.allowedLists.includes("PLfaucet") && !st.purpose.allowed.some(v => v.id === "s9"), JSON.stringify(st.purpose.allowed.map(v => v.id)));
  await p.goto("https://www.youtube.com/watch?v=n1");
  await p.waitForTimeout(2000);
  step("a result plays without a card", !(await p.$(".wp-player-card")));
  const upnext = await text("#wp-upnext");
  step("Up next from your search lists the other results", upnext.includes("Up next from your search") && upnext.includes("Faucet cartridge swap") && !upnext.includes("Fixing a leaky faucet"), upnext.slice(0, 120));
  await p.goto("https://www.youtube.com/watch?v=zz1&list=PLfaucet");
  await p.waitForTimeout(2000);
  step("a video in a playlist from the results plays", !(await p.$(".wp-player-card")));
  await p.goto("https://www.youtube.com/results?search_query=faucet+cartridge+replacement");
  await p.waitForSelector("#wp-results-bar", { timeout: 5000 });
  await p.waitForTimeout(500);
  step("a related search continues silently", !(await text("#wp-results-bar")).includes("part of your Target?") &&
    (await store()).purpose.searches.some(s => s.q === "faucet cartridge replacement"));
  await p.goto("https://www.youtube.com/results?search_query=gaming+laptop+deals");
  await p.waitForSelector("#wp-results-bar", { timeout: 5000 });
  await p.waitForTimeout(500);
  step("an unrelated search asks first, results hidden", (await text("#wp-results-bar")).includes("Is “gaming laptop deals” part of your Target?") &&
    await p.evaluate(() => document.documentElement.classList.contains("wp-search-pending")));
  await p.click('#wp-results-bar button:has-text("Yes, it\'s part of it")');
  await p.waitForTimeout(800);
  st = await store();
  step("answering Yes shows the results and adds the search", !(await p.evaluate(() => document.documentElement.classList.contains("wp-search-pending"))) &&
    st.purpose.searches.some(s => s.q === "gaming laptop deals"));
  await p.goto("https://www.youtube.com/shorts/s9");
  await p.waitForSelector("#shorts-player .wp-player-card", { timeout: 6000 });
  step("opening a Short during a purpose asks first", (await text(".wp-player-card")).includes("Shorts are hidden while you're on Target"));
  await p.goto("https://www.youtube.com/feed/subscriptions");
  await p.waitForSelector("#wp-feed-note", { timeout: 6000 });
  step("subscriptions feed replaced by a note during a purpose", (await p.isHidden("#subsGrid")) && (await text("#wp-feed-note")).includes("Feeds are hidden while you're on Target"));
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
  const [optText, plusHidden] = await (async () => { const o = await ctx.newPage(); await o.goto(`chrome-extension://${extId}/options.html`); await o.waitForTimeout(400);
    const t = await o.textContent("body"), h = await o.$eval("#plus", n => n.hidden && !n.querySelector("input")); await o.close(); return [t, h]; })();
  step("no AI, no API key anywhere in settings", !/API key|Claude|AI check/i.test(optText));
  step("no Aim Plus section while config.js is empty", plusHidden);
  step("popup leads with the Target: Resume, Take a Break, Done; activity folded below",
    ["Current Target", "learn to sharpen a chisel", "so far", "Resume", "Take a Break", "Done", "Change Target", "Your activity", "This week", "Targets complete", "On Target", "Breaks", "Found it", "Daily limits"].every(t => popText.includes(t)) &&
    !popText.includes("left") && !(await pop.$eval("#activity", d => d.open)), popText.slice(0, 200));
  await pop.click('button:text-is("Done")');
  await pop.click('button:text-is("Yes, I\'m done")');
  await pop.waitForTimeout(500);
  step("Done from the popup asks and ends the purpose", !(await store()).purpose && (await store()).history.pop().outcome === "yes");

  // ---------- picking a Target up again ----------
  await sw.evaluate(() => serial(() => setSetting("homeCard", true))); // an earlier check switched the homepage card off
  await sw.evaluate(() => serial(() => startPurpose({ text: "Study for my biology exam", search: "cell biology" })));
  await sw.evaluate(() => serial(() => allowVideos({ query: "cell biology", videos: [{ id: "bio1", title: "Cells" }], lists: [] })));
  await sw.evaluate(() => serial(() => recordTick(10, { id: "bio1", title: "Video bio1", channel: "Chan bio1", t: 300 })));
  await sw.evaluate(() => serial(() => startPurpose({ text: "Fix my truck's AC", search: "truck ac recharge" })));
  await p.goto("https://www.youtube.com/");
  await p.waitForSelector("#wp-home .wp-home-resume");
  let home = await text("#wp-home");
  step("home: Pick up where you left off, with the current Target and Continue",
    home.includes("Pick up where you left off") && home.includes("Current Target") && home.includes("Fix my truck's AC") && home.includes("Continue"), home.slice(0, 160));
  step("home: the set-aside Target under Recent Targets, with when and Resume",
    home.includes("Recent Targets") && home.includes("Study for my biology exam") && home.includes("Last active today") && !!(await p.$(".wp-home-row button:text-is('Resume')")));
  step("home: no example chips once there's something to pick up", !home.includes("Try asking") && home.includes("View all Targets") && !/\bnull\b/.test(home));
  await p.click(".wp-home-row button:text-is('Resume')");
  await p.waitForURL(/watch\?v=bio1/);
  step("Resume returns to the last video at the moment you left it", p.url().includes("watch?v=bio1&t=300s"), p.url());
  await p.waitForTimeout(800);
  st = await store();
  step("the resumed Target is current and the other is set aside", st.purpose?.text === "Study for my biology exam" &&
    st.paused.map(x => x.text).join() === "Fix my truck's AC" && !(await p.$(".wp-player-card")));
  await p.click("#wp-chip .wp-pill");
  await p.click('.wp-dropdown button:has-text("Set aside for later")');
  await p.waitForURL("https://www.youtube.com/");
  await p.waitForSelector("#wp-home .wp-home-recent");
  st = await store();
  home = await text("#wp-home");
  step("Set aside for later: no current Target, both waiting on the homepage", !st.purpose && st.paused.length === 2 &&
    !home.includes("Current Target") && home.includes("Study for my biology exam") && home.includes("Fix my truck's AC"));
  const [all] = await Promise.all([ctx.waitForEvent("page"), p.click("button:text-is('View all Targets')")]);
  await all.waitForSelector("h2:text-is('Set aside')");
  const allText = await all.textContent("main");
  step("View all Targets lists set-aside and completed Targets", allText.includes("Study for my biology exam") && allText.includes("Start again") &&
    allText.includes("learn to sharpen a chisel"), allText.slice(0, 200));
  await all.click(".row-item:has-text(\"Fix my truck's AC\") button:text-is('Resume')");
  await all.waitForURL(/results\?search_query=truck/);
  step("resuming a Target without a video goes back to its last search", (await store()).purpose?.text === "Fix my truck's AC");
  await all.close();
  await sw.evaluate(() => serial(() => finishPurpose("yes")));

  const opt = await ctx.newPage();
  opt.on("pageerror", e => errors.push("options: " + e.message));
  await opt.goto(`chrome-extension://${extId}/options.html`);
  await opt.waitForTimeout(500);
  await opt.selectOption("#leisureMin", "90");
  await opt.click("summary");
  await opt.selectOption("#graceMin", "5");
  await opt.selectOption("#totalMin", "240");
  await opt.selectOption("#avoid select", "warn");
  await opt.uncheck("#hideShorts");
  await opt.check("#homeCard");
  await opt.waitForTimeout(600);
  st = await store();
  step("settings save through the background", st.settings.leisureMin === 90 && st.settings.graceMin === 5 && st.settings.totalMin === 240 &&
    st.settings.homeCard === true && st.settings.hideShorts === false && st.avoid["/@hideme"].action === "warn", JSON.stringify(st.settings));
  await p.waitForTimeout(300);
  step("turning a distraction switch off applies to open tabs", !(await p.evaluate(() => document.documentElement.classList.contains("wp-hide-shorts"))));

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
