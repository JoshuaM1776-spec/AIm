# Aim — testing

Run all three before and after every phase. A change is safe to keep when everything that passed before still passes.

## Automated

```sh
node tests/store.test.js      # data layer: migrations, timer, write queue, settings (no dependencies)
node tests/filetext.test.mjs  # study guide files: .docx and PDFs from Chrome, LibreOffice, ReportLab (no dependencies)
node tests/browser.test.js    # loads the extension in Chromium on a fake youtube.com (needs Playwright)
node --experimental-strip-types tests/ai.test.mjs     # Aim Plus AI endpoint logic (no dependencies)
node --experimental-strip-types tests/plus.test.mjs   # Aim Plus sign-in in Chromium against a local stand-in server (needs Playwright)
```

The database tests need a throwaway Postgres; see [supabase/README.md](supabase/README.md#tests).

The browser test checks Aim's own wiring: the top-bar button, prompts, pause and resume, time-up, channel hiding, popup, settings and extension reload. It uses a stand-in page, so it can't tell you whether YouTube changed its page structure. That's what the manual checklist below is for.

## Real-YouTube check (automated)

`tools/real-youtube-check.mjs` loads Aim on the real youtube.com and checks what breaks when YouTube changes its pages: the home card replacing the feed, results (links, titles, channels, lengths), the watch page (video id, title, channel, sidebar, Up next), every selector in `content/youtube.js` on its page, and every channel in Learn something's list (found, with videos, and its Shorts list). It writes `report.json` and screenshots.

```sh
PLAYWRIGHT=… CHROMIUM_PATH=… node tools/real-youtube-check.mjs ./real-youtube-report
```

From a cloud session, the environment must allow `*.youtube.com`, `*.ytimg.com`, `*.googlevideo.com`, `*.ggpht.com`, `*.gstatic.com`, `*.googleapis.com` and `accounts.google.com`. YouTube may challenge cloud servers ("confirm you're not a bot") and refuse playback there; the page-structure checks still mean something, but the manual checklist on a real computer is the final word.

## Manual checklist (real YouTube)

### Setup

1. `chrome://extensions` → Developer mode on → **Load unpacked** → choose this folder.
2. Open the service worker console (the "service worker" link on the extension card) and keep it open to catch errors.
3. Nothing to configure: Aim needs no account or key.
4. Start from a clean profile, or clear data: service worker console → `chrome.storage.local.clear()`, then reload the extension.

### 1. Install, upgrade and settings

- [ ] **Opening a video in a new tab plays normally** (no "An error occurred. Please try again later"), with and without a Target. A video Aim holds starts for a split second, then pauses under the card.

- [ ] **Fresh install** (remove Aim first, then load it): the welcome tour opens in a new tab. Let's go → How it works → Make it yours (changes save right away) → Want help finding the right video? (only when accounts are available) → You're all set → Open YouTube. Back, Skip and the arrow keys work; light and dark both look right.
- [ ] First YouTube visit: a tip points at the box ("Start here", 1 of 2), then at the Aim button. Neither comes back after a reload. The first search on a Target gets one tip about the results bar.
- [ ] **Updating** an existing Aim (reload over an older version): no welcome tab and no tips.
- [ ] Settings → "Show the welcome tour again" opens it and brings the tips back.
- [ ] Extension loads with no errors on the card.
- [ ] Service worker console: `chrome.storage.local.get("schemaVersion")` returns `{ schemaVersion: 5 }`.
- [ ] **Upgrade from 0.9** (same folder, then reload):
  - a running Focus session becomes your Target, without its timer;
  - an Explore session becomes a break;
  - history, saved videos and channels are kept.
- [ ] Popup shows the current Target or break, Saved for later, Today (on Target / breaks / all YouTube) and Recent.
- [ ] Settings shows only "Replace the homepage feed" and "Daily leisure time", plus a collapsed **Advanced** section. Every change saves instantly. There's no API key or AI setting anywhere.
- [ ] **Upgrade from 0.11:** a stored API key is deleted, and a running Target keeps working (search again to fill its list).
- [ ] No mentions of Focus/Explore modes, pausing a session, strictness or the daily reminder anywhere.

### 2. Homepage and design

- [ ] youtube.com shows "What brings you here?" with YouTube's own search-box style, and "Just browsing? Take a break" with 15m / 30m / 1h and the leisure time left.
- [ ] Hard-refresh the homepage a few times: the feed never flashes before the card appears.
- [ ] With "Replace the homepage feed" off, the feed appears normally on refresh, right away in an open tab too.
- [ ] The indicator (mark + "Set Target") sits just right of YouTube's search box on a wide window, and next to Create below 1200px. Below about 860px it shows only the mark.
- [ ] YouTube's theme (Settings → Appearance) restyles everything Aim shows. No accent colors.
- [ ] Escape and clicking outside close Aim's menu and dialogs. The card on the video player stays until you choose.

### 3. Two states: a Target or a break

- [ ] With neither, open a video from a pasted link. It stays paused and a card **on the player** (not over the whole page) asks "What brings you here?", with a Target field and Just this video / 15m / 30m / 1h.
- [ ] **Just this video** plays it. The indicator shows "Break · 1 video". When the video ends, or you open another one, the break is over and the card returns.
- [ ] **15m** starts a break: the homepage feed comes back and videos play freely. The indicator counts down.
- [ ] Typing a Target on the card plays the video under that Target.

### 4. Purpose

- [ ] Search with no Target: your search becomes the Target, with no time limit. The results bar is one compact row: Target, a small **Change** link and a check (Target complete). No time left unless you set a limit.
- [ ] Click a result: it plays. The sidebar shows **Up next from your search** with the other results (thumbnails, titles, channels) instead of YouTube's recommendations.
- [ ] Scroll the results further, then open one from far down: it plays too (results are captured as they load).
- [ ] A playlist in the results: its videos play.
- [ ] Open a video your searches didn't find (a link in a description, a channel page, a pasted URL): "Not on your Target" on the player, with Back, a search box, Change Target, Save for later and break options. There's no "watch anyway".
- [ ] **Change Target** from that card: the new Target includes the video, which then plays.
- [ ] A related search ("sourdough starter" → "starter feeding schedule") continues silently.
- [ ] An unrelated one ("gaming laptop deals") hides its results behind "Is … part of your Target?". **Yes** shows them and they become watchable. **Change Target** or a break also work.
- [ ] **Set Target** from the indicator on a video page: that video plays. From the homepage, with no search yet: any video asks you to search first.
- [ ] The indicator menu shows Current Target, "No time limit · Set one", what's hidden, Take a break, Target complete, Change Target, Save, Hide or warn.

### 5. Breaks during a Target

- [ ] Menu → Take a break → 15m. The indicator shows "Break", the menu says "Your Target is waiting".
- [ ] **Back on Target** ends the break; the indicator shows the Target again.
- [ ] Let a break run out while **no** video plays: the Target resumes and a toast says the break is over.
- [ ] Let a break run out **while a video plays**: a notice says "Your break is over. Finish this video…". When the video ends (or after the grace period, 15 min by default), the video is paused and checked against your Target.
- [ ] To skip waiting, run this in the service worker console during a break:
      `chrome.storage.local.get("brk").then(({brk}) => chrome.storage.local.set({brk: {...brk, usedSec: brk.durationMin * 60 - 5}}))`

### 6. Limits

- [ ] **Daily leisure time** (Settings, default 1 hour): breaks are capped to what's left. When it's used up, the break chips are disabled with "Today's leisure time is used up". It resets at midnight.
- [ ] **Purpose time limit**: menu → Set one → 15m. When it runs out, a card on the player says "Time's up" with Target complete / Add 15 minutes / a break.
- [ ] **Daily YouTube limit** (Advanced): when reached, every video shows "That's today's YouTube time" and the homepage says so too. Nothing extends it until midnight.
- [ ] **Finish the current video** (Advanced): set "Stop right away" and let a break run out mid-video. The video pauses immediately.

### 7. Distractions (whenever you're not on a break)

- [ ] With a Target, or before choosing: no Shorts shelves on the homepage feed (during a break you'll see them), search results or channel pages, and no Shorts link in the left menu or mini menu.
- [ ] On a watch page: no recommendations in the sidebar or below the video on narrow windows, and no end-screen cards or suggestions when the video ends.
- [ ] YouTube's autoplay switch (in the player controls) is off. Take a break: it turns back on, and the sidebar and Shorts return. End the break: off again.
- [ ] If autoplay was already off before Aim, it stays off during breaks.
- [ ] A Short opened from a link during a Target shows "Shorts are hidden while you're on Target" on the player.
- [ ] Subscriptions and Trending show "Feeds are hidden…" with break options instead of the feed.
- [ ] The indicator menu says what's hidden, and **Adjust** opens Settings → Advanced → Distractions. Each switch there takes effect in open tabs right away.
- [ ] Hard-refresh a search results page: Shorts never flash before disappearing.
- [ ] Playlists in the sidebar (opened from a playlist) and live chat still show during a Target.

### 8. Target complete

- [ ] Menu → **Target complete** (or the results bar, homepage or time-up card) asks first: "Target complete? Did you find what you were looking for?" with Yes, I'm done / Partly / Not really / Keep going.
- [ ] Keep going closes it. The others land on the homepage with a short confirmation.
- [ ] Homepage with no Targets: "What brings you here?", one rounded field ("Tell me what you're looking for…") with a small arrow inside, three example requests, and no big Search YouTube button. Enter and the arrow both work.
- [ ] Popup with a Target: Resume (red), Take a Break, Done, then small Change Target · Set aside · All Targets links. It shows "N min so far" (time left only with a limit). **Resume** on a YouTube tab goes to the last video at the moment you left; on another site it opens a new tab instead. "Your activity" is folded.
- [ ] Results after a plain search, signed in: the librarian is folded behind the speech-bubble icon; clicking it opens the ask box. After a request it opens by itself.
- [ ] Up next from your search shows each video's length on its thumbnail, and no untitled "Video" entries (sponsored results are skipped).
- [ ] Recent in the popup (under Your activity) shows the Target (with its pivots), minutes, number of videos and your answer.

### 9. Step D details

- [ ] Homepage card: the line under "What brings you here?" reads "Whether you're preparing for an exam…", and the example chips (Study for my biology exam, Learn cabinetmaking…) fill the search box when tapped.
- [ ] Break chips everywhere include **Custom**: it becomes a minutes box with Start break.
- [ ] During a timed break the indicator counts down by the second ("Break 14:59 left") with an × that ends the break.
- [ ] When a break runs out with nothing playing: a "Break time is up" card offers Back on Target (or Set Target) and Extend break (15 min) while leisure time is left.
- [ ] Change Target and Set Target list your recent Targets; tapping one fills the box.
- [ ] Popup: current Target with a time ring (when there's a limit), Take a break / Change Target / Target complete working inline; This week (7 bars: on Target dark, breaks light) with totals and how many purposes found what you needed.
- [ ] The mark has a red bullseye (no play triangle) everywhere: toolbar (light and dark), YouTube, popup, settings.

### 10. Timer accuracy

- [ ] **Two YouTube windows side by side**, both visible, for 2 minutes. Today's time grows by about 2 minutes, not 4.
- [ ] **A video in a background tab** keeps counting while it plays.
- [ ] Miniplayer: start a video, open the miniplayer, browse. Time keeps counting.

### 11. Channels

- [ ] On a video: menu → Hide or warn about this channel → **Hide channel**. The toast confirms and the video keeps playing.
- [ ] That channel's videos disappear from the homepage feed (during a break), search results and the sidebar.
- [ ] Opening one of its videos directly shows "You chose to hide …" on the player, with Go back / Continue.
- [ ] **Warn me** on another channel: its videos ask before playing unless you have a Target.
- [ ] Settings → Advanced lists both. Switching Hide/Warn or removing takes effect immediately.

### 12. Aim Plus (only with a Supabase project; see supabase/README.md)

- [ ] With `config.js` empty: Settings has no Aim Plus section, and the service worker's Network panel shows no requests to Supabase.
- [ ] With `config.js` filled in: Settings → Aim Plus → enter your email → **Send code**. The email arrives with a 6-digit code (check the template shows `{{ .Token }}`).
- [ ] A wrong code says "That code didn't work". The right code signs in and shows "Plan: Aim Free".
- [ ] Set the plan to plus in SQL, reload Settings: "AI use, last 24 hours" appears. **Check connection** says "Connected" and a row appears in `ai_usage`.
- [ ] Close Chrome and reopen it after more than an hour: Settings still shows you signed in (the session refreshes).
- [ ] **Sign out** returns to the email form. Signing in again works.
- [ ] YouTube behaves exactly as without an account.

### 13. Picking up where you left off

- [ ] Set a Target, watch part of a video, then **Change Target** (menu or a "Not on your Target" card). The homepage shows the new one as **Current Target** with **Continue**, and the old one under **Recent Targets** with "Last active today" and **Resume**. No example chips.
- [ ] **Resume** the old one: the video opens at about the moment you left it, and plays (it's part of that Target). The other Target is now under Recent Targets.
- [ ] A Target with searches but no video resumes on its last search's results.
- [ ] Menu → **Set aside for later**: back on the homepage, no current Target, both under Recent Targets (at most two show).
- [ ] **View all Targets** (homepage, or the popup's All Targets link) opens a page with Current, Set aside (Resume, Remove) and Completed (Start again). **Start again** opens the last video watched for it.
- [ ] Searching related things ("spark plugs", "ignition coils" for "repair my engine") stays one Target; nothing new appears under Recent Targets.
- [ ] Resuming never opens TeachBack or anything AI.
- [ ] Popup: the Current card has "Set aside for later".

### 14. The librarian (signed in to an Aim account, free or Plus)

- [ ] Signed out: the homepage says "Your search becomes your Target", and nothing calls Aim's server (service worker Network panel).
- [ ] Signed in: the homepage says "Tell Aim what you want to accomplish. It'll help you find it."
- [ ] A plain search ("sourdough starter") goes straight to YouTube, as before.
- [ ] A request ("I need to replace the alternator on my 2014 Tacoma") shows "Aim is looking…", then opens YouTube results for a better search. The results bar shows the Target in your words with the librarian open: a short note, and maybe one question as choices ("2.7L / 4.0L V6") and "Also try" searches.
- [ ] Within a few seconds, "Aim's picks from these results" appears above YouTube's results: up to 3 groups, each video with a reason. YouTube's results are still below. Reloading shows the same picks immediately.
- [ ] Tapping a choice refines: new searches, same Target. "Find something that explains that last part more clearly" after watching a video understands what "that last part" was.
- [ ] A request for something unrelated starts a new Target and sets the old one aside.
- [ ] The librarian never writes instructions or long answers, only short notes and searches. Check a medical or repair question.
- [ ] Free accounts: after about 40 requests in a day, requests fall back to plain YouTube searches with a note.
- [ ] Studying ("I have a biology exam Friday on cellular respiration") on Plus shows "Studying this? Test my understanding".

### 15. Your data (signed in)

- [ ] Settings → Aim Plus → **Download my data** saves `aim-data-YYYY-MM-DD.json` with your account, AI use, TeachBack sessions and progress, and a `browser` section with your Targets, history and settings. No sign-in tokens anywhere in it.
- [ ] **Delete account…** asks you to type DELETE; the button stays disabled until you do. After deleting: Settings shows the sign-in form, and in Supabase the user, profile, learners, assessments, turns, progress and AI usage rows are all gone.
- [ ] Signing in again with the same email starts a fresh, empty account.

### 16. Study sessions (Aim Plus)

- [ ] A learning request ("I'm struggling with cellular respiration and have an exam Friday") shows "Studying this? Organize a study session · Test my understanding" in the results bar. A repair request doesn't.
- [ ] Organize a study session → paste a study guide → Start: "Planning…", then results for topic 1, headed "Topic 1 of N", with its brief. Aim's picks appear; the top ones become the topic's videos.
- [ ] Open one: the sidebar shows the study plan instead of Up next, with Check yourself, Next topic and the topic list. After it plays a little, the topic counts it as watched.
- [ ] Check yourself opens TeachBack with the topic and its brief filled in. After the results, the topic shows Checked or Review.
- [ ] Next topic goes to the next topic's results; the last topic offers See summary.
- [ ] The summary page (also "Overview" in the sidebar) shows each topic's videos (✓ watched), its check, Review links for weak spots, and Worth reviewing. End study session keeps the summary; the sidebar returns to Up next.
- [ ] Set the Target aside and resume it: the study session comes back where it was.

### 17. TeachBack (Aim Plus account on the plus plan)

- [ ] Settings → Aim Plus → **Test my understanding** opens TeachBack in a new tab. On YouTube, **Target complete?** shows "Learned something? Test my understanding" (Plus only; not when signed out or on Free).
- [ ] Start with a topic (and optionally notes): Milo asks a first, basic question within a few seconds.
- [ ] Answer well: a follow-up goes deeper. Answer vaguely: the next question comes from a different angle, without giving the answer away.
- [ ] **Give me a hint** shows one sentence and counts down (two per question). **Skip** moves on.
- [ ] After every objective is covered (or **End session**), results show each part as Demonstrated, Developing, Needs review or Not assessed, with your own words quoted, "With hints" where you used them, and Review on YouTube links.
- [ ] Reload the TeachBack tab mid-session: the same question comes back. Reload on results: results come back.
- [ ] In Supabase, `assessments`, `assessment_turns` and `progress_events` have rows for the session; `ai_usage` has one row per AI call.

### 18. Aim Homeschool preview (Settings → Advanced → Preview a student's Today screen)

- [ ] The first time Today shows, a spotlight tour runs: 5 stops, Back, Skip tour, "Let's start". It doesn't return; "Take the tour" on Today replays it.
- [ ] YouTube's homepage shows Today instead of the usual card: Aim mark with "Homeschool", "Good morning/afternoon/evening, Alex!", Ask Aim, Today's Plan (date, about 2h, 0 of 6 done), Current Unit, Up next this week, My Dashboard. YouTube's own search box and left menu are unchanged.
- [ ] Only the next item is highlighted, with the one blue button. The project shows "Do this together".
- [ ] Start on a video lesson opens YouTube results for it; the results bar says "Today's plan". Watch a video: beside it, the plan replaces Up next (this lesson, Mark done, Next, Back to Today).
- [ ] Back on Today, that lesson shows the video's thumbnail and **Continue**, which returns to where you left off. Playing it to about 90% (or Mark done) makes it quiet: a green check, "Done", "Watch again".
- [ ] View guide on the project: materials, steps, the "do it together" note, Mark done. The circles on the left also mark items done or not done.
- [ ] TeachBack's Start opens TeachBack on the topic (needs Aim Plus); finishing it marks the item done.
- [ ] With everything done: "You're done for today.", Go deeper searches and break choices, and the last lesson is no longer the Target.
- [ ] Dark theme and a narrow window (the side column moves below). "Turn off" brings back "What brings you here?". Reset sample plan (Settings) starts the day over.

### 19. Pathways (Aim Plus; signed in for "Where could this take me?")

- [ ] After a TeachBack check and a study session's summary: "Want more of this?" (Yes / Maybe / Not really) and "Where could this take me?". The latter unfolds four fields, each with a short problem; Hint and Answer stay hidden until clicked.
- [ ] On YouTube: "Where could this take me?" in a study topic's panel and on Today's lessons opens a dialog with the same.
- [ ] Settings → Pathways (or the link at the end of "Where could this take me?"): off at first, explains what it uses, asks where you are. Turn it on.
- [ ] Type an interest → careers (or kinds of work, for middle school) → Explore this path: hero, Overview with four step cards (Try it marked most important), Quick facts with an O*NET link instead of pay figures, "You might enjoy this if…", Related paths, and "Real people. Real stories." YouTube searches. No Prepare step for middle school.
- [ ] Try it: a brief with a client, constraints, deliverable, materials, steps, a professional's rubric, and "Do this together" when it needs a parent. I did it → three reflection questions; "Not for me" ends the path and shows under "What you've found out".
- [ ] After a few "Yes"/"Maybe" answers: a theme appears on the Pathways page, and once on YouTube's homepage (or Today) as "You've been exploring … Want to see …?". Not now and Don't suggest this both stop it showing.
- [ ] Turn off Pathways and delete its data: everything goes, including the answers.

### 20. In this video (Aim Plus, a learning Target)

- [ ] Watch a video with chapters for a learning Target (or a study session or Today lesson): "In this video" appears beside it, says it's from the title, description and chapters, and lists the concepts. Chapter times jump the video; "likely" marks concepts not named on the page.
- [ ] Open a concept: a one-line summary and "See it in another context" searches, which open in a new tab.
- [ ] A regulated subject (a private pilot oral exam video) names its references (the FAA's Airman Certification Standards, the Pilot's Handbook of Aeronautical Knowledge) and says Aim doesn't replace a certified instructor.
- [ ] Nothing appears for music or entertainment, or without a learning Target.
- [ ] When the video ends: "Finished. Test yourself on this video?" → TeachBack on the video, with its concepts as the notes. In a study session the result goes back to the topic.
- [ ] Reloading the video doesn't ask the AI again.

### 21. Relax with a theme, and notes (signed in)

- [ ] With a Target, type "I just want to enjoy some engineering videos" on the homepage: a 30-minute break starts (the Aim button reads "Relax: …"), the Target waits, and the results have a slim "Relaxing" bar with the librarian's note and other searches. No study offers, no picks to work through, no "In this video".
- [ ] A vague request ("engineering videos") leans toward recent Targets, and the note says so.
- [ ] Beside a video: "More on <theme>" from the theme's searches, above YouTube's own suggestions (which show, as on any break). It counts against leisure time; Add 15 minutes works.
- [ ] During any break, the Aim menu lists set-aside Targets as "Resume: …".
- [ ] Aim menu → Add notes: type, close, reopen: the notes are there. Suggest questions adds a few, never answers. The results bar's notes icon gets a dot.
- [ ] Notes stay with the Target through Set aside, Resume, Target complete and Start again, and show on the Targets page.

### 22. YouTube's own AI

- [ ] "In this video" → open a concept → **Ask YouTube about this**: the question is copied. With YouTube's Ask button under the video, it's outlined for a few seconds; without it, the search bar is, and the question names the video. Paste it in: YouTube answers.
- [ ] On a Target, use Ask in the search bar. Videos in its answer play without "Is this part of your Target?", and show up in Up next from your search. If Ask YouTube opens a page of its own, a video picked there plays too. Note the page's address and what Aim did, for selectors.
- [ ] A video from the homepage feed, a channel page or the sidebar still asks first.

### 23. Sync and reload

- [ ] Target complete from the popup while a YouTube tab is on a video: that tab shows the "What brings you here?" card on the player within a few seconds.
- [ ] Two YouTube tabs: starting a break or setting a Target in one updates the other's indicator, and a card waiting on the other tab's player clears if the new state allows its video.
- [ ] Reload the extension from `chrome://extensions` with a YouTube tab open. Aim's indicator disappears from that tab, videos play normally, and the tab console shows no repeating errors. Refreshing the tab brings Aim back.

### 24. Picking up a Target, with its videos (0.36)
- [ ] Watch two or three videos for a Target, then go to YouTube's home page. Under **Pick up where you left off**, the current Target shows its last video: thumbnail, title, channel, "Stopped at m:ss", and a coral line on the thumbnail showing how far you got. Clicking it continues at that moment.
- [ ] **See more (N)** opens a row of small thumbnails of the Target's other videos, newest first; clicking one plays it from where you stopped, still on the Target. **See less** folds the row away.
- [ ] Only videos you watched for that Target appear, never YouTube's suggestions; nothing plays or previews on hover.
- [ ] A Target with no videos yet (only searches) keeps the plain text card.
- [ ] Each Recent Target shows a small thumbnail of its last video; clicking it resumes that Target.
- [ ] All Targets: each Target with videos shows its last video's thumbnail (click to continue) and **See more videos (N)**.
- [ ] Light and dark themes.

### 25. Saved for later, Still looking?, Got my answer, your channels (0.37)
- [ ] Save a video for later (Aim menu → Save this video for later). YouTube's home page shows **Saved for later** with its thumbnail; hovering shows ×, which removes it.
- [ ] Clicking a saved video plays it as a one-video break (your Target's time doesn't count it). Watching it to the end removes it from the list.
- [ ] With something saved, start a 15-minute break: a notice offers your saved videos.
- [ ] With a Target, search three different ways without watching anything for more than a minute and a half: the results bar asks **Still looking?** Signed in, **Ask the librarian** opens it with the box focused; signed out, it gives a tip. **Not now** puts it away.
- [ ] Ask the librarian a quick question ("how do I reset my router?"): the Target's done button says **Got my answer** (home card, results bar, Aim menu) and ends it in one tap, with no questions.
- [ ] While watching, Aim menu → **Prefer, warn about or hide this channel** → Prefer. Its videos show a **Your channel** badge in search results; it never warns or blocks. Signed in, the librarian's picks put a fitting video from it first. Settings → Advanced → **Your channels** lists it with Prefer / Warn / Hide / Remove.

### 26. Your path, strict mode (0.38)
- [ ] All Targets: a Target with two or more searches shows **Your path: first → second → third**.
- [ ] Settings → Advanced → **Strict mode** on. "Add 15 minutes" (Time's up), "Continue" past a warned channel, and "Yes, it's part of it" for an unrelated search each ask why first; Continue stays disabled until you write a short sentence; "Never mind" changes nothing.
- [ ] The popup → Your activity → **Reasons you gave** lists them, newest first, with the Target. Strict mode off: no questions.

### 27. Put it to work, and a syllabus file (0.39, Plus)
- [ ] In a study session, check a topic, then open the summary: **Put it to work** offers **Suggest a project**. It suggests one small project with steps, a time estimate and what finishing it shows, aimed at what your check said to practice; regulated subjects get a safety note.
- [ ] **I did it** asks what you made or found out and keeps it with the session; **Suggest another** gives something different.
- [ ] Organize a study session → **Upload a file**: a .docx, a .pdf exported from Word or Google Docs, and a .txt each fill the study guide box with their text, to check before Start. A scanned PDF says to paste the text instead. Over 6,000 characters, it says only the start fits.

### 28. Today, for a study session (0.40, Plus)
- [ ] With a study session going, YouTube's home page shows **Today · <session>** in the current Target's card: how many topics are checked, **Next up** with Start (goes to that topic's search).
- [ ] A day after a check that found gaps, that topic shows as **Review today**, and Review searches for what needs practice.
- [ ] With every topic checked: **Put it to work** (or See summary once you've done it).

### 29. Learning record (0.41)
- [ ] Popup → **Learning record** (also linked from All Targets and a study session's summary) opens one page: totals (Targets completed, time on Target, study topics checked, ideas demonstrated, projects done), then each Target you worked on, newest first.
- [ ] A finished Target that had a study session still shows its topics, what each check showed, and the Put it to work project with your note.
- [ ] **Study sessions** and **Completed** filter the list; **Print or save as PDF** prints just the record (no buttons).

### 30. Learn something (0.42)
- [ ] With no topics chosen and no Target, YouTube's home page invites you to **Choose topics** (Settings → Learn something); **No thanks** hides it for good.
- [ ] Pick Math and Engineering: the home page shows **Learn something**, six new videos (three by two) from those channels, newest first, at most two per channel, no Shorts, each labeled with its channel and topic. The first visit takes a few seconds while feeds load; after that it's instant for a day.
- [ ] **Check every curated channel loads** (Settings lists them, each linked): a channel that never shows up has a wrong handle in content/topics.js.
- [ ] Clicking one starts the Target "Exploring: <title>"; the watch page's sidebar says **More from your topics** with the rest of the row.
- [ ] Videos you've watched aren't offered again; **Take out** a channel in Settings and its videos disappear; channels you marked Prefer join the row.
- [ ] With a Target going, the row isn't shown. Light and dark themes.

### 31. Plus page and subscribing (0.43–0.44, Plus)
- [ ] With a Plus server configured, the popup shows **Aim Plus**; it opens the Plus page. With none configured, the link isn't there.
- [ ] Signed out or on Free, the page lists the seven Plus features with no action buttons, and offers **Sign in to get started** or **Upgrade to Plus** (or "Subscriptions open soon" when billing isn't set up).
- [ ] **Upgrade to Plus** opens Stripe Checkout (test mode: card 4242 4242 4242 4242). After paying, the Plus page opens once with **Welcome to Aim Plus**, and each feature now has its button and a live line (your current study session, record totals).
- [ ] Settings → Aim Plus shows when it renews and **Manage subscription** (Stripe's portal). Cancelling there shows "Ends on …"; at the end, the plan goes back to Free.
- [ ] Deleting the account cancels the subscription in Stripe.

### 32. Sync across devices (0.45, Plus)
- [ ] Settings → Aim Plus shows **Sync across devices**, off. Turning it on says **Synced** and **Last synced just now**.
- [ ] In a second Chrome profile, sign in to the same account and turn sync on: Targets set aside appear under Set aside (one in progress elsewhere says so), finished ones and their study sessions appear on the Targets page and in the learning record, and Saved for later, settings and channel rules match.
- [ ] Finish a Target in one profile, then **Sync now** in the other: it's finished there too. Remove a saved video: it's gone in both. Time per day stays separate.
- [ ] **Remove synced copy from Aim's server** turns sync off and keeps everything in this browser. Signing out turns sync off.

### 33. Shorts from your topics (0.45)
- [ ] Settings → Learn something → **Shorts from your topics** on (with a topic chosen): YouTube's home page shows **Quick review**, five Shorts from your topics' channels, upright thumbnails, no "#shorts" in titles.
- [ ] After a study session on a topic (or a Target), a Short about it comes first, labeled **Reviews: <topic>**.
- [ ] Clicking one starts the Target "Quick review: …" and the Short plays, with a bar: **Quick review · 1 of 5** and **Next**. The last one says **Done reviewing**, which finishes the Target.
- [ ] Swiping to a Short YouTube picked: it waits behind **Only Shorts from your topics**, with **Next review**.
- [ ] Turn the setting off: every Short waits again, and Quick review is gone.

## Known issues (not regressions)

- The word check knows words, not meanings: synonyms ("tap" vs "faucet") get the question once; answering Yes teaches it that search.
- Up next links reload the page instead of using YouTube's in-page navigation, so they're a little slower than YouTube's own.
- Hiding the Shorts menu link matches YouTube's English label ("Shorts") as well as its link; other languages rely on the link alone.
- Aim changes YouTube's own autoplay switch. If Aim is removed during a Target, autoplay stays off until you switch it back on.
- Hiding channels depends on the channel link in each video tile. Tiles that only link the channel by ID, not by @handle, may not be matched.
- Miniplayer time counting relies on YouTube's `ytd-miniplayer` element and needs checking on real YouTube.
