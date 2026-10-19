// Draws the Aim mark and writes everything made from it:
//   icons/mark.svg, icons/mark-small.svg       the drawing (full, and a wider road for 16–32 px)
//   icons/16|32|48|128.png, icons/light/*.png  toolbar and store icons (for light / dark toolbars)
//   icons/wordmark.png, icons/wordmark-light.png  "Aim" with the mark, for the store and website
//   the ICON.logo entry in content/core.js
// The mark: a rounded triangle pointing forward, a road curving up through it with a ribbon beside
// it, and a coral arrowhead where the road leads out. Never red and never on a red tile, so it isn't mistaken for YouTube's
// play button.
// Run: PLAYWRIGHT=… CHROMIUM_PATH=… node tools/build-mark.mjs
import { writeFileSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
export const COLORS = { forest: "#193d31", coral: "#ff5446", cream: "#f8f1e7", light: "#f1f1f1" };

// Units: a 100 × 100 box, y down. The triangle's corners, rounded (its bottom-right is cut flat; the
// road and ribbon take that part):
const CORNERS = [[8, 6], [96, 50], [48, 95], [8, 95]], ROUND = 11;

// A convex polygon with rounded corners, sampled finely (clockwise).
function rounded(v, r, per = 12) {
  const out = [];
  v.forEach((p, i) => {
    const a = v[(i + v.length - 1) % v.length], b = v[(i + 1) % v.length];
    const u1 = norm([a[0] - p[0], a[1] - p[1]]), u2 = norm([b[0] - p[0], b[1] - p[1]]);
    const half = Math.acos(u1[0] * u2[0] + u1[1] * u2[1]) / 2, t = r / Math.tan(half);
    const s = [p[0] + u1[0] * t, p[1] + u1[1] * t], e = [p[0] + u2[0] * t, p[1] + u2[1] * t];
    const bis = norm([u1[0] + u2[0], u1[1] + u2[1]]), c = [p[0] + bis[0] * r / Math.sin(half), p[1] + bis[1] * r / Math.sin(half)];
    const a0 = Math.atan2(s[1] - c[1], s[0] - c[0]); let a1 = Math.atan2(e[1] - c[1], e[0] - c[0]);
    while (a1 < a0) a1 += 2 * Math.PI;
    if (a1 - a0 > Math.PI) a1 -= 2 * Math.PI;
    for (let k = 0; k <= per; k++) { const g = a0 + (a1 - a0) * k / per; out.push([c[0] + r * Math.cos(g), c[1] + r * Math.sin(g)]); }
  });
  return out;
}
const norm = ([x, y]) => { const l = Math.hypot(x, y); return [x / l, y / l]; };

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
  out.push(pts.at(-1));
  return out;
}
// Curves either side of `center`, at a distance that varies along it: width(t) for t in 0..1.
function offset(center, width, side) {
  return center.map((p, i) => {
    const a = center[Math.max(0, i - 1)], b = center[Math.min(center.length - 1, i + 1)];
    const [nx, ny] = norm([-(b[1] - a[1]), b[0] - a[0]]), w = width(i / (center.length - 1)) * side;
    return [p[0] + nx * w, p[1] + ny * w];
  });
}

// Point-in-convex-polygon (clockwise, y down) and where a segment crosses its outline.
const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
const insideOf = poly => p => poly.every((a, i) => cross(a, poly[(i + 1) % poly.length], p) >= 0);
function hit(inside, p, q) {
  let lo = 0, hi = 1; const pin = inside(p);
  for (let k = 0; k < 40; k++) { const m = (lo + hi) / 2, x = [p[0] + (q[0] - p[0]) * m, p[1] + (q[1] - p[1]) * m]; if (inside(x) === pin) lo = m; else hi = m; }
  return [p[0] + (q[0] - p[0]) * lo, p[1] + (q[1] - p[1]) * lo];
}
// The part of a curve inside the shape, from where it enters to where it leaves.
function within(inside, line) {
  const a = line.findIndex(inside), b = line.findLastIndex(inside);
  return [hit(inside, line[a], line[a - 1]), ...line.slice(a, b + 1), hit(inside, line[b], line[b + 1])];
}
// Position of a point along the outline (index of its nearest segment, plus fraction).
function along(poly, p) {
  let best = [Infinity, 0];
  poly.forEach((a, i) => {
    const b = poly[(i + 1) % poly.length], dx = b[0] - a[0], dy = b[1] - a[1];
    const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy)));
    const dd = Math.hypot(a[0] + dx * t - p[0], a[1] + dy * t - p[1]);
    if (dd < best[0]) best = [dd, i + t];
  });
  return best[1];
}
// The outline's points walking forward from position s to position e.
function arc(poly, s, e) {
  const n = poly.length, out = [];
  let i = Math.floor(s) + 1;
  const end = e > s ? e : e + n;
  for (let k = i; k <= Math.floor(end); k++) out.push(poly[k % n]);
  return out;
}

