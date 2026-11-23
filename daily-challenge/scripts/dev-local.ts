// One command for local development without a Supabase project:
//   the local stand-in server (auth, database functions, evaluation) on :54321, and the app on :5173.
// Needs a local Postgres; run `npm run db:reset` once first (and whenever you want a fresh start).
// Evaluations use Claude when ANTHROPIC_API_KEY is set; otherwise the clearly labelled test evaluator.
import { spawn } from "node:child_process";
import { startDevServer } from "../server/dev-server.ts";

if (!process.env.EVAL_PROVIDER) process.env.EVAL_PROVIDER = process.env.ANTHROPIC_API_KEY ? "anthropic" : "test";
await startDevServer();
const vite = spawn("npx", ["vite"], {
  stdio: "inherit",
  env: { ...process.env, VITE_SUPABASE_URL: "http://localhost:54321", VITE_SUPABASE_ANON_KEY: "local-dev-anon-key" },
});
vite.on("exit", code => process.exit(code ?? 0));
console.log("\nOpen http://localhost:5173. Sign-in codes are printed here (no email is sent).");
console.log("Make yourself an admin: curl -X POST localhost:54321/dev/admin -d '{\"email\":\"you@example.com\"}'\n");
