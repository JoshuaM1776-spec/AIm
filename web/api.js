// Aim Homeschool, parent website — the account and Aim's server. Sign-in is the same as the
// extension's (an emailed code or link, Supabase Auth); every plan change goes through Aim's server
// (supabase/functions/ai/homeschool.ts), which enforces the approval rules. config.js names the server.

const CFG = window.AIM_WEB || {};
const KEY = "aim-parent-session";
export const configured = () => !!(CFG.supabaseUrl && CFG.supabaseAnonKey);

export class ApiError extends Error {
  constructor(message, status = 0, code = "") { super(message); this.status = status; this.code = code; }
}

const load = () => { try { return JSON.parse(localStorage.getItem(KEY) || "null"); } catch { return null; } };
const store = s => { try { s ? localStorage.setItem(KEY, JSON.stringify(s)) : localStorage.removeItem(KEY); } catch {} };
export const session = () => load();

async function request(path, { method = "POST", body, token } = {}) {
  const headers = { apikey: CFG.supabaseAnonKey, "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  let res;
  try { res = await fetch(CFG.supabaseUrl + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }); }
  catch { throw new ApiError("Couldn't reach Aim. Check your connection and try again."); }
  const data = await res.json().catch(() => ({}));
  return { res, data };
}

const fromAuth = d => ({ access: d.access_token, refresh: d.refresh_token, email: d.user?.email || "",
  expiresAt: d.expires_at ? d.expires_at * 1000 : Date.now() + (d.expires_in || 3600) * 1000 });

export async function sendCode(email) {
  email = String(email || "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new ApiError("Check the email address.");
  const back = encodeURIComponent(location.origin + location.pathname);
  const { res, data } = await request(`/auth/v1/otp?redirect_to=${back}`, { body: { email, create_user: true } });
  if (!res.ok) throw new ApiError(res.status === 429 ? "Too many tries. Wait a minute and try again." : data.msg || "Couldn't send the email. Try again.", res.status);
  return email;
}

export async function verify(email, code) {
  code = String(code || "").replace(/\s+/g, "");
  if (!/^\d{6,10}$/.test(code)) throw new ApiError("Enter the code from the email.");
  const { res, data } = await request("/auth/v1/verify", { body: { type: "email", email, token: code } });
  if (!res.ok || !data.access_token) throw new ApiError("That code didn't work. Check it, or send a new one.", res.status);
  store(fromAuth(data));
}

// The link in Supabase's default email comes back here with the session in the #fragment.
export async function adoptLink() {
  const f = new URLSearchParams(location.hash.replace(/^#/, ""));
  if (!f.get("access_token") && !f.get("error")) return false;
  history.replaceState(null, "", location.pathname + location.search);
  if (f.get("error")) throw new ApiError("That sign-in link has expired or was already used. Send a new one.");
  const { res, data: user } = await request("/auth/v1/user", { method: "GET", token: f.get("access_token") });
  if (!res.ok || !user?.id) throw new ApiError("That sign-in link didn't work. Send a new one.");
  store({ access: f.get("access_token"), refresh: f.get("refresh_token"), email: user.email || "",
    expiresAt: Number(f.get("expires_at")) * 1000 || Date.now() + (Number(f.get("expires_in")) || 3600) * 1000 });
  return true;
}

let refreshing = null;
async function token(force = false) {
  const s = load();
  if (!s) return null;
  if (!force && s.expiresAt - 60_000 > Date.now()) return s.access;
  refreshing ||= (async () => {
    const { res, data } = await request("/auth/v1/token?grant_type=refresh_token", { body: { refresh_token: s.refresh } });
    if (!res.ok) { if (res.status >= 400 && res.status < 500) store(null); return null; }
    const fresh = fromAuth(data);
    store({ ...fresh, email: fresh.email || s.email });
    return fresh.access;
  })().finally(() => { refreshing = null; });
  return refreshing;
}

export async function signOut() {
  const s = load();
  store(null);
  if (s) await request("/auth/v1/logout", { body: {}, token: s.access }).catch(() => {});
}

// One task on Aim's server. Errors carry the server's message and code (plan, conflict, gaps…).
export async function call(task, input) {
  let t = await token();
  if (!t) throw new ApiError("Sign in to continue.", 401, "auth");
  let { res, data } = await request("/functions/v1/ai", { body: { task, input }, token: t });
  if (res.status === 401) {
    t = await token(true);
    if (!t) throw new ApiError("Your sign-in has expired. Sign in again.", 401, "auth");
    ({ res, data } = await request("/functions/v1/ai", { body: { task, input }, token: t }));
  }
  if (!res.ok || !data.ok) throw new ApiError(data.error?.message || ([502, 503, 504, 546].includes(res.status)
    ? `Aim's server stopped before finishing (status ${res.status}). Try again in a minute.` : `Something went wrong (status ${res.status}). Try again.`), res.status, data.error?.code || "");
  return data;
}
