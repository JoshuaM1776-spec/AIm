# Aim

Use YouTube on purpose without blocking what's useful. Your search becomes your purpose, Aim keeps you on it, and breaks are a deliberate choice with a daily allowance, all styled to feel like part of YouTube.

Chrome extension, Manifest V3, no build step.

## Load it

`chrome://extensions` → Developer mode → **Load unpacked** → this folder. Nothing to set up: Aim Free uses no AI, needs no account or key, and talks to no server. Everything stays in your browser.

**Aim Plus** (in progress) adds an optional account and AI through Aim's own server. It stays switched off until `config.js` names that server; see [supabase/README.md](supabase/README.md).

## The parent website (Aim Homeschool)

`web/` is the parents' side of Aim Homeschool: plain HTML and JavaScript (no build), hosted anywhere, talking to the same Supabase project. Setup is in docs/SETUP.md Part 11; the design is docs/PARENT_WEBSITE.md.

| File | What it does |
|---|---|
| `web/index.html`, `web/app.css` | The page shell, navigation and look (colors and type from `shared/tokens.css`) |
| `web/config.js` | Where Aim's server is (same values as the extension's `config.js`) |
| `web/api.js` | Sign-in (emailed code or link) and calls to Aim's server |
| `web/ui.js` | Small helpers, the family's data, suggested channels per subject |
| `web/app.js` | Routing, Overview ("Needs your attention"), Settings, and the seven-step setup |
| `web/curriculum.js` | The big picture: the family's own curriculum organized, edited, warned about, approved |
| `web/week.js` | The weekly plan: proposed, edited or changed in plain words, gaps decided, approved as a week |
| `web/projects.js`, `web/progress.js` | Projects & Materials (four weeks ahead, one shopping list) and Progress (the four words, from evidence) |
| `web/shared/` | Copies of the extension's colors, fonts, mark, channel list and file reader. `node tools/build-web.mjs` refreshes them. |

On the server, `supabase/functions/ai/homeschool.ts` holds every rule (approval, gaps, pairing, what the student may see); migration `0005_homeschool.sql` the tables. In the extension, a student's browser connects in Settings ("A student? Connect to my family"), and `saveFamilyPlan` in `store.js` turns the approved day into Today.

## How it fits together

