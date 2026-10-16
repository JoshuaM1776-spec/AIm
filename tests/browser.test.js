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

  step("service worker started and migrated", (await store()).schemaVersion === 2);

  const p = await ctx.newPage();
  p.on("pageerror", e => errors.push("page: " + e.message));
  p.on("console", m => { if (m.type() === "error") errors.push("console: " + m.text()); });

  // Homepage: the feed is hidden from the very first moment, then the card takes over.
  await p.goto("https://www.youtube.com/", { waitUntil: "domcontentloaded" });
  step("feed hidden before Aim's main scripts run", await p.evaluate(() =>
    document.documentElement.classList.contains("wp-boot") || document.documentElement.classList.contains("wp-home")));
  await p.waitForSelector("#wp-chip .wp-pill", { timeout: 5000 });
  step("top-bar button renders", (await p.textContent("#wp-chip")).includes("Start a session"));
  await p.waitForSelector("#wp-home", { timeout: 5000 });
  step("homepage card replaces the feed", await p.isHidden("ytd-rich-grid-renderer"));
  step("early hide hands over to the card", await p.evaluate(() =>
    !document.documentElement.classList.contains("wp-boot") && document.documentElement.classList.contains("wp-home")));
  step("Aim mark renders as SVG under Trusted Types", (await p.$$("#wp-chip svg path")).length === 5);
  step("toolbar icon follows dark mode", await sw.evaluate(async () => (await setToolbarTheme(true)).result === "applied" && (await setToolbarTheme(false)).result === "applied"));

  // Watch without a session: start prompt with "Not now".
  await p.goto("https://www.youtube.com/watch?v=aaa");
  await p.waitForSelector(".wp-dialog", { timeout: 5000 });
  const dlg = await p.textContent(".wp-dialog");
  step("start prompt appears on a video", dlg.includes("Up next: Video aaa") && dlg.includes("Not now"), dlg.slice(0, 80));
  await p.click('.wp-dialog button:text-is("Not now")');
  await p.waitForTimeout(300);
  step("Not now closes the prompt", !(await p.$(".wp-dialog")));
  await p.evaluate(() => ytNav("/watch?v=bbb"));
  await p.waitForTimeout(1500);
  step("Not now isn't asked again in this tab", !(await p.$(".wp-dialog")));

  // Start a Focus session from the top bar.
  await p.click("#wp-chip .wp-pill");
  await p.waitForSelector(".wp-dialog textarea");
  await p.fill(".wp-dialog textarea", "Learn how sourdough starters work");
  await p.click('.wp-dialog button:text-is("15m")');
  await p.click('.wp-dialog button:text-is("Start session")');
  await p.waitForFunction(() => document.querySelector("#wp-chip")?.textContent.includes("Focus"), null, { timeout: 5000 });
  let st = await store();
  step("Focus session started", st.session?.mode === "focus" && st.session.budgetMin === 15);

  // Dropdown has the new items and no Quick answer leftovers.
  await p.click("#wp-chip .wp-pill");
  const menu = await p.textContent(".wp-dropdown");
  step("dropdown shows Focus actions", ["Got what I came for", "Change purpose", "Add 15 minutes", "Pause session", "Hide or warn about this channel", "End session"].every(t => menu.includes(t)), menu.replace(/\s+/g, " ").slice(0, 160));

  // Pause from the dropdown, then confirm the tick doesn't undo it.
  await p.click('.wp-dropdown button:has-text("Pause session")');
  await p.waitForTimeout(500);
  step("paused notice shows", (await p.textContent(".wp-notice")).includes("paused"));
  await p.waitForTimeout(10500);
  step("pause survives a timer tick", (await store()).session.paused === true);
  await p.click('.wp-notice button:text-is("Resume")');
  await p.waitForTimeout(800);
  step("resume works", (await store()).session.paused === false);

  // Hide a channel from the dropdown; its homepage item disappears.
  await p.evaluate(() => ytNav("/watch?v=hideme"));
  await p.waitForTimeout(1500);
  await sw.evaluate(() => chrome.storage.local.set({ avoid: { "/@hideme": { name: "Hide Me", action: "hide" } } }));
  await p.goto("https://www.youtube.com/");
  await p.waitForTimeout(1500);
  await p.evaluate(() => document.documentElement.classList.remove("wp-home")); // show the grid to inspect it
  step("hidden channel's video is removed from the feed", (await p.isHidden("#i1")) && (await p.isVisible("#i2")));

  // Time up: push the session to its limit and wait for a tick.
  await sw.evaluate(async () => { const { session } = await chrome.storage.local.get("session"); await chrome.storage.local.set({ session: { ...session, usedSec: session.budgetMin * 60 - 5 } }); });
  await p.goto("https://www.youtube.com/watch?v=ccc");
  await p.waitForFunction(() => document.querySelector(".wp-notice")?.textContent.includes("time is up"), null, { timeout: 15000 });
  step("time-up notice appears", true);
  await p.click('.wp-notice button:text-is("Add 15 minutes")');
  await p.waitForTimeout(800);
  st = await store();
  step("Add 15 minutes extends the session", st.session.budgetMin === 30 && !st.session.timeUp && !(await p.$(".wp-notice")));

  // End the session: back to the homepage with a reflection.
  await p.click("#wp-chip .wp-pill");
  await p.click('.wp-dropdown button:has-text("End session")');
  await p.waitForURL("https://www.youtube.com/", { timeout: 5000 });
  await p.waitForSelector(".wp-notice", { timeout: 5000 });
  step("reflection shows after ending", (await p.textContent(".wp-notice")).includes("Session complete"));
  st = await store();
  step("session recorded in history", !st.session && st.sessions.length === 1 && !("reflection" in st));

  // Search with no session starts a 15-minute Focus session.
  await p.goto("https://www.youtube.com/results?search_query=how+to+fix+a+leaky+faucet");
  await p.waitForSelector("#wp-results-bar", { timeout: 5000 });
  st = await store();
  step("search starts a Focus session", st.session?.mode === "focus" && st.session.budgetMin === 15 && st.session.purpose === "how to fix a leaky faucet");
  step("results bar shows purpose and time", (await p.textContent("#wp-results-bar")).includes("Focus · 15 min left"));

  // Popup and settings page.
  const pop = await ctx.newPage();
  pop.on("pageerror", e => errors.push("popup: " + e.message));
  await pop.goto(`chrome-extension://${extId}/popup.html`);
  await pop.waitForTimeout(500);
  const popText = await pop.textContent("body");
  step("popup renders session, saved, today and history", popText.includes("how to fix a leaky faucet") && popText.includes("Time on YouTube") && popText.includes("Learn how sourdough"));

  const opt = await ctx.newPage();
  opt.on("pageerror", e => errors.push("options: " + e.message));
  await opt.goto(`chrome-extension://${extId}/options.html`);
  await opt.waitForTimeout(500);
  await opt.check("#hold");
  await opt.fill("#reminderMin", "45");
  await opt.press("#reminderMin", "Tab");
  await opt.selectOption("#avoid select", "warn");
  await opt.waitForTimeout(500);
  st = await store();
  step("settings save through the background", st.settings.hold === true && st.settings.reminderMin === 45 && st.avoid["/@hideme"].action === "warn");

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
