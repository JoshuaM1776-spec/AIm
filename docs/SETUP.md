# Setting up the Aim Plus server, step by step

This connects Aim to your own Supabase project, so you can sign in to Aim and Aim can use Claude through your server. Aim Free doesn't need any of this.

- **Time:** about 45 minutes the first time.
- **Cost:** Supabase's free plan is enough for testing. Claude API usage is pay as you go; testing costs cents.
- **You'll need:** a computer with Google Chrome, and the Aim **source** folder (unzip `aim-…-source.zip`). The source folder contains the `supabase` folder; the extension-only zip doesn't.

> **Keep these private, always:** your Claude API key, the Supabase **service_role** key (also called the secret key), and your database password. Never paste them into a chat, an email or the extension.
> **Safe to share:** the Supabase **Project URL** and the **anon** (public) key. They're designed to sit inside the extension.

Keep a note open as you go. You'll collect five things:

| # | What | Private? |
|---|---|---|
| 1 | Claude API key (`sk-ant-api03-…`) | **Yes** |
| 2 | Supabase database password | **Yes** |
| 3 | Supabase Project URL (`https://xxxx.supabase.co`) | No |
| 4 | Supabase project ref (the `xxxx` part of the URL) | No |
| 5 | Supabase anon public key (a long `eyJ…` string) | No |

---

## Part 1 — Get a Claude API key

1. Go to **platform.claude.com** (the Claude Console) and sign in, or create an account. It's separate from your claude.ai chat subscription.
2. **Add credit:**
   1. Open **Settings → Billing** and add a payment method with a small amount of credit (for example $5–10).
   2. Under **Limits**, set a monthly spend limit you're comfortable with. This is your safety net.
3. **Create the key:**
   1. Open **Settings → API keys** and choose **Create key**.
   2. Name it `aim-server`.
   3. Copy the key. It starts with `sk-ant-api03-`, and it's shown only once. Put it in your note as **#1**.
4. **Clean up:** while you're on that page, delete any key you don't recognize, or any you've pasted anywhere public.

## Part 2 — Create the Supabase project

1. Go to **supabase.com**, sign up (signing in with GitHub is fine) and choose **New project**.
2. **Fill in the project:**
   - **Name:** `aim`.
   - **Database password:** choose **Generate a password**, copy it and save it as **#2** (a password manager is ideal).
   - **Region:** the one closest to where most of your users will be.
3. Choose **Create new project** and wait a minute or two while it sets up.
4. **Collect the public details:** open **Project Settings** (the gear icon at the bottom left) → **API** (in newer layouts, **Data API** and **API Keys**). Copy:
   - **Project URL**, for example `https://abcdefghijklmnop.supabase.co` → **#3**. The part between `https://` and `.supabase.co` is your **project ref** → **#4**.
   - The **anon public** key → **#5**. If the page shows newer "publishable" and "secret" keys, look for the **Legacy API keys** tab and use the **anon public** key from there.
   - Don't copy the **service_role** or secret key anywhere. Aim's server gets it automatically.

## Part 3 — Create Aim's tables (in the browser)

1. In the left sidebar, open **SQL Editor** and choose **New query** (or the **+** button).
2. On your computer, open `supabase/migrations/0001_init.sql` from the Aim source folder in TextEdit (or any text editor). Select all, copy, and paste it into the query box.
3. Choose **Run**. You should see **Success. No rows returned**.
4. **Do the same for the second file,** `supabase/migrations/0002_teachback.sql`: open a **New query**, paste it, choose **Run**. It adds TeachBack's tables.
5. **Check:** open **Table Editor** in the sidebar. You should see `profiles`, `ai_usage`, `learners`, `assessments`, `assessment_turns` and `progress_events`.

> **Already did Part 3 before TeachBack existed?** Just run `0002_teachback.sql` now. It's safe on a project that already has accounts.

> If you ever use the Supabase command line's `supabase db push` later, it may try to run this file again. Since you ran it here, skip `db push` for this file.

## Part 4 — Let the sign-in email bring you back to Aim (in the browser)

Aim signs you in with the link in Supabase's standard sign-in email. Supabase needs to know it may send people back to Aim:

