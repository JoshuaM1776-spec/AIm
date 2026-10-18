// Draws the Aim mark and writes everything made from it:
//   icons/mark.svg, icons/mark-small.svg       the drawing (large, and simplified for 16–32 px)
//   icons/16|32|48|128.png, icons/light/*.png  toolbar and store icons (dark mark / light mark)
//   icons/wordmark.png, icons/wordmark-light.png  the mark with "im", for the store and website
//   the ICON.logo entry in content/core.js
// The A is a mountain; a road winds up it and leaves the summit for a north star.
// Run: PLAYWRIGHT=… CHROMIUM_PATH=… node tools/build-mark.mjs
import { writeFileSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
export const COLORS = { forest: "#1e3a32", coral: "#ff5446", light: "#f1f1f1" };

// Units: cap height 100, baseline y = 0, up is negative. Mountain corners:
const BL = [0, 0], APEX = [60, -100], BR = [112, 0];

// A smooth curve through points (Catmull-Rom), sampled finely.
function spline(pts, per = 40) {
  const out = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
    for (let s = 0; s < per; s++) {
      const t = s / per, t2 = t * t, t3 = t2 * t;
      out.push([0, 1].map(k => 0.5 * (2 * p1[k] + (-p0[k] + p2[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3)));
    }
  }
  out.push(pts[pts.length - 1]);
  return out;
}
// The two edges of a road along `center`, w0 wide at the start narrowing to w1.
function edges(center, w0, w1) {
  const len = [0];
  for (let i = 1; i < center.length; i++) len.push(len[i - 1] + Math.hypot(center[i][0] - center[i - 1][0], center[i][1] - center[i - 1][1]));
  const L = [], R = [];
  center.forEach((p, i) => {
    const a = center[Math.max(0, i - 1)], b = center[Math.min(center.length - 1, i + 1)];
    const dx = b[0] - a[0], dy = b[1] - a[1], d = Math.hypot(dx, dy), w = (w0 + (w1 - w0) * Math.pow(len[i] / len.at(-1), 0.85)) / 2;
    L.push([p[0] + dy / d * w, p[1] - dx / d * w]); R.push([p[0] - dy / d * w, p[1] + dx / d * w]);
  });
  return [L, R];
}
const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
const inside = p => p[1] <= 0 && cross(BL, APEX, p) >= 0 && cross(APEX, BR, p) >= 0;
// Where segment p→q crosses the mountain's outline.
function hit(p, q) {
  let lo = 0, hi = 1; const pin = inside(p);
  for (let k = 0; k < 40; k++) { const m = (lo + hi) / 2, x = [p[0] + (q[0] - p[0]) * m, p[1] + (q[1] - p[1]) * m]; if (inside(x) === pin) lo = m; else hi = m; }
  return [p[0] + (q[0] - p[0]) * lo, p[1] + (q[1] - p[1]) * lo];
}
// The part of an edge inside the mountain, with its exact entry and exit points.
function within(edge) {
  const a = edge.findIndex(inside), b = edge.findLastIndex(inside);
  return [hit(edge[a], edge[a - 1]), ...edge.slice(a, b + 1), hit(edge[b], edge[b + 1])];
}
const f = n => +n.toFixed(2);
const d = poly => "M" + poly.map(p => `${f(p[0])} ${f(p[1])}`).join("L") + "Z";

// The north star: a long north point, shorter east, west and south, and four small rays.
function star([cx, cy], r) {
  const w = r * 0.2, pts = [[0, -r * 1.5], [w, -w], [r * 0.95, 0], [w, w], [0, r * 1.2], [-w, w], [-r * 0.95, 0], [-w, -w]];
  const rays = [45, 135, 225, 315].map(g => {
    const t = g * Math.PI / 180, rot = ([x, y]) => [x * Math.cos(t) - y * Math.sin(t), x * Math.sin(t) + y * Math.cos(t)];
    return [[0, -r * 0.78], [r * 0.12, -r * 0.16], [-r * 0.12, -r * 0.16]].map(rot);
  });
  const at = poly => poly.map(([x, y]) => [cx + x, cy + y]);
  return [at(pts), ...rays.map(at)];
}

// A map pin: its point at (cx, cy + 2.1r), a hole in its head (drawn with fill-rule evenodd).
function pin([cx, cy], r) {
  cy -= r * 1.1; // (cx, cy) given is where the pin points from; center its head above
  const D = 2.1 * r, phi = Math.acos(r / D), tip = [cx, cy + D];
  const a = [cx + r * Math.sin(phi), cy + r * Math.cos(phi)], b = [cx - r * Math.sin(phi), cy + r * Math.cos(phi)], h = r * 0.42;
  return [`M${f(tip[0])} ${f(tip[1])}L${f(a[0])} ${f(a[1])}A${f(r)} ${f(r)} 0 1 0 ${f(b[0])} ${f(b[1])}Z` +
    `M${f(cx - h)} ${f(cy)}a${f(h)} ${f(h)} 0 1 0 ${f(2 * h)} 0a${f(h)} ${f(h)} 0 1 0 ${f(-2 * h)} 0Z`];
}

export function mark({ small = false, star: at, dest = "star" } = {}) {
  // The road: in at the foot, a bend left, a bend right, out by the summit's right shoulder.
  const road = spline([[50, 8], [44, -6], [26, -26], [34, -46], [60, -62], [68, -80], [76, -96]]);
  const [L, R] = edges(road, small ? 24 : 19, small ? 6.5 : 3.6).map(within);
  // The edge that meets the ground further left borders the piece with the summit.
  const [up, down] = L[0][0] < R[0][0] ? [L, R] : [R, L];
  const summit = [BL, ...up, APEX];
  const foot = [...down, BR];
  // The trail: from the road's exit toward the star, thinning out.
  const sc = at || (small ? [94, -114] : [96, -122]), sr = small ? 22 : 15;
  const exit = [(up.at(-1)[0] + down.at(-1)[0]) / 2, (up.at(-1)[1] + down.at(-1)[1]) / 2];
  const trailEnd = [sc[0] - (sc[0] - exit[0]) * 0.22, sc[1] - (sc[1] - exit[1]) * 0.22];
  const mid = [exit[0] + (trailEnd[0] - exit[0]) * 0.42, exit[1] + (trailEnd[1] - exit[1]) * 0.58];
  const [tl, tr] = edges(spline([exit, mid, trailEnd], 30), 4.2, 0.6);
  const ink = [summit, foot, ...(small ? [] : [[...tl, ...tr.reverse()]])];
  const accent = dest === "pin" ? [] : star(sc, sr);
  const pinD = dest === "pin" ? pin(sc, sr * 1.05) : [];
  // The box around everything, with a little room.
  const all = [...ink, ...accent, ...(dest === "pin" ? [[[sc[0] - sr * 1.1, sc[1] - sr * 2.3], [sc[0] + sr * 1.1, sc[1] + sr * 1.1]]] : [])].flat(), pad = 2;
  const x0 = Math.min(...all.map(p => p[0])) - pad, y0 = Math.min(...all.map(p => p[1])) - pad;
  const x1 = Math.max(...all.map(p => p[0])) + pad, y1 = Math.max(...all.map(p => p[1])) + pad;
  return { ink: ink.map(d), accent: [...accent.map(d), ...pinD], box: [x0, y0, x1 - x0, y1 - y0] };
}

export function svg(m, ink, accent = COLORS.coral, extra = "") {
  const [x, y, w, h] = m.box;
  // Square viewBox, mark centered.
  const s = Math.max(w, h), vx = x - (s - w) / 2, vy = y - (s - h) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${f(vx)} ${f(vy)} ${f(s)} ${f(s)}"${extra}>` +
    m.ink.map(p => `<path d="${p}" fill="${ink}"/>`).join("") + m.accent.map(p => `<path d="${p}" fill="${accent}" fill-rule="evenodd"/>`).join("") + `</svg>`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const big = mark(), small = mark({ small: true });
  writeFileSync(root + "icons/mark.svg", svg(big, COLORS.forest) + "\n");
  writeFileSync(root + "icons/mark-small.svg", svg(small, COLORS.forest) + "\n");

  // ICON.logo for YouTube pages: the mountain follows the text color (light in YouTube's dark theme).
  const [x, y, w, h] = small.box, s = Math.max(w, h);
  const scale = 24 / s, ox = x - (s - w) / 2, oy = y - (s - h) / 2;
  const re = p => p.replace(/(-?[\d.]+) (-?[\d.]+)/g, (_, a, b) => `${f((+a - ox) * scale)} ${f((+b - oy) * scale)}`);
  const logo = [20, ...small.ink.map(p => ["path", { d: re(p), fill: "currentColor" }]), ...small.accent.map(p => ["path", { d: re(p), fill: COLORS.coral, "fill-rule": "evenodd" }])];
  const core = root + "content/core.js", src = readFileSync(core, "utf8");
  writeFileSync(core, src.replace(/^  logo: \[20, .*\],$/m, `  logo: ${JSON.stringify(logo)},`));

  // PNGs, drawn by Chromium.
  const require = createRequire(import.meta.url);
  const { chromium } = require(process.env.PLAYWRIGHT || "playwright");
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
  const page = await browser.newPage();
  const shoot = async (html, w, h, file) => {
    await page.setViewportSize({ width: w, height: h });
    await page.setContent(`<html><body style="margin:0;background:transparent">${html}</body></html>`);
    await page.locator("body > *").first().screenshot({ path: root + file, omitBackground: true });
  };
  for (const [dir, ink] of [["icons", COLORS.forest], ["icons/light", COLORS.light]]) {
    for (const n of [16, 32, 48, 128]) {
      const m = n <= 32 ? small : big;
      await shoot(svg(m, ink, COLORS.coral, ` width="${n}" height="${n}" style="display:block"`), n, n, `${dir}/${n}.png`);
    }
  }
  // The wordmark: the mark's mountain as the A, then "im" in Inter Display, the i's dot left off so the star stands in for it.
  // "im" starts at the mountain's right foot; the star sits where the i's dot would be.
  const TEXT_X = 114;
  await page.setContent(`<svg xmlns="http://www.w3.org/2000/svg"><text id="t" x="${TEXT_X}" font-family="Inter Display" font-weight="800" font-size="137.5" letter-spacing="-2">ım</text></svg>`);
  const I_STEM = await page.evaluate(() => { const e = document.getElementById("t").getExtentOfChar(0); return e.x + (e.width + 2) / 2; });
  const word = ink => {
    const m = mark({ star: [I_STEM, -104] }), [bx, by, , bh] = m.box, ww = 350;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${bx} ${by} ${ww} ${bh}" width="${ww * 3}" height="${bh * 3}" style="display:block">` +
      m.ink.map(p => `<path d="${p}" fill="${ink}"/>`).join("") + m.accent.map(p => `<path d="${p}" fill="${COLORS.coral}"/>`).join("") +
      `<text x="${TEXT_X}" y="0" font-family="Inter Display" font-weight="800" font-size="137.5" letter-spacing="-2" fill="${ink}">ım</text></svg>`;
  };
  await shoot(word(COLORS.forest), 1100, 480, "icons/wordmark.png");
  await shoot(word(COLORS.light), 1100, 480, "icons/wordmark-light.png");
  await browser.close();
  console.log("Wrote icons/mark.svg, mark-small.svg, PNGs, wordmarks, and ICON.logo.");
}
