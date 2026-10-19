# Aim Plus server (Supabase)

Aim Free needs none of this. It's the foundation for Aim Plus: accounts, plans, and AI access through Aim's own server, so users never need an API key.

| Part | What it does |
|---|---|
| **Supabase Auth** | Sign-in with a 6-digit code sent by email. No passwords. |
| `migrations/0001_init.sql` | `profiles` (one per user, `plan` = `free` or `plus`) and `ai_usage` (one row per AI call). Row-level security: users can read only their own rows and can't change their plan. `ai_begin` / `ai_finish` enforce usage limits atomically and can be called only by the server. |
| `functions/ai/` | The AI endpoint, an Edge Function. It checks the user's sign-in, plan and limits, calls Claude with the server's key, and records usage. `handler.ts` holds the logic (tested in Node), `index.ts` connects it to Supabase and the Claude API. |
| `functions/ai-dashboard.ts` | The same endpoint as one file, for pasting into Supabase's browser editor. Generated: run `node tools/bundle-ai.mjs` after changing `functions/ai/`. A test fails if it's out of date. |
| `../config.js` | The extension's pointer to this project: URL and anon key. Empty means Aim Free only. |
| `../plus.js` | The extension's side: sign-in, keeping the session fresh, calling the endpoint. |

## AI endpoint

`POST https://<project>.supabase.co/functions/v1/ai` with `Authorization: Bearer <user access token>` and a JSON body `{ "task": "...", "input": ... }`.

| Task | Plan | AI | Returns |
|---|---|---|---|
| `status` | any | no | `{ email, plan, usage: { calls, tokens }, limits }` for the last 24 hours |
| `check` | plus | yes | `{ reply: "ready" }`. A tiny call that proves the whole path works. |
| `teachback-start` | plus | yes | `{ session }`. Plans 2–4 objectives from `{ topic, notes? }` and asks the first question |
| `teachback-turn` | plus | yes | `{ session, hint? }`. `{ id, seq, action: "answer" \| "skip" \| "hint", answer? }`: evaluates the answer and picks the next question |
| `teachback-finish` | plus | yes | `{ session }` with `result`. `{ id, end? }`: statuses from the evidence, plus a written summary |
| `teachback-get` | plus | no | `{ session }`, to resume or reload |

Later steps add tasks (learning paths, curation) to the `TASKS` table in `handler.ts`. Each task builds its own prompt on the server, so the extension can't send arbitrary prompts on your key.

**Errors** are `{ ok: false, error: { code, message } }` with messages written for users: `auth` (401), `plan` (403), `limit` (429), `refusal` (422), `busy` (503), `upstream` (502), `too_large` (413), `task` / `bad_json` (400).

**Limits per user**, over rolling windows, set by secrets: 300 AI calls per 24 hours (`AIM_DAY_CALLS`), 400,000 tokens per 24 hours (`AIM_DAY_TOKENS`), 20 calls per minute (`AIM_MINUTE_CALLS`). Calls that fail still count, so retry loops can't run up a bill.

**Models:** `AIM_MODEL` (default `claude-opus-5-5`) plans sessions and writes results; `AIM_MODEL_FAST` (default `claude-haiku-5-5`) handles each answer and hint, where speed matters. TeachBack replies use structured JSON output. Requests use `effort: "low"` and server-side fallback (`fallbacks: "default"`): if the model declines a request for policy reasons, the API retries it on a fallback model. For cheaper Plus pricing, try a smaller model such as `claude-haiku-5-5` per task once real tasks exist, and check the results are good enough.

## Set it up

**New to this? Follow [docs/SETUP.md](../docs/SETUP.md) instead:** the same steps, explained one click at a time.

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

## Billing (Stripe)

`functions/ai/billing.ts` holds the logic; tests in `tests/ai.test.mjs`. Step by step: [docs/SETUP.md, Part 9](../docs/SETUP.md).

| Part | What it does |
|---|---|
| `migrations/0003_billing.sql` | `profiles` gains `stripe_customer_id`, `plan_status`, `plan_renews_at`, `plan_cancel_at_period_end`; `billing_events` records each Stripe event once. |
| `billing-checkout`, `billing-portal` (tasks on `ai`) | Return a Stripe Checkout page (a subscription to `STRIPE_PRICE_PLUS`, tied to the user) or the customer portal. Already Plus: Checkout returns the portal instead. Without Stripe secrets: 503, and `status` reports `billing.available: false`. |
| `functions/stripe-webhook/` (and `stripe-webhook-dashboard.ts`) | Stripe's webhook, deployed with JWT verification off. Checks the `Stripe-Signature` (HMAC-SHA256, five-minute tolerance), applies each event once: Checkout links the customer and sets Plus; subscription events set the plan (`active`, `trialing`, `past_due` → Plus; anything else → Free). GET serves the pages Checkout and the portal return to. |

Secrets: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_PLUS`. Card details never reach Aim's server.

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
# TeachBack tables, on a fresh database: an account that exists before 0002 must get a learner too
psql "$TEST_DB2" -v ON_ERROR_STOP=1 -f tests/db/stub.sql -f supabase/migrations/0001_init.sql \
  -c "insert into auth.users values ('00000000-0000-0000-0000-0000000000e1','e@example.com')" \
  -f supabase/migrations/0002_teachback.sql -f tests/db/test_teachback.sql
```
