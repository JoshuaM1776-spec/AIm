// The public website (site/): its copies of Aim's assets and the privacy page are current, every
// local link and file it uses exists, it loads nothing from other sites, and it renders without
// errors or sideways scrolling on a phone. Run: node tests/site.test.mjs (Playwright for the last part)
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { stale, markdown } from "../tools/build-site.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
let failed = 0;
const step = (name, ok, detail = "") => { if (!ok) failed++; console.log(`${ok ? "  ok  " : "  FAIL"} ${name}${!ok && detail ? `  — ${detail}` : ""}`); };

step("the copies of Aim's assets and the privacy page are current (node tools/build-site.mjs)", stale().length === 0, stale().join(", "));

const pages = ["index.html", "privacy.html", "install.html"];
const missing = [], external = [];
for (const page of pages) {
  const html = readFileSync(root + "site/" + page, "utf8");
  for (const [, attr, url] of html.matchAll(/\b(href|src)="([^"#]*)(?:#[^"]*)?"/g)) {
    if (!url || /^(mailto:|\.\/$)/.test(url)) continue;
    if (/^https?:/.test(url)) { if (attr === "src" || /stylesheet/.test(html.slice(html.lastIndexOf("<", html.indexOf(url)), html.indexOf(url)))) external.push(`${page}: ${url}`); continue; }
    if (url === "download/aim-preview.zip") continue; // built with --preview, not committed
    if (!existsSync(root + "site/" + url)) missing.push(`${page}: ${url}`);
  }
}
step("every local page, script, stylesheet and image the site uses exists", missing.length === 0, missing.join(", "));
step("nothing is loaded from another site (no trackers, fonts or scripts from elsewhere)", external.length === 0, external.join(", "));

const md = readFileSync(root + "PRIVACY.md", "utf8"), privacy = readFileSync(root + "site/privacy.html", "utf8");
const headings = [...md.matchAll(/^##+ (.*)$/gm)].map(m => m[1].replace(/[*_`]/g, ""));
step("the privacy page has every section of PRIVACY.md", headings.length > 3 && headings.every(h => privacy.includes(h.replace(/&/g, "&amp;"))), headings.find(h => !privacy.includes(h)));
step("Markdown: bold, links and lists come out as HTML, and text is escaped",
  markdown("**Hi** <b>x</b> [a](b.html)\n\n- one\n- two") === '<p><strong>Hi</strong> &lt;b&gt;x&lt;/b&gt; <a href="b.html">a</a></p>\n<ul><li>one</li><li>two</li></ul>');
const index = readFileSync(root + "site/index.html", "utf8");
step("the home page says Aim isn't affiliated with YouTube, and links the privacy policy", /not affiliated with YouTube or Google/.test(index) && index.includes('href="privacy.html"'));
step("no understanding scores or percentages are promised", !/\d+\s?%/.test(index.replace(/<style[\s\S]*?<\/style>/g, "")));

try {
  const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT || "playwright");
  const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  for (const page of pages) {
    const p = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const errors = [];
    p.on("pageerror", e => errors.push(e.message));
    p.on("requestfailed", r => !r.url().endsWith("aim-preview.zip") && errors.push("failed: " + r.url()));
    await p.goto("file://" + root + "site/" + page);
    await p.waitForTimeout(300);
    const over = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    step(`${page}: no errors, and no sideways scrolling on a phone`, !errors.length && over <= 0, errors.join(" | ") || `${over}px wider`);
    if (page === "index.html") {
      step("the shelf shows Aim's own book covers", (await p.$$("#shelf .book")).length === 4);
      step("until there's a store listing, the buttons lead to the preview", (await p.getAttribute("a[data-get]", "href")) === "install.html" && (await p.textContent("a.btn.big")).includes("preview"));
      await p.route("**/config.js", r => r.fulfill({ contentType: "text/javascript", body: 'window.AIM_SITE = { storeUrl: "https://chromewebstore.google.com/detail/aim/abc", plusPrice: "$6 a month", contactEmail: "hi@example.com" };' }));
      await p.reload();
      await p.waitForTimeout(200);
      step("Homeschool is teased as coming later, parent-approved, never as a complete curriculum", (await p.textContent("#homeschool")).includes("Coming later") &&
        (await p.textContent("#homeschool")).includes("until you approve the week") && !/complete curriculum|full curriculum/i.test(await p.textContent("#homeschool")));
      step("with a listing: buttons go to the Chrome Web Store, the price and contact show", (await p.getAttribute("a.btn.big", "href")).startsWith("https://chromewebstore.google.com/") &&
        (await p.textContent("[data-plus-price]")) === "$6 a month" && (await p.getAttribute("[data-contact]", "href")) === "mailto:hi@example.com" &&
        (await p.getAttribute("[data-early]", "href")).startsWith("mailto:hi@example.com?subject="));
    }
    await p.close();
  }
  await browser.close();
} catch (e) {
  if (/Cannot find module/.test(e.message)) console.log("  (skipped the browser checks: Playwright isn't installed)");
  else { failed++; console.log("  FAIL browser checks  — " + e.message); }
}
console.log(failed ? `${failed} failed` : "All website checks passed.");
process.exit(failed ? 1 : 0);
