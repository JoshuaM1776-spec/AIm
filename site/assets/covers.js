// Aim — book covers for aims (the library, an aim's page, the popup). Each aim is a clothbound book:
// the subject's color, a spine with raised bands, a gilt frame, its name in gold serif type and an
// engraved emblem for the subject. Drawn (SVG and CSS), not pictures: light, sharp at any size, the
// same in both themes, and nothing to license. Styles: covers.css. subject: { id, name } from
// aimSubject in store.js.

const COVER_COLORS = {
  history: "#1d3a2d", science: "#1a3150", math: "#2f2a55", space: "#151f3d", engineering: "#2c3a42", craft: "#6a2c14",
  coding: "#163a44", money: "#2f4a22", aviation: "#1f4560", health: "#2c4727", language: "#5a2131", arts: "#5a2343",
  cooking: "#7a4314", people: "#4f1c1c", faith: "#3d2a1a", general: "#24402f"
};

// Engraved emblems on a 48×48 grid: fine gold lines, more drawing than icon.
const EMBLEMS = {
  // The Colosseum: three tiers of arches on an oval.
  history: ["M6 38h36", "M8 38V19c5-3 11-4.5 16-4.5s11 1.5 16 4.5v19", "M8 25c5-2.6 11-4 16-4s11 1.4 16 4", "M8 31.5c5-2.2 11-3.4 16-3.4s11 1.2 16 3.4",
    "M11 38v-3.5a1.6 1.6 0 0 1 3.2 0V38M17.5 38v-4a1.6 1.6 0 0 1 3.2 0v4M24.4 38v-4a1.6 1.6 0 0 1 3.2 0v4M31 38v-4a1.6 1.6 0 0 1 3.2 0v4",
    "M11 29.5v-2.6a1.4 1.4 0 0 1 2.8 0v2.4M17.6 28.4v-2.8a1.4 1.4 0 0 1 2.8 0v2.6M24.6 28v-2.9a1.4 1.4 0 0 1 2.8 0V28M31.3 28.6v-2.7a1.4 1.4 0 0 1 2.8 0v2.6",
    "M12 22.6v-1.8a1.2 1.2 0 0 1 2.4 0v1.3M18.4 21.4v-2a1.2 1.2 0 0 1 2.4 0v1.8M25 21v-2a1.2 1.2 0 0 1 2.4 0v2M31.4 21.6v-1.9a1.2 1.2 0 0 1 2.4 0v1.6", "M40 19v-2.5"],
  // An atom.
  science: [["e", 24, 24, 18, 6.5, 0], ["e", 24, 24, 18, 6.5, 60], ["e", 24, 24, 18, 6.5, -60], ["c", 24, 24, 2.4], ["c", 41.5, 24, .9], ["c", 15.2, 38.6, .9], ["c", 15.2, 9.4, .9]],
  // Compass and triangle.
  math: ["M10 38l14-26 14 26z", "M24 12v26M16.5 25h15", "M24 8a2 2 0 1 0 0-4 2 2 0 0 0 0 4z", "M22.8 7.5L14 40M25.2 7.5L34 40", "M17 33a9 9 0 0 1 14 0"],
  // A ringed planet and stars.
  space: [["c", 24, 25, 9], ["e", 24, 25, 19, 4.5, -18], "M38 8l.9 2.1 2.1.9-2.1.9-.9 2.1-.9-2.1-2.1-.9 2.1-.9z", "M9 9l.7 1.5 1.5.7-1.5.7L9 13.4l-.7-1.5-1.5-.7 1.5-.7z",
    ["c", 40, 38, .7], ["c", 8, 34, .7], ["c", 31, 6, .6]],
  // Two meshing gears.
  engineering: ["M19 31a7 7 0 1 0 0-14 7 7 0 0 0 0 14z", "M19 26a2 2 0 1 0 0-4 2 2 0 0 0 0 4z",
    "M19 11v3.5M19 33.5V37M6 24h3.5M28.5 24H32M9.8 14.8l2.5 2.5M25.7 30.7l2.5 2.5M9.8 33.2l2.5-2.5M25.7 17.3l2.5-2.5",
    "M34 40a5 5 0 1 0 0-10 5 5 0 0 0 0 10z", "M34 27v2M34 41v2M27.5 35h2M38.5 35h2M29.5 30.5l1.4 1.4M37.1 38.1l1.4 1.4M29.5 39.5l1.4-1.4M37.1 31.9l1.4-1.4"],
  // A woodworker's hand plane: sole, body, rear tote, front knob, blade, and a curl of shaving.
  craft: ["M5 33h34v3.5H5z", "M8 33l2-6h26l2.5 6", "M11 27c-1.2-6 1.8-10.5 7-10.5 3 0 4.2 2.2 3 4.2-1.4 2.2-4.2 2.6-4.6 6.3", "M32 27c0-3.2 1.6-5.2 3.6-5.2s3.6 2 3.6 5.2",
    "M21.5 27l5-10h3.2l-4.2 10", "M24.5 22.5h4.5", "M41 32c3.6-.6 5-3.6 3-5.3s-4.8-.3-3.8 2.2", "M7 40.5h30"],
  // A laptop with code.
  coding: ["M10 12h28v19H10z", "M5 35h38l-3 3H8z", "M19 18l-4 3.5 4 3.5M29 18l4 3.5-4 3.5M26 16.5l-4 10"],
  // A stack of coins.
  money: ["M14 38c0 1.7 4.5 3 10 3s10-1.3 10-3v-4", "M14 34c0 1.7 4.5 3 10 3s10-1.3 10-3v-4c0-1.7-4.5-3-10-3s-10 1.3-10 3z", "M14 30c0 1.7 4.5 3 10 3s10-1.3 10-3",
    "M18 23c0 1.7 4.5 3 10 3s10-1.3 10-3v-5c0-1.7-4.5-3-10-3s-10 1.3-10 3z", "M18 18c0 1.7 4.5 3 10 3s10-1.3 10-3", "M14 38v-4M34 38v-4", "M10 14l2-6M8 10h6"],
  // An airliner over clouds.
  aviation: ["M6 23.5l14-1.5 8-10h3.5l-4 10 10.5-1 3.5-4H44l-2.5 6.5L44 30h-2.5l-3.5-4-10.5-1 4 10H28l-8-10-14-1.5z", "M6 38c2-2.5 5-2.5 7 0 2-3 6-3 8 0 2-2 5-2 6 0M30 41c1.5-2 4-2 5 0 1.5-1.5 3.5-1.5 4.5 0"],
  // A sprouting seedling.
  health: ["M24 40V22", "M24 26c0-6-5-10-12-10 0 7 5 10 12 10z", "M24 22c0-6 4-10 11-10 0 7-4 10-11 10z", "M14 40h20", "M17 44h14"],
  // Two speech bubbles.
  language: ["M6 10h22v14H16l-6 5v-5H6z", "M20 28h22v14h-4v5l-6-5H20z", "M12 19l3-6 3 6M13 17h4", "M27 33h9M31.5 33v-1.5M34 33c0 3-2 5.5-5 7M29 35.5c1.5 2 3.5 3.5 6 4.5"],
  // A palette and brush.
  arts: ["M24 8C13 8 6 15 6 23c0 9 8 15 16 15 3 0 4-2 3-4s0-4 3-4h5c5 0 9-4 9-9 0-7-8-13-18-13z", "M15 22h.01M19 15h.01M27 14h.01M34 19h.01", "M30 44l12-14 2 2-12 14z"],
  // A loaf of bread, scored.
  cooking: ["M8 30c0-8 7-14 16-14s16 6 16 14v6H8z", "M17 22l4 5M23 20l4 6M29 21l4 5", "M6 40h36"],
  // A classical column.
  people: ["M12 10h24M14 13h20", "M16 13v25M21 13v25M27 13v25M32 13v25", "M13 38h22M10 41h28"],
  // An open book.
  faith: ["M6 14c6-3 12-3 18 1 6-4 12-4 18-1v24c-6-3-12-3-18 1-6-4-12-4-18-1z", "M24 15v24", "M10 20c3-1 7-1 10 1M10 25c3-1 7-1 10 1M28 21c3-2 7-2 10-1M28 26c3-2 7-2 10-1"],
  // A compass rose.
  general: ["M24 42a18 18 0 1 0 0-36 18 18 0 0 0 0 36z", "M24 10l3.5 10.5L38 24l-10.5 3.5L24 38l-3.5-10.5L10 24l10.5-3.5z", "M24 26a2 2 0 1 0 0-4 2 2 0 0 0 0 4z"]
};

