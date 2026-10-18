# Aim

Use YouTube on purpose without blocking what's useful. Your search becomes your purpose, Aim keeps you on it, and breaks are a deliberate choice with a daily allowance, all styled to feel like part of YouTube.

Chrome extension, Manifest V3, no build step.

## Load it

`chrome://extensions` → Developer mode → **Load unpacked** → this folder. Nothing to set up: Aim Free uses no AI, needs no account or key, and talks to no server. Everything stays in your browser.

**Aim Plus** (in progress) adds an optional account and AI through Aim's own server. It stays switched off until `config.js` names that server; see [supabase/README.md](supabase/README.md).

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
| `content/onboarding.js` | First-time help on YouTube: one-time tips (the homepage box, the Aim button, the results bar) and the Homeschool student's spotlight tour of Today |
| `content/pathways.js` | Pathways on YouTube: "Want more of this?", "Where could this take me?" and the occasional theme offer |
| `content/video.js` | "In this video" (Aim Plus): beside a video watched for a learning Target, the concepts it covers (from its title, description and chapters), chapter jumps, "See it in another context", and "Test me on this video" when it ends |
| `content/study.js` | Study sessions on YouTube: the offer, the planning dialog, the topic header on results, the plan in the watch page's sidebar |
| `study.html/js` | A study session's overview and summary |
| `content/main.js` | Timer ticks, sync with other tabs, navigation, startup. Loads last. |
| `content/content.css` | Styles for all of the above |
| `popup.html/js` | Toolbar popup |
| `targets.html/js` | All Targets: current, set aside (Resume, Remove) and completed (Start again) |
| `aim.css` | The shared look for all of Aim's own pages (see Design) |
| `options.html/js` | Settings page |
| `welcome.html/js` | The welcome tour: opens once on install (what Aim is, how it works, a few choices, pin it), and from Settings → "Show the welcome tour again" |
| `config.js`, `plus.js` | Aim Plus in the service worker: where the server is (empty = Free only), sign-in with an emailed code, calling Aim's AI endpoint. Only Aim's own pages can use it, never YouTube tabs. |
| `options-plus.js` | The Aim Plus section of Settings (hidden until `config.js` is filled in) |
| `signin.html/js` | Where the link in the sign-in email lands. It hands the session to the worker, which accepts it only for a sign-in this browser started. |
| `pathways.html/js` | Pathways (Aim Plus): themes from what you've explored, work connected to an interest, and a path's four steps (See it, Try it, Meet it, Prepare for it) with reflections |
| `pathways-ui.js` | "Want more of this?" and "Where could this take me?" for Aim's own pages (TeachBack, study sessions) |
| `teachback.html/js` | TeachBack, Aim Plus's conversational check of what you can explain |
| `supabase/` | The Aim Plus server: database tables and the AI endpoint. Not part of the extension package. |
| `tests/` | Automated tests (see TESTING.md) |

## Product rules

**Wording:** the interface calls the active objective a **Target** (Set Target, Current Target, Change Target, Target complete, Back on Target), and keeps natural phrasing where it reads better ("What brings you here?"). Code and stored data still say `purpose`; that's deliberate, to avoid a data migration for a wording change.

Aim doesn't block or alter YouTube's ads, and stays compatible with ad blockers people install separately.

