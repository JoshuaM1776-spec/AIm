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
| `content.js`, `content.css` | Everything on youtube.com: top-bar button, dialogs, notices, homepage card, results bar, video gate, timer ticks, channel hiding |
| `popup.html/js` | Toolbar popup |
| `options.html/js` | Settings page |
| `tests/` | Automated tests (see TESTING.md) |

## Product rules

- **Two modes.** Focus (a purpose and a time) and Explore (just a time). Searching with no session starts a 15-minute Focus session.
- **The session timer is the main limit.** Time counts while a video plays or while you're looking at YouTube. Several open tabs never count the same moment twice.
- **Hold me to my time limits** (optional): adding time takes a short written reason.
- **Daily reminder** (optional): one heads-up a day after N minutes on YouTube. Nothing is blocked.
- **Channels** (optional): Hide removes a channel from feeds, results and the sidebar. Warn asks before you watch it outside Focus.

## Stored data

Everything lives in `chrome.storage.local`. `schemaVersion` records the data format. When it changes, bump `SCHEMA_VERSION` in `store.js`, add a step to `migrateStorage()`, and add a test to `tests/store.test.js`.

## Testing

See [TESTING.md](TESTING.md).
