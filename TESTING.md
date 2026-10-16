# Aim — testing

Run all three before and after every phase. A change is safe to keep when everything that passed before still passes.

## Automated

```sh
node tests/store.test.js      # data layer: migrations, timer, write queue, settings (no dependencies)
node tests/browser.test.js    # loads the extension in Chromium on a fake youtube.com (needs Playwright)
```

The browser test checks Aim's own wiring: the top-bar button, prompts, pause and resume, time-up, channel hiding, popup, settings and extension reload. It uses a stand-in page, so it can't tell you whether YouTube changed its page structure. That's what the manual checklist below is for.

## Manual checklist (real YouTube)

### Setup

1. `chrome://extensions` → Developer mode on → **Load unpacked** → choose this folder.
2. Open the service worker console (the "service worker" link on the extension card) and keep it open to catch errors.
3. Run the checklist once **without** an API key, then once **with** a key (Settings → AI check).
4. Start from a clean profile, or clear data: service worker console → `chrome.storage.local.clear()`, then reload the extension.

### 1. Install, upgrade and settings

- [ ] Extension loads with no errors on the card.
- [ ] Service worker console: `chrome.storage.local.get("schemaVersion")` returns `{ schemaVersion: 2 }`.
- [ ] **Upgrade from Waypoint:** with Waypoint 0.5 data in place (same folder, then reload), check:
  - Strict becomes "Hold me to my time limits" turned on.
  - The total daily cap becomes the daily reminder.
  - Blocked channels become Hidden.
  - A running Quick answer becomes Focus.
  - Saved videos and history are kept.
- [ ] Popup opens and shows "No session running", saved videos, time on YouTube today, and recent sessions.
- [ ] Settings page renders Homepage, Recommendations, Time, Channels and AI check. Every change saves instantly with a "Saved." toast.
- [ ] Every visible label says **Aim**. No mentions of strictness, leisure, Quick answer or 24-hour delays anywhere.

### 2. Homepage

- [ ] youtube.com shows the "What brings you here?" card instead of the feed. The placeholder example rotates.
- [ ] The "Aim" button with "Start a session" appears in the top bar, left of YouTube's icons.
- [ ] Switching YouTube to dark theme restyles the card, button and dialogs.
- [ ] Settings → Homepage → "Leave the homepage alone" brings the feed back right away, in an open YouTube tab too.

### 3. Watching without a session

- [ ] With no session, open a video. It's held, and the prompt shows "Up next: …" with **Not now**.
- [ ] **Not now** plays the video. Opening more videos in the same tab doesn't ask again.
- [ ] A new tab asks again.

### 4. Focus session

- [ ] Top bar → Start a session → Focus. A purpose shorter than 4 characters is rejected.
- [ ] Enter a purpose, pick 15m, start. The pill shows "Focus · 15 min".
- [ ] The dropdown shows:
  - the purpose, and the time remaining with a bar;
  - with a key, a "Suggested path" with 3 links;
  - Got what I came for, Change purpose, Add 15 minutes, Pause, Save, Hide or warn about this channel, End session.
- [ ] A matching video plays. With a key, a related one may show "Counts toward your purpose".
- [ ] With a key, open a clearly unrelated video. It stays paused and shows "This video looks different from your current purpose".
  - [ ] **Stay focused** goes back.
  - [ ] **Save for later** saves it, then goes back. It appears in the popup.
  - [ ] **Change purpose** opens the pivot dialog; confirming plays the video.
- [ ] **Move between several videos quickly.** With a key, check the drift check judges the video on screen, not the previous one. This uses the stale-details fix.
- [ ] Typing in Aim's text fields doesn't trigger YouTube shortcuts (try `k`, `f`, `/`).
- [ ] Watch for about 1 minute. The remaining time goes down, and keyboard focus on the top-bar button isn't lost every 10 s.

### 5. Pivot

- [ ] Dropdown → Change purpose → new purpose, "Keep my remaining time". The toast confirms and the remaining time is unchanged.
- [ ] Pivot again with "Set a new time limit" → 30m. Remaining becomes about 30 min.
- [ ] With "Hold me to my time limits" on, pivoting with a longer limit asks for a reason.
- [ ] After time is up, the pivot dialog starts on "Set a new time limit".
- [ ] End the session: the reflection shows "Path: A → B → C".