// Each line of an emblem: a path, ["e", cx, cy, rx, ry, degrees] for an ellipse, or ["c", cx, cy, r] for a circle.
function coverEmblem(id) {
  const NS = "http://www.w3.org/2000/svg", s = document.createElementNS(NS, "svg");
  s.setAttribute("viewBox", "0 0 48 48"); s.setAttribute("class", "book-emblem"); s.setAttribute("aria-hidden", "true");
  for (const d of EMBLEMS[id] || EMBLEMS.general) {
    const [tag, attrs] = typeof d === "string" ? ["path", { d }]
      : d[0] === "e" ? ["ellipse", { cx: d[1], cy: d[2], rx: d[3], ry: d[4], transform: `rotate(${d[5]} ${d[1]} ${d[2]})` }]
      : ["circle", { cx: d[1], cy: d[2], r: d[3] }];
    const n = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries({ ...attrs, fill: "none", stroke: "currentColor", "stroke-width": "1.25", "stroke-linecap": "round", "stroke-linejoin": "round" })) n.setAttribute(k, v);
    s.append(n);
  }
  return s;
}

// How far along, 0..1, or null when there's nothing to measure: the map (with putting it together as
// the last step), a study session's checks, or a finished aim.
function coverProgress(a) {
  const u = a.understanding;
  if (u?.parts?.length) return (u.parts.filter(x => x.status === "explained").length + (u.solid ? 1 : 0)) / (u.parts.length + 1);
  if (a.study?.of) return a.study.checked / a.study.of;
  if (a.state === "completed") return 1;
  return null;
}

