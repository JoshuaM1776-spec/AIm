// Aim — settings page. Reads and changes data through the background worker.

const $ = id => document.getElementById(id);
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
  for (const k of TOGGLES) $(k).checked = S[k] !== false;
  for (const k of ["leisureMin", "graceMin", "totalMin", "purposeLimitMin"]) {
    const sel = $(k);
    if (![...sel.options].some(o => o.value === String(S[k]))) sel.append(new Option(`${S[k]} minutes`, S[k]));
    sel.value = String(S[k]);
  }
  $("recMode").value = S.recMode;
  const m = s => Math.floor(s / 60);
  $("leisureNote").textContent = `Breaks share this allowance. When it's used up, breaks are done for the day. Used today: ${m(t.leisure)} min.`;
  $("today").textContent = `Today so far: ${m(t.purpose)} min on purpose, ${m(t.leisure)} min on breaks, ${m(t.purpose + t.leisure + t.other)} min on YouTube in all.`;
  if (document.activeElement !== $("key")) $("key").value = st.apiKey;
  if (document.activeElement !== $("model")) $("model").value = st.model;

  const av = $("avoid");
  av.replaceChildren();
  const entries = Object.entries(st.avoid).sort((a, b) => (a[1].name || "").localeCompare(b[1].name || ""));
  if (!entries.length) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = "No channels yet. That's fine. Your purpose handles most of it.";
    av.append(empty);
  }
  for (const [key, c] of entries) {
    const row = document.createElement("div");
    row.className = "row";
    const name = document.createElement("div");
    name.className = "what";
    name.textContent = c.name || key;
    const sel = document.createElement("select");
    for (const [value, label] of [["hide", "Hide"], ["warn", "Warn"], ["", "Remove"]]) sel.append(new Option(label, value, false, value === c.action));
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
for (const k of TOGGLES) $(k).onchange = () => setSetting(k, $(k).checked);
if (location.hash === "#advanced") { $("advanced").open = true; $("advanced").scrollIntoView(); }
for (const k of ["leisureMin", "graceMin", "totalMin", "purposeLimitMin"]) $(k).onchange = () => setSetting(k, parseInt($(k).value, 10));
$("recMode").onchange = () => setSetting("recMode", $("recMode").value);
$("saveKey").onclick = async () => {
  const r = await send({ type: "ai-key", apiKey: $("key").value, model: $("model").value });
  toast(r?.result === "applied" ? "Saved." : "Couldn't save that.");
};

render();
