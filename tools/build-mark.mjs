// Builds everything made from the Aim mark:
//   icons/mark.svg                             the mark, squared up (forest green and coral)
//   icons/16|32|48|128.png, icons/light/*.png  toolbar and store icons (for light / dark toolbars)
//   icons/wordmark.png, icons/wordmark-light.png  "Aim" with the mark, for the store and website
//   the ICON.logo entry in content/core.js
// The drawing itself is icons/mark-traced.svg: the approved artwork (docs/brand/aim-mark-approved.webp)
// traced by tools/trace-mark.py. Nothing here changes its shape; to change the mark, trace new
// artwork. The road is a gap in the green, so it shows whatever is behind the mark.
// Never red and never on a red tile, so it isn't mistaken for YouTube's play button.
// Run: PLAYWRIGHT=… CHROMIUM_PATH=… node tools/build-mark.mjs
import { writeFileSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
export const COLORS = { forest: "#193d31", coral: "#ff5446", light: "#f1f1f1" };

const f = n => +n.toFixed(2);
const traced = readFileSync(root + "icons/mark-traced.svg", "utf8");
const [green, coral] = [...traced.matchAll(/<path d="([^"]+)"/g)].map(m => m[1]);

const paths = (ink, box) => `<path d="${green}" fill="${ink}" fill-rule="evenodd"/><path d="${coral}" fill="${COLORS.coral}" fill-rule="evenodd"/>`;
// The mark in a square viewBox around its drawing (box: [x, y, w, h] from the browser).
export function svg(box, ink, extra = "") {
  const [x, y, w, h] = box, s = Math.max(w, h) + 4, vx = x - (s - w) / 2, vy = y - (s - h) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${f(vx)} ${f(vy)} ${f(s)} ${f(s)}"${extra}>${paths(ink)}</svg>`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const require = createRequire(import.meta.url);
  const { chromium } = require(process.env.PLAYWRIGHT || "playwright");
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
  const page = await browser.newPage();
  // The drawing's bounds, measured by Chromium.
  await page.setContent(traced.replace("<svg ", '<svg id="m" '));
  const box = await page.evaluate(() => { const b = document.querySelector("#m").getBBox(); return [b.x, b.y, b.width, b.height]; });

  writeFileSync(root + "icons/mark.svg", svg(box, COLORS.forest) + "\n");

  // ICON.logo for YouTube pages: forest green, or light in YouTube's dark theme (--wp-mark, content.css).
  const [x, y, w, h] = box, s = Math.max(w, h) + 4, ox = x - (s - w) / 2, oy = y - (s - h) / 2, k = 24 / s;
  const re = d => d.replace(/(-?[\d.]+) (-?[\d.]+)/g, (_, a, b) => `${f((+a - ox) * k)} ${f((+b - oy) * k)}`);
  const logo = [20, ["path", { d: re(green), "fill-rule": "evenodd", style: `fill: var(--wp-mark, ${COLORS.forest})` }],
    ["path", { d: re(coral), "fill-rule": "evenodd", fill: COLORS.coral }]];
  const core = root + "content/core.js", src = readFileSync(core, "utf8");
  writeFileSync(core, src.replace(/^  logo: \[20,.*\],$/m, `  logo: ${JSON.stringify(logo)},`));

  // PNGs, drawn by Chromium.
  const shoot = async (html, w, h, file) => {
    await page.setViewportSize({ width: w, height: h });
    await page.setContent(`<html><body style="margin:0;background:transparent">${html}</body></html>`);
    await page.locator("body > *").first().screenshot({ path: root + file, omitBackground: true });
  };
  for (const [dir, ink] of [["icons", COLORS.forest], ["icons/light", COLORS.light]]) {
    for (const n of [16, 32, 48, 128]) await shoot(svg(box, ink, ` width="${n}" height="${n}" style="display:block"`), n, n, `${dir}/${n}.png`);
  }
  // The wordmark: "Aim" in Inter Display, then the mark, as in the approved lockup.
  const word = ink => `<div style="display:inline-flex;align-items:center;gap:20px;padding:6px">` +
    `<span style="font:700 112px 'Inter Display';letter-spacing:-3px;color:${ink};line-height:1">Aim</span>` +
    svg(box, ink, ` width="${f(130 * box[2] / box[3])}" height="130"`).replace(/viewBox="[^"]+"/, `viewBox="${box.map(f).join(" ")}"`) + `</div>`;
  await shoot(word(COLORS.forest), 700, 200, "icons/wordmark.png");
  await shoot(word(COLORS.light), 700, 200, "icons/wordmark-light.png");
  await browser.close();
  console.log("Wrote icons/mark.svg, PNGs, wordmarks, and ICON.logo from icons/mark-traced.svg.");
}
