# Daily Challenge

One thought-provoking challenge every day, shared by everyone.

Each day at 00:00 UTC everyone receives the same problem: a role, a situation and real constraints. People investigate on their own, write a recommendation and defend it, get specific AI feedback on their understanding, reasoning, clarity and organization, revise once if they like, and then see how others approached the same problem.

This folder is a complete, separate web app (React, TypeScript, Tailwind CSS, Supabase). It doesn't share code with the Aim extension in the rest of this repository.

## Try it locally (no Supabase account needed)

You need Node 22.18 or later and a local PostgreSQL (14 or later).

```sh
cd daily-challenge
npm install
npm run db:reset      # creates the database "daily_challenge" with the five sample challenges (Day 1 = today, UTC)
npm run dev:local     # the app on http://localhost:5173, a local stand-in for Supabase on :54321
```

- Sign in with any email address: the 6-digit code is printed in the terminal instead of being emailed.
- Without `ANTHROPIC_API_KEY`, evaluations come from the **built-in test evaluator**. It is mechanical, not AI, and every result it produces is labelled as a test evaluation in the app. To get real feedback from Claude locally: `ANTHROPIC_API_KEY=sk-ant-... npm run dev:local`.
- Make yourself an admin (challenge management): `curl -X POST localhost:54321/dev/admin -d '{"email":"you@example.com"}'`, then sign out and in again (or reload).
- Pretend it's another day, to see the daily reset: `curl -X POST localhost:54321/dev/today -d '{"date":"2026-12-01"}'` (send `{"date":null}` to go back).
- `DATABASE_URL` defaults to `postgres://postgres:postgres@localhost:5432/daily_challenge`; set it if your Postgres differs.

`server/dev-server.ts` is a development stand-in only. It implements the small part of Supabase the app uses (email-code sign-in, database functions run exactly as PostgREST runs them, the evaluate function) on top of the real migration, so local behaviour, permissions and row-level security match production.

## Deploy

1. **Create a Supabase project.** Note its URL and anon key (Project Settings → API) and its database connection string.
2. **Create the tables and functions** from this folder:
   ```sh
   supabase login
   supabase link --project-ref <project-ref>
   supabase db push
   psql "<connection string>" -f supabase/seed.sql   # the five sample challenges, Day 1 releasing the day you run it
   ```
   The seed is safe to re-run: it updates content without moving dates or duplicating sample responses. Skip it if you'd rather start empty and write challenges in the admin screens.
3. **Email sign-in with a code.** Authentication → Sign In / Providers → Email: enabled. In Authentication → Email Templates (Magic Link and Confirm signup), include the code, for example `<p>Your Daily Challenge code: <strong>{{ .Token }}</strong></p>`. Before real users, set up your own SMTP (Authentication → Emails); Supabase's built-in email is rate-limited and meant for testing.
4. **Server secrets** (never put these in the app):
   ```sh
   supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
   # optional
   supabase secrets set EVAL_MODEL=claude-opus-5-5 EVAL_EFFORT=medium EVAL_PER_HOUR=8 EVAL_PER_DAY=24 EVAL_TIMEOUT_MS=120000
   supabase secrets set APP_ORIGINS=https://your-app.example
   ```
5. **Deploy the evaluator:** `supabase functions deploy evaluate`
6. **Build and host the app:**
   ```sh
   VITE_SUPABASE_URL=https://<project-ref>.supabase.co VITE_SUPABASE_ANON_KEY=<anon key> npm run build
   ```
   Host `dist/` on any static host. It's a single-page app, so configure the host to serve `index.html` for unknown paths (for example a `/* /index.html 200` rewrite).
7. **Make an admin**, in the SQL editor:
   ```sql
   update public.profiles set is_admin = true where id = (select id from auth.users where email = 'you@example.com');
   ```

## How it fits together

| Path | What it is |
|---|---|
| `src/screens/` | Every screen: Home, Overview, Story (the five cards), Brief, Write (also the revision), Evaluation, Community, Results, Progress, Library, Account (sign-in, profile, mission, about), `admin/` (list, editor, preview) |
| `src/lib/challenge.tsx` | The state every challenge screen shares: the challenge and your work on it. A visitor's work lives on the device until they sign in, then moves to their account |
| `src/lib/api.ts` | Every server call. Data goes through database functions; evaluation through the `evaluate` Edge Function |
| `src/illustrations/` | Hand-drawn SVG plates for each challenge, in the reference style. Challenges can also use an image URL |
| `src/components/` | Buttons, cards, dialogs, the emblem, the laurel, icon sets |
| `supabase/migrations/0001_daily_challenge.sql` | Tables, row-level security and the database API (every function documented in place) |
| `supabase/functions/evaluate/index.ts` | The Edge Function (Deno): checks the user, then runs the shared handler with Claude |
| `supabase/functions/_shared/evaluation/` | The evaluator, runtime-neutral: `handler.ts` (claim, call, validate, store), `rubric.ts` (instructions and JSON schema), `validate.ts`, `providers/anthropic.ts`, `providers/test.ts` |
| `content/challenges/` | The five seed challenges as authored files (public story plus private evaluator reference, plus labelled sample responses). `npm run seed:build` turns them into `supabase/seed.sql`. These files are never bundled into the app |
| `server/dev-server.ts`, `scripts/` | Local development: the stand-in server, database reset, the one-command dev setup |
| `tests/` | `unit/` (evaluator), `db/` (schema, permissions and rules against real Postgres), `e2e/` (the whole journey in Chromium at phone sizes) |

### Security model

