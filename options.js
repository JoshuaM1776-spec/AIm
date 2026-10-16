// Waypoint — settings page. Logic lives in store.js.

const LEVEL_INFO = {
  lenient: "Rules warn you. You can always watch anyway.",
  balanced: "Breaking a limit or rule takes a typed reason.",
  strict: "Limits are walls. Leisure locks outside its hours."
};

const $ = id => document.getElementById(id);

function toast(msg) {
  const t = $("toast");
  t.textContent = msg;
  t.style.display = "block";
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => (t.style.display = "none"), 4500);
}

// Try the change; if it needs a reason, ask for one and retry.
async function withReason(fn) {
  let r = await fn("");
  if (r.result === "error" && /reason/i.test(r.message)) {
    const reason = prompt("This loosens your rules. Why? (It'll wait 24 hours, and you can cancel it.)");
    if (reason === null) { render(); return; }
    r = await fn(reason);
  }
  toast(r.message);
  render();
}

function hourOptions(selected) {
  const opts = [];
  for (let h = 0; h <= 24; h++) {
    const label = h === 24 ? "midnight" : fmtHour(h);
    opts.push(`<option value="${h}" ${h === selected ? "selected" : ""}>${label}</option>`);
  }
  return opts.join("");
}

function timeLeft(ms) {
  const h = Math.floor(ms / 3600000), m = Math.ceil((ms % 3600000) / 60000);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

async function render() {
  const state = await loadState();

  // Strictness
  $("levels").replaceChildren(...LEVELS.map(l => {
    const b = document.createElement("button");
    b.className = "level" + (l === state.level ? " current" : "");
    b.innerHTML = `<b>${l[0].toUpperCase() + l.slice(1)}${l === state.level ? " · current" : ""}</b><span>${LEVEL_INFO[l]}</span>`;
    b.onclick = () => l !== state.level && withReason(reason => requestLevel(l, reason));
    return b;
  }));

  // Pending
  const pend = $("pending");
  pend.replaceChildren();
  if (!state.pending.length) pend.innerHTML = `<div class="empty">Nothing waiting.</div>`;
  for (const p of state.pending) {
    const row = document.createElement("div");
    row.className = "row pending";
    row.innerHTML = `<div><div>${esc(p.desc)}</div><div class="when">Takes effect in ${timeLeft(p.effectiveAt - Date.now())}</div><div class="why">“${esc(p.reason)}”</div></div>`;
    const cancel = document.createElement("button");
    cancel.className = "ghost";
    cancel.textContent = "Cancel";
    cancel.onclick = async () => { await cancelPending(p.id); toast("Cancelled. Good call."); render(); };
    row.append(cancel);
    pend.append(row);
  }

  // Daily limits
  const L = state.limits;
  if (document.activeElement?.closest?.(".limits") == null) {
    $("leisureMin").value = L.leisureMin;
    $("totalMin").value = L.totalMin;
    $("leisureStart").innerHTML = hourOptions(L.leisureStart);
    $("leisureEnd").innerHTML = hourOptions(L.leisureEnd);
  }
  const mins = k => Math.floor(usedSec(state, k) / 60);
  $("today").textContent = `Today: ${mins("leisure")} min leisure${L.leisureMin ? ` of ${L.leisureMin}` : ""} · ` +
    `${mins("purposeful")} min purposeful · ${mins("total")} min total${L.totalMin ? ` of ${L.totalMin}` : ""}`;

  // Avoided channels
  const av = $("avoid");
  av.replaceChildren();
  const entries = Object.entries(state.avoid).sort((a, b) => (a[1].name || "").localeCompare(b[1].name || ""));
  if (!entries.length) av.innerHTML = `<div class="empty">No avoided channels. That's fine. Purpose handles most of it.</div>`;
  for (const [key, c] of entries) {
    const row = document.createElement("div");
    row.className = "row";
    const name = document.createElement("div");
    name.textContent = c.name || key;
    const sel = document.createElement("select");
    sel.innerHTML = `<option value="warn" ${c.action === "warn" ? "selected" : ""}>Warn</option>
      <option value="block" ${c.action === "block" ? "selected" : ""}>Block</option>
      <option value="">Remove</option>`;
    sel.onchange = () => withReason(reason => requestAvoid(key, c.name, sel.value || null, reason));
    row.append(name, sel);
    av.append(row);
  }
}

$("saveLimits").onclick = () => withReason(reason => requestLimits({
  leisureMin: $("leisureMin").value, totalMin: $("totalMin").value,
  leisureStart: $("leisureStart").value, leisureEnd: $("leisureEnd").value
}, reason));

// Feature switches: protection up is instant, protection down waits 24 hours.
async function syncSwitches() {
  const { homeCard = true, recMode = "mark", apiKey = "", model = "" } =
    await chrome.storage.local.get(["homeCard", "recMode", "apiKey", "model"]);
  $("homeCard").value = homeCard ? "on" : "off";
  $("recMode").value = recMode;
  $("key").value = apiKey;
  $("model").value = model;
  return { homeCard, recMode, apiKey };
}
syncSwitches();

const REC_RANK = { off: 0, mark: 1, hide: 2 };
const REC_TEXT = { off: "leave them alone", mark: "mark and dim", hide: "hide them" };

$("homeCard").onchange = async () => {
  const on = $("homeCard").value === "on";
  await withReason(reason => requestSetting("homeCard", on, !on, `Homepage → ${on ? "replace the feed" : "leave it alone"}`, reason));
  syncSwitches();
};
$("recMode").onchange = async () => {
  const cur = (await syncSwitches()).recMode, next = $("recMode").value;
  $("recMode").value = next;
  await withReason(reason => requestSetting("recMode", next, REC_RANK[next] < REC_RANK[cur], `Off-purpose recommendations → ${REC_TEXT[next]}`, reason));
  syncSwitches();
};
$("saveKey").onclick = async () => {
  const cur = await chrome.storage.local.get("apiKey");
  const key = $("key").value.trim();
  await chrome.storage.local.set({ model: $("model").value.trim() });
  // Removing the key turns off AI checks, so it counts as loosening. Adding or replacing one is instant.
  if (!key && (cur.apiKey || "").trim()) {
    await withReason(reason => requestSetting("apiKey", "", true, "Remove the AI key (turns off drift checks)", reason));
  } else {
    await chrome.storage.local.set({ apiKey: key });
    toast("Saved.");
  }
  syncSwitches();
};

render();
setInterval(() => { if (document.activeElement === document.body) render(); }, 60000); // keep countdowns fresh without wiping edits
