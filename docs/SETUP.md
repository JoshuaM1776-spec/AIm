# Setting up the Aim Plus server, step by step

This connects Aim to your own Supabase project, so you can sign in to Aim and Aim can use Claude through your server. Aim Free doesn't need any of this.

- **Time:** about 45 minutes the first time.
- **Cost:** Supabase's free plan is enough for testing. Claude API usage is pay as you go; testing costs cents.
- **You'll need:** a Mac (Windows notes are included), Google Chrome, and the Aim **source** folder (unzip `aim-…-source.zip`). The source folder contains the `supabase` folder; the extension-only zip doesn't.

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
4. **Check:** open **Table Editor** in the sidebar. You should see two tables, `profiles` and `ai_usage`, both empty for now.

> If you ever use the Supabase command line's `supabase db push` later, it may try to run this file again. Since you ran it here, skip `db push` for this file.

## Part 4 — Turn on sign-in with an emailed code (in the browser)

1. **Check that email sign-in is on:** open **Authentication** (the people icon) → **Sign In / Providers** (in some layouts, **Providers**). Make sure **Email** is enabled. The defaults are fine; leave **Confirm email** on.
2. **Make the emails show a code instead of a link:** open **Authentication → Emails** (in some layouts, **Email Templates**).
   1. Open the **Magic Link** template.
   2. Set the **Subject** to `Your Aim sign-in code`.
   3. Replace the whole message body with:
      ```html
      <h2>Your Aim sign-in code</h2>
      <p>Enter this code in Aim: <strong>{{ .Token }}</strong></p>
      <p>It expires in an hour. If you didn't ask for it, you can ignore this email.</p>
      ```
   4. Choose **Save**.
   5. Do the same for the **Confirm signup** template. Brand-new accounts may get this one.
3. **Sending limit:** Supabase's built-in email sends only a few messages an hour and is meant for testing, so that's fine for now. Before real users, set up your own email sending under **Authentication → Emails → SMTP Settings**, for example with Resend, Postmark or Amazon SES. Each has a Supabase guide.

## Part 5 — Install the Supabase command-line tool (one time)

The server code is two files, so it's deployed with Supabase's command-line tool rather than the website editor.

**On a Mac:**

1. Open **Terminal**: press ⌘-Space, type `Terminal`, press Return.
2. If you don't have Homebrew yet, install it by pasting the command from **brew.sh** and pressing Return. Follow what it prints at the end; it may ask you to paste two more lines.
3. Install the Supabase tool:
   ```sh
   brew install supabase/tap/supabase
   ```
4. Check it worked:
   ```sh
   supabase --version
   ```
   It should print a version number.

**On Windows:** install Node.js (the LTS version) from **nodejs.org**. Then, in the steps below, type `npx supabase` wherever you see `supabase`.

## Part 6 — Send the key to your server, and deploy

Run these one at a time in Terminal.

1. **Go to the Aim source folder.** Type `cd ` (with a space), drag the unzipped Aim folder from Finder into the Terminal window, and press Return.
2. **Sign in:**
   ```sh
   supabase login
   ```
   A browser window opens. Approve it, then come back to Terminal.
3. **Connect this folder to your project.** Replace `YOUR-PROJECT-REF` with **#4**:
   ```sh
   supabase link --project-ref YOUR-PROJECT-REF
   ```
   If it asks for the database password, paste **#2**. Nothing appears as you paste; that's normal. Then press Return.
4. **Store the Claude key as a server secret.** Replace the key with **#1**:
   ```sh
   supabase secrets set ANTHROPIC_API_KEY=sk-ant-api03-PASTE-YOURS-HERE
   ```
   - **Optional: a cheaper model while testing.** The default is Claude Opus 5.5. For testing, a smaller model costs less:
     ```sh
     supabase secrets set AIM_MODEL=claude-haiku-5-5
     ```
   - **Clear the key from Terminal's history:** to keep the key out of the saved history, run `history -c` afterwards, or just close the Terminal window.
5. **Deploy the server function:**
   ```sh
   supabase functions deploy ai
   ```
   - It finishes with a line saying the function is deployed.
   - If it complains that Docker isn't running, use this instead:
     ```sh
     supabase functions deploy ai --use-api
     ```
6. **Check:** in the Supabase website, open **Edge Functions**. You should see `ai`.

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
   1. Enter your email and choose **Send code**.
   2. Check your inbox, and the spam folder, for "Your Aim sign-in code".
   3. Type the 6-digit code and choose **Sign in**.
   4. You should see your email and **Plan: Aim Free**.
3. **Give yourself Plus:** in Supabase, open **SQL Editor → New query**, paste this (with your email) and choose **Run**:
   ```sql
   update public.profiles set plan = 'plus'
   where id = (select id from auth.users where email = 'you@example.com');
   ```
4. **Check the AI:** reload Aim's settings page. It should now show **AI use, last 24 hours**. Choose **Check connection**; it should say **Connected. Aim's AI is ready.**
5. **Confirm it was recorded:** in **Table Editor → ai_usage**, there's now one row.

**That's it: accounts and AI are working end to end.**

## If something goes wrong

| What you see | What to do |
|---|---|
| No **Aim Plus** section in Settings | `config.js` is still empty, or the extension wasn't reloaded. Check both values, then press ↻ on `chrome://extensions`. |
| "Couldn't reach Aim's server" | Check the Project URL in `config.js`: it starts with `https://` and ends with `.supabase.co`, with no slash at the end. |
| No email arrives | Check spam. The built-in sender allows only a few emails an hour, so wait and try again, or set up SMTP (Part 4). |
| The email has a link, not a code | The template still uses the default text. Redo Part 4 for **Magic Link** and **Confirm signup**. |
| "That code didn't work" | Use the newest email's code; each new request replaces the old code. Codes expire after an hour. |
| "Too many tries" | Supabase allows one code per address per minute. Wait a minute. |
| Check connection: "The AI couldn't be reached" | Usually the Claude key or billing. In Supabase, open **Edge Functions → ai → Logs** for the reason. Re-run the `secrets set` step with a valid key, and check you have credit in the Claude Console. |
| Check connection: "This needs Aim Plus" | Part 8, step 3 didn't match your email. Check the spelling, run it again, and reload Settings. |
| "This origin isn't allowed" | You set `AIM_EXTENSION_ORIGINS` and the extension's ID changed. Loading the folder from a different place changes the ID. Remove the setting with `supabase secrets unset AIM_EXTENSION_ORIGINS`, or set it to the ID shown on `chrome://extensions`. |
| "Something went wrong" right after deploying | Open **Edge Functions → ai → Logs** and send me the error line. Logs never contain your keys. |

## Later, before real users

- **Email sending:** set up your own SMTP (Part 4).
- **Lock the server to the published extension:** when the Chrome Web Store gives Aim its permanent ID:
  ```sh
  supabase secrets set AIM_EXTENSION_ORIGINS=chrome-extension://THE-STORE-ID
  ```
- **Watch spending:** keep the Claude Console spend limit, and check usage now and then:
  ```sql
  select date_trunc('day', created_at) as day, count(*) as calls,
         sum(input_tokens + output_tokens) as tokens
  from ai_usage group by 1 order by 1 desc;
  ```
- **Privacy:** update `PRIVACY.md` and the store listing's privacy answers, as noted in both files, in the same release that ships a filled-in `config.js`.
