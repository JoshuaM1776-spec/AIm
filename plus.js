// Aim Plus account, in the service worker: sign in with a code sent by email (Supabase Auth),
// keep the session fresh, and call Aim's AI endpoint. Loaded after config.js.
// The session is kept in this worker's IndexedDB, which YouTube tabs and content scripts can't read.

const PLUS = self.AIM_PLUS || {};
const plusConfigured = () => !!(PLUS.supabaseUrl && PLUS.supabaseAnonKey);

class PlusError extends Error {
  constructor(message, status = 0, code = "") { super(message); this.status = status; this.code = code; }
}

// ---------- session storage (IndexedDB) ----------

let dbPromise = null;
function plusDb() {
  dbPromise ??= new Promise((resolve, reject) => {
    const open = indexedDB.open("aim-plus", 1);
    open.onupgradeneeded = () => open.result.createObjectStore("kv");
    open.onsuccess = () => resolve(open.result);
    open.onerror = () => { dbPromise = null; reject(open.error); };
  });
  return dbPromise;
}
async function kv(mode, fn) {
  const db = await plusDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("kv", mode), req = fn(tx.objectStore("kv"));
    tx.oncomplete = () => resolve(req?.result);
    tx.onerror = tx.onabort = () => reject(tx.error);
  });
}
const loadSession = () => kv("readonly", s => s.get("session")).then(v => v || null);
const saveSession = s => kv("readwrite", st => st.put(s, "session"));
const clearSession = () => kv("readwrite", st => st.delete("session"));

// ---------- Supabase Auth ----------

const AUTH_MESSAGES = [
  [/expired|invalid|otp/i, "That code didn't work. Check it, or send a new one."],
  [/rate limit|too many|security purposes/i, "Too many tries. Wait a minute and try again."],
  [/signups not allowed/i, "New accounts aren't open yet."],
  [/email/i, "Check the email address."]
];

async function plusFetch(url, init) {
  let res;
  try { res = await fetch(url, init); }
  catch { throw new PlusError("Couldn't reach Aim's server. Check your connection and try again."); }
  const data = await res.json().catch(() => ({}));
  return { res, data };
}

async function authCall(path, body, token) {
  const headers = { apikey: PLUS.supabaseAnonKey, "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const { res, data } = await plusFetch(`${PLUS.supabaseUrl}/auth/v1/${path}`, { method: "POST", headers, body: JSON.stringify(body || {}) });
  if (!res.ok) {
    const raw = String(data.msg || data.error_description || data.message || data.error || "");
    const friendly = res.status === 429 ? AUTH_MESSAGES[1][1] : AUTH_MESSAGES.find(([re]) => re.test(raw))?.[1];
    throw new PlusError(friendly || "Sign-in didn't work. Try again.", res.status, data.error_code || data.code || "");
  }
  return data;
}

function sessionFrom(data) {
  if (!data.access_token || !data.refresh_token) throw new PlusError("Sign-in didn't work. Try again.");
  const expiresAt = data.expires_at ? data.expires_at * 1000 : Date.now() + (data.expires_in || 3600) * 1000;
  return { accessToken: data.access_token, refreshToken: data.refresh_token, expiresAt,
    email: data.user?.email || "", userId: data.user?.id || "" };
}

const validEmail = e => typeof e === "string" && e.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

async function plusSendCode(email) {
  email = String(email || "").trim().toLowerCase();
  if (!validEmail(email)) throw new PlusError("Check the email address.");
  await authCall("otp", { email, create_user: true });
  return { result: "sent", email };
}

async function plusVerify(email, code) {
  email = String(email || "").trim().toLowerCase();
  code = String(code || "").replace(/\s+/g, "");
  if (!validEmail(email)) throw new PlusError("Check the email address.");
  if (!/^\d{6,10}$/.test(code)) throw new PlusError("Enter the code from the email.");
  const s = sessionFrom(await authCall("verify", { type: "email", email, token: code }));
  await saveSession(s);
  return { result: "signed-in", email: s.email };
}

// One refresh at a time: a refresh token works once, so two racing refreshes would sign the user out.
let refreshing = null;
async function accessToken({ force = false } = {}) {
  const s = await loadSession();
  if (!s) return null;
  if (!force && s.expiresAt - 60_000 > Date.now()) return s.accessToken;
  refreshing ??= (async () => {
    try {
      const fresh = sessionFrom(await authCall("token?grant_type=refresh_token", { refresh_token: s.refreshToken }));
      await saveSession(fresh);
      return fresh.accessToken;
    } catch (e) {
      // A rejected refresh token means the session is over. Network trouble keeps it for later.
      if (e.status >= 400 && e.status < 500) { await clearSession(); return null; }
      throw e;
    } finally { refreshing = null; }
  })();
  return refreshing;
}

async function plusSignOut() {
  const s = await loadSession();
  await clearSession();
  // Revoke on the server too. Signed out locally either way.
  if (s) await authCall("logout", {}, s.accessToken).catch(() => {});
  return { result: "signed-out" };
}

// ---------- Aim's AI endpoint ----------

async function plusCall(task, input) {
  let token = await accessToken();
  if (!token) throw new PlusError("Sign in to use Aim Plus.", 401, "auth");
  const send = t => plusFetch(`${PLUS.supabaseUrl}/functions/v1/ai`, {
    method: "POST",
    headers: { Authorization: `Bearer ${t}`, apikey: PLUS.supabaseAnonKey, "Content-Type": "application/json" },
    body: JSON.stringify({ task, input })
  });
  let { res, data } = await send(token);
  if (res.status === 401) {
    token = await accessToken({ force: true });
    if (!token) throw new PlusError("Your sign-in has expired. Sign in again.", 401, "auth");
    ({ res, data } = await send(token));
  }
  if (!res.ok || !data.ok) throw new PlusError(data.error?.message || "Aim's server had a problem. Try again.", res.status, data.error?.code || "");
  return data;
}

// What Settings shows.
async function plusStatus() {
  if (!plusConfigured()) return { configured: false };
  const s = await loadSession();
  if (!s) return { configured: true, signedIn: false };
  try {
    const st = await plusCall("status");
    return { configured: true, signedIn: true, email: st.email || s.email, plan: st.plan, usage: st.usage, limits: st.limits };
  } catch (e) {
    if (e.code === "auth") return { configured: true, signedIn: false, error: e.message };
    return { configured: true, signedIn: true, email: s.email, offline: true, error: e.message };
  }
}

// Messages from Aim's own pages (Settings). Network calls don't go through serial(), so a slow
// server never holds up the timer.
const plusHandlers = {
  "plus-status": () => plusStatus(),
  "plus-send-code": m => plusSendCode(m.email),
  "plus-verify": m => plusVerify(m.email, m.code),
  "plus-sign-out": () => plusSignOut(),
  "plus-check": () => plusCall("check").then(r => ({ result: "ok", reply: r.reply }))
};
