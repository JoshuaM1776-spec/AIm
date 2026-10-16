# Aim

Use YouTube on purpose without blocking what's useful. Aim adds Focus and Explore sessions, purpose checks, intentional pivots and session timers, styled to feel like part of YouTube.

Chrome extension, Manifest V3, no build step.

## Load it

`chrome://extensions` → Developer mode → **Load unpacked** → this folder. Optional: add your own Claude API key under Settings → AI check to enable purpose checks, search suggestions and recommendation labels.

## Layout

| File | Role |
|---|---|
| `manifest.json` | Extension manifest |
| `background.js` | Service worker: Claude API calls and the message handlers the YouTube page uses |
| `store.js` | Shared logic: sessions, daily limits, channel rules, strictness, storage migrations. Loaded by the service worker, popup and settings page |
| `content.js`, `content.css` | Everything on youtube.com: top-bar button, dialogs, notices, homepage card, results bar, video gate, timer |
| `popup.html/js` | Toolbar popup |
| `options.html/js` | Settings page |

## Stored data

Everything lives in `chrome.storage.local`. `schemaVersion` records the data format; when it changes, bump `SCHEMA_VERSION` in `store.js` and add a step to `migrateStorage()`.

## Testing

See [TESTING.md](TESTING.md).
