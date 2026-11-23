// Local stand-in for Supabase, for development and end-to-end tests. NOT for production.
//
// It implements just what the app uses, on top of a plain local Postgres that has the real
// migration applied:
//   /auth/v1/*            email sign-in with a 6-digit code (printed here instead of emailed)
//   /rest/v1/rpc/:fn      database functions, run exactly as PostgREST runs them: as the
//                         "anon" or "authenticated" role, with the user's id in request.jwt.claim.sub,
//                         so the same grants and row-level security apply
//   /functions/v1/evaluate  the same evaluation handler the Edge Function runs
//   /dev/*                helpers for tests (read the last sign-in code, pin "today", make an admin)
// It can also serve the built app (dist/) so everything runs on one port.
//
// Environment: DATABASE_URL (default postgres://postgres:postgres@localhost:5432/daily_challenge),
// PORT (54321), EVAL_PROVIDER (anthropic | test), ANTHROPIC_API_KEY, EVAL_MODEL, SERVE_DIST=1.
import { createHmac, randomBytes, randomInt, randomUUID, timingSafeEqual } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import pg from "pg";
import Anthropic from "@anthropic-ai/sdk";
import { serveEvaluate } from "../supabase/functions/_shared/evaluation/handler.ts";
import { anthropicProvider } from "../supabase/functions/_shared/evaluation/providers/anthropic.ts";
import { testProvider } from "../supabase/functions/_shared/evaluation/providers/test.ts";
import type { ClaimResult, EvalProvider, EvalStore } from "../supabase/functions/_shared/evaluation/types.ts";
import { type GenClaim, type GenStore, serveGenerate } from "../supabase/functions/_shared/generation/generate.ts";
import { testGenerator } from "../supabase/functions/_shared/generation/test-generator.ts";

export interface DevServerOptions {
  port?: number;
  databaseUrl?: string;
  provider?: EvalProvider | null;
  generator?: EvalProvider | null;
  serveDist?: string | null;
  quiet?: boolean;
  limits?: { perHour: number; perDay: number };
  evalTimeoutMs?: number;
}

const SECRET = process.env.DEV_JWT_SECRET || randomBytes(32).toString("hex");
const b64 = (b: Buffer | string) => Buffer.from(b).toString("base64url");

