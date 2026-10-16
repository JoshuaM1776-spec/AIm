# Aim Plus server (Supabase)

Aim Free needs none of this. It's the foundation for Aim Plus: accounts, plans, and AI access through Aim's own server, so users never need an API key.

| Part | What it does |
|---|---|
| **Supabase Auth** | Sign-in with a 6-digit code sent by email. No passwords. |
| `migrations/0001_init.sql` | `profiles` (one per user, `plan` = `free` or `plus`) and `ai_usage` (one row per AI call). Row-level security: users can read only their own rows and can't change their plan. `ai_begin` / `ai_finish` enforce usage limits atomically and can be called only by the server. |
| `functions/ai/` | The AI endpoint, an Edge Function. It checks the user's sign-in, plan and limits, calls Claude with the server's key, and records usage. `handler.ts` holds the logic (tested in Node), `index.ts` connects it to Supabase and the Claude API. |
| `../config.js` | The extension's pointer to this project: URL and anon key. Empty means Aim Free only. |
| `../plus.js` | The extension's side: sign-in, keeping the session fresh, calling the endpoint. |

## AI endpoint

`POST https://<project>.supabase.co/functions/v1/ai` with `Authorization: Bearer <user access token>` and a JSON body `{ "task": "...", "input": ... }`.

| Task | Plan | AI | Returns |
|---|---|---|---|
| `status` | any | no | `{ email, plan, usage: { calls, tokens }, limits }` for the last 24 hours |
| `check` | plus | yes | `{ reply: "ready" }`. A tiny call that proves the whole path works. |

Later steps add tasks (learning paths, curation) to the `TASKS` table in `handler.ts`. Each task builds its own prompt on the server, so the extension can't send arbitrary prompts on your key.

**Errors** are `{ ok: false, error: { code, message } }` with messages written for users: `auth` (401), `plan` (403), `limit` (429), `refusal` (422), `busy` (503), `upstream` (502), `too_large` (413), `task` / `bad_json` (400).

**Limits per user**, over rolling windows, set by secrets: 300 AI calls per 24 hours (`AIM_DAY_CALLS`), 400,000 tokens per 24 hours (`AIM_DAY_TOKENS`), 20 calls per minute (`AIM_MINUTE_CALLS`). Calls that fail still count, so retry loops can't run up a bill.

**Model:** `AIM_MODEL`, default `claude-opus-5-5`. Requests use `effort: "low"` and server-side fallback (`fallbacks: "default"`): if the model declines a request for policy reasons, the API retries it on a fallback model. For cheaper Plus pricing, try a smaller model such as `claude-haiku-5-5` per task once real tasks exist, and check the results are good enough.

## Set it up

You need a Supabase account, the [Supabase CLI](https://supabase.com/docs/guides/cli), and a Claude API key from the [Claude Console](https://platform.claude.com/).

1. **Create a project** in the Supabase dashboard. Note its URL and **anon (public) key** (Project Settings → API).
2. **Link and create the tables** from this repo's root:
   ```sh
   supabase login
   supabase link --project-ref <project-ref>
   supabase db push
   ```
3. **Email sign-in with a code:** Authentication → Sign In / Providers → Email: enabled, with "Confirm email" on. Then Authentication → Email Templates: in **Magic Link** and **Confirm signup**, show the code instead of (or as well as) the link, for example:
   ```html
   <h2>Your Aim sign-in code</h2>
   <p>Enter this code in Aim: <strong>{{ .Token }}</strong></p>
   <p>It expires in an hour. If you didn't ask for it, ignore this email.</p>
   ```
   Codes are 6 digits by default (Authentication → Providers → Email → OTP length).
4. **Email delivery:** Supabase's built-in email sends only a few messages an hour and is meant for testing. Before real users, set up your own SMTP under Authentication → Emails → SMTP settings.
5. **Server secrets** (never put these in the extension):
   ```sh
   supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
   # optional:
   supabase secrets set AIM_MODEL=claude-opus-5-5 AIM_DAY_CALLS=300 AIM_DAY_TOKENS=400000 AIM_MINUTE_CALLS=20
   supabase secrets set AIM_EXTENSION_ORIGINS=chrome-extension://<your extension id>
   ```
   `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are provided to Edge Functions automatically. Without `AIM_EXTENSION_ORIGINS`, any Chrome extension origin may call the endpoint (still only with a valid sign-in). Set it once the Chrome Web Store has given Aim its ID.
6. **Deploy the endpoint:**
   ```sh
   supabase functions deploy ai
   ```
7. **Point the extension at it:** fill in `config.js` with the project URL and anon key, then reload the extension. Settings now has an **Aim Plus** section.
8. **Give a test account Plus** (until billing exists), in the SQL editor:
   ```sql
   update public.profiles set plan = 'plus'
   where id = (select id from auth.users where email = 'you@example.com');
   ```
   Then Settings → Aim Plus → **Check connection**.

## Before release

- Filling in `config.js` changes what Aim sends off the device, so update `PRIVACY.md` and the store listing's privacy answers at the same time (see the notes in both).
- Watch usage and cost: `select date_trunc('day', created_at) d, count(*), sum(input_tokens + output_tokens) from ai_usage group by 1 order by 1 desc;` and set a monthly spend limit in the Claude Console.
- Deleting a user in Authentication → Users deletes their profile and usage rows too.

## Tests

```sh
node --experimental-strip-types tests/ai.test.mjs     # endpoint logic with fake accounts and a fake Claude
node --experimental-strip-types tests/plus.test.mjs   # sign-in end to end in Chromium, against a local stand-in server
# database: needs a throwaway Postgres (not your Supabase project)
psql "$TEST_DB" -v ON_ERROR_STOP=1 -f tests/db/stub.sql -f supabase/migrations/0001_init.sql -f tests/db/test.sql
```
