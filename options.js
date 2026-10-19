// Aim — settings page. Reads and changes data through the background worker.

const $ = id => document.getElementById(id);
const BRAND = chrome.runtime.getManifest().name; // the product name lives in manifest.json
for (const n of document.querySelectorAll("[data-brand]")) n.textContent = BRAND;
document.title = `${BRAND} — Settings`;
const send = msg => chrome.runtime.sendMessage(msg).catch(() => null);

function toast(msg) {
  const t = $("toast");
  t.textContent = msg;
  t.style.display = "block";
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => (t.style.display = "none"), 3000);
}

async function setSetting(key, value) {
  const r = await send({ type: "setting", key, value });
  toast(r?.result === "applied" ? "Saved." : "Couldn't save that.");
  render();
}

const TOGGLES = ["hideShorts", "hideRecs", "hideFeeds", "noAutoplay"];

async function render() {
  const st = await send({ type: "state" });
  if (!st) return;
  const S = st.settings, t = st.today || { purpose: 0, leisure: 0, other: 0 };
  $("homeCard").checked = S.homeCard;
  $("homeschoolPreview").checked = !!st.homeschool;
  $("homeschoolResetRow").hidden = !st.homeschool;
  for (const k of TOGGLES) $(k).checked = S[k] !== false;
  $("strict").checked = S.strict === true;
  $("learnShorts").checked = S.learnShorts === true;
  renderLearn(S);
  for (const k of ["leisureMin", "graceMin", "totalMin", "purposeLimitMin"]) {
    const sel = $(k);
    if (![...sel.options].some(o => o.value === String(S[k]))) sel.append(new Option(`${S[k]} minutes`, S[k]));
    sel.value = String(S[k]);
  }
  const m = s => Math.floor(s / 60);
  $("leisureNote").textContent = `Breaks share this allowance. When it's used up, breaks are done for the day. Used today: ${m(t.leisure)} min.`;
  $("today").textContent = `Today so far: ${m(t.purpose)} min on Target, ${m(t.leisure)} min on breaks, ${m(t.purpose + t.leisure + t.other)} min on YouTube in all.`;

  const av = $("avoid");
  av.replaceChildren();
  const entries = Object.entries(st.avoid).sort((a, b) => (a[1].name || "").localeCompare(b[1].name || ""));
  if (!entries.length) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = "No channels yet. That's fine. Your Target handles most of it.";
    av.append(empty);
  }
  for (const [key, c] of entries) {
    const row = document.createElement("div");
    row.className = "setting";
    const name = document.createElement("div");
    name.className = "what";
    name.textContent = c.name || key;
    const sel = document.createElement("select");
    for (const [value, label] of [["prefer", "Learn from"], ["break", "For breaks"], ["warn", "Ask first"], ["hide", "Hide"], ["", "Remove"]]) sel.append(new Option(label, value, false, value === c.action));
    sel.onchange = async () => {
      const r = await send({ type: "avoid", key, name: c.name, action: sel.value || null });
      toast(r?.result === "applied" ? (sel.value ? "Saved." : `Removed ${c.name || key}.`) : "Couldn't save that.");
      render();
    };
    row.append(name, sel);
    av.append(row);
  }
}

$("homeCard").onchange = () => setSetting("homeCard", $("homeCard").checked);
$("openChannels").onclick = () => chrome.tabs.create({ url: chrome.runtime.getURL("channels.html") });
$("homeschoolPreview").onchange = async () => {
  const r = await send({ type: "homeschool-preview", on: $("homeschoolPreview").checked });
  toast(r?.result === "applied" ? ($("homeschoolPreview").checked ? "Open YouTube's homepage to see Today." : "Preview off.") : "Couldn't change that.");
  render();
};
$("homeschoolReset").onclick = async () => {
  const r = await send({ type: "homeschool-preview", on: true });
  toast(r?.result === "applied" ? "Sample plan reset." : "Couldn't reset it.");
};
for (const k of TOGGLES) $(k).onchange = () => setSetting(k, $(k).checked);
$("strict").onchange = () => setSetting("strict", $("strict").checked);
$("learnShorts").onchange = () => setSetting("learnShorts", $("learnShorts").checked);
// "Learn something": topics as toggles; under each chosen topic, its channels, which you can take out.
function renderLearn(S) {
  const on = new Set(S.learnTopics || []), off = new Set(S.learnOff || []);
  const save = (key, value) => setSetting(key, value);
  $("learnTopics").replaceChildren(...LEARN_TOPICS.map(t => {
    const b = document.createElement("button");
    b.type = "button"; b.textContent = t.name; b.setAttribute("aria-pressed", String(on.has(t.id)));
    b.onclick = () => save("learnTopics", on.has(t.id) ? [...on].filter(x => x !== t.id) : [...on, t.id]);
    return b;
  }));
  const box = $("learnChannels");
  box.replaceChildren();
  for (const t of LEARN_TOPICS.filter(t => on.has(t.id))) {
    const h = document.createElement("h3");
    h.textContent = t.name;
    h.style.marginTop = "16px";
    box.append(h);
    for (const c of t.channels) {
      const row = document.createElement("div"), name = document.createElement("div"), b = document.createElement("button");
      row.className = "setting"; name.className = "what";
      const link = document.createElement("a");
      link.href = `https://www.youtube.com/${c.handle}`; link.target = "_blank"; link.textContent = c.name;
      name.append(link);
      if (off.has(c.handle)) { const s = document.createElement("span"); s.textContent = "Taken out"; name.append(s); }
      b.type = "button"; b.className = "btn text"; b.textContent = off.has(c.handle) ? "Put back" : "Take out";
      b.onclick = () => save("learnOff", off.has(c.handle) ? [...off].filter(x => x !== c.handle) : [...off, c.handle]);
      row.append(name, b);
      box.append(row);
    }
  }
}

if (location.hash === "#learn") setTimeout(() => $("learn").scrollIntoView({ block: "start" }), 200);
if (location.hash === "#advanced") { $("advanced").open = true; $("advanced").scrollIntoView(); }
if (location.hash === "#plus") setTimeout(() => $("plus").scrollIntoView({ block: "start" }), 300); // shown once the account check is done
$("welcomeTour").onclick = async e => { e.preventDefault(); await send({ type: "onboarding", reset: true }); send({ type: "open-welcome" }); };
for (const k of ["leisureMin", "graceMin", "totalMin", "purposeLimitMin"]) $(k).onchange = () => setSetting(k, parseInt($(k).value, 10));

render();