const f = n => +n.toFixed(2);
const d = poly => "M" + poly.map(p => `${f(p[0])} ${f(p[1])}`).join("L") + "Z";

// The polygon with its corner at index i rounded off over distance r along each side.
function fillet(poly, i, r) {
  const n = poly.length, at = k => poly[(k + n) % n];
  const walk = step => { let k = i, left = r, p = poly[i];
    for (;;) { const q = at(k + step), l = Math.hypot(q[0] - p[0], q[1] - p[1]);
      if (l >= left) return [[p[0] + (q[0] - p[0]) * left / l, p[1] + (q[1] - p[1]) * left / l], k];
      left -= l; p = q; k += step; } };
  const [a, ka] = walk(-1), [b, kb] = walk(1), c = poly[i];
  const curve = Array.from({ length: 9 }, (_, j) => { const t = j / 8, u = 1 - t;
    return [u * u * a[0] + 2 * u * t * c[0] + t * t * b[0], u * u * a[1] + 2 * u * t * c[1] + t * t * b[1]]; });
  // Keep the points outside the rounded stretch, in order, starting after it.
  const out = [...curve];
  for (let k = kb + 1; (k - (ka - 0)) % n !== 0 && out.length < n + 9; k++) out.push(at(k));
  return out;
}

// A band along `center` between distances near(t) and far(t) on one side, from index i0 to i1,
// with round ends.
function band(center, near, far, side, i0, i1) {
  const n = center.length - 1;
  const inner = offset(center, near, side).slice(i0, i1 + 1), outer = offset(center, far, side).slice(i0, i1 + 1);
  const cap = (from, to, out) => {
    const c = [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2], r = Math.hypot(from[0] - c[0], from[1] - c[1]);
    const a0 = Math.atan2(from[1] - c[1], from[0] - c[0]);
    // Turn the way that passes through `out` (the direction the band ends in).
    const mid = a0 + Math.PI / 2, sense = Math.cos(mid) * out[0] + Math.sin(mid) * out[1] > 0 ? 1 : -1;
    return Array.from({ length: 13 }, (_, k) => { const g = a0 + sense * Math.PI * k / 12; return [c[0] + r * Math.cos(g), c[1] + r * Math.sin(g)]; });
  };
  const fwd = norm([center[i1][0] - center[i1 - 1][0], center[i1][1] - center[i1 - 1][1]]);
  const back = norm([center[i0][0] - center[i0 + 1][0], center[i0][1] - center[i0 + 1][1]]);
  return [...inner, ...cap(inner.at(-1), outer.at(-1), fwd), ...outer.slice().reverse(), ...cap(outer[0], inner[0], back)];
}

export function mark({ small = false } = {}) {
  const shape = rounded(CORNERS, ROUND), inside = insideOf(shape);
  // The road: in through the lower edge near the corner, curving up and out by the tip.
  const center = spline([[27, 112], [27, 96], [28, 82], [36, 71], [52, 62], [68, 54], [84, 46], [98, 39]]);
  const n = center.length - 1;
  // Half the road's width; it widens where it comes in at the bottom, curling the triangle's foot.
  const road = t => (small ? 13 - 2 * t : 9.5 - 1.5 * t) / 2 + (t < 0.34 ? 8 * (1 - t / 0.34) ** 2 : 0);
  const rib = t => (small ? 22 - 3 * t : 18 - 3 * t);             // the ribbon's width
  const upper = within(inside, offset(center, road, -1)), lower = within(inside, offset(center, road, 1));
  const pos = p => along(shape, p);
  // The triangle above the road: the road's upper edge, then round by the left side.
  const s0 = pos(upper.at(-1)), e0 = pos(upper[0]), o = [pos(lower[0]), pos(lower.at(-1))];
  const between = (x, a, b) => (b > a ? x > a && x < b : x > a || x < b);
  let top = [...upper, ...(o.some(x => between(x, s0, e0)) ? arc(shape, e0, s0).reverse() : arc(shape, s0, e0))];
  top = fillet(top, 0, small ? 5 : 4);  // the foot, where the road comes in
  top = fillet(top, top.findIndex(p => p === upper.at(-1)), 1.5);  // the point by the arrow
  // Below the road: a ribbon running beside it, from the first bend up to the arrow.
  const i0 = Math.round(n * 0.47), i1 = Math.round(n * 0.9);
  const ribbon = band(center, road, t => road(t) + rib(t), 1, i0, i1);
  // The arrowhead, just past the end of the road, pointing the road's way.
  // It sits a little above the road's line and turns a little upward: heading for higher ground.
  const end = center[i1], along0 = norm([end[0] - center[i1 - 6][0], end[1] - center[i1 - 6][1]]), turn = -0.22;
  const dir = [along0[0] * Math.cos(turn) - along0[1] * Math.sin(turn), along0[0] * Math.sin(turn) + along0[1] * Math.cos(turn)];
  const nrm = [-dir[1], dir[0]], L = small ? 38 : 36, W = small ? 34 : 32, gap = small ? 5 : 4, lift = small ? 5 : 6;
  const base = [end[0] + dir[0] * gap - nrm[0] * lift, end[1] + dir[1] * gap - nrm[1] * lift];
  const tip = [base[0] + dir[0] * L, base[1] + dir[1] * L];
  const wing = s => [base[0] + nrm[0] * W / 2 * s, base[1] + nrm[1] * W / 2 * s];
  const notch = [base[0] + dir[0] * L * 0.28, base[1] + dir[1] * L * 0.28];
  const arrow = [tip, wing(1), notch, wing(-1)];
  // Box around everything.
  const all = [...top, ...ribbon, ...arrow], pad = 2;
  const x0 = Math.min(...all.map(p => p[0])) - pad, y0 = Math.min(...all.map(p => p[1])) - pad;
  const x1 = Math.max(...all.map(p => p[0])) + pad, y1 = Math.max(...all.map(p => p[1])) + pad;
  return { ink: [d(top), d(ribbon)], accent: [d(arrow)], box: [x0, y0, x1 - x0, y1 - y0] };
}

