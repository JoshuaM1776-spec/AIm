// Aim — Your references: protocols and course texts, read in this browser (content/filetext.js) and
// kept here. Scenarios use only these for medications, doses and steps (see refExcerpts in store.js).

const BRAND = chrome.runtime.getManifest().name;
for (const n of document.querySelectorAll("[data-brand]")) n.textContent = BRAND;
const send = msg => chrome.runtime.sendMessage(msg).catch(() => null);
const $ = id => document.getElementById(id);
function node(tag, props = {}, ...kids) {
  const n = Object.assign(document.createElement(tag), props);
  n.append(...kids.flat().filter(k => k != null && k !== false));
  return n;
}
function toast(msg) {
  const t = $("toast"); t.textContent = msg; t.style.display = "block";
  clearTimeout(toast.timer); toast.timer = setTimeout(() => (t.style.display = "none"), 3000);
}
const KIND = { protocol: "Protocols", poh: "POH / checklists", course: "Course text", other: "Document" };
// Levels for medical and flying references (the same lists scenarios use).
const LEVELS = ["", "EMR", "EMT", "AEMT", "Paramedic", "Nursing", "Student pilot", "Private pilot", "Instrument rated", "Commercial pilot", "Flight instructor", "Airline pilot", "Other"];

let fileText = "";
$("file").onchange = async () => {
  const f = $("file").files[0];
  fileText = "";
  if (!f) return;
  $("fileNote").textContent = `Reading ${f.name}…`;
  try {
    fileText = await readFileText(f);
    $("fileNote").textContent = `Read ${f.name}: about ${Math.round(fileText.length / 1000)}k characters.`;
    if (!$("name").value) $("name").value = f.name.replace(/\.[^.]+$/, "");
  } catch (e) { $("fileNote").textContent = e.message; }
};

$("save").onclick = async () => {
  const text = fileText || $("text").value;
  $("msg").textContent = "Adding…";
  const r = await send({ type: "ref-add", name: $("name").value, region: $("region").value, kind: $("kind").value, level: $("level").value, text });
  if (r?.result !== "applied") { $("msg").textContent = r?.message || "Couldn't add that. Try again."; return; }
  $("msg").textContent = `Added: ${r.reference.passages} passages.`;
  fileText = ""; $("file").value = ""; $("text").value = ""; $("name").value = "";
  $("fileNote").textContent = "A PDF, Word or text file, up to 10 MB.";
  render();
};

async function render() {
  const refs = (await send({ type: "ref-list" })) || [];
  $("list").replaceChildren(...(refs.length ? refs.map(r => {
    const level = node("select", { ariaLabel: "Level", onchange: () => send({ type: "ref-update", id: r.id, fields: { level: level.value } }).then(() => toast("Saved.")) },
      ...LEVELS.map(v => node("option", { value: v, textContent: v || "Any level", selected: r.level === v })));
    return node("div", { className: "doc" },
      node("span", { className: "ico", textContent: r.kind === "protocol" ? "PROT" : r.kind === "poh" ? "POH" : r.kind === "course" ? "TEXT" : "DOC" }),
      node("div", {}, node("b", { textContent: r.name }),
        node("div", { className: "meta", textContent: [KIND[r.kind], r.region, `${r.passages} passages`, `added ${new Date(r.addedAt).toLocaleDateString()}`].filter(Boolean).join(" · ") })),
      node("div", { className: "row", style: "gap:8px" }, level,
        node("button", { className: "btn text", type: "button", textContent: "Remove", onclick: async () => {
          if (!confirm(`Remove "${r.name}" from your references?`)) return;
          await send({ type: "ref-remove", id: r.id }); render();
        } })));
  }) : [node("p", { className: "muted", textContent: "Nothing yet. Add your protocols, and scenarios will use them for medications and doses." })]));
}

$("go").onclick = async () => {
  const refs = (await send({ type: "ref-list" })) || [];
  const r = await send({ type: "ref-excerpts", ids: refs.map(x => x.id), about: $("q").value, maxChars: 5000 });
  const hits = r?.passages || [];
  $("hits").replaceChildren(...(hits.length ? hits.slice(0, 5).map(h => node("div", { className: "hit" },
    node("b", { textContent: `[${h.cite}] ${h.ref}${h.heading ? ` · ${h.heading}` : ""}` }), "\n", h.text.slice(0, 600) + (h.text.length > 600 ? "…" : "")))
    : [node("p", { className: "muted", textContent: "Nothing matched. Try other words, or check the document was read." })]));
};
$("q").addEventListener("keydown", e => { if (e.key === "Enter") $("go").click(); });

render();