- **Two states, nothing in between.** A **purpose** (why you're on YouTube right now) or a **break** (free browsing). With neither, Aim asks before a video plays: set a purpose, or take a break (15 / 30 / 60 min, or just this video).
- **Your search becomes your purpose.** Later searches that share a meaningful word with it continue silently; others ask once, "Is this part of your purpose?". Changing purpose is deliberate and keeps your searches, videos and time limit.
- **On purpose, you watch what your searches found:** their results, playlists among them, and the video you set the purpose from. Anything else shows "Not part of your purpose": go back, search, change purpose or take a break. The sidebar shows **Up next from your search** instead of YouTube's recommendations. No AI is involved.
- **Picking up where you left off.** A Target is active, set aside, or completed. **Change Target** and **Set aside for later** keep the old Target, with its searches, the videos they found and where you were in the last video. The homepage shows the current Target and the two most recent set-aside ones under "Pick up where you left off"; **View all Targets** lists every one. **Resume** returns to the last video at the moment you left it, or else the last search, and never starts anything else (no AI). Completed Targets can be started again. More searches on the same Target never create new Targets.
- **The librarian** (signed-in accounts): Aim's search box takes requests as well as searches. A plain search ("sourdough starter") goes straight to YouTube. A request or goal ("I need to replace the alternator on my 2014 Tacoma") goes to the librarian, which writes better YouTube searches, adds a one- or two-sentence note, and at most one question shown as choices; on the results page it groups the best of YouTube's results with a reason for each. It never answers questions itself or blocks videos, and if it can't help, the search goes to YouTube as typed. Its memory of a Target stays in the browser. Signed out, Aim uses no AI.
- **Study sessions** (Aim Plus): on a learning goal, the librarian offers "Organize a study session". Aim breaks the Target into a few topics in order (following a pasted study guide if there is one), the librarian picks videos for each from YouTube's results, the watch page's sidebar shows the plan (brief, videos, Check yourself, Next topic), and TeachBack checks each topic. A summary page shows what was watched, checked and worth reviewing. The plan lives with the Target in the browser.
- **Purposes have no time limit** unless you set one. **Done** ends a purpose and asks once whether you found what you needed.
- **Breaks** share a **daily leisure allowance** (default 1 hour), a hard stop. A purpose waits during a break and resumes after it.
- **Optional daily YouTube limit**, also a hard stop until midnight.
- **When time runs out mid-video**, that video may finish within the grace period (default 15 min, adjustable 0 to 30).
- Time counts while a video plays or while you're looking at YouTube. Several open tabs never count the same moment twice.
- **Fewer distractions whenever you're not on a break:** Shorts, recommendations and end screens, the subscriptions and trending feeds are hidden, and YouTube's autoplay is switched off (and back on during breaks). Each can be turned off under Advanced.
- **Channels** (optional): Hide removes a channel from feeds, results and the sidebar. Warn asks before you watch it outside a purpose.

## Design

YouTube helps you find something to watch. Aim helps you find what you need. Aim should feel like it belongs inside YouTube, with calm, polished moments of decision:

- **Colors** come from YouTube's own theme variables (`--yt-spec-*`) in `content/content.css`, so light and dark mode match exactly. Aim red (`--wp-accent`, #e5131f) is an accent, not the default: it marks the one way back to your Target (Continue, Resume, Back on Target), the time ring and the mark. Primary buttons are neutral (`.wp-btn-primary`, dark on light); use `.wp-btn-accent` only for that "back to it" action.
- **Homepage:** a conversation, not a search box. "What brings you here?", one rounded field ("Tell me what you're looking for…") with a small arrow inside it (Enter works too), example requests said the way you'd ask a librarian, then at most one current and two recent Targets to pick up.
- **Results:** a compact one-row Target indicator above YouTube's results: the Target, a small Change action, a done check, and (signed in) a librarian icon. The librarian stays folded away unless it has something new to say about this search. Time left shows only when you set a limit. The videos stay the main event.
- **Popup:** about the current Target: Resume, Take a Break, Done, with Change Target, Set aside and All Targets as small links. It shows time so far, or time left only when you set a limit. Activity is folded under "Your activity"; Daily limits and Settings are secondary.
- **Shapes:** 16px-radius dialogs and cards with a centered brand line and a close button when dismissible, full-width buttons for the main decision, segmented choices (Take a Break) and a green check for Target complete.
- **Placement:** the Aim button sits beside YouTube's search box on wide windows (1200px+) and beside the Create button otherwise.
- **Behavior:** Escape or a click outside closes menus and dialogs, except prompts that are holding a video for your decision.
- **Aim's own pages** (Settings, Targets, TeachBack, study sessions, Pathways, the welcome tour, sign-in) all use `aim.css`: one set of colors for light and dark, the same header (mark, "Aim", the page's name), cards on a soft gray page, and the same buttons, fields, switches and pills. A page adds only what's truly its own in a small `<style>`. Main buttons are neutral; Aim red is only for getting back to your Target; blue is a small learning accent (Homeschool, Pathways), never a page's main button. The popup keeps its compact layout but uses the same colors.
- **Never** use YouTube's logo, icons, artwork or code. Aim's name and mark appear on every card, so nothing reads as YouTube's own feature.

## Rebranding

The name is Aim. It lives in one place, so it's easy to change if it ever has to:

- **Name and descriptions:** `name`, `description` and `action.default_title` in `manifest.json`. The YouTube pages, popup and settings page all read the name from there.
- **Icons:** `icons/16|32|48|128.png` (dark mark, for light toolbars) and `icons/light/` (light mark, for dark toolbars). The source drawing is `icons/mark.svg`.
- **The mark on YouTube** is the same drawing, built in code: `ICON.logo` in `content/core.js`.
- `PRIVACY.md` and `STORE_LISTING.md` mention the name in text.

## Stored data

`manifest.json` has a `"key"` so Aim's development ID stays `fdebaflkeabmcggljcjmchnepgddbplp` wherever it's loaded from; Supabase's sign-in redirect depends on it. Remove it from the copy you upload to the Chrome Web Store.

Everything lives in `chrome.storage.local`, except the Aim Plus sign-in session, which `plus.js` keeps in the service worker's IndexedDB so YouTube tabs can't read it. `schemaVersion` records the data format. When it changes, bump `SCHEMA_VERSION` in `store.js`, add a step to `migrateStorage()`, and add a test to `tests/store.test.js`.

## Testing

See [TESTING.md](TESTING.md).

## Privacy and release

- [PRIVACY.md](PRIVACY.md): what Aim stores (all of it locally) and why, plus the optional Aim Plus account.
- [STORE_LISTING.md](STORE_LISTING.md): the Chrome Web Store listing, ready to paste, and what's still needed before submitting.
- [docs/ROADMAP.md](docs/ROADMAP.md): status, the Aim Plus plan and the decisions behind it. [docs/HOMESCHOOL.md](docs/HOMESCHOOL.md): the future homeschool product (not in scope yet).
