// Draws the Aim mark and writes everything made from it:
//   icons/mark.svg, icons/mark-small.svg       the drawing (full, and simplified for 16–32 px)
//   icons/16|32|48|128.png, icons/light/*.png  toolbar and store icons (for light / dark toolbars)
//   icons/wordmark.png, icons/wordmark-light.png  "Aim" with the mark, for the store and website
//   the ICON.logo entry in content/core.js
// The mark: a rounded triangle pointing forward, a road winding through it, and a coral arrowhead
// where the road leads out. Never red and never on a red tile, so it isn't mistaken for YouTube's
// play button.
// Run: PLAYWRIGHT=… CHROMIUM_PATH=… node tools/build-mark.mjs
import { writeFileSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
export const COLORS = { forest: "#1e3a32", sage: "#7c9a7a", coral: "#ff5446", cream: "#f8f1e7", light: "#f1f1f1" };

// Units: a 100 × 100 box, y down. The triangle's corners, rounded:
const CORNERS = [[8, 6], [96, 50], [8, 94]], ROUND = 11;

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
// Sutherland–Hodgman: a polygon clipped to a convex one.
function clip(subject, poly) {
  let out = subject;
  poly.forEach((a, i) => {
    const b = poly[(i + 1) % poly.length], inn = p => cross(a, b, p) >= 0, input = out; out = [];
    input.forEach((p, j) => {
      const q = input[(j + 1) % input.length];
      if (inn(p)) out.push(p);
      if (inn(p) !== inn(q)) { const d1 = cross(a, b, p), d2 = cross(a, b, q), t = d1 / (d1 - d2); out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]); }
    });
  });
  return out;
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

export function mark({ small = false } = {}) {
  const shape = rounded(CORNERS, ROUND), inside = insideOf(shape);
  // The road: in through the lower edge, a bend left, a bend right, out through the upper edge.
  const center = spline([[40, 106], [40, 88], [29, 73], [37, 58], [56, 49], [69, 39], [80, 26]]);
  const width = t => (small ? 24 - 12 * t : 19 - 10 * t) / 2;
  const left = within(inside, offset(center, width, 1)), right = within(inside, offset(center, width, -1));
  // Which edge borders the triangle's top-left part: the one leaving the upper edge further left.
  const [upper, lower] = left.at(-1)[0] < right.at(-1)[0] ? [left, right] : [right, left];
  const pos = p => along(shape, p);
  // Each piece: one road edge, then back along the outline the way that doesn't cross the road.
  const piece = (edge, other) => {
    const s = pos(edge.at(-1)), e = pos(edge[0]), o = [pos(other[0]), pos(other.at(-1))];
    const fwd = arc(shape, s, e), between = (x, a, b) => (b > a ? x > a && x < b : x > a || x < b);
    const crossesOther = o.some(x => between(x, s, e));
    return [...edge, ...(crossesOther ? arc(shape, e, s).reverse() : fwd)];
  };
  const ink = [piece(upper, lower), piece(lower, upper)];
  // The sage verge along the road's upper side, widest in the middle, clipped to the triangle.
  const verge = [];
  if (!small) {
    const vw = t => width(t) + 5 * Math.sin(Math.PI * Math.min(1, Math.max(0, (t - 0.15) / 0.85)));
    const side = upper === left ? 1 : -1;
    verge.push(clip([...offset(center, width, side), ...offset(center, vw, side).reverse()], shape));
  }
  // The arrowhead, out past the upper edge where the road leads, pointing the road's way.
  const exitMid = [(upper.at(-1)[0] + lower.at(-1)[0]) / 2, (upper.at(-1)[1] + lower.at(-1)[1]) / 2];
  const dir = norm([center.at(-1)[0] - center.at(-8)[0], center.at(-1)[1] - center.at(-8)[1]]);
  const nrm = [-dir[1], dir[0]], L = small ? 34 : 30, W = small ? 30 : 27, gap = small ? 7 : 6;
  const base = [exitMid[0] + dir[0] * gap, exitMid[1] + dir[1] * gap];
  const tip = [base[0] + dir[0] * L, base[1] + dir[1] * L];
  const wing = s => [base[0] + nrm[0] * W / 2 * s - dir[0] * 2, base[1] + nrm[1] * W / 2 * s - dir[1] * 2];
  const notch = [base[0] + dir[0] * L * 0.28, base[1] + dir[1] * L * 0.28];
  const arrow = [tip, wing(1), notch, wing(-1)];
  // Box around everything.
  const all = [...shape, ...arrow], pad = 2;
  const x0 = Math.min(...all.map(p => p[0])) - pad, y0 = Math.min(...all.map(p => p[1])) - pad;
  const x1 = Math.max(...all.map(p => p[0])) + pad, y1 = Math.max(...all.map(p => p[1])) + pad;
  return { ink: ink.map(d), verge: verge.map(d), accent: [d(arrow)], box: [x0, y0, x1 - x0, y1 - y0] };
}

export function svg(m, ink, extra = "") {
  const [x, y, w, h] = m.box, s = Math.max(w, h), vx = x - (s - w) / 2, vy = y - (s - h) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${f(vx)} ${f(vy)} ${f(s)} ${f(s)}"${extra}>` + inner(m, ink) + `</svg>`;
}
const inner = (m, ink) => m.ink.map(p => `<path d="${p}" fill="${ink}"/>`).join("") +
  m.verge.map(p => `<path d="${p}" fill="${COLORS.sage}"/>`).join("") +
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