1. In Supabase, open **Authentication → URL Configuration**. In some layouts it's under **Authentication → Configuration**.
2. Under **Redirect URLs**, choose **Add URL** and enter exactly:
   ```
   chrome-extension://fdebaflkeabmcggljcjmchnepgddbplp/**
   ```
   That's Aim's ID in Chrome. It stays the same wherever you unzip Aim.
3. Choose **Save**. Leave **Site URL** as it is.
4. While you're in Authentication, check that the **Email** provider is enabled (**Sign In / Providers**). It is by default.

**How signing in works:** in Aim's Settings you enter your email and choose **Send sign-in email**. When it arrives:

- **On the same computer, with Chrome as your browser:** click the link. A page opens saying **You're signed in**, and you can close it.
- **If the link opens in Safari or another browser,** or you read email on your phone: don't click it. Copy the link instead (right-click or long-press → **Copy Link**), then paste it into Aim's Settings, in the box under the email, and choose **Sign in**.

Each link works once and expires after an hour. If one fails, choose **Send a new email**.

> **About codes and email templates.** Since mid-2026, new free Supabase projects can't edit their email templates unless they send email through their own provider (custom SMTP). That's why Aim uses the standard link email. Before real users, set up custom SMTP anyway (see [Custom email sending](#custom-email-sending-smtp-with-resend)): Supabase's built-in sender allows only a couple of emails an hour. Then you can also change the **Magic Link** and **Confirm signup** templates to show a 6-digit code (`{{ .Token }}`). Aim accepts codes too.

## Part 5 — Give the server your Claude key (in the browser)

1. In the Supabase sidebar, open **Edge Functions**, then the **Secrets** tab or link. In some layouts it's under **Project Settings → Edge Functions → Secrets**.
2. Add a secret:
   - **Name:** `ANTHROPIC_API_KEY` (exactly like that, all capitals).
   - **Value:** your Claude key, **#1**.
3. Choose **Save**. Supabase stores it encrypted, and only your server function can read it.
4. **Optional: a cheaper model while testing.** The default is Claude Opus 5.5. Add one more secret:
   - **Name:** `AIM_MODEL`
   - **Value:** `claude-haiku-5-5`

   You can delete this secret later to go back to the default.

## Part 6 — Put the server function online (in the browser)

1. In the Aim source folder, open `supabase/functions/ai-dashboard.ts` in TextEdit (on Windows, Notepad). It's the whole server in one file. Select all and copy.
2. **Create the function:** in Supabase, open **Edge Functions** and choose **Deploy a new function**, then **Via Editor**.
3. **Paste the code:** the editor opens with sample code. Delete all of it and paste the file you copied.
4. **Name it:** set the function name to exactly `ai`, in lowercase. The name field is usually at the bottom of the editor. Aim looks for a function with this name.
5. Choose **Deploy function** and wait until it says it's deployed, usually under a minute.
6. **Check:** **Edge Functions** now lists `ai`. Leave its settings as they are.

> **AIM_FREE_DAY_CALLS** (default 40), **AIM_FREE_DAY_TOKENS** (80,000) and **AIM_FREE_MINUTE_CALLS** (10) set the librarian allowance for free accounts, as optional secrets like the others.

> **Updating later:** when a new Aim version changes the server, open the `ai` function's **Code** tab, replace everything with the new `ai-dashboard.ts`, and choose **Deploy** again. Your secrets stay.

<details>
<summary>Alternative for later: the command line (needs Homebrew or Node.js)</summary>

If you ever have Supabase's command-line tool installed, from the Aim source folder:

```sh
supabase login
supabase link --project-ref YOUR-PROJECT-REF
supabase secrets set ANTHROPIC_API_KEY=sk-ant-api03-...
supabase functions deploy ai
```

This deploys the same code from `supabase/functions/ai/`.
</details>

## Part 7 — Point Aim at your project

Either:

- **Send me #3 (Project URL) and #5 (anon key).** Both are safe to share. I'll put them in `config.js` and send you a new build.

Or do it yourself:

1. Open `config.js` in the Aim folder with TextEdit.
2. Fill in the two values between the quotes:
   ```js
   self.AIM_PLUS = {
     supabaseUrl: "https://abcdefghijklmnop.supabase.co",
     supabaseAnonKey: "eyJ...your anon key..."
   };
   ```
3. Save the file. If TextEdit asks, keep it as plain text.

Then load or reload the extension:

1. Open `chrome://extensions` in Chrome.
2. Turn on **Developer mode** (top right).
3. Choose **Load unpacked** and pick the Aim folder. If Aim is already loaded, press its reload ↻ button.

## Part 8 — Test the whole thing

1. **Open Aim's settings:** right-click Aim's toolbar icon → **Options**. A new **Aim Plus** section should appear.
2. **Sign in:**
   1. Enter your email and choose **Send sign-in email**.
   2. Check your inbox, and the spam folder, for Supabase's email.
   3. Click its link in Chrome, or copy it and paste it into Settings (see Part 4).
   4. Settings shows your email and **Plan: Aim Free**.
3. **Give yourself Plus:** in Supabase, open **SQL Editor → New query**, paste this (with your email) and choose **Run**:
   ```sql
   update public.profiles set plan = 'plus'
   where id = (select id from auth.users where email = 'you@example.com');
   ```
4. **Check the AI:** reload Aim's settings page. It should now show **AI use, last 24 hours**. Choose **Check connection**; it should say **Connected. Aim's AI is ready.**
5. **Confirm it was recorded:** in **Table Editor → ai_usage**, there's now one row.

**That's it: accounts and AI are working end to end.**

## Custom email sending (SMTP) with Resend

This lifts Supabase's limit of a couple of emails an hour, and lets you edit the email templates to show a 6-digit code.

1. **Create a Resend account** at **resend.com**. The free plan is enough to start.
2. **Create an API key:** **API Keys → Create API key**. Name it `supabase`, choose **Sending access**, then **Add**. Copy the key (it starts with `re_`); it's shown once. Keep it private.
3. **Choose who the emails come from:**
   - **Testing only, sending to yourself:** you can use `onboarding@resend.dev`. Resend only delivers these to the email address you signed up to Resend with, so sign in to Aim with that address.
   - **For real users:** you need your own domain (about $10–15 a year from any registrar).
     1. In Resend, open **Domains → Add Domain**. Using a subdomain is tidy, for example `mail.yourdomain.com`.
     2. Resend shows a few DNS records. Add them at your domain registrar, then choose **Verify**. It can take from minutes to a few hours.
     3. Then use a sender like `aim@mail.yourdomain.com`.
4. **Fill in Supabase's SMTP settings:** in Supabase, open **Authentication → Emails → SMTP Settings** and turn on **Enable custom SMTP**. Fill in:

   | Field | Value |
   |---|---|
   | Sender email | `onboarding@resend.dev` for testing, or your own (step 3) |
   | Sender name | `Aim` |
   | Host | `smtp.resend.com` |
   | Port | `465` |
   | Username | `resend` |
   | Password | your Resend API key (`re_…`) |

   Choose **Save**.
5. **Raise the sending limit:** **Authentication → Rate Limits** now allows more emails an hour. The default with custom SMTP is fine to start.
6. **Optional: show a code in the email.** Templates are editable now. In **Authentication → Emails → Templates**, edit **Magic Link** and **Confirm signup**. This version shows a code and keeps the link:
   ```html
   <h2>Sign in to Aim</h2>
   <p>Enter this code in Aim: <strong>{{ .Token }}</strong></p>
   <p>Or click this link in Chrome on the computer where Aim is installed: <a href="{{ .ConfirmationURL }}">Sign in to Aim</a></p>
   <p>It expires in an hour. If you didn't ask for it, you can ignore this email.</p>
   ```
   Set the subject to `Your Aim sign-in code`. Aim accepts either the code or the link.
7. **Test it:** in Aim's Settings, choose **Send sign-in email**. The email should arrive within seconds, from your sender. If it doesn't:
   - check spam;
   - in Resend, open **Emails** (or **Logs**) for the reason;
   - check the API key and sender in step 4.

## If something goes wrong

| What you see | What to do |
|---|---|
| No **Aim Plus** section in Settings | `config.js` is still empty, or the extension wasn't reloaded. Check both values, then press ↻ on `chrome://extensions`. |
| "Couldn't reach Aim's server" | Check the Project URL in `config.js`: it starts with `https://` and ends with `.supabase.co`, with no slash at the end. |
| No email arrives | Check spam. The built-in sender allows only a few emails an hour, so wait and try again, or set up SMTP (Part 4). |
| Clicking the link shows "localhost refused to connect" | The redirect address from Part 4 is missing or mistyped, so Supabase fell back to its placeholder. Add it exactly as shown, then send a new email (that link was used up). |
| Clicking the link opens Safari or another browser | Copy the link instead of clicking it, and paste it into Aim's Settings. |
| "That link has expired or was already used" | Each link works once, for an hour. Send a new email. |
| "That code didn't work" | Use the newest email; each new request replaces the old one. Links and codes expire after an hour. |
| "Too many tries" | Supabase allows one email per address per minute, and its built-in sender only a couple an hour. Wait, then try again. |
| Check connection: "The AI couldn't be reached" | Usually the Claude key or billing. In Supabase, open **Edge Functions → ai → Logs** for the reason. Check the `ANTHROPIC_API_KEY` secret (Part 5) holds a valid key, and that you have credit in the Claude Console. |
| Check connection: "This needs Aim Plus" | Part 8, step 3 didn't match your email. Check the spelling, run it again, and reload Settings. |
| "This origin isn't allowed" | You set `AIM_EXTENSION_ORIGINS` and the extension's ID changed. Loading the folder from a different place changes the ID. Delete that secret in **Edge Functions → Secrets**, or set it to the ID shown on `chrome://extensions`. |
| "Something went wrong" right after deploying | Open **Edge Functions → ai → Logs** and send me the error line. Logs never contain your keys. |
| Check connection fails, and the logs (or the error) mention **Invalid JWT** | Open **Edge Functions → ai → Details** and turn off **Verify JWT** (sometimes "Enforce JWT verification"), then save. Aim's code checks the sign-in itself, so this is safe. Newer Supabase projects sometimes need it. |
| The editor won't deploy and shows a red error | Make sure you pasted the **whole** file: it starts with `// GENERATED` and ends with `});`. Paste it again and redeploy. |

## Part 9 — Take payments for Aim Plus (Stripe)

Until this is done, Plus is given by hand: in Supabase's **Table Editor**, open `profiles` and set someone's `plan` to `plus`. Settings says subscriptions aren't available yet. When you're ready to charge:

1. **Add billing's tables:** in Supabase, open **SQL Editor** → **New query**, paste all of `supabase/migrations/0003_billing.sql`, and choose **Run**.
2. **Create the product in Stripe** ([dashboard.stripe.com](https://dashboard.stripe.com), in **Test mode** first): **Product catalog** → **Add product**, name it "Aim Plus", and add a **recurring** price (monthly, yearly or both; the price is your decision). Open the price and copy its **Price ID** (starts with `price_`).
3. **Put the webhook function online:** in Supabase, **Edge Functions** → **Deploy a new function** → **Via Editor**. Paste all of `supabase/functions/stripe-webhook-dashboard.ts`, name it exactly `stripe-webhook`, and deploy. Then open its **Details** and turn **Verify JWT** (or "Enforce JWT verification") **off**: Stripe can't sign in to your project, so this function checks Stripe's signature on every request instead.
4. **Tell Stripe where to send events:** in Stripe, **Developers** → **Webhooks** → **Add endpoint**. The URL is `https://YOUR-PROJECT-REF.supabase.co/functions/v1/stripe-webhook`. Select these events: `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`. Save, then reveal and copy the **Signing secret** (starts with `whsec_`).
5. **Give the server the Stripe secrets:** in Supabase, **Edge Functions** → **Secrets**, add three. Type them there yourself; never paste them into a chat or a file.
   - `STRIPE_SECRET_KEY`: from Stripe **Developers** → **API keys** → **Secret key** (`sk_test_…` in test mode)
   - `STRIPE_WEBHOOK_SECRET`: the `whsec_…` from step 4
   - `STRIPE_PRICE_PLUS`: the `price_…` from step 2
6. **Let people manage their subscription:** in Stripe, **Settings** → **Billing** → **Customer portal**: turn on canceling and updating payment methods, and save.
7. **Update the `ai` function** with the current `ai-dashboard.ts` (Part 6, "Updating later").
8. **Test it:** in Aim's Settings, signed in on a Free account, choose **Upgrade to Plus**. Pay with Stripe's test card `4242 4242 4242 4242`, any future date, any CVC. Back in Settings, the plan says Aim Plus with a renewal date, and **Manage subscription** opens Stripe's portal; cancel there and the plan goes back to Free when the period ends.
9. **Going live:** repeat steps 2, 4 and 5 in Stripe's live mode (a live price, a live webhook endpoint, the live secret key and signing secret), replacing the test values.

## Part 10 — Sync across devices (Aim Plus)

1. **Add sync's table:** in Supabase, **SQL Editor** → **New query**, paste all of `supabase/migrations/0004_sync.sql`, and choose **Run**.
2. **Update the `ai` function** with the current `ai-dashboard.ts` (Part 6, "Updating later").
3. **Test it:** sign in to the same Plus account in two Chrome profiles, turn on **Sync across devices** in Settings → Aim Plus in both, and set an aim aside in one. **Sync now** in the other shows it under Set aside on the aims page.

## Part 11 — Aim Homeschool: the parent website (pilot)

**Read first.** This puts children's learning data (their name, levels, plans and progress) on Aim's server. Before real families use it: the privacy and legal design for children (COPPA and equivalents), the curriculum-upload terms and takedown process, and a lawyer's review (docs/HOMESCHOOL.md → "Bring your own curriculum"). Until then, use it with your own family or a few test families who know it's a pilot.

1. **Add Homeschool's tables:** in Supabase, **SQL Editor** → **New query**, paste all of `supabase/migrations/0005_homeschool.sql`, and choose **Run**.
2. **Let students' browsers connect without an email:** **Authentication** → **Sign In / Providers** (or **Settings**) → turn on **Allow anonymous sign-ins**. Each student's Chrome becomes an anonymous account tied to the student by the parent's one-time code.
3. **Put the website online.** The `web/` folder is plain files; any static host works (Cloudflare Pages, Netlify, GitHub Pages). First fill in `web/config.js` with the same two values as the extension's `config.js` (Part 7). Then upload the whole `web/` folder. Note its address, like `https://family.example.com`.
4. **Let the website call Aim's server:** in **Edge Functions** → **Secrets**, add `AIM_WEB_ORIGINS` with the website's address (no trailing slash; several separated by commas).
5. **Let the sign-in email come back to the website:** **Authentication** → **URL Configuration** → **Redirect URLs** → add the website's address.
6. **Update the `ai` function** with the current `ai-dashboard.ts` (Part 6, "Updating later").
7. **Turn Homeschool on for an account:** in **Table Editor** → `profiles`, set the parent's `plan` to `homeschool`. (Homeschool includes everything in Plus. Billing for it is a later step: it needs its own Stripe price.)
8. **Test it:** sign in on the website and go through setup; add a curriculum you have the right to use; approve the big picture and a week; connect a student's Chrome with the code (Aim's Settings → "A student? Connect to my family"); YouTube's homepage shows Today with that day's lessons.

## Later, before real users

- **Email sending:** set up your own SMTP (Part 4).
- **Lock the server to the published extension:** when the Chrome Web Store gives Aim its permanent ID, add a secret named `AIM_EXTENSION_ORIGINS` with the value `chrome-extension://THE-STORE-ID`.
- **Watch spending:** keep the Claude Console spend limit, and check usage now and then:
  ```sql
  select date_trunc('day', created_at) as day, count(*) as calls,
         sum(input_tokens + output_tokens) as tokens
  from ai_usage group by 1 order by 1 desc;
  ```
- **Privacy:** update `PRIVACY.md` and the store listing's privacy answers, as noted in both files, in the same release that ships a filled-in `config.js`.
