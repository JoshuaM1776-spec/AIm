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
// A sign-in waiting for its email: the address, and a random state that the emailed link must carry back.
const loadPending = () => kv("readonly", st => st.get("pending")).then(v => v || null);
const savePending = p => kv("readwrite", st => st.put(p, "pending"));
const clearPending = () => kv("readwrite", st => st.delete("pending"));

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

// The email can carry a 6-digit code (with a customized email template) or a sign-in link (Supabase's
// default email). The link comes back to signin.html in this extension, carrying `state`, so a link
// can only finish a sign-in this browser started.
const SIGNIN_PAGE = () => chrome.runtime.getURL("signin.html");
const PENDING_MS = 60 * 60 * 1000;

async function plusSendCode(email) {
  email = String(email || "").trim().toLowerCase();
  if (!validEmail(email)) throw new PlusError("Check the email address.");
  const state = crypto.randomUUID();
  await savePending({ email, state, at: Date.now() });
  const back = encodeURIComponent(`${SIGNIN_PAGE()}?state=${state}`);
  await authCall(`otp?redirect_to=${back}`, { email, create_user: true });
  return { result: "sent", email };
}

// What was typed or pasted: a code, or the link from the email.
async function plusVerify(email, entry) {
  email = String(email || "").trim().toLowerCase();
  if (!validEmail(email)) throw new PlusError("Check the email address.");
  const raw = String(entry || "").trim();
  let data;
  const link = linkToken(raw);
  if (link) {
    data = await authCall("verify", { type: link.type, token_hash: link.token });
  } else {
    const code = raw.replace(/\s+/g, "");
    if (!/^\d{6,10}$/.test(code)) throw new PlusError("Enter the code from the email, or paste its sign-in link.");
    data = await authCall("verify", { type: "email", email, token: code });
  }
  const s = sessionFrom(data);
  if (s.email && s.email.toLowerCase() !== email) throw new PlusError("That link is for a different email address.");
  await saveSession(s);
  await clearPending();
  return { result: "signed-in", email: s.email };
}

// The token inside an emailed sign-in link (…/auth/v1/verify?token=…&type=magiclink), if `raw` is one.
function linkToken(raw) {
  let u;
  try { u = new URL(raw); } catch { return null; }
  if (u.origin !== new URL(PLUS.supabaseUrl).origin || !u.pathname.endsWith("/auth/v1/verify")) return null;
  const token = u.searchParams.get("token") || "";
  const type = u.searchParams.get("type") || "magiclink";
  if (!/^[\w-]{10,}$/.test(token) || token.startsWith("pkce_")) return null;
  return { token, type: ["magiclink", "signup", "email", "invite"].includes(type) ? type : "magiclink" };
}