| File | Role |
|---|---|
| `manifest.json` | Extension manifest |
| `background.js` | Service worker. **The only writer of stored data**: the popup, settings page and YouTube tabs send it messages. |
| `store.js` | Purposes, breaks, limits, time tracking, settings, channels and migrations, loaded only by the service worker. Changes run one at a time through `serial()`. |
| `content/` | Everything on youtube.com, loaded in the order listed in `manifest.json`. The files share one scope in the extension's isolated world. |
| `content/early.js` | Runs at document_start: hides the homepage feed and holds videos until the rest of Aim has loaded, so nothing flashes. |
| `content/core.js` | Shared state, messaging to the background, the `el()` DOM helper, icons |
| `content/youtube.js` | **Every YouTube selector and page reader.** When YouTube changes its markup, fix it here (plus the feed rules in `content.css`). |
| `content/ui.js` | Menus, dialogs, notices, toasts |
| `content/gate.js` | Holds each new video and decides: plays on a break, is checked against a purpose, or shows the choice card on the player |
| `content/session.js` | The indicator and its menu, set / change purpose, time limit, Done and the reflection |
| `content/focus.js` | Fewer distractions when you're not on a break: page classes for the CSS, YouTube's autoplay switch, the feed note, the Shorts card |
| `content/search.js` | Search results: a search becomes the purpose, the word check on later searches, capturing results the purpose allows |
| `content/upnext.js` | "Up next from your search" in the watch page's sidebar |
| `content/home.js`, `channels.js` | Homepage card, hidden/warned channels |
| `content/librarian.js` | The librarian for signed-in accounts: requests vs plain searches, the results bar's note/choices/ask box, and the picks above YouTube's results |
| `content/plan.js` | Aim Homeschool: the student's Today screen on YouTube's homepage, and the day's plan beside a lesson's video (sample plan for now, turned on in Settings → Advanced) |
| `content/onboarding.js` | First-time help on YouTube: one-time tips (the homepage box, then the Aim button) and the Homeschool student's spotlight tour of Today |
| `content/pathways.js` | Pathways on YouTube: "Want more of this?", "Where could this take me?" and the occasional theme offer |
| `content/video.js` | "In this video" (Aim Plus): beside a video watched for a learning aim, the concepts it covers (from its title, description and chapters), chapter jumps, "See it in another context", and "Test me on this video" when it ends |
| `content/relax.js` | "Relax with a theme": a break with something you'd enjoy in mind (from a relax request to the librarian), with a slim bar on its results and "More on <theme>" beside each video |
| `content/filetext.js` | Reads a study guide file (.txt, .docx, .pdf) in the browser for a study session (Aim Plus) |
| `content/topics.js` | Explore: the subjects and their hand-picked channels (also loaded by Settings and the designer) |
| `content/learn.js` | Explore: about twelve picks worth learning from (your interests, or a bit of everything, plus four from subjects you haven't picked), from hand-picked channels' public feeds or pages, cached a day; Go deeper turns exploring into an aim |
| `content/shorts.js` | Shorts from your topics: the Quick review row, matched to what you've learned, and which Shorts may play |
| `content/channels.js` | Your channels on YouTube: Learn from (a "Your channel" badge; the librarian puts them first), For breaks (asks on an aim), Keep out (Hide or Ask first) |
| `content/subs.js` | Reads your subscriptions on youtube.com/feed/channels (scrolling for the rest) for the Your channels page |
| `content/notes.js` | Notes on an aim (Aim menu, or the notes icon in the results bar), saved as you type, with "Suggest questions" when signed in |
| `content/study.js` | Study sessions on YouTube: the offer, the planning dialog, the topic header on results, the plan in the watch page's sidebar |
| `study.html/js` | A study session's overview and summary |
| `content/understanding.js` | Your understanding: a learning aim's map (parts and how far you've got), what's worth exploring next, and Put it together, the finish line |
| `content/captions.js` | Aim Plus, preview: a video's captions, read in the browser only when the librarian needs them, and the excerpt sent with a conversation or "In this video" |
| `content/talk.js` | Talking a session through with the librarian: the question in the card after Done, the Explore invitation, "This connects to…" while watching, Talk it through in the menu, and the small conversation panel |
| `content/main.js` | Timer ticks, sync with other tabs, navigation, startup. Loads last. |
| `content/content.css` | Styles for all of the above |
| `popup.html/js` | Toolbar popup |
| `record.html/js` | The learning record: totals, then each aim with its time, videos, study checks and projects; printable |
| `channels.html/js` | Your channels: subscriptions sorted into Not sorted, Learn from (with your own topics), For breaks and Keep out, by tap or drag, with suggestions |
| `targets.html/js` | All aims: current, set aside (Resume, Remove) and completed (Start again) |
| `aim.css` | The shared look for all of Aim's own pages (see Design) |
| `tokens.css` | Aim's fonts and colors, from the mark (used by `aim.css` and the popup) |
| `fonts/` | Inter and Inter Display, Latin subsets (SIL Open Font License) |
| `design.html/js` | Design your YouTube: three stages (Home, Shorts, Watching) with a live preview drawn from your own topics' videos, click the preview to change that part, then a before-and-after and one Apply. The welcome tour invites you here; Settings links to each stage. |
| `options.html/js` | Settings page (everything, including the finer details the designer leaves out) |
| `welcome.html/js` | The welcome tour: opens once on install (what Aim is, how it works, a few choices, pin it), and from Settings → "Show the welcome tour again" |
| `config.js`, `plus.js` | Aim Plus in the service worker: where the server is (empty = Free only), sign-in with an emailed code, calling Aim's AI endpoint. Only Aim's own pages can use it, never YouTube tabs. |
| `plus.html`, `plus-home.js` | The Aim Plus page: what each Plus feature does, with a button to use it once you have Plus; the welcome page after subscribing |
| `sync.js` | Aim Plus sync across devices, in the service worker: sends what changed in this browser, merges what changed in others (off until turned on in Settings) |
| `options-plus.js` | The Aim Plus section of Settings (hidden until `config.js` is filled in) |
| `signin.html/js` | Where the link in the sign-in email lands. It hands the session to the worker, which accepts it only for a sign-in this browser started. |
| `pathways.html/js` | Pathways (Aim Plus): themes from what you've explored, work connected to an interest, and a path's four steps (See it, Try it, Meet it, Prepare for it) with reflections |
| `pathways-ui.js` | "Want more of this?" and "Where could this take me?" for Aim's own pages (TeachBack, study sessions) |
| `teachback.html/js` | TeachBack, Aim Plus's conversational check of what you can explain |
| `supabase/` | The Aim Plus server: database tables and the AI endpoint. Not part of the extension package. |
| `tests/` | Automated tests (see TESTING.md) |

## Product rules

**Wording:** the interface calls the active objective an **aim** (Set aim, Your aim, Change my aim, Done with this aim, Back to my aim), and keeps natural phrasing where it reads better ("What brings you here?"). Code and stored data still say `purpose`; that's deliberate, to avoid a data migration for a wording change.

