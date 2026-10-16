// Aim — background service worker
// The single writer for stored data, plus AI checks (purpose fit, starter path, recommendation labels).

importScripts("store.js");

// Fires on first install and on every update or reload of the extension.
chrome.runtime.onInstalled.addListener(() => serial(ensureMigrated));

// Also checked before the first message after the worker starts, in case an update
// left a YouTube tab talking to the new worker before onInstalled finished.
let migrated = false;
async function ensureMigrated() {
  if (migrated) return;
  await migrateStorage();
  migrated = true;
}

const DEFAULT_MODEL = "claude-haiku-5-5";

async function getAISettings() {
  const { apiKey = "", model = DEFAULT_MODEL } = await chrome.storage.local.get(["apiKey", "model"]);
  return { apiKey: apiKey.trim(), model: (model || DEFAULT_MODEL).trim() };
}

async function askClaude(system, user, maxTokens = 500) {
  const { apiKey, model } = await getAISettings();
  if (!apiKey) return null;
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true"
    },
    body: JSON.stringify({ model, max_tokens: maxTokens, system, messages: [{ role: "user", content: user }] })
  });
  if (!res.ok) throw new Error(`API error ${res.status}`);
  const data = await res.json();
  const text = (data.content || []).map(b => b.text || "").join("");
  const start = Math.min(...["{", "["].map(c => text.indexOf(c)).filter(i => i >= 0));
  const end = Math.max(text.lastIndexOf("}"), text.lastIndexOf("]"));
  return JSON.parse(text.slice(start, end + 1));
}

// ---- Does this video fit the current purpose? ----
// Cached in session storage so answers survive the service worker going idle.
async function classify(purpose, video, search) {
  const key = "fit:" + purpose + "|" + video.id;
  const hit = (await chrome.storage.session.get(key))[key];
  if (hit) return hit;
  const system = `Someone is in a focus session on YouTube with a stated purpose. Decide how a video relates to it.
Reply with ONLY JSON: {"verdict": "on_path" | "refinement" | "different", "note": "under 12 words"}
- on_path: directly serves the purpose.
- refinement: a useful step toward the purpose (a prerequisite, a closely related sub-topic, a deeper dive).
- different: a new direction that doesn't serve the purpose.
Be generous with refinement; only say different when it clearly wanders.`;
  const user = `Purpose: ${purpose}${search ? `\nCurrent search: ${search}` : ""}\nVideo title: ${video.title}\nChannel: ${video.channel}\nDescription: ${(video.description || "").slice(0, 800)}`;
  try {
    const r = await askClaude(system, user, 120);
    if (!r || !["on_path", "refinement", "different"].includes(r.verdict)) return { verdict: "unknown", note: "" };
    await chrome.storage.session.set({ [key]: r });
    return r;
  } catch (e) {
    return { verdict: "unknown", note: String(e.message || e) };
  }
}

// ---- Is a new search a continuation of the purpose, or a new direction? ----
async function searchFit(purpose, query) {
  const system = `Someone has a purpose on YouTube and just ran a new search. Is the search a step toward the same purpose, or a different direction?
Reply with ONLY JSON: {"verdict": "continuation" | "different"}. Narrowing, a prerequisite, or a related sub-question is a continuation.`;
  try { return (await askClaude(system, `Purpose: ${purpose}\nNew search: ${query}`, 60)) || { verdict: "unknown" }; }
  catch { return { verdict: "unknown" }; }
}

// ---- Turn a stated purpose into a more effective YouTube search ----
async function improveSearch(purpose) {
  const system = `Someone told YouTube what they want to find or learn. If a differently worded YouTube search would clearly find better videos, suggest it; otherwise keep theirs.
Reply with ONLY JSON: {"better": true|false, "query": "the search to run"}.
Only say better when the improvement is meaningful (adds the right technical terms or removes conversational filler that hurts results). Keep it under 10 words.`;
  try { return (await askClaude(system, `Purpose: ${purpose}`, 80)) || { better: false }; }
  catch { return { better: false }; }
}

// ---- Starter path for a new purpose ----
async function suggestPath(purpose) {
  const system = `Suggest three YouTube videos to search for that build toward someone's purpose: the basics underneath it, the core of it, and a common mistake or deeper angle.
Reply with ONLY JSON: [{"label": "short video idea", "query": "specific youtube search query"}, ...] (exactly 3).`;
  try { return { items: (await askClaude(system, `Purpose: ${purpose}`, 300)) || [] }; } catch { return { items: [] }; }
}

