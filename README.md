# Aim

Use YouTube on purpose without blocking what's useful. Aim adds Focus and Explore sessions, purpose checks, intentional pivots and session timers, styled to feel like part of YouTube.

Chrome extension, Manifest V3, no build step.

## Load it

`chrome://extensions` → Developer mode → **Load unpacked** → this folder. Optional for now: add your own Claude API key under Settings → AI check to enable purpose checks, search suggestions and recommendation labels. A hosted backend will replace this.

## How it fits together

| File | Role |
|---|---|
| `manifest.json` | Extension manifest |
| `background.js` | Service worker. **The only writer of stored data**: the popup, settings page and YouTube tabs send it messages. Also makes the Claude API calls. |
| `store.js` | Data and session logic, loaded only by the service worker: sessions, timer, settings, channels, migrations. Changes run one at a time through `serial()`. |
| `content/` | Everything on youtube.com, loaded in the order listed in `manifest.json`. The files share one scope in the extension's isolated world. |
| `content/early.js` | Runs at document_start: hides the homepage feed and holds videos until the rest of Aim has loaded, so nothing flashes. |
| `content/core.js` | Shared state, messaging to the background, the `el()` DOM helper, icons |
| `content/youtube.js` | **Every YouTube selector and page reader.** When YouTube changes its markup, fix it here (plus the feed rules in `content.css`). |
| `content/ui.js` | Menus, dialogs, notices, toasts |
| `content/gate.js` | Holds each new video, checks channel rules and purpose, then lets it play |
| `content/session.js` | Top-bar button and menu, start / pivot / add-time dialogs, pause, time up, ending, reflection |
| `content/home.js`, `search.js`, `recs.js`, `channels.js` | Homepage card, search results, sidebar labels, hidden/warned channels |
| `content/main.js` | Timer ticks, sync with other tabs, navigation, startup. Loads last. |
| `content/content.css` | Styles for all of the above |
| `popup.html/js` | Toolbar popup |
| `options.html/js` | Settings page |
| `tests/` | Automated tests (see TESTING.md) |

## Product rules

- **Two modes.** Focus (a purpose and a time) and Explore (just a time). Searching with no session starts a 15-minute Focus session.
- **The session timer is the main limit.** Time counts while a video plays or while you're looking at YouTube. Several open tabs never count the same moment twice.
- **Hold me to my time limits** (optional): adding time takes a short written reason.
- **Daily reminder** (optional): one heads-up a day after N minutes on YouTube. Nothing is blocked.
- **Channels** (optional): Hide removes a channel from feeds, results and the sidebar. Warn asks before you watch it outside Focus.

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