Aim doesn't block or alter YouTube's ads, and stays compatible with ad blockers people install separately.

- **Two states, nothing in between.** A **purpose** (why you're on YouTube right now) or a **break** (free browsing). With neither, Aim asks before a video plays: set a purpose, or take a break (15 / 30 / 60 min, or just this video).
- **Your search becomes your purpose.** Later searches that share a meaningful word with it continue silently; others ask once, "Is this part of your purpose?". Changing purpose is deliberate and keeps your searches, videos and time limit.
- **On purpose, you watch what your searches found:** their results, playlists among them, and the video you set the purpose from. Anything else shows "Not part of your purpose": go back, search, change purpose or take a break. The sidebar shows **Up next from your search** instead of YouTube's recommendations. No AI is involved.
- **Picking up where you left off.** An aim is active, set aside, or completed. **Change my aim** and **Set aside for later** keep the old aim, with its searches, the videos they found and where you were in the last video. The homepage shows the current aim and the two most recent set-aside ones under "Pick up where you left off"; **View all aims** lists every one. **Resume** returns to the last video at the moment you left it, or else the last search, and never starts anything else (no AI). Completed aims can be started again. More searches on the same aim never create new aims.
- **The librarian** (signed-in accounts): Aim's search box takes requests as well as searches. A plain search ("sourdough starter") goes straight to YouTube. A request or goal ("I need to replace the alternator on my 2014 Tacoma") goes to the librarian, which writes better YouTube searches, adds a one- or two-sentence note, and at most one question shown as choices; on the results page it groups the best of YouTube's results with a reason for each. It never answers questions itself or blocks videos, and if it can't help, the search goes to YouTube as typed. Its memory of an aim stays in the browser. Signed out, Aim uses no AI.
- **Talking it through** (signed-in accounts; free ones once a day): the librarian is also a curious friend. When you finish an aim, the card after Done asks one specific question about the session ("You watched two takes on why the Republic fell. If you had to bet on one cause, which would it be?"), never "what did you learn?". It knows the aim, searches, video titles and time, and notes (with Aim Plus and captions turned on, also excerpts of what was said), so it asks for your take, not a quiz on details. Explore gets one question and a closing remark; Focus up to three. With Aim Plus it also invites a conversation after a long stretch of exploring (paced, and backing off after Maybe later), remembers what you explained (in the browser; Settings lists and forgets it), says when a later video connects to it, and in a study session its read of each topic becomes the topic's check. The rules live in `supabase/functions/ai/talk.ts`.
- **Study sessions** (Aim Plus): on a learning goal, the librarian offers "Organize a study session". Aim breaks the aim into a few topics in order (following a pasted study guide if there is one), the librarian picks videos for each from YouTube's results, the watch page's sidebar shows the plan (brief, videos, Check yourself, Next topic), and TeachBack checks each topic. A summary page shows what was watched, checked and worth reviewing. The plan lives with the aim in the browser.
- **Purposes have no time limit** unless you set one. **Done** ends a purpose and asks once whether you found what you needed.
- **Breaks** share a **daily leisure allowance** (default 1 hour), a hard stop. A purpose waits during a break and resumes after it.
- **Optional daily YouTube limit**, also a hard stop until midnight.
- **When time runs out mid-video**, that video may finish within the grace period (default 15 min, adjustable 0 to 30).
- Time counts while a video plays or while you're looking at YouTube. Several open tabs never count the same moment twice.
- **Fewer distractions whenever you're not on a break:** Shorts, recommendations and end screens, the subscriptions and trending feeds are hidden, and YouTube's autoplay is switched off (and back on during breaks). Each can be turned off under Advanced.
- **Channels** (optional): Hide removes a channel from feeds, results and the sidebar. Warn asks before you watch it outside a purpose.

## Design

YouTube helps you find something to watch. Aim helps you find what you need. Aim should feel like it belongs inside YouTube, with calm, polished moments of decision:

- **Colors on YouTube** come from YouTube's own theme variables (`--yt-spec-*`) in `content/content.css`, so Aim's cards follow YouTube's light and dark themes exactly. On top of that, Aim's brand: main buttons, selected chips and the home screen's arrow are forest green (`--wp-primary`, cream in the dark theme), headlines use Inter Display, Homeschool's accent is the learning green (`--wp-hs`), and Aim coral (`--wp-accent`, #d93b2b) marks only the one way back to your aim (Continue, Resume, Back to my aim) and the time ring. Use `.wp-btn-accent` only for that "back to it" action.
- **Homepage:** a conversation, not a search box. "What brings you here?", one rounded field ("Tell me what you're looking for…") with a small arrow inside it (Enter works too), example requests said the way you'd ask a librarian, then at most one current and two recent aims to pick up. The current aim leads with its last video (thumbnail, where you stopped, a coral progress line) and **See more** for its other videos; each recent aim shows its last video small. Only videos you chose for that aim, never suggestions, and nothing plays on hover.
- **Results:** a compact one-row aim indicator above YouTube's results: the aim, a small Change action, a done check, and (signed in) a librarian icon. The librarian stays folded away unless it has something new to say about this search. Time left shows only when you set a limit. The videos stay the main event.
- **Popup:** about the current aim: Resume, Take a Break, Done, with Change my aim, Set aside and All aims as small links. It shows time so far, or time left only when you set a limit. Activity is folded under "Your activity"; Daily limits and Settings are secondary.
- **Shapes:** 16px-radius dialogs and cards with a centered brand line and a close button when dismissible, full-width buttons for the main decision, segmented choices (Take a Break) and a green check for Done with this aim.
- **Placement:** the Aim button sits beside YouTube's search box on wide windows (1200px+) and beside the Create button otherwise.
- **Behavior:** Escape or a click outside closes menus and dialogs, except prompts that are holding a video for your decision.
- **Aim's own pages** (Settings, aims, TeachBack, study sessions, Pathways, the welcome tour, sign-in) all use `aim.css`, and its fonts and colors come from `tokens.css` (the popup uses `tokens.css` too). The look follows the mark: warm parchment pages with cream cards, green-black text, forest-green main buttons and switches, coral only for getting back to your aim, and a learning green for Homeschool and Pathways details; in dark mode, deep green-black with cream buttons. Type is Inter, with Inter Display for headings and the name; `fonts/` holds Latin subsets (SIL Open Font License, `fonts/OFL.txt`), and `InterDisplay-Bold` is web-accessible so YouTube pages can use it for headlines. Every page has the same header (mark, "Aim", the page's name). A page adds only what's truly its own in a small `<style>`.
- **Never** use YouTube's logo, icons, artwork or code. Aim's name and mark appear on every card, so nothing reads as YouTube's own feature.

## Rebranding

The name is Aim. It lives in one place, so it's easy to change if it ever has to:

- **Name and descriptions:** `name`, `description` and `action.default_title` in `manifest.json`. The YouTube pages, popup and settings page all read the name from there.
- **The mark:** a rounded triangle pointing forward, a road curving up through it beside a ribbon, and a coral arrowhead where the road leads out ("Learn forward"). Forest green (#193d31, or light on dark backgrounds) and coral (#ff5446); never red and never on a red tile, so it isn't mistaken for YouTube's play button. The approved artwork is `docs/brand/aim-mark-approved.webp`; `tools/trace-mark.py` traces it into `icons/mark-traced.svg` (needs `pip install potracer pillow numpy`), and `tools/build-mark.mjs` builds everything from that trace without changing its shape: `icons/mark.svg`, `icons/16|32|48|128.png` (dark mark, for light toolbars), `icons/light/` (light mark, for dark toolbars), `icons/wordmark.png` and `wordmark-light.png` ("Aim" then the mark, for the store and website), and `ICON.logo` in `content/core.js`, the mark on YouTube. To change the mark, trace new artwork and run both (see the comments at their tops).
- `PRIVACY.md` and `STORE_LISTING.md` mention the name in text.

## Stored data

`manifest.json` has a `"key"` so Aim's development ID stays `fdebaflkeabmcggljcjmchnepgddbplp` wherever it's loaded from; Supabase's sign-in redirect depends on it. Remove it from the copy you upload to the Chrome Web Store.

Everything lives in `chrome.storage.local` (with Aim Plus sync on, a copy of aims, saved videos, settings and channel rules is also on Aim's server; see `sync.js`), except the Aim Plus sign-in session, which `plus.js` keeps in the service worker's IndexedDB so YouTube tabs can't read it. `schemaVersion` records the data format. When it changes, bump `SCHEMA_VERSION` in `store.js`, add a step to `migrateStorage()`, and add a test to `tests/store.test.js`.

## Testing

See [TESTING.md](TESTING.md).

## Privacy and release

- [PRIVACY.md](PRIVACY.md): what Aim stores (all of it locally) and why, plus the optional Aim Plus account.
- [STORE_LISTING.md](STORE_LISTING.md): the Chrome Web Store listing, ready to paste, and what's still needed before submitting.
- [docs/ROADMAP.md](docs/ROADMAP.md): status, the Aim Plus plan and the decisions behind it. [docs/HOMESCHOOL.md](docs/HOMESCHOOL.md): the future homeschool product (not in scope yet).
