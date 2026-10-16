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
3. Nothing to configure: Aim needs no account or key.
4. Start from a clean profile, or clear data: service worker console → `chrome.storage.local.clear()`, then reload the extension.

### 1. Install, upgrade and settings

- [ ] Extension loads with no errors on the card.
- [ ] Service worker console: `chrome.storage.local.get("schemaVersion")` returns `{ schemaVersion: 4 }`.
- [ ] **Upgrade from 0.9** (same folder, then reload):
  - a running Focus session becomes your purpose, without its timer;
  - an Explore session becomes a break;
  - history, saved videos and channels are kept.
- [ ] Popup shows the current purpose or break, Saved for later, Today (on purpose / breaks / all YouTube) and Recent.
- [ ] Settings shows only "Replace the homepage feed" and "Daily leisure time", plus a collapsed **Advanced** section. Every change saves instantly. There's no API key or AI setting anywhere.
- [ ] **Upgrade from 0.11:** a stored API key is deleted, and a running purpose keeps working (search again to fill its list).
- [ ] No mentions of Focus/Explore modes, pausing a session, strictness or the daily reminder anywhere.

### 2. Homepage and design

- [ ] youtube.com shows "What brings you here?" with YouTube's own search-box style, and "Just browsing? Take a break" with 15m / 30m / 1h and the leisure time left.
- [ ] Hard-refresh the homepage a few times: the feed never flashes before the card appears.
- [ ] With "Replace the homepage feed" off, the feed appears normally on refresh, right away in an open tab too.
- [ ] The indicator (mark + "Set a purpose") sits just right of YouTube's search box on a wide window, and next to Create below 1200px. Below about 860px it shows only the mark.
- [ ] YouTube's theme (Settings → Appearance) restyles everything Aim shows. No accent colors.
- [ ] Escape and clicking outside close Aim's menu and dialogs. The card on the video player stays until you choose.

### 3. Two states: a purpose or a break

- [ ] With neither, open a video from a pasted link. It stays paused and a card **on the player** (not over the whole page) asks "What brings you here?", with a purpose field and Just this video / 15m / 30m / 1h.
- [ ] **Just this video** plays it. The indicator shows "Break · 1 video". When the video ends, or you open another one, the break is over and the card returns.
- [ ] **15m** starts a break: the homepage feed comes back and videos play freely. The indicator counts down.
- [ ] Typing a purpose on the card plays the video under that purpose.

### 4. Purpose

- [ ] Search with no purpose: your search becomes the purpose, with no time limit. The results bar shows it with Edit and **Done**.
- [ ] Click a result: it plays. The sidebar shows **Up next from your search** with the other results (thumbnails, titles, channels) instead of YouTube's recommendations.
- [ ] Scroll the results further, then open one from far down: it plays too (results are captured as they load).
- [ ] A playlist in the results: its videos play.
- [ ] Open a video your searches didn't find (a link in a description, a channel page, a pasted URL): "Not part of your purpose" on the player, with Back, a search box, Change purpose, Save for later and break options. There's no "watch anyway".
- [ ] **Change purpose** from that card: the new purpose includes the video, which then plays.
- [ ] A related search ("sourdough starter" → "starter feeding schedule") continues silently.
- [ ] An unrelated one ("gaming laptop deals") hides its results behind "Is … part of your purpose?". **Yes** shows them and they become watchable. **Change purpose** or a break also work.
- [ ] Set a purpose from the indicator on a video page: that video plays. From the homepage, with no search yet: any video asks you to search first.
- [ ] The indicator menu shows your purpose, "No time limit · Set one", what's hidden, Take a break, Done, Change purpose, Save, Hide or warn.

### 5. Breaks during a purpose

- [ ] Menu → Take a break → 15m. The indicator shows "Break", the menu says "Your purpose is waiting".
- [ ] **Back to my purpose** ends the break; the indicator shows the purpose again.
- [ ] Let a break run out while **no** video plays: the purpose resumes and a toast says the break is over.
- [ ] Let a break run out **while a video plays**: a notice says "Your break is over. Finish this video…". When the video ends (or after the grace period, 15 min by default), the video is paused and checked against your purpose.
- [ ] To skip waiting, run this in the service worker console during a break:
      `chrome.storage.local.get("brk").then(({brk}) => chrome.storage.local.set({brk: {...brk, usedSec: brk.durationMin * 60 - 5}}))`

