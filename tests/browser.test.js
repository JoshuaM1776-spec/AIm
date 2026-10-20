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
// A watch page whose video really plays (a second of silence), started the way YouTube's player
// starts it, recording whether that start was interrupted.
const silentWav = (() => {
  const n = 8000, b = Buffer.alloc(44 + n);
  b.write("RIFF", 0); b.writeUInt32LE(36 + n, 4); b.write("WAVEfmt ", 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(8000, 24); b.writeUInt32LE(8000, 28); b.writeUInt16LE(1, 32); b.writeUInt16LE(8, 34); b.write("data", 36); b.writeUInt32LE(n, 40); b.fill(128, 44);
  return "data:audio/wav;base64," + b.toString("base64");
})();
const REALPLAY = page(`<ytd-watch-flexy video-id="realplay">
  <ytd-watch-metadata><h1 class="ytd-watch-metadata"><yt-formatted-string>Video realplay</yt-formatted-string></h1>
  <div id="owner"><div id="channel-name"><a href="/@chanreal">Chan real</a></div></div></ytd-watch-metadata>
  <div id="movie_player"><video class="html5-main-video" src="${silentWav}" muted></video></div><div id="secondary"></div></ytd-watch-flexy>
  <script>
    const v = document.querySelector("video");
    window.__started = false;
    v.play().then(() => { window.__started = true; }, e => { window.__abort = e.name; });
  </script>`, "Video realplay - YouTube");
// Ask YouTube, as best Aim can guess it: an AI answer on the results page whose markup Aim doesn't
// know, and a page of its own with videos to pick.
const RESULTS_AI = page(`<ytd-search><div><ytd-section-list-renderer>
  <div class="some-ai-answer"><p>Most drips come from a worn cartridge.</p><a href="/watch?v=ai1&t=95" aria-label="Why faucets drip, explained">Why faucets drip</a></div>
  <ytd-video-renderer><a id="video-title" href="/watch?v=n1">Fixing a leaky faucet</a></ytd-video-renderer>
</ytd-section-list-renderer></div></ytd-search>`);
const ASKPAGE = page(`<div id="ask-answer">Here's a good one: <a href="/watch?v=ai2" aria-label="Faucet washer swap">Faucet washer swap</a></div>`, "Ask YouTube");
const SHORTS = id => page(`<div id="shorts-player"><video class="html5-main-video"></video></div>
  <ytd-reel-player-overlay-renderer><div id="channel-name"><a href="/@short${id}">Short ${id}</a></div></ytd-reel-player-overlay-renderer>`);
// Your subscriptions (youtube.com/feed/channels): three rows, and three more each time you scroll to the
// end, the way YouTube loads them, up to nine.
const SUBROWS = [["@3blue1brown", "3Blue1Brown"], ["@gamerguy", "Gamer Guy"], ["@woodshop", "The Wood Shop"], ["@plumb", "Plumb Co"],
  ["@sillycats", "Silly Cats"], ["@numberphile", "Numberphile"], ["@chanbrk1", "Chan brk1"], ["@dramanews", "Drama News"], ["@lathe", "Lathe Life"]];
const SUBSLIST = page(`<ytd-browse page-subtype="channels"><div id="list"></div></ytd-browse><div style="height:3000px"></div>
  <script>
    const rows = ${JSON.stringify(SUBROWS)}; let shown = 0;
    const more = () => { for (const [h, name] of rows.slice(shown, shown + 3)) {
      const r = document.createElement("ytd-channel-renderer"), a = document.createElement("a"), t = document.createElement("div"), x = document.createElement("span");
      a.id = "main-link"; a.setAttribute("href", "/" + h); t.id = "channel-title"; x.id = "text"; x.textContent = name;
      t.append(x); a.append(t); r.append(a); document.getElementById("list").append(r); } shown += 3; };
    more();
    addEventListener("scroll", () => { if (innerHeight + scrollY >= document.documentElement.scrollHeight - 50) setTimeout(more, 200); });
  </script>`, "Subscriptions - YouTube");
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
    // "Learn something": channel feeds (one Short each, which Aim skips) and a channel page to look an id up on.
    if (u.pathname === "/feeds/videos.xml" && u.searchParams.get("playlist_id")) {
      const f = SHORTS_FEEDS[u.searchParams.get("playlist_id")];
      return f ? route.fulfill({ contentType: "application/atom+xml", body: f }) : route.fulfill({ status: 404, body: "" });
    }
    if (u.pathname === "/feeds/videos.xml") {
      const f = FEEDS[u.searchParams.get("channel_id")];
      return f ? route.fulfill({ contentType: "application/atom+xml", body: atom(f) }) : route.fulfill({ status: 404, body: "" });
    }
    // Stand-up Maths' feed fails (as YouTube's feeds have for weeks at a time), so Aim reads its Videos tab.
    if (u.pathname === "/@standupmaths/videos") return route.fulfill({ contentType: "text/html", body: CHANNEL_PAGE });
    const body = u.pathname === "/watch" && u.searchParams.get("v") === "realplay" ? REALPLAY : u.pathname === "/watch" ? WATCH(u.searchParams.get("v")) : u.pathname === "/results" && /dripping/.test(u.searchParams.get("search_query") || "") ? RESULTS_AI : u.pathname === "/new" ? ASKPAGE : u.pathname === "/results" ? RESULTS
      : u.pathname.startsWith("/shorts/") ? SHORTS(u.pathname.split("/")[2]) : u.pathname === "/feed/subscriptions" ? SUBS : u.pathname === "/feed/channels" ? SUBSLIST : HOME;
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

  const FEEDS = { "UCYO_jab_esuFRV4b17AJtAw": ["3Blue1Brown", "tbobvid", 18], "UCoxcjq-8xIDTYp3uz647V5A": ["Numberphile", "numbvid", 17],
    "UC4a-Gbdw7vOaccHmFo40b9g": ["Khan Academy", "khanvid", 16] };
  // A channel's Videos tab as YouTube sends it: the list is in the page's data (ytInitialData).
  const lockup = (id, title, ago) => ({ richItemRenderer: { content: { lockupViewModel: { contentId: id, contentType: "LOCKUP_CONTENT_TYPE_VIDEO",
    metadata: { lockupMetadataViewModel: { title: { content: title }, metadata: { contentMetadataViewModel: { metadataRows: [{ metadataParts: [{ text: { content: "12K" } }, { text: { content: ago } }] }] } } } } } } } });
  const CHANNEL_PAGE = `<html><body><script>var ytInitialData = ${JSON.stringify({ metadata: { channelMetadataRenderer: { title: "Stand-up Maths", externalId: "UCSju5G2aFaWMqn-_0YBtq5A" } },
    contents: { tabs: [{ tabRenderer: { content: { richGridRenderer: { contents: [lockup("sumavid1", "Stand-up Maths lesson 1 & more", "2 years ago"), lockup("sumavid2", "Stand-up Maths lesson 2 & more", "3 years ago")] } } } }] } })};</script></body></html>`;
  const atom = ([name, base, day]) => `<?xml version="1.0"?><feed xmlns:yt="http://www.youtube.com/xml/schemas/2015"><title>${name}</title>` +
    `<entry><yt:videoId>${base}sh</yt:videoId><title>A quick one #shorts</title><link rel="alternate" href="https://www.youtube.com/shorts/${base}sh"/><author><name>${name}</name></author><published>2026-10-${day + 1}T10:00:00+00:00</published></entry>` +
    [1, 2, 3].map(i => `<entry><yt:videoId>${base}${i}</yt:videoId><title>${name} lesson ${i} &amp; more</title><link rel="alternate" href="https://www.youtube.com/watch?v=${base}${i}"/>` +
      `<author><name>${name}</name></author><published>2026-10-${String(day - i).padStart(2, "0")}T10:00:00+00:00</published></entry>`).join("") + `</feed>`;
  // 3Blue1Brown's Shorts-only playlist (UUSH + its id after "UC"); other channels have none, so their
  // Shorts come from their main feeds.
  const SHORTS_FEEDS = { "UUSHYO_jab_esuFRV4b17AJtAw": `<?xml version="1.0"?><feed xmlns:yt="http://www.youtube.com/xml/schemas/2015"><title>3Blue1Brown</title>` +
    [["shderiv01", "What a derivative really measures", 17], ["shfouri01", "Fourier series in a minute", 16], ["shprime01", "A strange pattern in primes", 15]]
      .map(([id, t, day]) => `<entry><yt:videoId>${id}</yt:videoId><title>${t}</title><link rel="alternate" href="https://www.youtube.com/shorts/${id}"/><author><name>3Blue1Brown</name></author><published>2026-10-${day}T10:00:00+00:00</published></entry>`).join("") + `</feed>` };
  const setLocal = obj => sw.evaluate(o => chrome.storage.local.set(o), obj);
  const patchLocal = (key, fields) => sw.evaluate(async ([k, f]) => {
    const cur = (await chrome.storage.local.get(k))[k];
    await chrome.storage.local.set({ [k]: { ...cur, ...f } });
  }, [key, fields]);
  const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
  const text = async sel => ((await p.$(sel)) ? (await p.textContent(sel)).replace(/\s+/g, " ") : "");

  step("service worker started and migrated", (await store()).schemaVersion === 5);

  // ---------- welcome tour (opens by itself on install) ----------
  let welcome = ctx.pages().find(x => x.url().includes("/welcome.html"));
  for (let i = 0; !welcome && i < 20; i++) { await new Promise(r => setTimeout(r, 250)); welcome = ctx.pages().find(x => x.url().includes("/welcome.html")); }
  step("a new install opens the welcome tour", !!welcome);
  if (welcome) {
    welcome.on("pageerror", e => errors.push("welcome: " + e.message));
    await welcome.waitForSelector("h1");
    step("welcome: Aim's line, and a minute to learn it", (await welcome.textContent("main")).includes("Aim helps you find what you need") && (await welcome.textContent("#next")) === "Let's go");
    await welcome.click("#next");
    const howText = await welcome.textContent("main");
    step("how it works: Target, staying on Target, breaks", ["Say what you're here for", "keeps YouTube on Target", "Take a break whenever you like"].every(t => howText.includes(t)));
    await welcome.click("#next");
    // ---------- Design your YouTube ----------
    const [design] = await Promise.all([ctx.waitForEvent("page"), welcome.click("#design")]);
    design.on("pageerror", e => errors.push("design: " + e.message));
    await design.waitForSelector(".yt");
    const prev = () => design.textContent("#preview");
    step("Design your YouTube: step 1 of 3, with a live preview of the homepage", (await design.textContent(".panel .count")) === "Step 1 of 3" && (await prev()).includes("What brings you here?"));
    await design.click(".opt:has-text('The regular YouTube feed')");
    step("choosing YouTube's feed changes the preview at once", !(await prev()).includes("What brings you here?") && (await prev()).includes("Recommended for you"));
    await design.click(".opt:has-text('A clean page with my Target')");
    step("a clean page: just What brings you here, no videos", (await prev()).includes("What brings you here?") && !(await prev()).includes("Learn something"));
    await design.click(".opt:has-text('Videos from channels I choose')");
    await design.click(".seg button:text-is('Math')");
    step("picking a topic adds Learn something to the preview, from that topic's channels", (await prev()).includes("Learn something") && (await prev()).includes("3Blue1Brown"));
    await design.click("#next");
    step("Shorts: hidden to start", (await prev()).includes("No Shorts"));
    await design.click(".opt:has-text('Only Shorts from selected channels')");
    step("only from my topics: a Quick review row in the preview", (await prev()).includes("Quick review"));
    await design.click("#next");
    step("Watching: the watch page, with only your search's videos beside it", (await prev()).includes("Up next from your search") && !(await prev()).includes("Recommended"));
    await design.click(".opt:has-text(\"YouTube's recommendations\")");
    step("choosing recommendations puts them back in the preview", (await prev()).includes("Recommended"));
    await design.click(".opt:has-text('Only what my search found')");
    await design.click(".ba button:text-is('Before')");
    step("Before shows YouTube as it was: recommendations, autoplay counting down", (await prev()).includes("Recommended") && (await prev()).includes("Up next in 5"));
    step("nothing changes until Apply", (await store()).settings.learnShorts === false && (await store()).settings.learnTopics.length === 0);
    await design.click(".ba button:has-text('With')");
    await design.click("#next");
    await design.waitForSelector(".split");
    step("the before and after, side by side, with a summary", (await design.textContent(".split")).includes("Before") && (await design.textContent(".panel")).includes("Only from selected channels"));
    if (process.env.SHOTS) await design.screenshot({ path: `${process.env.SHOTS}/design-review.png`, fullPage: true });
    await design.click("#apply");
    await design.waitForSelector("#openYouTube");
    let st = await store();
    step("Apply saves the design", st.settings.learnShorts === true && st.settings.hideShorts === true && st.settings.learnRow === true && st.settings.learnTopics.join() === "math" && !!st.design?.appliedAt);
    // Later: straight to a stage, and clicking the preview opens the part you clicked.
    await design.goto(`chrome-extension://${extId}/design.html#home`);
    await design.waitForSelector(".yt");
    step("afterwards, a stage opens directly (no steps)", (await design.textContent(".panel .count")) === "Home");
    await design.click('#preview [data-go="shorts"]');
    step("clicking Shorts in the preview opens the Shorts choices", (await design.textContent(".panel h2")) === "What about Shorts?");
    if (process.env.SHOTS) await design.screenshot({ path: `${process.env.SHOTS}/design-shorts.png`, fullPage: true });
    await design.click(".opt:has-text('Show all Shorts')");
    step("a change waits to be applied, and can be undone", (await design.textContent(".applybar")).includes("Changes not applied yet"));
    await design.click(".applybar button:text-is('Undo')");
    step("Undo puts it back", !(await design.$(".applybar")));
    await design.close();
    await sw.evaluate(() => serial(async () => { await setSetting("learnTopics", []); await setSetting("learnShorts", false); }));
    await welcome.click("#skip");
    step("Skip goes to the last screen, Open YouTube", (await welcome.textContent("main")).includes("Keep Aim one click away") && (await welcome.textContent("#next")) === "Open YouTube");
    await welcome.click("#next");
    await welcome.waitForURL("https://www.youtube.com/");
    await welcome.close();
    step("finishing marks the welcome done, with tips still to show", (await store()).onboarding?.welcomed === true && !(await store()).onboarding.tips.home);
  }

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
  // First-time tips: the box, then the Aim button. Once each.
  await p.waitForSelector(".wp-coach", { timeout: 5000 }).catch(() => {});
  step("first visit: a tip points at the box", (await text(".wp-coach")).includes("Start here") && (await text(".wp-coach")).includes("1 of 2"));
  await p.click(".wp-coach-next");
  await p.waitForSelector(".wp-coach:has-text('Your Target lives here')", { timeout: 3000 }).catch(() => {});
  step("then one at the Aim button", (await text(".wp-coach")).includes("Your Target lives here"));
  await p.click(".wp-coach-next");
  await p.waitForTimeout(300);
  await p.reload(); await p.waitForSelector("#wp-home"); await p.waitForTimeout(600);
  step("tips don't come back", !(await p.$(".wp-coach")) && !!(await store()).onboarding.tips.chip);
  await sw.evaluate(() => serial(() => setOnboarding({ seenAll: true }))); // the results tip and the student tour are checked later
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
  step("the mark (triangle, road and arrowhead) renders as SVG under Trusted Types", await p.evaluate(() => {
    const paths = [...document.querySelectorAll("#wp-chip .wp-icon:first-child svg path")];
    return paths.filter(x => (x.getAttribute("style") || "").includes("--wp-mark")).length === 1 && paths.filter(x => x.getAttribute("fill") === "#ff5446").length === 1;
  }));
  step("toolbar icon follows dark mode", await sw.evaluate(async () => (await setToolbarTheme(true)).result === "applied" && (await setToolbarTheme(false)).result === "applied"));

  // ---------- holding a video never interrupts YouTube's player ----------
  await p.goto("https://www.youtube.com/watch?v=realplay");
  await p.waitForSelector("#movie_player .wp-player-card", { timeout: 6000 });
  await p.waitForTimeout(800);
  const held = await p.evaluate(() => ({ abort: window.__abort || null, started: window.__started, paused: document.querySelector("video").paused }));
  step("a held video lets the player's own start finish, then pauses (no 'An error occurred')", !held.abort && held.started && held.paused, JSON.stringify(held));

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
    ["Current Target", "No time limit", "Shorts, recommendations and feeds hidden · autoplay off", "Adjust", "Take a break", "Target complete", "Change Target", "Save this video", "Sort this channel"].every(t => menu.includes(t)) &&
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
  // Ask YouTube: videos in an AI answer, and picked from its own page, count toward the Target.
  await p.goto("https://www.youtube.com/results?search_query=why+is+my+faucet+dripping");
  await p.waitForSelector("#wp-results-bar", { timeout: 5000 });
  await p.waitForTimeout(800);
  step("a video in an AI answer on the results page counts toward the Target", (await store()).purpose.allowed.some(v => v.id === "ai1" && v.title === "Why faucets drip, explained"));
  await p.goto("https://www.youtube.com/new");
  await p.waitForTimeout(600);
  await p.click("#ask-answer a");
  await p.waitForURL(/watch\?v=ai2/);
  await p.waitForTimeout(1500);
  st = await store();
  step("a video picked from Ask YouTube's page counts too, and plays without asking", !(await p.$(".wp-player-card")) &&
    st.purpose.allowed.some(v => v.id === "ai2" && v.q === "Ask YouTube"));
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

  // ---------- your channels: prefer; and "Still looking?" ----------
  await setLocal({ avoid: { "/@hideme": { name: "Hide Me", action: "hide" }, "/@plumb": { name: "Plumb Co", action: "prefer" } } });
  await sw.evaluate(() => serial(() => startPurpose({ text: "fix a leaky faucet", search: "leaky faucet" })));
  await sw.evaluate(() => serial(async () => { await addSearch("faucet drip fix"); await addSearch("faucet washer"); }));
  await p.goto("https://www.youtube.com/results?search_query=faucet+washer");
  await p.waitForSelector("#wp-results-bar");
  await p.waitForTimeout(800);
  step("a preferred channel's results get a Your channel badge", await p.$eval("#normalItem", n => n.hasAttribute("data-wp-preferred")));
  step("Still looking? after three searches with nothing watched", (await text(".wp-rb-still")).includes("Still looking?"));
  await p.click('.wp-rb-still button:text-is("Not now")');
  step("Not now puts it away", !(await p.$(".wp-rb-still")));
  await sw.evaluate(() => serial(() => finishPurpose("yes")));
  await setLocal({ avoid: { "/@hideme": { name: "Hide Me", action: "hide" } } });

  // ---------- strict mode: bending a rule asks why ----------
  await sw.evaluate(() => serial(async () => { await setSetting("strict", true); await startPurpose({ text: "fix a leaky faucet", search: "leaky faucet" }); }));
  await p.goto("https://www.youtube.com/results?search_query=gaming+laptop+deals");
  await p.waitForSelector(".wp-rb-pending");
  await p.click('.wp-rb-pending button:text-is("Yes, it\'s part of it")');
  await p.waitForSelector(".wp-reason-input");
  const strictBlocked = await p.$eval('.wp-dialog button:text-is("Continue")', b => b.disabled);
  await p.fill(".wp-reason-input", "My faucet guide is in a laptop review video");
  await p.click('.wp-dialog button:text-is("Continue")');
  await p.waitForSelector("#wp-results-bar:not(.wp-rb-pending)");
  st = await store();
  step("strict mode: an unrelated search asks why first, and keeps the reason with its Target", strictBlocked &&
    st.reasons?.[0]?.kind === "search" && st.reasons[0].text.includes("laptop review") && st.reasons[0].target === "fix a leaky faucet" &&
    st.purpose.searches.some(s => s.q === "gaming laptop deals"));
  await sw.evaluate(() => serial(async () => { await setSetting("strict", false); await finishPurpose("yes"); }));

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
  step("no Aim Plus link in the popup when this copy has no Plus server", await pop.$eval("#plusPage", n => n.hidden));
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
  await sw.evaluate(() => serial(() => recordTick(10, { id: "bio2", title: "Video bio2", channel: "Chan bio2", t: 60, d: 500 })));
  await sw.evaluate(() => serial(() => recordTick(10, { id: "bio3", title: "Video bio3", channel: "Chan bio3", t: 90, d: 600 })));
  await sw.evaluate(() => serial(() => recordTick(10, { id: "bio1", title: "Video bio1", channel: "Chan bio1", t: 300, d: 900 })));
  await sw.evaluate(() => serial(() => startPurpose({ text: "Fix my truck's AC", search: "truck ac recharge" })));
  await p.goto("https://www.youtube.com/");
  await p.waitForSelector("#wp-home .wp-home-resume");
  let home = await text("#wp-home");
  step("home: Pick up where you left off, with the current Target and Continue",
    home.includes("Pick up where you left off") && home.includes("Current Target") && home.includes("Fix my truck's AC") && home.includes("Continue"), home.slice(0, 160));
  step("home: the set-aside Target under Recent Targets, with when and Resume",
    home.includes("Recent Targets") && home.includes("Study for my biology exam") && home.includes("Last active today") && !!(await p.$(".wp-home-row button:text-is('Resume')")));
  step("home: a Target with no videos yet keeps the text-only card; a recent Target shows its last video small",
    !(await p.$(".wp-home-current .wp-home-video")) && !!(await p.$(".wp-home-row .wp-home-row-thumb .wp-thumb-xs")) &&
    (await p.$eval(".wp-home-row .wp-thumb-xs", n => n.style.backgroundImage)).includes("i.ytimg.com/vi/bio1/"));
  step("home: no example chips once there's something to pick up", !home.includes("Try asking") && home.includes("View all Targets") && !/\bnull\b/.test(home));
  await p.click(".wp-home-row button:text-is('Resume')");
  await p.waitForURL(/watch\?v=bio1/);
  step("Resume returns to the last video at the moment you left it", p.url().includes("watch?v=bio1&t=300s"), p.url());
  await p.waitForTimeout(800);
  st = await store();
  step("the resumed Target is current and the other is set aside", st.purpose?.text === "Study for my biology exam" &&
    st.paused.map(x => x.text).join() === "Fix my truck's AC" && !(await p.$(".wp-player-card")));
  await p.goto("https://www.youtube.com/");
  await p.waitForSelector("#wp-home .wp-home-current .wp-home-video");
  const lastCard = await text("#wp-home .wp-home-video");
  step("home: the current Target leads with its last video: thumbnail, title, channel, where you stopped, a coral progress line",
    lastCard.includes("Video bio1") && lastCard.includes("Chan bio1") && lastCard.includes("Stopped at 5:00") &&
    (await p.$eval(".wp-home-video .wp-thumb-progress i", n => n.style.width)) === "33%" && (await text(".wp-home-video .wp-thumb-len")) === "15:00", lastCard);
  step("home: See more is closed at first and lists the Target's other videos",
    (await text(".wp-home-see-more")) === "See more (2)" && (await p.$eval(".wp-home-minis", n => n.hidden)));
  await p.click(".wp-home-see-more");
  step("See more opens a row of small thumbnails, newest first",
    (await p.$$eval(".wp-home-minis .wp-mini", ns => ns.map(n => n.title).join())) === "Video bio3,Video bio2" && (await text(".wp-home-see-more")) === "See less");
  await p.click(".wp-home-minis .wp-mini");
  await p.waitForURL(/watch\?v=bio3/);
  step("a small thumbnail plays that video from where you stopped, still on the Target",
    p.url().includes("watch?v=bio3&t=90s") && (await store()).purpose?.text === "Study for my biology exam", p.url());
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
  step("Targets page: a Target's last video as a thumbnail, and See more videos for the rest",
    !!(await all.$(".item:has-text('Study for my biology exam') .lead-thumb .thumb")) &&
    (await all.textContent(".item:has-text('Study for my biology exam') details.videos summary")) === "See more videos (2)" &&
    !(await all.$(".item:has-text(\"Fix my truck's AC\") .lead-thumb")));
  const rec = await ctx.newPage();
  await rec.goto(`chrome-extension://${extId}/record.html`);
  await rec.waitForSelector("#record .totals");
  const recText = await rec.textContent("#record");
  step("Learning record: totals and the Targets you worked on, with their videos", recText.includes("Targets completed") && recText.includes("Study for my biology exam") &&
    recText.includes("Video bio1") && (await rec.$$("#record .entry")).length >= 2 && !/undefined|null|NaN/.test(recText), recText.slice(0, 200));
  await rec.close();
  await all.click(".item:has-text(\"Fix my truck's AC\") button:text-is('Resume')");
  await all.waitForURL(/results\?search_query=truck/);
  step("resuming a Target without a video goes back to its last search", (await store()).purpose?.text === "Fix my truck's AC");
  await all.close();
  await sw.evaluate(() => serial(() => finishPurpose("yes")));

  // ---------- Saved for later ----------
  await sw.evaluate(() => serial(async () => { await saveForLater({ id: "sav1", title: "Saved one", channel: "C" }); await saveForLater({ id: "sav2", title: "Saved two", channel: "C" }); }));
  await p.goto("https://www.youtube.com/");
  await p.waitForSelector("#wp-home .wp-home-saved");
  step("home: Saved for later, newest first", (await p.$$eval(".wp-home-saved .wp-mini-play", ns => ns.map(n => n.title).join())) === "Saved two,Saved one");
  await p.click(".wp-home-saved .wp-mini-play");
  await p.waitForURL(/watch\?v=sav2/);
  step("watching a saved video is a one-video break", (await store()).brk?.oneVideoId === "sav2");
  await sw.evaluate(() => serial(() => recordTick(10, { id: "sav2", title: "Saved two", channel: "C", t: 95, d: 100 })));
  step("a saved video you've watched leaves the list", (await store()).saved.map(v => v.id).join() === "sav1");
  await sw.evaluate(() => serial(() => endBreak()));
  await p.goto("https://www.youtube.com/");
  await p.waitForSelector("#wp-home .wp-home-saved");
  await p.click('#wp-home .wp-chip:text-is("15m")');
  await p.waitForSelector(".wp-notice .wp-saved-row");
  step("starting a break offers what you saved", (await text(".wp-notice")).includes("You saved a video for later") && (await p.$$(".wp-notice .wp-mini-play")).length === 1);
  await p.click('.wp-notice button[aria-label="Dismiss"]');
  await sw.evaluate(() => serial(() => endBreak()));
  await sw.evaluate(() => serial(() => removeSaved("sav1")));

  // ---------- Got my answer: a quick lookup ends in one tap ----------
  await sw.evaluate(() => serial(async () => {
    await startPurpose({ text: "how do I reset my router", search: "reset router" });
    const { purpose } = await chrome.storage.local.get("purpose");
    await chrome.storage.local.set({ purpose: { ...purpose, librarian: { kind: "lookup" } } });
  }));
  await p.goto("https://www.youtube.com/");
  await p.waitForSelector("#wp-home .wp-home-current");
  step("a lookup Target says Got my answer instead of Target complete",
    !!(await p.$('.wp-home-current button:has-text("Got my answer")')) && !(await p.$('.wp-home-current button:has-text("Target complete")')));
  await p.click('.wp-home-current button:has-text("Got my answer")');
  await p.waitForTimeout(800);
  st = await store();
  step("Got my answer ends the Target as found, with no questions", !st.purpose && st.history[st.history.length - 1].outcome === "yes" && !(await p.$(".wp-done-dialog")));

  // ---------- Learn something ----------
  await setLocal({ onboarding: { welcomed: true, tips: { home: true, chip: true, results: true }, hsTour: true }, learn: {} });
  await p.goto("https://www.youtube.com/");
  await p.waitForSelector("#wp-home .wp-learn-invite");
  step("Learn something: an invitation to pick topics, when none are chosen", (await text(".wp-learn-invite")).includes("Choose topics"));
  await p.click('.wp-learn-invite button:text-is("No thanks")');
  await p.waitForTimeout(300);
  step("No thanks puts the invitation away for good", !(await p.$(".wp-learn-invite")) && (await store()).onboarding.tips.learn === true);
  await sw.evaluate(() => serial(() => setSetting("learnTopics", ["math"])));
  await p.goto("https://www.youtube.com/");
  await p.waitForSelector("#wp-home .wp-learn-row .wp-learn-item", { timeout: 15000 });
  const learnIds = await p.$$eval(".wp-learn-row .wp-learn-item", ns => ns.map(n => n.querySelector(".wp-thumb").style.backgroundImage.match(/vi\/([^/]+)\//)[1]));
  step("six new videos from the topic's channels: newest first, taking turns, no Shorts; an id looked up from the channel page",
    learnIds.join() === "tbobvid1,numbvid1,khanvid1,sumavid1,tbobvid2,numbvid2", learnIds.join());
  step("each says its channel and topic", (await text(".wp-learn-row .wp-learn-item")).includes("3Blue1Brown · Math") && (await text(".wp-learn-row")).includes("lesson 1 & more"));
  st = await store();
  step("the feeds are cached for a day; a channel that can't be found is noted", !!st.learn.channels["@3blue1brown"].videos.length &&
    st.learn.channels["@standupmaths"].id === "UCSju5G2aFaWMqn-_0YBtq5A" && st.learn.channels["@standupmaths"].videos[0]?.id === "sumavid1" && st.learn.channels["@Mathologer"].failed === true);
  await p.click(".wp-learn-row .wp-learn-item");
  await p.waitForURL(/watch\?v=tbobvid1/);
  st = await store();
  step("picking one starts a light Target from your topics", st.purpose?.text === "Exploring: 3Blue1Brown lesson 1 & more" && st.purpose.learn === "Math" &&
    st.purpose.allowed.length >= 6);
  await p.waitForSelector("#wp-upnext");
  step("Up next shows more from your topics", (await text("#wp-upnext")).includes("More from your topics") && (await text("#wp-upnext")).includes("Numberphile lesson 1"));
  await sw.evaluate(() => serial(() => recordTick(10, { id: "tbobvid1", title: "3Blue1Brown lesson 1 & more", channel: "3Blue1Brown", t: 30, d: 600 })));
  await sw.evaluate(() => serial(() => finishPurpose("yes")));
  await sw.evaluate(() => serial(() => setSetting("learnOff", ["@numberphile"])));
  await p.goto("https://www.youtube.com/");
  await p.waitForSelector("#wp-home .wp-learn-row .wp-learn-item", { timeout: 15000 });
  const learnIds2 = await p.$$eval(".wp-learn-row .wp-learn-item", ns => ns.map(n => n.querySelector(".wp-thumb").style.backgroundImage.match(/vi\/([^/]+)\//)[1]));
  step("what you watched isn't offered again, and a channel you took out is gone", !learnIds2.includes("tbobvid1") && !learnIds2.some(id => id.startsWith("numb")), learnIds2.join());
  await sw.evaluate(() => serial(async () => { await startPurpose({ text: "fix a leaky faucet" }); }));
  await p.goto("https://www.youtube.com/");
  await p.waitForSelector("#wp-home .wp-home-current");
  step("with a Target going, Learn something stays out of the way", !(await p.$(".wp-learn")));

  // ---------- Shorts from your topics: a Quick review ----------
  await sw.evaluate(() => serial(async () => {
    await finishPurpose("yes");
    await startPurpose({ text: "Calculus exam prep" });
    await startStudy({ title: "Calculus", topics: [{ title: "Derivatives", brief: "Rates of change.", searches: ["derivatives explained"] }] });
    const { purpose } = await chrome.storage.local.get("purpose");
    await updateStudy({ topicId: purpose.study.topics[0].id, check: { assessmentId: "a1", objectives: [{ text: "Explain what a derivative measures", status: "needs_review" }] } });
    await finishPurpose("partly");
    await setSetting("learnShorts", true);
  }));
  await p.goto("https://www.youtube.com/");
  await p.waitForSelector("#wp-home .wp-review-item", { timeout: 15000 });
  if (process.env.SHOTS) { await p.waitForTimeout(300); await (await p.$("#wp-home")).screenshot({ path: `${process.env.SHOTS}/quick-review.png` }); }
  const reviewIds = await p.$$eval(".wp-review-item", ns => ns.map(n => n.querySelector(".wp-review-thumb").style.backgroundImage.match(/vi\/([^/]+)\//)[1]));
  step("Quick review: Shorts from your topics' channels (a channel's Shorts playlist when it has one), the one on something you studied first", reviewIds[0] === "shderiv01" &&
    (await text(".wp-review-item")).includes("Reviews: Derivatives") && reviewIds.includes("khanvidsh") && !reviewIds.includes("tbobvidsh") && !reviewIds.some(id => id.startsWith("numb")), reviewIds.join());
  await p.click(".wp-review-item");
  await p.waitForURL(/shorts\/shderiv01/);
  await p.waitForSelector(".wp-notice");
  st = await store();
  step("opening one starts a Quick review Target, and the Short plays", st.purpose?.text === "Quick review: Derivatives" && !(await p.$("#shorts-player .wp-player-card")) &&
    (await text(".wp-notice")).includes("Quick review · 1 of"), st.purpose?.text);
  await p.goto("https://www.youtube.com/shorts/s9");
  await p.waitForSelector("#shorts-player .wp-player-card", { timeout: 6000 });
  step("a Short from anywhere else waits, and offers the next review", (await text(".wp-player-card")).includes("Only Shorts from your topics") && !!(await p.$('.wp-player-card button:text-is("Next review")')));
  await p.click('.wp-player-card button:text-is("Next review")');
  await p.waitForURL(new RegExp(`shorts/${reviewIds[1]}`));
  await p.waitForSelector(".wp-notice");
  step("Next review plays the next one", (await text(".wp-notice")).includes("2 of") && !(await p.$("#shorts-player .wp-player-card")));
  await sw.evaluate(() => serial(() => setSetting("learnShorts", false)));
  await p.goto("https://www.youtube.com/shorts/shfouri01");
  await p.waitForSelector("#shorts-player .wp-player-card", { timeout: 6000 });
  step("with the setting off, every Short waits again", (await text(".wp-player-card")).includes("Shorts are hidden"));
  await sw.evaluate(() => serial(() => finishPurpose("yes")));
  await sw.evaluate(() => serial(async () => { await finishPurpose("yes"); await setSetting("learnTopics", []); await setSetting("learnOff", []); }));


  // ---------- Your channels: subscriptions, sorted ----------
  await setLocal({ avoid: { "/@hideme": { name: "Hide Me", action: "hide" } } });
  await sw.evaluate(() => serial(async () => { await startPurpose({ text: "Turn a bowl on a lathe" }); await addSearch("lathe bowl turning");
    await recordTick(10, { id: "lth1", title: "Bowl basics", channel: "Lathe Life" }); await finishPurpose("yes");
    await startPurpose({ text: "Sharpen lathe tools" }); await recordTick(10, { id: "lth2", title: "Sharpening gouges", channel: "Lathe Life" }); await finishPurpose("yes"); }));
  const chPage = await ctx.newPage();
  await chPage.goto(`chrome-extension://${extId}/channels.html`);
  await chPage.waitForSelector("#readSubs");
  step("Your channels: before reading, it offers to get your subscriptions from YouTube", (await chPage.textContent("#readSubs")).includes("Get my subscriptions") &&
    (await chPage.$$(".col")).length === 4 && (await chPage.textContent(".col:nth-child(4)")).includes("Hide Me"));
  // Aim opens YouTube's subscriptions page in a new tab. Tabs the extension opens skip this test's
  // stand-in YouTube, so that one is closed and the same address opened here.
  const [opened] = await Promise.all([ctx.waitForEvent("page"), chPage.click("#readSubs")]);
  await opened.close();
  const subsTab = await ctx.newPage();
  await subsTab.goto("https://www.youtube.com/feed/channels?aim=import");
  await subsTab.waitForSelector(".wp-notice:has-text('9 channels found')", { timeout: 30000 });
  step("on YouTube's subscriptions page, Aim reads them all (scrolling for the rest) and keeps them here", (await store()).subs.channels.length === 9 && (await store()).subs.complete === true);
  await subsTab.close();
  await chPage.bringToFront();
  await chPage.waitForFunction(() => document.querySelectorAll(".ch").length >= 10);
  const unsorted = await chPage.textContent(".col:nth-child(1)");
  step("they arrive unsorted, with suggestions: Learn something's channels under their topic, and one you watched for two Targets",
    unsorted.includes("Suggested: Learn from · Math") && unsorted.includes("You watched it for 2 Targets") && !unsorted.includes("Gamer Guy (Suggested") &&
    (await chPage.textContent("#acceptAll")) === "Accept 3 suggestions", (await chPage.textContent("#acceptAll")));
  await chPage.click("#acceptAll");
  await chPage.waitForFunction(() => document.querySelector(".col:nth-child(2) .count").textContent === "3");
  let av = (await store()).avoid;
  step("accepting puts them under Learn from, with Math as a topic of yours", av["/@3blue1brown"]?.action === "prefer" && av["/@3blue1brown"].topic === "Math" &&
    av["/@lathe"]?.action === "prefer" && (await store()).settings.myTopics.includes("Math") && (await chPage.textContent(".col:nth-child(2) .group h3")).startsWith("Math"));
  // One tap: For breaks. Drag: Silly Cats into Keep out.
  await chPage.click('.ch:has-text("Gamer Guy") button:text-is("Break")');
  await chPage.waitForFunction(() => document.querySelector(".col:nth-child(3)").textContent.includes("Gamer Guy"));
  await chPage.dragAndDrop('.ch:has-text("Silly Cats")', ".col:nth-child(4) .drop");
  await chPage.waitForFunction(() => document.querySelector(".col:nth-child(4)").textContent.includes("Silly Cats"));
  av = (await store()).avoid;
  step("a tap puts a channel in For breaks; dragging one into Keep out hides it", av["/@gamerguy"]?.action === "break" && av["/@sillycats"]?.action === "hide");
  // Your own topic, and a channel dragged into it.
  await chPage.fill(".addtopic input", "Woodworking");
  await chPage.click('.addtopic button:text-is("Add")');
  await chPage.waitForSelector('.group h3:has-text("Woodworking")');
  await chPage.dragAndDrop('.ch:has-text("The Wood Shop")', '.group:has(h3:has-text("Woodworking")) .drop');
  await chPage.waitForFunction(() => [...document.querySelectorAll(".group")].some(g => g.textContent.includes("Woodworking") && g.textContent.includes("The Wood Shop")));
  av = (await store()).avoid;
  step("a topic of your own; a channel dropped into it learns under it", av["/@woodshop"]?.action === "prefer" && av["/@woodshop"].topic === "Woodworking");
  await chPage.fill("#filter", "lathe");
  step("Find a channel narrows every column", (await chPage.$$(".ch")).length === 1);
  await chPage.fill("#filter", "");
  if (process.env.SHOTS) { await chPage.setViewportSize({ width: 1280, height: 900 }); await chPage.screenshot({ path: `${process.env.SHOTS}/channels.png`, fullPage: true }); }
  await chPage.close();
  // A break channel, on a Target: Aim asks first, even for a video your search found.
  await sw.evaluate(() => serial(async () => { await startPurpose({ text: "fix a leaky faucet" }); await allowVideos({ query: "x", videos: [{ id: "brk1", title: "Gaming", channel: "Chan brk1" }], lists: [] });
    await setAvoid("/@chanbrk1", "Chan brk1", "break"); }));
  await p.goto("https://www.youtube.com/watch?v=brk1");
  await p.waitForSelector(".wp-player-card", { timeout: 8000 });
  step("a For breaks channel on a Target: Aim asks, with a break as the way to watch it", (await text(".wp-player-card")).includes("is one of your break channels") &&
    (await text(".wp-player-card")).includes("Just this video"));
  await sw.evaluate(() => serial(() => finishPurpose("yes")));
  await setLocal({ avoid: { "/@hideme": { name: "Hide Me", action: "hide" } } });

  // ---------- Aim Homeschool preview: the student's Today screen ----------
  await sw.evaluate(() => serial(async () => { await setHomeschoolPreview(true); await setOnboarding({ hsTour: false }); }));
  await p.goto("https://www.youtube.com/");
  await p.waitForSelector("#wp-home.wp-today");
  await p.waitForSelector(".wp-coach-tour", { timeout: 5000 }).catch(() => {});
  step("the first time Today appears, a spotlight tour starts", (await text(".wp-coach-tour")).includes("This is Today") && (await text(".wp-coach-tour")).includes("1 of 5") && !!(await p.$(".wp-coach-ring")));
  for (let i = 0; i < 4; i++) { await p.click(".wp-coach-next"); await p.waitForTimeout(250); }
  step("its last stop: what's coming, then Let's start", (await text(".wp-coach-tour")).includes("See what's coming") && (await text(".wp-coach-next")) === "Let's start");
  await p.click(".wp-coach-next");
  await p.waitForTimeout(300);
  step("the tour ends and is remembered", !(await p.$(".wp-coach")) && (await store()).onboarding.hsTour === true);
  await p.click(".wp-today-tour");
  step("Take the tour replays it", !!(await p.$(".wp-coach-tour")));
  await p.click(".wp-coach-skip");
  await p.waitForTimeout(200);
  let todayText = (await text("#wp-home")).replace(/\s+/g, " ");
  step("Today replaces the homepage card: greeting, Ask Aim, the plan, the unit, the week, the dashboard",
    /Good (morning|afternoon|evening), Alex!/.test(todayText) && ["Homeschool", "Today's Plan", "0 of 6 done", "About 2h", "Do this together", "Current Unit", "Up next this week", "My Dashboard"].every(t => todayText.includes(t)) &&
    (await p.getAttribute("#wp-home .wp-home-input", "placeholder")).startsWith("Ask Aim anything") && !todayText.includes("What brings you here?") && !/\bnull\b|undefined/.test(todayText), todayText.slice(0, 200));
  step("only the next item is highlighted, with the one strong button", (await p.$$(".wp-plan-next")).length === 1 &&
    (await p.getAttribute(".wp-plan-next", "data-id")) === "sci1" && (await p.$$("#wp-home .wp-plan-btn-strong")).length === 1);
  await patchLocal("onboarding", { tips: { home: true, chip: true } }); // the results tip not seen yet
  await p.click('.wp-plan-item[data-id="sci1"] .wp-btn');
  await p.waitForURL(/results\?search_query=how%20volcanoes%20form/);
  await p.waitForSelector("#wp-results-bar");
  st = await store();
  await p.waitForSelector(".wp-coach", { timeout: 3000 }).catch(() => {});
  step("the first search on Target gets one tip about the bar", (await text(".wp-coach")).includes("This search is on Target"));
  await p.click(".wp-coach-next");
  step("Start makes the lesson the Target and searches for it", st.purpose?.plan === "sci1" && st.purpose.text === "Science: How Volcanoes Form" &&
    (await text("#wp-results-bar")).includes("Today's plan"));
  await sw.evaluate(() => serial(() => recordTick(10, { id: "vol1", title: "Volcanoes 101", channel: "Geo", t: 100, d: 600 })));
  let hs = (await store()).homeschool;
  step("the first video watched becomes the lesson's video, not done yet", hs.items[0].video?.id === "vol1" && !hs.items[0].doneAt);
  await sw.evaluate(() => serial(() => recordTick(10, { id: "vol1", title: "Volcanoes 101", channel: "Geo", t: 560, d: 600 })));
  hs = (await store()).homeschool;
  step("playing to about 90% marks the lesson done", !!hs.items[0].doneAt);
  await p.goto("https://www.youtube.com/");
  await p.waitForSelector("#wp-home.wp-today");
  step("a done item is quiet (Watch again) and the highlight moves on", (await p.getAttribute(".wp-plan-next", "data-id")) === "math1" &&
    (await text('.wp-plan-item[data-id="sci1"]')).includes("Watch again") && (await text("#wp-home")).includes("1 of 6 done"));
  step("a finished item asks once: Want more of this?", (await text('.wp-plan-item[data-id="sci1"]')).includes("Want more of this?"));
  await p.click('.wp-plan-item[data-id="sci1"] .wp-interest-btn:text-is("Yes")');
  await p.waitForTimeout(500);
  st = await store();
  step("the answer is kept, and the question goes away", st.homeschool.items[0].interest === "yes" && st.interests?.[0]?.topic === "How Volcanoes Form" &&
    !(await text('.wp-plan-item[data-id="sci1"]')).includes("Want more of this?"));
  await p.click('.wp-plan-item[data-id="proj1"] .wp-btn');
  await p.waitForSelector(".wp-plan-guide");
  step("a project opens its guide, with materials, steps and Do this together", (await text(".wp-plan-guide")).includes("Materials") && (await text(".wp-plan-guide")).includes("Steps") && (await text(".wp-plan-guide")).includes("Ask them to join you"));
  await p.click('.wp-plan-guide button:has-text("Mark done")');
  await p.waitForTimeout(400);
  step("Mark done from the guide", !!(await store()).homeschool.items[3].doneAt);
  await sw.evaluate(() => serial(() => planStart("math1")));
  await sw.evaluate(() => serial(() => allowVideos({ query: "area and volume of 3d shapes", videos: [{ id: "mth1", title: "Area" }], lists: [] })));
  await p.goto("https://www.youtube.com/watch?v=mth1");
  await p.waitForSelector("#wp-plan-panel");
  const panel = await text("#wp-plan-panel");
  step("beside the video, the plan replaces Up next: this lesson, Mark done, what's next", panel.includes("Area and Volume Review") && panel.includes("Mark done") &&
    panel.includes("Next: Exploration and Trade") && panel.includes("Back to Today") && !(await p.$("#wp-upnext")));
  await p.click('#wp-plan-panel button:has-text("Mark done")');
  await p.waitForTimeout(400);
  step("Mark done beside the video", !!(await store()).homeschool.items[1].doneAt);
  await sw.evaluate(() => serial(async () => { for (const id of ["hist1", "read1", "tb1"]) await planDone(id); }));
  st = await store();
  step("the whole day done: the last lesson stops being the Target", !st.purpose && st.homeschool.items.every(i => i.doneAt));
  await p.goto("https://www.youtube.com/");
  await p.waitForSelector(".wp-plan-finished");
  step("You're done for today, with optional Go deeper and a break", (await text(".wp-plan-finished")).includes("You're done for today.") &&
    (await text(".wp-plan-finished")).includes("Go deeper") && (await text("#wp-home")).includes("6 of 6 done"));
  await p.click('.wp-today-preview button:text-is("Turn off")');
  await p.waitForSelector("#wp-home.wp-home-card");
  step("turning the preview off brings back the usual card", (await text("#wp-home")).includes("What brings you here?") && !(await store()).homeschool);

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
