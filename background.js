// Aim — background service worker
// AI checks (purpose fit, starter path, recommendation labels), rules, and the watch log.

importScripts("store.js");

// Fires on first install and on every update or reload of the extension.
chrome.runtime.onInstalled.addListener(() => migrateStorage());

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
const fitCache = new Map();

async function classify(purpose, video, search) {
  const key = purpose + "|" + video.id;
  if (fitCache.has(key)) return fitCache.get(key);
  const system = `Someone is in a focus session on YouTube with a stated purpose. Decide how a video relates to it.
Reply with ONLY JSON: {"verdict": "on_path" | "refinement" | "different", "note": "under 12 words"}
- on_path: directly serves the purpose.
- refinement: a useful step toward the purpose (a prerequisite, a closely related sub-topic, a deeper dive).
- different: a new direction that doesn't serve the purpose.
Be generous with refinement; only say different when it clearly wanders.`;
  const user = `Purpose: ${purpose}${search ? `\nCurrent search: ${search}` : ""}\nVideo title: ${video.title}\nChannel: ${video.channel}\nDescription: ${(video.description || "").slice(0, 800)}`;
  try {
    const r = (await askClaude(system, user, 120)) || { verdict: "unknown", note: "" };
    fitCache.set(key, r);
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
  try { return (await askClaude(system, `Purpose: ${purpose}`, 300)) || []; } catch { return []; }
}

// ---- Label sidebar recommendations against the purpose ----
async function labelRecs(purpose, titles) {
  const system = `Label each YouTube video title against someone's purpose.
Reply with ONLY a JSON array of the same length, each item one of: "match" (serves the purpose), "related" (a useful adjacent perspective), "off" (unrelated).`;
  const user = `Purpose: ${purpose}\nTitles:\n${titles.map((t, i) => `${i + 1}. ${t}`).join("\n")}`;
  try {
    const r = await askClaude(system, user, 300);
    return Array.isArray(r) && r.length === titles.length ? r : null;
  } catch { return null; }
}

async function logEntry(entry) {
  const { log = [] } = await chrome.storage.local.get("log");
  log.push({ time: Date.now(), ...entry });
  await chrome.storage.local.set({ log: log.slice(-500) });
}

// Channel rules + daily limits for whatever is about to be watched.
// kind: "leisure" (Explore, or no session) | "purposeful" (Focus, Quick answer)
async function checkWatch(channelKey, kind) {
  const state = await loadState();
  return {
    level: state.level,
    avoid: state.avoid[channelKey] || null,
    daily: checkDaily(state, kind),
    leisureLeft: leisureLeftMin(state),
    limits: state.limits
  };
}

const handlers = {
  "check": m => checkWatch(m.channelKey, m.kind),
  "avoid": m => requestAvoid(m.key, m.name, m.action, m.reason || ""),
  "tick": async m => {
    if (m.kind) await addUsage(m.kind, m.seconds);
    const session = m.sessionActive ? await addSessionTime(m.seconds) : await getSession();
    const state = await loadState();
    return { level: state.level, session, daily: m.kind ? checkDaily(state, m.kind) : { status: "ok" } };
  },
  "override": m => logEntry({ kind: "override", reason: m.reason || "", videoId: m.video.id, title: m.video.title, rule: m.status }),
  "log": m => logEntry(m.entry),
  "session-get": async () => ({ session: await getSession(), level: (await loadState()).level }),
  "session-start": async m => {
    const s = await startSession(m);
    await logEntry({ kind: "session-start", mode: s.mode, purpose: s.purpose, budgetMin: s.budgetMin });
    return s;
  },
  "session-patch": m => patchSession(m.patch),
  "session-extend": m => extendSession(m.minutes, m.reason || ""),
  "session-pivot": m => pivotSession(m.purpose, m.budgetMin ?? null, m.reason || ""),
  "session-end": m => endSession(m.outcome),
  "session-rate": m => rateLastSession(m.outcome),
  "classify": m => classify(m.purpose, m.video, m.search),
  "search-fit": m => searchFit(m.purpose, m.query),
  "improve-search": m => improveSearch(m.purpose),
  "session-add-search": m => addSearch(m.query),
  "session-refine": m => refinePurpose(m.purpose),
  "session-to-focus": m => convertToFocus(m.budgetMin),
  "suggest-path": m => suggestPath(m.purpose),
  "label-recs": m => labelRecs(m.purpose, m.titles),
  "save": m => saveForLater(m.video),
  "settings": async () => {
    const { recMode = "mark", apiKey = "", homeCard = true } = await chrome.storage.local.get(["recMode", "apiKey", "homeCard"]);
    return { recMode, hasKey: !!apiKey.trim(), homeCard };
  },
  "open-options": async () => { chrome.runtime.openOptionsPage(); }
};

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  const h = handlers[msg.type];
  if (!h) return;
  Promise.resolve(h(msg)).then(sendResponse, e => sendResponse({ error: String(e.message || e) }));
  return true;
});