export function svg(m, ink, extra = "") {
  const [x, y, w, h] = m.box, s = Math.max(w, h), vx = x - (s - w) / 2, vy = y - (s - h) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${f(vx)} ${f(vy)} ${f(s)} ${f(s)}"${extra}>` + inner(m, ink) + `</svg>`;
}
const inner = (m, ink) => m.ink.map(p => `<path d="${p}" fill="${ink}"/>`).join("") +
  m.accent.map(p => `<path d="${p}" fill="${COLORS.coral}" stroke="${COLORS.coral}" stroke-width="2" stroke-linejoin="round"/>`).join("");

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const big = mark(), small = mark({ small: true });
  writeFileSync(root + "icons/mark.svg", svg(big, COLORS.forest) + "\n");
  writeFileSync(root + "icons/mark-small.svg", svg(small, COLORS.forest) + "\n");

  // ICON.logo for YouTube pages: forest green, or light in YouTube's dark theme (--wp-mark, content.css).
  const [x, y, w, h] = small.box, s = Math.max(w, h);
  const scale = 24 / s, ox = x - (s - w) / 2, oy = y - (s - h) / 2;
  const re = p => p.replace(/(-?[\d.]+) (-?[\d.]+)/g, (_, a, b) => `${f((+a - ox) * scale)} ${f((+b - oy) * scale)}`);
  const logo = [20, ...small.ink.map(p => ["path", { d: re(p), style: `fill: var(--wp-mark, ${COLORS.forest})` }]),
    ...small.accent.map(p => ["path", { d: re(p), fill: COLORS.coral, stroke: COLORS.coral, "stroke-width": f(2 * scale), "stroke-linejoin": "round" }])];
  const core = root + "content/core.js", src = readFileSync(core, "utf8");
  writeFileSync(core, src.replace(/^  logo: \[20,.*\],$/m, `  logo: ${JSON.stringify(logo)},`));

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
    for (const n of [16, 32, 48, 128]) await shoot(svg(n <= 32 ? small : big, ink, ` width="${n}" height="${n}" style="display:block"`), n, n, `${dir}/${n}.png`);
  }
  // The wordmark: "Aim" in Inter Display, then the mark, which points on from the word.
  const word = ink => {
    const [bx, by, bw, bh] = big.box, H = 100, sc = H / bh;
    return `<div style="display:inline-flex;align-items:center;gap:22px;padding:6px"><span style="font:700 112px 'Inter Display';letter-spacing:-3px;color:${ink};line-height:1">Aim</span>` +
      `<svg viewBox="${bx} ${by} ${bw} ${bh}" width="${bw * sc * 1.25}" height="${H * 1.25}">${inner(big, ink)}</svg></div>`;
  };
  await shoot(word(COLORS.forest), 700, 200, "icons/wordmark.png");
  await shoot(word(COLORS.light), 700, 200, "icons/wordmark-light.png");
  await browser.close();
  console.log("Wrote icons/mark.svg, mark-small.svg, PNGs, wordmarks, and ICON.logo.");
}
