// Aim — your subscriptions, read from YouTube's own list (youtube.com/feed/channels) for the Your
// channels page (channels.html). Only on that page, only what it shows: each channel's name, address
// and picture. Kept in this browser.

const SUBS_PATH = "/feed/channels";
const subsFound = new Map();
let subsTimer = null, subsReading = false;

function readSubsRows() {
  let added = 0;
  for (const n of $$(YT.channelRow)) {
    const href = $(YT.channelLink, n)?.getAttribute("href") || "";
    const key = channelPath(href);
    if (!/^\/(@|channel\/)/.test(key)) continue;
    const src = first(YT.channelAvatar, n)?.getAttribute("src") || "";
    const avatar = src.startsWith("//") ? "https:" + src : src.startsWith("https://") ? src : "";
    const name = squash(first(YT.channelName, n)?.textContent);
    const had = subsFound.get(key);
    if (!had) added++;
    subsFound.set(key, { key, name: name || had?.name || key.slice(1), avatar: avatar || had?.avatar || "" });
  }
  return added;
}
const saveSubsNow = complete => send({ type: "subs-save", channels: [...subsFound.values()], complete });

function subsBar(text, ...buttons) {
  showNotice([el("div", { style: "min-width:0" }, el("div", { class: "wp-strong" }, "Your channels"), el("div", { class: "wp-muted" }, text)), ...buttons]);
  if (notice) notice.dataset.keep = "1";
}
const sortButton = () => el("button", { class: "wp-btn wp-btn-primary", onclick: () => send({ type: "open-channels" }) }, "Sort them");

// YouTube adds rows as you scroll; read them all by scrolling to the end until no more arrive.
async function readAllSubs() {
  if (subsReading) return;
  subsReading = true;
  subsBar("Reading your subscriptions…");
  let still = 0;
  for (let i = 0; i < 120 && still < 4 && location.pathname === SUBS_PATH; i++) {
    window.scrollTo(0, document.documentElement.scrollHeight);
    await new Promise(r => setTimeout(r, 900));
    still = readSubsRows() ? 0 : still + 1;
    if (i % 5 === 4) subsBar(`Reading your subscriptions… ${subsFound.size} so far`);
  }
  window.scrollTo(0, 0);
  subsReading = false;
  if (location.pathname !== SUBS_PATH) return;
  await saveSubsNow(true);
  subsBar(subsFound.size ? `${subsFound.size} channels found. Sort them on the Your channels page.` : "No subscriptions found. Sign in to YouTube to read yours.", sortButton());
}

// On the subscriptions page: read what's there, keep it, and offer to read the rest.
function renderSubsBar() {
  clearInterval(subsTimer);
  if (location.pathname !== SUBS_PATH) return;
  const auto = new URLSearchParams(location.search).has("aim");
  let shown = false, ticks = 0;
  subsTimer = setInterval(() => {
    if (location.pathname !== SUBS_PATH) return clearInterval(subsTimer);
    if (subsReading) return;
    const added = readSubsRows();
    if (added) saveSubsNow(false);
    if (!shown && (subsFound.size || ++ticks >= 4)) { // rows, or a few seconds without any
      shown = true;
      if (auto) return readAllSubs();
      subsBar(subsFound.size ? `${subsFound.size} channels found so far.` : "Sign in to YouTube to read your subscriptions.",
        el("button", { class: "wp-btn wp-btn-tonal", onclick: readAllSubs }, "Read them all"), sortButton());
    }
  }, 1500);
}