// signin.html hands over what the link delivered: the state from its address, and the
// session (or an error) from its #fragment.
async function plusAdopt(search, hash) {
  const q = new URLSearchParams(String(search || "").replace(/^\?/, ""));
  const f = new URLSearchParams(String(hash || "").replace(/^#/, ""));
  if (f.get("error") || f.get("error_code")) {
    throw new PlusError(/expired|invalid/i.test(f.get("error_description") || f.get("error_code") || "")
      ? "That link has expired or was already used. Send a new one from Settings." : "That sign-in link didn't work. Send a new one from Settings.");
  }
  const pending = await loadPending();
  if (!pending || pending.state !== q.get("state") || Date.now() - pending.at > PENDING_MS) {
    throw new PlusError("This sign-in link wasn't started here, or it's too old. Send a new one from Settings.");
  }
  const access = f.get("access_token"), refresh = f.get("refresh_token");
  if (!access || !refresh) throw new PlusError("That sign-in link didn't work. Send a new one from Settings.");
  // Ask Supabase who this session belongs to rather than trusting the link.
  const { res, data: user } = await plusFetch(`${PLUS.supabaseUrl}/auth/v1/user`, {
    headers: { apikey: PLUS.supabaseAnonKey, Authorization: `Bearer ${access}` }
  });
  if (!res.ok || !user?.id) throw new PlusError("That sign-in link didn't work. Send a new one from Settings.");
  if ((user.email || "").toLowerCase() !== pending.email) throw new PlusError("That link is for a different email address.");
  const expiresAt = Number(f.get("expires_at")) * 1000 || Date.now() + (Number(f.get("expires_in")) || 3600) * 1000;
  await saveSession({ accessToken: access, refreshToken: refresh, expiresAt, email: user.email, userId: user.id });
  await clearPending();
  return { result: "signed-in", email: user.email };
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

// What Settings shows. Also remembers the plan, so YouTube tabs can ask whether to offer Plus
// features without a network request (see plusBrief).
async function plusStatus() {
  if (!plusConfigured()) return { configured: false };
  const s = await loadSession();
  if (!s) return { configured: true, signedIn: false };
  try {
    const st = await plusCall("status");
    const fresh = await loadSession();
    if (fresh && fresh.plan !== st.plan) await saveSession({ ...fresh, plan: st.plan });
    return { configured: true, signedIn: true, email: st.email || s.email, plan: st.plan, usage: st.usage, limits: st.limits };
  } catch (e) {
    if (e.code === "auth") return { configured: true, signedIn: false, error: e.message };
    return { configured: true, signedIn: true, email: s.email, offline: true, error: e.message };
  }
}

// Your data: one file with everything on Aim's server for this account, plus what Aim keeps in this
// browser (Targets, history, settings). The sign-in session itself is never included.
async function plusExport() {
  const server = await plusCall("account-export");
  const browser = await chrome.storage.local.get(null);
  const { ok, ...data } = server;
  return { result: "ok", data: { format: "aim-export-1", ...data, browser } };
}

// Delete the account and everything on the server, then sign out here. Aim's data in this browser
// stays (it was never on the server); "Clear history" and removing the extension cover it.
async function plusDelete(confirm) {
  await plusCall("account-delete", { confirm });
  await clearSession();
  await clearPending();
  return { result: "deleted" };
}

// All a YouTube tab may learn about the account: whether someone is signed in (the librarian is
// on) and whether Plus features can be offered.
async function plusBrief() {
  if (!plusConfigured()) return { plus: false, account: false };
  const s = await loadSession();
  return { plus: s?.plan === "plus", account: !!s };
}

// The librarian, for YouTube tabs: only its tasks (planning a study session, and "Where could this
// take me?", which uses nothing about the student), only when signed in. Errors come back as
// { error, code } so the tab can fall back to a plain YouTube search.
const LIBRARIAN_TASKS = new Set(["librarian-ask", "librarian-rank", "study-plan", "pathways-where", "video-concepts"]);
async function plusLibrarian(task, input) {
  if (!LIBRARIAN_TASKS.has(task) || !plusConfigured()) return { error: "Unavailable.", code: "unavailable" };
  try { return await plusCall(task, input); }
  catch (e) { return { error: String(e.message || e), code: e.code || "" }; }
}

// Aim Plus features Aim's pages may call. Each is a task on Aim's server, which builds the prompts.
const PLUS_TASKS = new Set(["teachback-start", "teachback-turn", "teachback-finish", "teachback-get",
  "pathways-themes", "pathways-careers", "pathways-step"]);

// Messages from Aim's own pages (Settings, TeachBack). Network calls don't go through serial(), so a slow
// server never holds up the timer.
const plusHandlers = {
  "plus-status": () => plusStatus(),
  "plus-send-code": m => plusSendCode(m.email),
  "plus-verify": m => plusVerify(m.email, m.code),
  "plus-adopt": m => plusAdopt(m.search, m.hash),
  "plus-sign-out": () => plusSignOut(),
  "plus-export": () => plusExport(),
  "plus-delete": m => plusDelete(m.confirm),
  "plus-check": () => plusCall("check").then(r => ({ result: "ok", reply: r.reply })),
  "plus-call": async m => {
    if (!PLUS_TASKS.has(m.task)) throw new PlusError("Unknown request.");
    return plusCall(m.task, m.input);
  }
};