function signJwt(claims: Record<string, unknown>): string {
  const head = b64(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = b64(JSON.stringify(claims));
  return `${head}.${body}.${b64(createHmac("sha256", SECRET).update(`${head}.${body}`).digest())}`;
}

function verifyJwt(token: string | undefined): Record<string, unknown> | null {
  if (!token) return null;
  const [head, body, sig] = token.split(".");
  if (!head || !body || !sig) return null;
  const want = createHmac("sha256", SECRET).update(`${head}.${body}`).digest();
  const got = Buffer.from(sig, "base64url");
  if (got.length !== want.length || !timingSafeEqual(got, want)) return null;
  const claims = JSON.parse(Buffer.from(body, "base64url").toString());
  return typeof claims.exp === "number" && claims.exp * 1000 > Date.now() ? claims : null;
}

const bearer = (h: string | undefined | null) => h?.replace(/^Bearer\s+/i, "");
const SERVICE_KEY = process.env.DEV_SERVICE_ROLE_KEY || "local-dev-service-role-key";

export async function startDevServer(opts: DevServerOptions = {}) {
  const port = opts.port ?? Number(process.env.PORT || 54321);
  const pool = new pg.Pool({ connectionString: opts.databaseUrl ?? process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/daily_challenge", max: 10 });
  const log = (...a: unknown[]) => { if (!opts.quiet) console.log("[dev-server]", ...a); };

  let today: string | null = null; // pinned "today" (YYYY-MM-DD), for tests of the daily reset
  const codes = new Map<string, { code: string; expires: number }>();
  const refreshTokens = new Map<string, string>(); // token -> user id

  const users = {
    async byEmail(email: string) {
      return (await pool.query("select id, email, created_at from auth.users where lower(email) = lower($1)", [email])).rows[0] as { id: string; email: string; created_at: Date } | undefined;
    },
    async byId(id: string) {
      return (await pool.query("select id, email, created_at from auth.users where id = $1", [id])).rows[0] as { id: string; email: string; created_at: Date } | undefined;
    },
    async create(email: string) {
      return (await pool.query("insert into auth.users (id, email) values ($1, $2) returning id, email, created_at", [randomUUID(), email.toLowerCase()])).rows[0] as { id: string; email: string; created_at: Date };
    },
  };

  const userJson = (u: { id: string; email: string; created_at: Date }) => ({
    id: u.id, aud: "authenticated", role: "authenticated", email: u.email, phone: "",
    email_confirmed_at: u.created_at, confirmed_at: u.created_at, last_sign_in_at: new Date().toISOString(),
    app_metadata: { provider: "email", providers: ["email"] }, user_metadata: {}, identities: [],
    created_at: u.created_at, updated_at: u.created_at, is_anonymous: false,
  });

  function session(u: { id: string; email: string; created_at: Date }) {
    const now = Math.floor(Date.now() / 1000);
    const expiresIn = 3600;
    const refresh = randomBytes(24).toString("hex");
    refreshTokens.set(refresh, u.id);
    return {
      access_token: signJwt({ aud: "authenticated", sub: u.id, email: u.email, role: "authenticated", iat: now, exp: now + expiresIn, session_id: randomUUID(), is_anonymous: false }),
      token_type: "bearer", expires_in: expiresIn, expires_at: now + expiresIn, refresh_token: refresh, user: userJson(u),
    };
  }

  // Runs a database function the way PostgREST does.
  async function rpc(fn: string, args: Record<string, unknown>, claims: Record<string, unknown> | null, role?: "service_role") {
    if (!/^[a-z][a-z0-9_]*$/.test(fn)) throw Object.assign(new Error("Could not find the function"), { code: "PGRST202" });
    const keys = Object.keys(args);
    for (const k of keys) if (!/^[a-z_][a-z0-9_]*$/.test(k)) throw Object.assign(new Error("bad argument name"), { code: "PGRST202" });
    const client = await pool.connect();
    try {
      await client.query("begin");
      await client.query(
        "select set_config('role', $1, true), set_config('request.jwt.claim.sub', $2, true), set_config('request.jwt.claims', $3, true), set_config('app.today', $4, true)",
        [role ?? (claims ? "authenticated" : "anon"), (claims?.sub as string) ?? "", JSON.stringify(claims ?? { role: role ?? "anon" }), today ?? ""]
      );
      const values = keys.map(k => {
        const v = args[k];
        return v !== null && typeof v === "object" ? JSON.stringify(v) : v;
      });
      const r = await client.query(`select public.${fn}(${keys.map((k, i) => `${k} => $${i + 1}`).join(", ")}) as result`, values);
      await client.query("commit");
      return r.rows[0]?.result ?? null;
    } catch (e) {
      await client.query("rollback").catch(() => {});
      throw e;
    } finally {
      client.release();
    }
  }

  // The evaluation function's storage: the eval_* database functions, called as the server.
  const store: EvalStore = {
    async claim(userId, submissionId, perHour, perDay) {
      return (await pool.query("select public.eval_claim($1, $2, $3, $4) as r", [userId, submissionId, perHour, perDay])).rows[0].r as ClaimResult;
    },
    async complete(id, evaluation, provider, model, inTok, outTok) {
      const r = await pool.query("select public.eval_complete($1, $2, $3, $4, $5, $6, $7) as r",
        [id, JSON.stringify(evaluation.scores), JSON.stringify(evaluation.feedback), provider, model, inTok, outTok]);
      return !!r.rows[0].r.ok;
    },
    async fail(id, code, provider, model) {
      await pool.query("select public.eval_fail($1, $2, $3, $4)", [id, code, provider, model]);
    },
  };

  let provider: EvalProvider | null = opts.provider !== undefined ? opts.provider : null;
  let generator: EvalProvider | null = opts.generator !== undefined ? opts.generator : null;
  if (opts.provider === undefined) {
    const kind = process.env.EVAL_PROVIDER || (process.env.ANTHROPIC_API_KEY ? "anthropic" : "");
    if (kind === "anthropic") {
      provider = anthropicProvider(new Anthropic(), Anthropic, { model: process.env.EVAL_MODEL || "claude-opus-5-5" });
      if (opts.generator === undefined) generator = anthropicProvider(new Anthropic(), Anthropic, { model: process.env.GEN_MODEL || "claude-opus-5-5" });
    } else if (kind === "test") {
      provider = testProvider();
      if (opts.generator === undefined) generator = testGenerator();
      log("Using the built-in TEST evaluator and drafting model (not AI). Their results are labelled as tests.");
    } else {
      log("No evaluator configured: set ANTHROPIC_API_KEY, or EVAL_PROVIDER=test for the mechanical test evaluator.");
    }
  }

  const genStore: GenStore = {
    async claim(userId, perDay) {
      return (await pool.query("select public.gen_claim($1, $2) as r", [userId, perDay])).rows[0].r as GenClaim;
    },
    async save(userId, callId, doc, prov, model, inTok, outTok) {
      return (await pool.query("select public.gen_save_draft($1, $2, $3, $4, $5, $6, $7) as r",
        [userId, callId, JSON.stringify(doc), prov, model, inTok, outTok])).rows[0].r as { id: string; number: number };
    },
    async fail(callId, code, prov, model) {
      await pool.query("select public.gen_fail($1, $2, $3, $4)", [callId, code, prov, model]);
    },
  };

  const CORS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info, accept-profile, content-profile, prefer, x-supabase-api-version",
    "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
  };
  const send = (res: ServerResponse, status: number, body?: unknown, headers: Record<string, string> = {}) => {
    res.writeHead(status, { ...CORS, ...(body === undefined ? {} : { "content-type": "application/json" }), ...headers });
    res.end(body === undefined ? undefined : JSON.stringify(body));
  };
  const readBody = async (req: IncomingMessage) => {
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const c of req) {
      size += (c as Buffer).length;
      if (size > 1_000_000) throw new Error("too large");
      chunks.push(c as Buffer);
    }
    return Buffer.concat(chunks).toString();
  };
  const json = async (req: IncomingMessage) => {
    const t = await readBody(req);
    return t ? JSON.parse(t) : {};
  };

  const MIME: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml",
    ".woff2": "font/woff2", ".woff": "font/woff", ".png": "image/png", ".ico": "image/x-icon", ".json": "application/json", ".webmanifest": "application/manifest+json" };

  async function serveStatic(res: ServerResponse, root: string, path: string) {
    const safe = normalize(decodeURIComponent(path)).replace(/^(\.\.[/\\])+/, "");
    let file = join(root, safe);
    try {
      if (!(await stat(file)).isFile()) throw new Error();
    } catch {
      file = join(root, "index.html"); // single-page app: unknown paths get the app
    }
    res.writeHead(200, { "content-type": MIME[extname(file)] ?? "application/octet-stream" });
    res.end(await readFile(file));
  }

  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", `http://localhost:${port}`);
    const path = url.pathname;
    try {
      if (req.method === "OPTIONS") return send(res, 204);

      // ---- auth ----
      if (path === "/auth/v1/otp" && req.method === "POST") {
        const { email } = await json(req);
        if (typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return send(res, 400, { code: 400, error_code: "validation_failed", msg: "Enter a valid email address." });
        const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
        codes.set(email.toLowerCase(), { code, expires: Date.now() + 60 * 60 * 1000 });
        log(`sign-in code for ${email}: ${code}`);
        return send(res, 200, {});
      }
      if (path === "/auth/v1/verify" && req.method === "POST") {
        const { email, token } = await json(req);
        const entry = typeof email === "string" ? codes.get(email.toLowerCase()) : undefined;
        if (!entry || entry.expires < Date.now() || entry.code !== String(token)) {
          return send(res, 403, { code: 403, error_code: "otp_expired", msg: "Token has expired or is invalid" });
        }
        codes.delete(email.toLowerCase());
        const u = (await users.byEmail(email)) ?? (await users.create(email));
        return send(res, 200, session(u));
      }
      if (path === "/auth/v1/token" && req.method === "POST" && url.searchParams.get("grant_type") === "refresh_token") {
        const { refresh_token } = await json(req);
        const id = refreshTokens.get(refresh_token);
        const u = id ? await users.byId(id) : undefined;
        if (!u) return send(res, 400, { code: 400, error_code: "refresh_token_not_found", msg: "Invalid Refresh Token: Refresh Token Not Found" });
        refreshTokens.delete(refresh_token);
        return send(res, 200, session(u));
      }
      if (path === "/auth/v1/user" && req.method === "GET") {
        const claims = verifyJwt(bearer(req.headers.authorization));
        const u = claims ? await users.byId(claims.sub as string) : undefined;
        if (!u) return send(res, 401, { code: 401, error_code: "bad_jwt", msg: "invalid JWT" });
        return send(res, 200, userJson(u));
      }
      if (path === "/auth/v1/logout" && req.method === "POST") return send(res, 204);

      // ---- database functions ----
      const m = /^\/rest\/v1\/rpc\/([a-z0-9_]+)$/.exec(path);
      if (m && (req.method === "POST" || req.method === "GET")) {
        const token = bearer(req.headers.authorization);
        // The Supabase Edge Function calls the eval_* functions with the service role key.
        const service = token === SERVICE_KEY;
        const claims = service ? null : verifyJwt(token);
        const args = req.method === "GET" ? Object.fromEntries(url.searchParams) : await json(req);
        try {
          return send(res, 200, await rpc(m[1], args, claims, service ? "service_role" : undefined));
        } catch (e) {
          const err = e as { code?: string; message: string; detail?: string; hint?: string };
          const status = err.code === "P0001" || err.code === "22P02" || err.code === "23514" ? 400
            : err.code === "42501" ? (claims ? 403 : 401) : err.code === "42883" || err.code === "PGRST202" ? 404
            : err.code === "23505" ? 409 : 500;
          if (status === 500) console.error("[dev-server] rpc", m[1], err.message);
          return send(res, status, { code: err.code, message: err.message, details: err.detail ?? null, hint: err.hint ?? null });
        }
      }

      // ---- the generate function ----
      if (path === "/functions/v1/generate") {
        const body = req.method === "POST" ? await readBody(req) : undefined;
        const headers = new Headers();
        for (const [k, v] of Object.entries(req.headers)) if (typeof v === "string" && k !== "host" && k !== "connection") headers.set(k, v);
        const response = await serveGenerate(new Request(url, { method: req.method, headers, body }), {
          async authenticate(authorization) {
            return (verifyJwt(bearer(authorization))?.sub as string) ?? null;
          },
          store: genStore, provider: generator, perDay: 10, timeoutMs: 300_000, allowedOrigins: ["*"],
          log: (event, data) => log(event, JSON.stringify(data)),
        });
        res.writeHead(response.status, Object.fromEntries(response.headers));
        return res.end(await response.text());
      }

      // ---- the evaluate function ----
      if (path === "/functions/v1/evaluate") {
        const body = req.method === "POST" ? await readBody(req) : undefined;
        const headers = new Headers();
        for (const [k, v] of Object.entries(req.headers)) if (typeof v === "string" && k !== "host" && k !== "connection") headers.set(k, v);
        const request = new Request(url, { method: req.method, headers, body });
        const response = await serveEvaluate(request, {
          async authenticate(authorization) {
            const claims = verifyJwt(bearer(authorization));
            return (claims?.sub as string) ?? null;
          },
          store, provider,
          limits: opts.limits ?? { perHour: 8, perDay: 24 },
          timeoutMs: opts.evalTimeoutMs ?? 120_000,
          allowedOrigins: ["*"],
          log: (event, data) => log(event, JSON.stringify(data)),
        });
        res.writeHead(response.status, Object.fromEntries(response.headers));
        return res.end(await response.text());
      }

      // ---- test helpers ----
      if (path.startsWith("/dev/")) {
        if (path === "/dev/code" && req.method === "GET") {
          const e = codes.get((url.searchParams.get("email") ?? "").toLowerCase());
          return send(res, e ? 200 : 404, e ? { code: e.code } : { error: "no code" });
        }
        if (path === "/dev/today" && req.method === "POST") {
          const { date } = await json(req);
          today = typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null;
          return send(res, 200, { today });
        }
        if (path === "/dev/admin" && req.method === "POST") {
          const { email } = await json(req);
          const u = (await users.byEmail(email)) ?? (await users.create(email));
          await pool.query("insert into public.profiles (id, is_admin) values ($1, true) on conflict (id) do update set is_admin = true", [u.id]);
          return send(res, 200, { id: u.id });
        }
        if (path === "/dev/sql" && req.method === "POST" && process.env.DEV_ALLOW_SQL === "1") {
          const { sql, params } = await json(req);
          return send(res, 200, (await pool.query(sql, params ?? [])).rows);
        }
        return send(res, 404, { error: "not found" });
      }

      if (opts.serveDist && req.method === "GET") return serveStatic(res, opts.serveDist, path);
      return send(res, 404, { error: "not found" });
    } catch (e) {
      console.error("[dev-server]", e);
      return send(res, 500, { message: "Internal error" });
    }
  });

  await new Promise<void>(resolve => server.listen(port, resolve));
  log(`listening on http://localhost:${port}`);
  return {
    port,
    setToday(d: string | null) { today = d; },
    async close() {
      await new Promise<void>(r => server.close(() => r()));
      await pool.end();
    },
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  startDevServer({ serveDist: process.env.SERVE_DIST ? process.env.SERVE_DIST : null }).catch(e => {
    console.error(e);
    process.exit(1);
  });
}