### 6. Pause, time up, add time, end

- [ ] Pause from the dropdown while on a video. The video stops and "Your session is paused" appears. It stays paused if you press play.
- [ ] **Pause, then immediately do something else** (open another video). Pause must not undo itself within the next 10 s.
- [ ] Resume: the video plays again.
- [ ] Time up: start a 15m Focus. To skip the wait, run this in the service worker console:
      `chrome.storage.local.get("session").then(({session}) => chrome.storage.local.set({session: {...session, usedSec: 890}}))`.
      Within about 20 s, "Your time is up" appears and the video is held.
  - [ ] **Add 15 minutes** with hold off: instant. With "Hold me to my time limits" on: asks for a reason.
  - [ ] **End session** lands on the homepage with "Session complete" and Yes / Partly / No.
- [ ] "Got what I came for" ends the session with a "Glad you found it." toast.
- [ ] Rate a session: the popup's "Recent sessions" shows it with the rating.

### 7. Explore

- [ ] Start → "Just exploring" → 15m. The pill shows "Explore" and the homepage feed comes back.
- [ ] Unrelated videos play with no drift prompt.
- [ ] Dropdown → Add 15 minutes adds 15.
- [ ] Dropdown → Change to Focus → enter a purpose. The session becomes Focus, even with a new time limit.

### 8. Search

- [ ] With no session, search from YouTube's search box. A **15-minute Focus** session starts with the search as its purpose. The results bar shows "Focus · 15 min left", Edit, and "Got my answer".
- [ ] Homepage card with a key: a conversational query ("how do i make my bread less dense") may offer "Suggested search". Both buttons search, and the purpose stays as typed.
- [ ] With a key, in Focus: search for something unrelated. "This search looks different from your purpose" appears. **Stay focused** goes back.

### 9. Timer accuracy

- [ ] **Two YouTube windows side by side**, both visible, for 2 minutes. The session uses about 2 minutes, not 4.
- [ ] **Focus video in a background tab**: play it, switch to another tab for 1 minute. The session time still goes down.
- [ ] Miniplayer: start a video, open the miniplayer, browse the homepage. Time on YouTube keeps counting.

### 10. Daily reminder

- [ ] Settings → Daily reminder after 1 minute. After about a minute on YouTube, "You've spent 1 minutes on YouTube today" appears once. Nothing is blocked.
- [ ] It doesn't appear again that day.

### 11. Channels

- [ ] On a video: dropdown → Hide or warn about this channel → **Hide channel**. The toast confirms and the video keeps playing.
- [ ] That channel's videos disappear from the homepage feed (turn the homepage card off to see it), search results and the sidebar.
- [ ] Opening one of its videos directly asks "You chose to hide …" with **Watch anyway** / **Go back**, even in Focus.
- [ ] **Warn me** on another channel: its videos ask before playing outside Focus, and play directly during Focus.
- [ ] Settings lists both. Switching Hide/Warn or removing takes effect immediately.

### 12. Recommendations (key required)

- [ ] In Focus on a watch page, after a few seconds sidebar videos get "Matches your purpose" / "Related perspective" / "Off purpose" labels. Off-purpose ones are dimmed.
- [ ] **Move to another video:** old labels disappear and new ones arrive for the new sidebar. No label sits on the wrong video.
- [ ] Settings → Recommendations → Hide: off-purpose ones disappear on the next video.

### 13. Sync and reload

- [ ] Ending the session from the popup while a YouTube tab is on a video sends that tab to the homepage.
- [ ] Two YouTube tabs: starting, pausing or adding time in one updates the other within about 10 s. A time-up or paused notice in the other tab clears by itself.
- [ ] Reload the extension from `chrome://extensions` with a YouTube tab open. Aim's button disappears from that tab, videos play normally, and the tab console shows no repeating errors. Refreshing the tab brings Aim back.

## Known issues (not regressions)

- Purpose checks need your own Claude API key until the hosted backend (Phase 4).
- The homepage feed can flash briefly, and a video can start for a split second, before Aim loads (fixed in Phase 2).
- Hiding channels depends on the channel link in each video tile. Tiles that only link the channel by ID, not by @handle, may not be matched.
- Miniplayer time counting relies on YouTube's `ytd-miniplayer` element and needs checking on real YouTube.