### 6. Limits

- [ ] **Daily leisure time** (Settings, default 1 hour): breaks are capped to what's left. When it's used up, the break chips are disabled with "Today's leisure time is used up". It resets at midnight.
- [ ] **Purpose time limit**: menu → Set one → 15m. When it runs out, a card on the player says "Time's up" with Done / Add 15 minutes / a break.
- [ ] **Daily YouTube limit** (Advanced): when reached, every video shows "That's today's YouTube time" and the homepage says so too. Nothing extends it until midnight.
- [ ] **Finish the current video** (Advanced): set "Stop right away" and let a break run out mid-video. The video pauses immediately.

### 7. Distractions (whenever you're not on a break)

- [ ] With a purpose, or before choosing: no Shorts shelves on the homepage feed (during a break you'll see them), search results or channel pages, and no Shorts link in the left menu or mini menu.
- [ ] On a watch page: no recommendations in the sidebar or below the video on narrow windows, and no end-screen cards or suggestions when the video ends.
- [ ] YouTube's autoplay switch (in the player controls) is off. Take a break: it turns back on, and the sidebar and Shorts return. End the break: off again.
- [ ] If autoplay was already off before Aim, it stays off during breaks.
- [ ] A Short opened from a link during a purpose shows "Shorts are hidden while you're on purpose" on the player.
- [ ] Subscriptions and Trending show "Feeds are hidden…" with break options instead of the feed.
- [ ] The indicator menu says what's hidden, and **Adjust** opens Settings → Advanced → Distractions. Each switch there takes effect in open tabs right away.
- [ ] Hard-refresh a search results page: Shorts never flash before disappearing.
- [ ] Playlists in the sidebar (opened from a playlist) and live chat still show during a purpose.

### 8. Done

- [ ] Menu → **Done** (or the results bar or homepage Done button) lands on the homepage and asks once: "Did you find what you needed?" Yes / Partly / No.
- [ ] Recent in the popup shows the purpose (with its pivots), minutes, number of videos and your answer.

### 9. Timer accuracy

- [ ] **Two YouTube windows side by side**, both visible, for 2 minutes. Today's time grows by about 2 minutes, not 4.
- [ ] **A video in a background tab** keeps counting while it plays.
- [ ] Miniplayer: start a video, open the miniplayer, browse. Time keeps counting.

### 10. Channels

- [ ] On a video: menu → Hide or warn about this channel → **Hide channel**. The toast confirms and the video keeps playing.
- [ ] That channel's videos disappear from the homepage feed (during a break), search results and the sidebar.
- [ ] Opening one of its videos directly shows "You chose to hide …" on the player, with Go back / Continue.
- [ ] **Warn me** on another channel: its videos ask before playing unless you have a purpose.
- [ ] Settings → Advanced lists both. Switching Hide/Warn or removing takes effect immediately.

### 11. Sync and reload

- [ ] Done from the popup while a YouTube tab is on a video: that tab shows the "What brings you here?" card on the player within a few seconds.
- [ ] Two YouTube tabs: starting a break or setting a purpose in one updates the other's indicator, and a card waiting on the other tab's player clears if the new state allows its video.
- [ ] Reload the extension from `chrome://extensions` with a YouTube tab open. Aim's indicator disappears from that tab, videos play normally, and the tab console shows no repeating errors. Refreshing the tab brings Aim back.

## Known issues (not regressions)

- The word check knows words, not meanings: synonyms ("tap" vs "faucet") get the question once; answering Yes teaches it that search.
- Up next links reload the page instead of using YouTube's in-page navigation, so they're a little slower than YouTube's own.
- Hiding the Shorts menu link matches YouTube's English label ("Shorts") as well as its link; other languages rely on the link alone.
- Aim changes YouTube's own autoplay switch. If Aim is removed during a purpose, autoplay stays off until you switch it back on.
- Hiding channels depends on the channel link in each video tile. Tiles that only link the channel by ID, not by @handle, may not be matched.
- Miniplayer time counting relies on YouTube's `ytd-miniplayer` element and needs checking on real YouTube.
- The logo still has the red play triangle in the center (replaced in step D).
