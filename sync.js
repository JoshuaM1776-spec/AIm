// Aim Plus sync across devices, in the service worker: your Targets (with study sessions, so the
// learning record), Saved for later, settings and channel rules, in every browser you sign in to.
// Off until you turn it on in Settings. Loaded after store.js and plus.js.
//
// Each round sends what changed here since the last round (found by comparing each item with what
// was last synced) and gets back what changed in your other browsers. The server keeps the newest
// change to each item (sync.ts, migration 0004).

const SYNC_EVERY_MIN = 10;
const SYNC_SOON_MS = 15_000;

const syncHash = s => { // cyrb53: short and fast; only used to notice that an item changed
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); h1 = Math.imul(h1 ^ c, 2654435761); h2 = Math.imul(h2 ^ c, 1597334677); }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
};
const itemHash = it => syncHash(JSON.stringify(it.data));

async function syncState() {
  const { sync } = await chrome.storage.local.get("sync");
  return { on: false, device: "", cursor: 0, hashes: {}, lastAt: 0, error: "", ...(sync || {}) };
}
const saveSyncState = st => chrome.storage.local.set({ sync: st });

// Applies a page of other browsers' changes, then records how those items now read here, so they
// aren't sent straight back.
async function syncTake(st, items, first) {
  if (!items.length) return;
  await serial(() => syncMerge(items, first));
  const now = await serial(syncSnapshot);
  for (const it of items) {
    const key = `${it.kind}:${it.id}`, here = now.get(key);
    if (here) st.hashes[key] = itemHash(here); else delete st.hashes[key];
  }
}

let syncRunning = null;
function syncNow() {
  syncRunning ||= syncRound().finally(() => { syncRunning = null; });
  return syncRunning;
}

async function syncRound() {
  let st = await syncState();
  if (!st.on || !plusConfigured()) return { result: "off" };
  if ((await loadSession())?.plan !== "plus") return { result: "off" };
  st.device ||= crypto.randomUUID();
  const call = (items = []) => plusCall("sync", { device: st.device, since: st.cursor, items });
  try {
    // The first time, take what the account already has before sending anything, so a new browser's
    // defaults don't replace settings made elsewhere.
    const first = !st.cursor;
    if (first) {
      let r;
      do { r = await call(); await syncTake(st, r.items, true); st.cursor = r.cursor; } while (r.more);
    }
    // What changed here.
    const snap = await serial(syncSnapshot);
    const { syncDeleted = [] } = await chrome.storage.local.get("syncDeleted");
    const rev = Date.now(), out = [];
    for (const [key, it] of snap) if (st.hashes[key] !== itemHash(it)) out.push({ key, hash: itemHash(it), item: { kind: it.kind, id: it.id, rev, data: it.data } });
    for (const d of syncDeleted) if (!snap.has(`${d.kind}:${d.id}`)) out.push({ key: `${d.kind}:${d.id}`, hash: null, item: { kind: d.kind, id: d.id, rev, data: null } });
    for (const key of Object.keys(st.hashes)) if (!snap.has(key)) delete st.hashes[key];
    // Sent in batches of up to 100 items or about 600 KB, each round also bringing back others' changes.
    const batches = [[]];
    let size = 0;
    for (const o of out) {
      const n = JSON.stringify(o.item).length;
      if (batches.at(-1).length >= 100 || (size + n > 600_000 && batches.at(-1).length)) { batches.push([]); size = 0; }
      batches.at(-1).push(o); size += n;
    }
    for (const batch of batches) {
      let r = await call(batch.map(o => o.item));
      for (const o of batch) if (o.hash) st.hashes[o.key] = o.hash; else delete st.hashes[o.key];
      for (;;) { await syncTake(st, r.items, false); st.cursor = r.cursor; if (!r.more) break; r = await call(); }
    }
    if (syncDeleted.length) {
      const { syncDeleted: now = [] } = await chrome.storage.local.get("syncDeleted");
      await chrome.storage.local.set({ syncDeleted: now.slice(syncDeleted.length) });
    }
    // Turned off or signed out while this ran: don't bring the old state back.
    if (!(await syncState()).on) return { result: "off" };
    st = { ...st, lastAt: Date.now(), error: "" };
    await saveSyncState(st);
    return { result: "synced", sent: out.length };
  } catch (e) {
    const latest = await syncState();
    if (latest.on) await saveSyncState({ ...latest, error: String(e.message || e) });
    return { result: "error", message: String(e.message || e) };
  }
}

// After a change worth carrying (a Target started, finished or set aside, a video saved, a setting),
// sync shortly, so another browser opened soon after already has it.
let syncTimer = null;
function syncSoon() {
  clearTimeout(syncTimer);
  syncTimer = setTimeout(async () => { if ((await syncState()).on) syncNow(); }, SYNC_SOON_MS);
}
const SYNC_AFTER = new Set(["purpose-start", "purpose-done", "purpose-pause", "purpose-resume", "paused-drop", "purpose-rate",
  "study-start", "study-update", "target-notes", "save", "saved-remove", "setting", "avoid", "history-clear", "purpose-pivot", "purpose-refine"]);

// Turning it on starts from nothing, so everything here is sent and everything synced arrives.
async function syncSet(on) {
  const st = await syncState();
  await saveSyncState(on ? { ...st, on: true, cursor: 0, hashes: {}, error: "" } : { ...st, on: false });
  await chrome.storage.local.remove("syncDeleted");
  return on ? syncNow() : { result: "off" };
}
// Off, and forget where this browser was (signing out, or a different account signing in).
async function syncReset() {
  const st = await syncState();
  await saveSyncState({ on: false, device: st.device, cursor: 0, hashes: {}, lastAt: 0, error: "" });
  await chrome.storage.local.remove("syncDeleted");
}
// Remove the copy on Aim's server. Data in this browser stays.
async function syncErase() {
  await plusCall("sync-erase");
  await syncReset();
  return { result: "erased" };
}

chrome.alarms?.create("aim-sync", { periodInMinutes: SYNC_EVERY_MIN });
chrome.alarms?.onAlarm.addListener(a => { if (a.name === "aim-sync") syncNow(); });
syncSoon(); // the worker just started: catch up
