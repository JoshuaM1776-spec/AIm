// Aim — the four places (docs/SPEC.md §2): YouTube, Library, Pathways, Settings. One small bar in the
// header of every Aim page, so nothing is more than a click from the rest. Everything else (an aim's
// pages, references, TeachBack, study sessions, scenarios) lives inside the Library and opens from
// where it's needed. The Learning record is a tab of the Library.
(() => {
  const head = document.querySelector(".page-head");
  if (!head || head.querySelector(".places")) return;
  const file = location.pathname.split("/").pop() || "";
  const PLACE = { "pathways.html": "pathways", "options.html": "settings", "plus.html": "settings", "design.html": "settings" };
  const here = PLACE[file] || "library";
  const PLACES = [["youtube", "YouTube", "https://www.youtube.com/"], ["library", "Library", "targets.html"], ["pathways", "Pathways", "pathways.html"], ["settings", "Settings", "options.html"]];
  const link = (href, text, current) => {
    const a = document.createElement("a");
    a.href = href; a.textContent = text;
    if (current) a.setAttribute("aria-current", "page");
    return a;
  };
  const nav = document.createElement("nav");
  nav.className = "places no-print";
  nav.setAttribute("aria-label", "Aim");
  nav.append(...PLACES.map(([k, text, href]) => link(href, text, k === here)));
  // A crumb that only repeats the place you're in goes; deeper crumbs (Library · References) stay.
  const crumb = head.querySelector(".crumb");
  const label = PLACES.find(p => p[0] === here)[1];
  if (crumb && crumb.textContent.trim() === label) crumb.remove();
  // The page's own links and buttons move to a line under the header.
  const end = head.querySelector(".end");
  if (end) {
    const sub = document.createElement("div");
    sub.className = `page-sub ${end.className.replace(/\bend\b/, "").trim()}`.trim();
    sub.append(...end.childNodes);
    end.remove();
    head.after(sub);
  }
  head.append(nav);
  // The Library: your aims and the learning record, side by side.
  if (file === "targets.html" || file === "record.html") {
    const tabs = document.createElement("nav");
    tabs.className = "lib-tabs no-print";
    tabs.setAttribute("aria-label", "Library");
    tabs.append(link("targets.html", "Your aims", file === "targets.html"), link("record.html", "Learning record", file === "record.html"));
    (document.querySelector(".page-sub") || head).after(tabs);
  }
})();