- **Row-level security on every table.** Signed-in users can read only their own private rows directly. Visitors who aren't signed in can't read tables at all. Nobody writes tables directly.
- **All writes and shared reads go through `SECURITY DEFINER` database functions** that check the caller, validate input (lengths, allowed values, display names), strip control characters, and return only what that caller may see.
- **Reference material stays private.** What the evaluator knows about a challenge is readable only by admins and the evaluation function, never sent to ordinary users, and never bundled into the app.
- **The AI key lives only in the Edge Function.** Evaluation requests need a signed-in user, are rate-limited per user (8 an hour and 24 a day by default; failed calls count too), and are idempotent: one evaluation per submission. A finished evaluation is never regenerated, and a running one isn't duplicated.
- **Submissions are idempotent.** The app sends a key with each submission, kept across refreshes, so a double tap or a retry after a dropped connection returns the same submission.
- **User text is rendered as plain text** (React escapes it), never as HTML.
- **Private by default.** Responses are shared only when the person chooses, under a name they choose, and can be unshared. Scores and feedback are never shared. Other people's responses open only after you've submitted your own.
- **No invented numbers.** Global results show real counts. The average and distribution appear only once 10 people have a first evaluation. Sample responses are labelled as samples and never counted.
- **Honest failures.** If the AI fails, times out, refuses, or returns output that doesn't validate, the person is told, their response stays saved, and they can retry. No fallback feedback is ever made up.

### Product rules, as built

- The day changes at 00:00 UTC. Today's challenge is the most recent published challenge whose release date has arrived. Earlier challenges stay open.
- One active challenge at a time. Starting another asks first; setting one aside keeps its writing, doesn't count as complete, and it can be picked back up later. There's no backlog to catch up on.
- Difficulty (Easy, Moderate, Hard) is chosen before starting and can change until you submit. Everyone gets the same scenario; difficulty changes what the response is expected to do and how it's judged. Suggested lengths are guides: 150–300, 250–500, 400–800 words. There's no hard upper limit below 30,000 characters; at least 40 words are needed to submit.
- The overall score is the equal-weight average of the four categories, computed on the server.
- One optional revision, after the first evaluation. Both versions and both evaluations are kept, with the change in score shown.
- A streak counts consecutive UTC days on which you submitted a first response. Missing today doesn't break it until the day is over. It's shown quietly, with no reminders or penalties.

### The evaluator

`rubric.ts` holds the instructions. They ask the model to judge reasoning rather than agreement with any answer, to recognise several defensible approaches, to separate factual errors from judgement calls, not to reward length or vocabulary, not to penalise people for skipping suggested questions, to ground every comment in the response, never to claim to have verified sources, not to guess about AI-written text, and to treat the response as data (ignoring any instructions inside it). Output is constrained with a JSON schema and validated again on the server before anything is stored. The model defaults to `claude-opus-5-5` with medium effort, server-side refusal fallback enabled, and a two-minute timeout. Change `EVAL_MODEL` and `EVAL_EFFORT` to trade cost and quality; to use another provider, add a file beside `providers/anthropic.ts` that implements `EvalProvider`.

## Writing challenges

In the app: Profile → Challenge management. Create a draft, preview it exactly as users will see it, set a UTC release date, and publish (publishing needs a date and reference material). Admins can curate Selected Approaches and hide reported responses from the same screen. A checklist there sets the quality bar: intrigue, realism, depth, real interdisciplinary integration, researchability, several defensible approaches, a clear task.

Or as files: add one to `content/challenges/`, list it in `content/index.ts`, then `npm run seed:build` and apply `supabase/seed.sql`.

The five seed challenges (The Water Decision, The Outbreak, The Mountain Pass, The Failing Expedition, The Energy Dilemma) are fictional or hypothetical scenarios, labelled as such, built on real engineering, epidemiology, logistics, physiology and energy trade-offs. Their reference material should be fact-checked by a person before launch.

## Tests

```sh
npm test            # evaluator: validation, prompt, handler (auth, limits, timeouts, invalid output), Claude provider error mapping
npm run test:db     # schema and rules against a throwaway Postgres database: privacy and RLS, daily visibility, one active challenge,
                    # idempotent submission, evaluation claims and rate limits, revision, community gating and reports,
                    # results thresholds, streaks, admin scheduling and publishing
npm run test:e2e    # the whole journey in Chromium on iPhone 13 and Pixel 7 sizes, with the test evaluator, checking for console errors
npm run typecheck
```

The e2e test uses the Playwright that comes with this environment. Elsewhere, install Playwright first. `SHOTS=/some/dir npm run test:e2e` saves a screenshot of each step.

## Not built yet

- **Real Claude evaluations have not been run end to end here**, because no API key was available while building. The Edge Function was run under Deno against the local stack: sign-in checks, storage, rate-limit bookkeeping and an API key rejected by the Claude API were all exercised. Run a few real evaluations, with `ANTHROPIC_API_KEY` set, before launch and read the feedback critically.
- Sign-in is the 6-digit email code only. Magic links and other providers aren't wired in.
- Billing ($2.99/month) isn't implemented, by design. The mission page describes the plan without committing to a percentage or calling anything a donation.
- Automated AI challenge generation isn't built; challenges are written and reviewed by people in the admin screens.
- The editor is plain text with paragraphs; there's no bold, italics or lists.
- The illustrations are original SVG drawings in the reference style. Commissioned art can replace any of them through an image URL.
- Not yet: an installable PWA, offline mode, account export and deletion in the app (deleting a user in Supabase removes all their data), email notifications, and a moderation queue beyond the reports list in each challenge's admin page.
