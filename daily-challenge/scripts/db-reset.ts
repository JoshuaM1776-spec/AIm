// Recreates the local development database from scratch: Supabase stand-ins, the migration, the seed.
// Usage: npm run db:reset [-- database_name]
// Uses DATABASE_URL's server (default postgres://postgres:postgres@localhost:5432).
import { readdirSync, readFileSync } from "node:fs";
import pg from "pg";

export async function resetDatabase(name = "daily_challenge", { seed = true, quiet = false } = {}) {
  const base = new URL(process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/daily_challenge");
  if (!/^[a-z0-9_]+$/.test(name)) throw new Error("bad database name");
  const admin = new pg.Client({ connectionString: Object.assign(new URL(base), { pathname: "/postgres" }).toString() });
  await admin.connect();
  await admin.query(`drop database if exists ${name} with (force)`);
  await admin.query(`create database ${name}`);
  await admin.end();
  const url = Object.assign(new URL(base), { pathname: `/${name}` }).toString();
  const db = new pg.Client({ connectionString: url });
  await db.connect();
  const file = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
  await db.query(file("tests/db/stub.sql"));
  const migrations = readdirSync(new URL("../supabase/migrations/", import.meta.url)).filter(f => f.endsWith(".sql")).sort();
  for (const m of migrations) await db.query(file(`supabase/migrations/${m}`));
  if (seed) await db.query(file("supabase/seed.sql"));
  await db.end();
  if (!quiet) console.log(`Database ${name} is ready${seed ? " with the five sample challenges (Day 1 is today, UTC)" : ""}.`);
  return url;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  resetDatabase(process.argv[2]).catch(e => { console.error(e.message); process.exit(1); });
}
