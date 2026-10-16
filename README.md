# Aim

Use YouTube on purpose without blocking what's useful. Your search becomes your purpose, Aim keeps you on it, and breaks are a deliberate choice with a daily allowance, all styled to feel like part of YouTube.

Chrome extension, Manifest V3, no build step.

## Load it

`chrome://extensions` → Developer mode → **Load unpacked** → this folder. Nothing to set up: Aim Free uses no AI, needs no account or key, and talks to no server. Everything stays in your browser.

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
| `content/main.js` | Timer ticks, sync with other tabs, navigation, startup. Loads last. |
| `content/content.css` | Styles for all of the above |
| `popup.html/js` | Toolbar popup |
| `options.html/js` | Settings page |
| `tests/` | Automated tests (see TESTING.md) |

## Product rules

- **Two states, nothing in between.** A **purpose** (why you're on YouTube right now) or a **break** (free browsing). With neither, Aim asks before a video plays: set a purpose, or take a break (15 / 30 / 60 min, or just this video).
- **Your search becomes your purpose.** Later searches that share a meaningful word with it continue silently; others ask once, "Is this part of your purpose?". Changing purpose is deliberate and keeps your searches, videos and time limit.
- **On purpose, you watch what your searches found:** their results, playlists among them, and the video you set the purpose from. Anything else shows "Not part of your purpose": go back, search, change purpose or take a break. The sidebar shows **Up next from your search** instead of YouTube's recommendations. No AI is involved.
- **Purposes have no time limit** unless you set one. **Done** ends a purpose and asks once whether you found what you needed.
- **Breaks** share a **daily leisure allowance** (default 1 hour), a hard stop. A purpose waits during a break and resumes after it.
- **Optional daily YouTube limit**, also a hard stop until midnight.
- **When time runs out mid-video**, that video may finish within the grace period (default 15 min, adjustable 0 to 30).
- Time counts while a video plays or while you're looking at YouTube. Several open tabs never count the same moment twice.
- **Fewer distractions whenever you're not on a break:** Shorts, recommendations and end screens, the subscriptions and trending feeds are hidden, and YouTube's autoplay is switched off (and back on during breaks). Each can be turned off under Advanced.
- **Channels** (optional): Hide removes a channel from feeds, results and the sidebar. Warn asks before you watch it outside a purpose.

## Design

Aim should look like part of YouTube, not a separate product:

- **Colors** come from YouTube's own theme variables (`--yt-spec-*`) in `content/content.css`, so light and dark mode match exactly. Aim has no accent color: everything is neutral like YouTube's menus and dialogs, and red appears only in the Aim mark.
- **Shapes** copy YouTube's components: 36px pill buttons, 32px chips, 12px-radius menus and dialogs, YouTube's search box on the homepage card, snackbar-style toasts.
- **Placement:** the Aim button sits beside YouTube's search box on wide windows (1200px+) and beside the Create button otherwise.
- **Behavior:** Escape or a click outside closes menus and dialogs, except prompts that are holding a video for your decision.
- The popup and settings page use the same palette and follow Chrome's light/dark mode.

## Stored data

Everything lives in `chrome.storage.local`. `schemaVersion` records the data format. When it changes, bump `SCHEMA_VERSION` in `store.js`, add a step to `migrateStorage()`, and add a test to `tests/store.test.js`.

## Testing

See [TESTING.md](TESTING.md).
