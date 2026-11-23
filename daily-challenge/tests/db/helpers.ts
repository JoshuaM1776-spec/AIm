import { randomUUID } from "node:crypto";
import pg from "pg";
import { resetDatabase } from "../../scripts/db-reset.ts";

export interface Db {
  pool: pg.Pool;
  /** Call a public function as a user (or as anon with null), the way PostgREST does. */
  call<T = any>(user: string | null, fn: string, args?: Record<string, unknown>, today?: string): Promise<T>;
  /** Run SQL as a user, with their role and claims, e.g. to check row-level security. */
  as<T = any>(user: string | null, sql: string, params?: unknown[]): Promise<T[]>;
  sql<T = any>(sql: string, params?: unknown[]): Promise<T[]>;
  user(email?: string): Promise<string>;
  close(): Promise<void>;
}

export async function freshDb(name: string): Promise<Db> {
  const url = await resetDatabase(name, { quiet: true });
  const pool = new pg.Pool({ connectionString: url, max: 4 });
  async function withRole<T>(user: string | null, today: string | undefined, run: (c: pg.PoolClient) => Promise<T>) {
    const c = await pool.connect();
    try {
      await c.query("begin");
      await c.query("select set_config('role', $1, true), set_config('request.jwt.claim.sub', $2, true), set_config('app.today', $3, true)",
        [user ? "authenticated" : "anon", user ?? "", today ?? ""]);
      const r = await run(c);
      await c.query("commit");
      return r;
    } catch (e) {
      await c.query("rollback");
      throw e;
    } finally {
      c.release();
    }
  }
  return {
    pool,
    call(user, fn, args = {}, today) {
      const keys = Object.keys(args);
      const values = keys.map(k => (args[k] !== null && typeof args[k] === "object" ? JSON.stringify(args[k]) : args[k]));
      return withRole(user, today, async c =>
        (await c.query(`select public.${fn}(${keys.map((k, i) => `${k} => $${i + 1}`).join(", ")}) as r`, values)).rows[0].r);
    },
    as(user, sql, params = []) {
      return withRole(user, undefined, async c => (await c.query(sql, params)).rows);
    },
    async sql(sql, params = []) {
      return (await pool.query(sql, params)).rows;
    },
    async user(email = `${randomUUID().slice(0, 8)}@example.com`) {
      const id = randomUUID();
      await pool.query("insert into auth.users (id, email) values ($1, $2)", [id, email]);
      return id;
    },
    close: () => pool.end(),
  };
}

export const essay = (words = 80) =>
  Array.from({ length: words }, (_, i) => (i % 12 === 11 ? "because." : "reasoning")).join(" ");

export const today = () => new Date().toISOString().slice(0, 10);
export const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
