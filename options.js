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

// The design, in words, one line per stage, each with a link straight to that stage. The switches
// themselves live in Design your YouTube only, so there's one place to change them.
function designSummary(S) {
  const home = S.homeCard === false ? "YouTube's own feed" : "A clean page with your aim, and Explore";
  const shorts = S.hideShorts === false ? "Shown" : S.learnShorts ? "Only from selected channels" : "Hidden";
  const watching = [S.hideRecs !== false ? "recommendations hidden" : "recommendations shown",
    S.noAutoplay !== false ? "autoplay off" : "autoplay on", S.hideFeeds !== false ? "feeds hidden" : "feeds shown",
    S.strict ? "strict" : "asks once"].join(" · ");
  $("designSummary").replaceChildren(...[["Home", home, "home"], ["Shorts", shorts, "shorts"], ["Watching", watching[0].toUpperCase() + watching.slice(1), "watching"]].map(([label, value, stage]) => {
    const row = document.createElement("div"), what = document.createElement("div"), b = document.createElement("b"), v = document.createElement("span"), a = document.createElement("a");
    row.className = "setting"; what.className = "what";
    b.textContent = label; v.textContent = value; what.append(b, v);
    a.href = `design.html#${stage}`; a.textContent = "Change"; a.className = "small";
    row.append(what, a);
    return row;
  }));
}

async function render() {
  const st = await send({ type: "state" });
  if (!st) return;
  const S = st.settings, t = st.today || { purpose: 0, leisure: 0, other: 0 };
  designSummary(S);
  renderMemory(S);
  $("homeschoolPreview").checked = !!st.homeschool;
  $("homeschoolResetRow").hidden = !st.homeschool;
  renderLearn(S);
  for (const k of ["leisureMin", "graceMin", "totalMin", "purposeLimitMin"]) {
    const sel = $(k);
    if (![...sel.options].some(o => o.value === String(S[k]))) sel.append(new Option(`${S[k]} minutes`, S[k]));
    sel.value = String(S[k]);
  }
  const m = s => Math.floor(s / 60);
  $("leisureNote").textContent = `Breaks share this allowance. When it's used up, breaks are done for the day. Used today: ${m(t.leisure)} min.`;
  $("today").textContent = `Today so far: ${m(t.purpose)} min on your aims, ${m(t.leisure)} min on breaks, ${m(t.purpose + t.leisure + t.other)} min on YouTube in all.`;

  const av = $("avoid");
  av.replaceChildren();
  const entries = Object.entries(st.avoid).sort((a, b) => (a[1].name || "").localeCompare(b[1].name || ""));
  if (!entries.length) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = "No channels yet. That's fine. Your aim handles most of it.";
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
// "Learn something": under each topic you chose (in Design your YouTube → Home), its channels,
// which you can take out.
function renderLearn(S) {
  const on = new Set(S.learnTopics || []), off = new Set(S.learnOff || []);
  const save = (key, value) => setSetting(key, value);
  const pick = document.createElement("a");
  pick.href = "design.html#home"; pick.textContent = on.size ? "Change your interests" : "Choose interests";
  $("learnNote").replaceChildren(on.size ? "The channels behind your topics. Take out any you'd rather not see. " : "Pick interests, and Explore shows new videos from channels that teach them well. ", pick);
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

// The librarian's memory: each idea, when, and Forget. And whether it may read captions, with how
// often they were there when it looked.
async function renderMemory(S) {
  const [brief, items, stats] = await Promise.all([send({ type: "plus-brief" }), send({ type: "memory-list" }), send({ type: "captions-stats" })]);
  $("captionsCard").hidden = !brief?.plus;
  $("captions").checked = S.captions === true;
  $("captionsNote").textContent = stats?.tried ? `Captions were there for ${stats.found} of the last ${stats.tried} videos it looked at.` : "Aim Plus. Off until you turn it on.";
  const list = Array.isArray(items) ? items : [];
  $("memoryCard").hidden = !brief?.plus && !list.length;
  $("librarianMemory").checked = S.librarianMemory !== false;
  $("forgetRow").hidden = !list.length;
  const day = ts => new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  $("memoryList").replaceChildren(...(list.length ? list.map(m => {
    const row = document.createElement("div"), what = document.createElement("div"), b = document.createElement("b"), v = document.createElement("span"), x = document.createElement("button");
    row.className = "setting"; what.className = "what";
    b.textContent = m.subject; v.textContent = `${m.idea} · ${day(m.at)}${m.understood === "shaky" ? " · still working on it" : ""}`;
    x.type = "button"; x.className = "btn text"; x.textContent = "Forget";
    x.onclick = async () => { await send({ type: "memory-forget", id: m.id }); toast("Forgotten."); render(); };
    what.append(b, v); row.append(what, x);
    return row;
  }) : [Object.assign(document.createElement("div"), { className: "empty", textContent: "Nothing yet. Talk a session through, and what you explain shows up here." })]));
}
$("librarianMemory").onchange = () => setSetting("librarianMemory", $("librarianMemory").checked);
$("captions").onchange = () => setSetting("captions", $("captions").checked);
$("forgetAll").onclick = async () => {
  if (!confirm("Forget everything the librarian remembers? This can't be undone.")) return;
  await send({ type: "memory-forget", id: "all" });
  toast("Forgotten.");
  render();
};

if (location.hash === "#learn") setTimeout(() => $("learn").scrollIntoView({ block: "start" }), 200);
if (location.hash === "#advanced") setTimeout(() => $("time").scrollIntoView({ block: "start" }), 200);

// The menu on the left: groups with nothing in them stay out of it, and the one you're reading is marked.
function syncGroups() {
  $("librarian").hidden = $("navLibrarian").hidden = $("memoryCard").hidden && $("captionsCard").hidden;
  $("plusGroup").hidden = $("navPlus").hidden = $("plus").hidden;
}
for (const id of ["memoryCard", "captionsCard", "plus"]) new MutationObserver(syncGroups).observe($(id), { attributes: true, attributeFilter: ["hidden"] });
syncGroups();
const navLinks = [...document.querySelectorAll(".settings-nav a")];
const groupOf = { general: "general", youtube: "youtube", librarian: "librarian", plus: "plusGroup" };
for (const a of navLinks) a.onclick = e => { e.preventDefault(); $(groupOf[a.dataset.nav]).scrollIntoView({ behavior: "smooth", block: "start" }); history.replaceState(null, "", `#${a.dataset.nav}`); };
const spy = () => {
  const visible = navLinks.filter(a => !a.hidden);
  let current = visible[0];
  for (const a of visible) if ($(groupOf[a.dataset.nav]).getBoundingClientRect().top < 140) current = a;
  for (const a of navLinks) a.classList.toggle("on", a === current);
};
addEventListener("scroll", spy, { passive: true });
spy();
// #plus scrolls once the account section is showing (renderPlus in options-plus.js waits for the server).
$("welcomeTour").onclick = async e => { e.preventDefault(); await send({ type: "onboarding", reset: true }); send({ type: "open-welcome" }); };
for (const k of ["leisureMin", "graceMin", "totalMin", "purposeLimitMin"]) $(k).onchange = () => setSetting(k, parseInt($(k).value, 10));

render();