// ---- Label sidebar recommendations against the purpose ----
async function labelRecs(purpose, titles) {
  const system = `Label each YouTube video title against someone's purpose.
Reply with ONLY a JSON array of the same length, each item one of: "match" (serves the purpose), "related" (a useful adjacent perspective), "off" (unrelated).`;
  const user = `Purpose: ${purpose}\nTitles:\n${titles.map((t, i) => `${i + 1}. ${t}`).join("\n")}`;
  try {
    const r = await askClaude(system, user, 300);
    return { labels: Array.isArray(r) && r.length === titles.length ? r : null };
  } catch { return { labels: null }; }
}

// What the popup and settings page show.
async function fullState() {
  const d = await chrome.storage.local.get(["session", "saved", "sessions", "usage", "avoid", "apiKey", "model"]);
  return {
    session: d.session || null, saved: d.saved || [], sessions: d.sessions || [], avoid: d.avoid || {},
    todaySec: (d.usage || {})[todayKey()] || 0, settings: await getSettings(),
    apiKey: d.apiKey || "", model: d.model || ""
  };
}

// What a YouTube tab needs to know.
async function tabSettings() {
  const { apiKey = "", avoid = {} } = await chrome.storage.local.get(["apiKey", "avoid"]);
  return { ...(await getSettings()), hasKey: !!apiKey.trim(), avoid };
}

// Changes to stored data run one at a time (see serial in store.js). AI calls don't wait in that line.
const writes = {
  "tick": m => recordTick(Math.min(30, Math.max(0, Number(m.seconds) || 0)), !!m.sessionRunning),
  "session-start": m => startSession(m),
  "session-patch": m => patchSession(m.patch || {}),
  "session-extend": m => extendSession(m.minutes, m.reason || ""),
  "session-pivot": m => pivotSession(m.purpose, m.budgetMin ?? null, m.reason || ""),
  "session-end": m => endSession(m.outcome),
  "session-rate": m => rateLastSession(m.outcome),
  "session-add-search": m => addSearch(m.query),
  "session-refine": m => refinePurpose(m.purpose),
  "reflection-clear": () => chrome.storage.local.remove("reflection").then(() => ({ result: "applied" })),
  "avoid": m => setAvoid(m.key, m.name, m.action),
  "save": m => saveForLater(m.video || {}),
  "saved-remove": m => removeSaved(m.id),
  "history-clear": () => clearHistory(),
  // The purpose typed on the homepage card, handed to the results page it searches.
  "pending-purpose": async m => {
    await chrome.storage.session.set({ pendingPurpose: { purpose: clip(m.purpose, 300), query: clip(m.query, 200), at: Date.now() } });
    return { result: "applied" };
  },
  "pending-purpose-take": async m => {
    const { pendingPurpose: p } = await chrome.storage.session.get("pendingPurpose");
    await chrome.storage.session.remove("pendingPurpose");
    return p && p.query === clip(m.query, 200) && Date.now() - p.at < 120000 ? { purpose: p.purpose } : null;
  },
  "setting": m => setSetting(m.key, m.value),
  "ai-key": async m => {
    await chrome.storage.local.set({ apiKey: clip(m.apiKey, 300), model: clip(m.model, 100) });
    return { result: "applied" };
  }
};

const reads = {
  "session-get": async () => ({ session: await getSession() }),
  "settings": () => tabSettings(),
  "state": () => fullState(),
  "classify": m => classify(m.purpose, m.video, m.search),
  "search-fit": m => searchFit(m.purpose, m.query),
  "improve-search": m => improveSearch(m.purpose),
  "suggest-path": m => suggestPath(m.purpose),
  "label-recs": m => labelRecs(m.purpose, m.titles)
};

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id || !msg) return;
  const w = writes[msg.type], r = reads[msg.type];
  if (!w && !r) return;
  // Make sure stored data is current before anything reads or changes it.
  const run = w ? serial(async () => { await ensureMigrated(); return w(msg); })
    : serial(ensureMigrated).then(() => r(msg));
  run.then(res => sendResponse(res ?? null), e => sendResponse({ error: String(e.message || e) }));
  return true;
});
