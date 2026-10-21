// Aim — book covers for aims (the library, an aim's page, the popup). Each aim is a book: the
// subject's color and line icon, its name in a serif, and a thin line for how far along it is. Drawn,
// not pictures, so they're light, sharp in both themes, and never need an image licence.
// subject: { id, name } from aimSubject in store.js.

const COVER_COLORS = {
  history: "#24453a", science: "#1f3f5c", math: "#3c3466", space: "#1d2b4a", engineering: "#3a4a52", craft: "#6b3f24",
  coding: "#22404a", money: "#3f5a2c", aviation: "#28506b", health: "#4f6a3a", language: "#6a2f3c", arts: "#6b2e4f",
  cooking: "#7a4a22", people: "#5a2a2a", faith: "#4a3b2a", general: "#2f4a40"
};
// Line icons, 24×24, drawn like Aim's others.
const COVER_ICONS = {
  history: ["M4 20h16", "M5 20V10M9 20V10M15 20V10M19 20V10", "M3 10h18L12 4z"],
  science: ["M9 3h6", "M10 3v6L5 18a2 2 0 0 0 1.8 3h10.4a2 2 0 0 0 1.8-3L14 9V3", "M7.5 14h9"],
  math: ["M5 5h14l-7 7 7 7H5"],
  space: ["M12 3c3 2 4.5 5.5 4.5 9.5L12 17l-4.5-4.5C7.5 8.5 9 5 12 3z", "M9 15l-3 5 4-2M15 15l3 5-4-2", "M12 9.5h.01"],
  engineering: ["M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z", "M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1"],
  craft: ["M14 4l6 6-3 3-6-6z", "M11 7L3.5 14.5a2.1 2.1 0 0 0 3 3L14 10"],
  coding: ["M8 7l-5 5 5 5", "M16 7l5 5-5 5", "M14 4l-4 16"],
  money: ["M12 3v18", "M16.5 7.5c-.8-1.3-2.5-2-4.5-2-2.5 0-4.5 1.3-4.5 3.2 0 4.3 9 2.2 9 6.6 0 1.9-2 3.2-4.5 3.2-2 0-3.8-.8-4.6-2.2"],
  aviation: ["M3 13l8-2V5.5a1.5 1.5 0 0 1 3 0V11l7 2v2l-7-1v4l2 1.5V21l-3.5-1L9 21v-1.5l2-1.5v-4l-8 1z"],
  health: ["M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"],
  language: ["M4 5h9M8.5 3v2M6 5c0 4 3 7 6 8M11 5c0 3-2.5 7-7 9", "M13 21l4-9 4 9M14.5 18h5"],
  arts: ["M12 3a9 9 0 0 0 0 18c1.5 0 2-1 2-2s-1-1.5-1-2.5 1-1.5 2-1.5h2a4 4 0 0 0 4-4c0-4.4-4-8-9-8z", "M7.5 11h.01M10 7h.01M15 7.5h.01"],
  cooking: ["M6 13h12v3a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4z", "M4 13h16", "M9 9c0-1.5 1-1.5 1-3M13 9c0-1.5 1-1.5 1-3"],
  people: ["M8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6z", "M16 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6z", "M2.5 20c.8-3 3-4.5 5.5-4.5s4.7 1.5 5.5 4.5M13 15.6c.9-.1 2-.1 3-.1 2.5 0 4.7 1.5 5.5 4.5"],
  faith: ["M4 5.5C6.5 4 9.5 4 12 6c2.5-2 5.5-2 8-.5V19c-2.5-1.5-5.5-1.5-8 .5-2.5-2-5.5-2-8-.5z", "M12 6v13.5"],
  general: ["M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z", "M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10z", "M12 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2z"]
};

function coverIcon(id) {
  const s = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  s.setAttribute("viewBox", "0 0 24 24"); s.setAttribute("class", "book-icon"); s.setAttribute("aria-hidden", "true");
  for (const d of COVER_ICONS[id] || COVER_ICONS.general) {
    const p = document.createElementNS("http://www.w3.org/2000/svg", "path");
    for (const [k, v] of Object.entries({ d, fill: "none", stroke: "currentColor", "stroke-width": "1.4", "stroke-linecap": "round", "stroke-linejoin": "round" })) p.setAttribute(k, v);
    s.append(p);
  }
  return s;
}

// How far along, 0..1, or null when there's nothing to measure: the map (with putting it together as
// the last step), a study session's checks, or a practice you tried.
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
  const book = document.createElement("div");
  book.className = `book book-${size}${a.state === "completed" ? " book-done" : ""}`;
  book.style.setProperty("--book", COVER_COLORS[subject.id] || COVER_COLORS.general);
  const label = Object.assign(document.createElement("span"), { className: "book-subject", textContent: subject.name });
  const title = Object.assign(document.createElement("span"), { className: "book-title", textContent: a.text });
  book.append(label, title, coverIcon(subject.id));
  const p = coverProgress(a);
  if (p !== null) {
    const bar = Object.assign(document.createElement("span"), { className: "book-progress" });
    bar.append(Object.assign(document.createElement("i"), { style: `width:${Math.round(p * 100)}%` }));
    book.append(bar);
  }
  return book;
}
