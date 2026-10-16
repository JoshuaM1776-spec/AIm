# Aim — manual test checklist

Run this before and after every phase. A change is safe to keep when every box that passed before still passes.

## Setup

1. `chrome://extensions` → Developer mode on → **Load unpacked** → choose this folder.
2. Open the service worker console (the "service worker" link on the extension card) and keep it open to catch errors.
3. Run the checklist once **without** an API key, then once **with** a key (Settings → AI check).
4. Start from a clean profile, or clear data: service worker console → `chrome.storage.local.clear()`.

Unless a step says otherwise, use strictness **Balanced** (the default).

## 1. Install and settings

- [ ] Extension loads with no errors on the card.
- [ ] Service worker console: `chrome.storage.local.get("schemaVersion")` returns `{ schemaVersion: 1 }`.
- [ ] Toolbar popup opens and shows "No session running", empty saved list, today's usage, mode "balanced".
- [ ] Settings page opens and every section renders (Strictness, Waiting to take effect, Homepage, Recommendations, Daily limits, Avoided channels, AI check).
- [ ] Every visible label says **Aim**, never "Waypoint".

## 2. Homepage

- [ ] youtube.com shows the "What brings you here?" card instead of the feed. The placeholder example rotates.
- [ ] "Aim" button with "Start a session" appears in the top bar, left of YouTube's icons.
- [ ] Switching YouTube to dark theme restyles the card, button and dialogs.
- [ ] Settings → Homepage → "Leave the homepage alone" (loosening): asks for a reason and shows it as waiting 24 hours. The feed stays replaced.

## 3. Focus session

- [ ] Top bar → Start a session → Focus. A purpose shorter than 4 characters is rejected.
- [ ] Enter a purpose, pick 15m, start. The pill shows "Focus" and about 15 min.
- [ ] The dropdown shows the purpose, time remaining with a bar, and (with a key) "Suggested path" with 3 links.
- [ ] Open a video that matches the purpose: it plays. With a key, a related one may show "Counts toward your purpose".
- [ ] With a key: open a clearly unrelated video. It stays paused and shows "This video looks different from your current purpose".
  - [ ] **Stay focused** goes back.
  - [ ] **Save for later** saves it, then goes back. It appears in the popup.
  - [ ] **Change purpose** opens the pivot dialog; confirming plays the video.
- [ ] Typing in Aim's text fields doesn't trigger YouTube shortcuts (try `k`, `f`, `/`).
- [ ] Watch for about 1 minute: the pill's remaining time goes down.

## 4. Pivot

- [ ] Dropdown → Change purpose → new purpose, "Keep my remaining time". The toast confirms. Remaining time is unchanged.
- [ ] Pivot again with "Set a new time limit" → 30m: remaining becomes about 30 min.
- [ ] Strictness **Strict**: pivoting with a longer limit requires a reason.
- [ ] End the session: the reflection shows "Path: A → B → C".

## 5. Pause, time up, extend, end

- [ ] Pause from the dropdown while on a video: the video stops and the "Your session is paused" notice appears. It stays paused if you press play.
- [ ] Resume: the video plays again.
- [ ] Time up: start a 15m Focus. To skip the wait, set `usedSec` to 890 in the service worker console:
      `chrome.storage.local.get("session").then(({session}) => chrome.storage.local.set({session: {...session, usedSec: 890}}))`.
      Within about 20 s, "Your time is up" appears and the video is held.
  - [ ] **Add 15 minutes** (Balanced): instant. Strict: asks for a reason.
  - [ ] **End session** lands on the homepage with "Session complete" and Yes / Partly / No.
- [ ] Rate the session: the popup's "Recent sessions" shows it with the rating.

## 6. Explore

- [ ] Start → "Just exploring" → 15m. The pill shows "Explore" and the homepage feed comes back.
- [ ] Unrelated videos play with no drift prompt.
- [ ] Dropdown → Extend time adds 15 min (capped by the remaining leisure allowance).
- [ ] Dropdown → Change to Focus → enter a purpose: the session becomes Focus.

## 7. Search and Quick answer

- [ ] With no session, search from YouTube's search box. A **Quick answer** session starts using the search as its purpose, and the results bar appears above results.
- [ ] Results bar → "Focus session" → pick a time: it converts to Focus.
- [ ] Homepage card with a key: a conversational query ("how do i make my bread less dense") may offer "Suggested search". Both buttons search.
- [ ] With a key, in Focus: search for something unrelated. "This search looks different from your purpose" appears. **Stay focused** goes back.
- [ ] Quick answer → "Got my answer" ends with a "Glad you found it." toast.

## 8. Watching without a session

- [ ] With no session, open a video from a direct URL. It's held and the start dialog shows "Up next: …".
- [ ] Balanced: "Watch without a session" needs a short-sentence reason, then plays.
- [ ] Strict: the option isn't offered.

## 9. Daily limits and channel rules

- [ ] Settings → leisure allowance 1 min → Save (tightening applies instantly).
- [ ] Watch with no session (or Explore) for over 1 minute: the "Your rule" dialog appears. Balanced asks for a reason to watch anyway; Strict only allows Go back.
- [ ] Raising the allowance afterwards is refused ("over a daily limit… locked until tomorrow").
- [ ] Dropdown on a video → Avoid this channel → **Warn**. Reopen a video from that channel outside Focus: "You marked … as one to avoid".
- [ ] Set **Block**: it goes back immediately, and the channel's videos are closed.
- [ ] Settings → Avoided channels lists it. Removing it asks for a reason and waits 24 hours.
- [ ] Waiting changes can be cancelled from Settings.

## 10. Recommendations (key required)

- [ ] In Focus on a watch page, after a few seconds sidebar videos get "Matches your purpose" / "Related perspective" / "Off purpose" labels. Off-purpose ones are dimmed.
- [ ] Settings → Recommendations → Hide (tightening): off-purpose ones disappear on the next video.

## 11. Cross-context sync

- [ ] Ending the session from the popup while a YouTube tab is on a video sends that tab to the homepage.
- [ ] Two YouTube tabs: starting a session in one updates the pill in the other within about 10 s.

## Known issues (from the review — don't treat as regressions)

These are scheduled for Phase 1:

- Pausing or pivoting at the same moment as a timer update can be lost.
- Two visible YouTube windows count session time twice.
- A Focus video playing in a background tab doesn't use session time.
- Changing an Explore session to Focus with a new time limit is capped by the leisure allowance.
- Sidebar labels can stay on the wrong videos after navigating.
- After reloading the extension, open YouTube tabs log "Extension context invalidated" until refreshed.
