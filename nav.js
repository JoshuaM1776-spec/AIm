// Aim — the bar along the top of every Aim page (0.73), the same as on YouTube's homepage: the mark,
// then Home, Break and Library (YouTube's homepage is Home; Break opens there with a break's lengths),
// then you: a small menu with Settings, your paths, the learning record and Homeschool. Everything else
// (an aim's pages, references, TeachBack, study sessions, scenarios) lives inside the Library and opens
// from where it's needed. The Learning record is a tab of the Library. Colors: aim.css (the reading room).
(() => {
  const head = document.querySelector(".page-head");
  if (!head || head.querySelector(".places")) return;
  const file = location.pathname.split("/").pop() || "";
  const YOU = { "pathways.html": "pathways.html", "options.html": "options.html", "plus.html": "options.html", "design.html": "options.html" };
  const mine = YOU[file] || "";
  const node = (tag, props = {}, ...kids) => { const n = Object.assign(document.createElement(tag), props); n.append(...kids.filter(Boolean)); return n; };
  const link = (href, text, current) => {
    const a = node("a", { href, textContent: text });
    if (current) a.setAttribute("aria-current", "page");
    return a;
  };
  const PLACES = [["Home", "https://www.youtube.com/", false], ["Break", "https://www.youtube.com/#aim-break", false], ["Library", "targets.html", !mine]];
  const nav = node("nav", { className: "places no-print" });
  nav.setAttribute("aria-label", "Aim");
  nav.append(...PLACES.map(([text, href, current]) => link(href, text, current)));
  // You: settings and the rest, in a small menu.
  const menu = node("div", { className: "me-menu", hidden: true });
  menu.setAttribute("role", "menu");
  for (const [text, href] of [["Settings", "options.html"], ["Your paths", "path.html"], ["Learning record", "record.html"], ["Homeschool", "pathways.html"],
    ["Your subscriptions", "channels.html"], ["References", "references.html"]]) {
    const a = link(href, text, href === mine || (href === "record.html" && file === "record.html"));
    a.setAttribute("role", "menuitem");
    menu.append(a);
  }
  const me = node("button", { className: "me", type: "button", title: "You" });
  me.setAttribute("aria-label", "You");
  me.setAttribute("aria-haspopup", "menu");
  me.setAttribute("aria-expanded", "false");
  if (mine) me.classList.add("on");
  const NS = "http://www.w3.org/2000/svg", svg = document.createElementNS(NS, "svg");
  svg.setAttribute("viewBox", "0 0 24 24"); svg.setAttribute("aria-hidden", "true");
  for (const [tag, attrs] of [["circle", { cx: "12", cy: "8.6", r: "4.1" }], ["path", { d: "M4.3 20.2c.7-4.3 3.8-6.8 7.7-6.8s7 2.5 7.7 6.8z" }]]) {
    const n = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries({ ...attrs, fill: "currentColor" })) n.setAttribute(k, v);
    svg.append(n);
  }
  me.append(svg);
  const open = on => { menu.hidden = !on; me.setAttribute("aria-expanded", String(on)); };
  me.addEventListener("click", e => { e.stopPropagation(); open(menu.hidden); });
  document.addEventListener("click", e => { if (!menu.hidden && !e.target.closest(".me-wrap")) open(false); });
  document.addEventListener("keydown", e => { if (e.key === "Escape") open(false); });
  const logo = node("a", { className: "logo", href: "https://www.youtube.com/" }, node("img", { src: "icons/mark-scene.svg", alt: "" }), node("span", { textContent: chrome.runtime.getManifest().name }));
  logo.setAttribute("aria-label", "Aim: Home");
  // Deeper pages keep their crumb (Library · References) on the line under the bar.
  const crumb = head.querySelector(".crumb");
  const deepCrumb = crumb && !["Library", "Settings", "Pathways", "YouTube"].includes(crumb.textContent.trim()) ? crumb : null;
  // The page's own links and buttons move to a line under the bar.
  const end = head.querySelector(".end");
  const sub = node("div", { className: `page-sub ${end ? end.className.replace(/\bend\b/, "").trim() : ""}`.trim() });
  if (deepCrumb) sub.append(deepCrumb); // the element itself: a page may fill in parts of it (scenario.html)
  if (end) sub.append(...end.childNodes);
  head.replaceChildren(logo, nav, node("div", { className: "me-wrap" }, me, menu));
  head.classList.add("scene-top");
  // A page can say where that line goes (the Library keeps it under the shelf).
  if (sub.childNodes.length) { const slot = document.querySelector(".page-sub-slot"); slot ? slot.replaceWith(sub) : head.after(sub); }
  // The Library: your aims and the learning record, side by side.
  if (file === "targets.html" || file === "record.html") {
    const tabs = node("nav", { className: "lib-tabs no-print" });
    tabs.setAttribute("aria-label", "Library");
    tabs.append(link("targets.html", "Your aims", file === "targets.html"), link("record.html", "Learning record", file === "record.html"));
    (document.querySelector(".lib-tabs-slot") || document.querySelector(".page-sub") || head).after(tabs);
  }
})();
