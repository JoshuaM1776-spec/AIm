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

async function render() {
  const st = await send({ type: "state" });
  if (!st) return;
  const S = st.settings;
  $("homeCard").value = S.homeCard ? "on" : "off";
  $("recMode").value = S.recMode;
  $("hold").checked = S.hold;
  if (document.activeElement !== $("reminderMin")) $("reminderMin").value = S.reminderMin || "";
  $("today").textContent = `Today so far: ${Math.floor(st.todaySec / 60)} minutes. Leave the reminder empty to turn it off.`;
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
    name.textContent = c.name || key;
    const sel = document.createElement("select");
    for (const [value, label] of [["hide", "Hide"], ["warn", "Warn"], ["", "Remove"]]) {
      const o = new Option(label, value, false, value === c.action);
      sel.append(o);
    }
    sel.onchange = async () => {
      const r = await send({ type: "avoid", key, name: c.name, action: sel.value || null });
      toast(r?.result === "applied" ? (sel.value ? "Saved." : `Removed ${c.name || key}.`) : "Couldn't save that.");
      render();
    };
    row.append(name, sel);
    av.append(row);
  }
}

$("homeCard").onchange = () => setSetting("homeCard", $("homeCard").value === "on");
$("recMode").onchange = () => setSetting("recMode", $("recMode").value);
$("hold").onchange = () => setSetting("hold", $("hold").checked);
$("reminderMin").onchange = () => {
  const v = Math.max(0, Math.min(1440, parseInt($("reminderMin").value, 10) || 0));
  setSetting("reminderMin", v);
};
$("saveKey").onclick = async () => {
  const r = await send({ type: "ai-key", apiKey: $("key").value, model: $("model").value });
  toast(r?.result === "applied" ? "Saved." : "Couldn't save that.");
};

render();