// A book. size: "shelf" (the library), "large" (an aim's page) or "small" (the popup).
function cover(a, size = "shelf") {
  const subject = a.subject || { id: "general", name: "Learning" };
  const mk = (tag, cls, text) => Object.assign(document.createElement(tag), { className: cls, ...(text ? { textContent: text } : {}) });
  // Long names set a little smaller, so the whole name and the emblem both fit.
  const len = Math.max(String(a.text || "").length, ...String(a.text || "").split(/\s+/).map(w => (w.length > 12 ? 31 : 0)));
  const book = mk("div", `book book-${size}${a.state === "completed" ? " book-done" : ""}${len > 52 ? " book-longer" : len > 30 ? " book-long" : ""}`);
  book.style.setProperty("--book", COVER_COLORS[subject.id] || COVER_COLORS.general);
  const frame = mk("span", "book-frame");
  const label = mk("span", "book-subject");
  label.append(mk("i", ""), mk("span", "", subject.name), mk("i", ""));
  frame.append(label, mk("span", "book-title", a.text), coverEmblem(subject.id));
  const p = coverProgress(a);
  if (p !== null) {
    const bar = mk("span", "book-progress");
    bar.append(Object.assign(mk("i", ""), { style: `width:${Math.round(p * 100)}%` }));
    frame.append(bar);
  }
  book.append(mk("span", "book-spine"), frame);
  return book;
}
