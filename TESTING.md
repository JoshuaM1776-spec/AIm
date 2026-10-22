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

Last full run: October 19, 2026, all checks passing (after the fixes in 0.45.1: channel pages when YouTube's feeds fail, lengths from the title's spoken label, three corrected handles). Swiping to another Short can't be tried from a cloud server, where YouTube won't play video; check it by hand.

From a cloud session, the environment must allow `*.youtube.com`, `*.ytimg.com`, `*.googlevideo.com`, `*.ggpht.com`, `*.gstatic.com`, `*.googleapis.com` and `accounts.google.com`. YouTube may challenge cloud servers ("confirm you're not a bot") and refuse playback there; the page-structure checks still mean something, but the manual checklist on a real computer is the final word.

## Manual checklist (real YouTube)

### Setup

1. `chrome://extensions` → Developer mode on → **Load unpacked** → choose this folder.
2. Open the service worker console (the "service worker" link on the extension card) and keep it open to catch errors.
3. Nothing to configure: Aim needs no account or key.
4. Start from a clean profile, or clear data: service worker console → `chrome.storage.local.clear()`, then reload the extension.

### 1. Install, upgrade and settings

- [ ] **Opening a video in a new tab plays normally** (no "An error occurred. Please try again later"), with and without an aim. A video Aim holds starts for a split second, then pauses under the card.

- [ ] **Fresh install** (remove Aim first, then load it): the welcome tour opens in a new tab. Welcome and how it works on one screen → Let's go → Make it yours: four switches, already on, each saved right away, with **Customize with a preview** for the full designer → Want help finding the right video? (only when accounts are available) → You're all set → Open YouTube. Back, Skip and the arrow keys work; light and dark both look right.
- [ ] First YouTube visit: a tip points at the box ("Start here", 1 of 2), then at the Aim button. Neither comes back after a reload. The first search on an aim gets one tip about the results bar.
- [ ] **Updating** an existing Aim (reload over an older version): no welcome tab and no tips.
- [ ] Settings → "Show the welcome tour again" opens it and brings the tips back.
- [ ] Extension loads with no errors on the card.
- [ ] Service worker console: `chrome.storage.local.get("schemaVersion")` returns `{ schemaVersion: 5 }`.
- [ ] **Upgrade from 0.9** (same folder, then reload):
  - a running Focus session becomes your aim, without its timer;
  - an Explore session becomes a break;
  - history, saved videos and channels are kept.
- [ ] Popup shows the current aim or break, Saved for later, Today (on your aim / breaks / all YouTube) and Recent.
- [ ] Settings shows only "Replace the homepage feed" and "Daily leisure time", plus a collapsed **Advanced** section. Every change saves instantly. There's no API key or AI setting anywhere.
- [ ] **Upgrade from 0.11:** a stored API key is deleted, and a running aim keeps working (search again to fill its list).
- [ ] No mentions of Focus/Explore modes, pausing a session, strictness or the daily reminder anywhere.

### 2. Homepage and design

- [ ] youtube.com shows "What brings you here?" with YouTube's own search-box style, and "Just browsing? Take a break" with 15m / 30m / 1h and the leisure time left.
- [ ] Hard-refresh the homepage a few times: the feed never flashes before the card appears.
- [ ] With "Replace the homepage feed" off, the feed appears normally on refresh, right away in an open tab too.
- [ ] The indicator (mark + "Set aim") sits just right of YouTube's search box on a wide window, and next to Create below 1200px. Below about 860px it shows only the mark.
- [ ] YouTube's theme (Settings → Appearance) restyles everything Aim shows. No accent colors.
- [ ] Escape and clicking outside close Aim's menu and dialogs. The card on the video player stays until you choose.

### 3. Two states: an aim or a break

- [ ] With neither, open a video from a pasted link. It stays paused and a card **on the player** (not over the whole page) asks "What brings you here?", with an aim field and Just this video / 15m / 30m / 1h.
- [ ] **Just this video** plays it. The indicator shows "Break · 1 video". When the video ends, or you open another one, the break is over and the card returns.
- [ ] **15m** starts a break: the homepage feed comes back and videos play freely. The indicator counts down.
- [ ] Typing an aim on the card plays the video under that aim.

### 4. Purpose

- [ ] Search with no aim: your search becomes the aim, with no time limit. The results bar is one compact row: Aim, a small **Change** link and a check (Done with this aim). No time left unless you set a limit.
- [ ] Click a result: it plays. The sidebar shows **Up next from your search** with the other results (thumbnails, titles, channels) instead of YouTube's recommendations.
- [ ] Scroll the results further, then open one from far down: it plays too (results are captured as they load).
- [ ] A playlist in the results: its videos play.
- [ ] Open a video your searches didn't find (a link in a description, a channel page, a pasted URL): "Part of your aim?" on the player: **Back to my aim**, **Yes, it's part of it** (plays it and keeps it with the aim; strict mode asks why first), Change my aim. A search box, Save for later and break options sit under **More options**. A video from a channel you've already watched for this aim, or whose title shares a word with it, plays without asking (not in strict mode).
- [ ] **Change my aim** from that card: the new aim includes the video, which then plays.
- [ ] A related search ("sourdough starter" → "starter feeding schedule") continues silently.
- [ ] An unrelated one ("gaming laptop deals") hides its results behind "Is … part of your aim?". **Yes** shows them and they become watchable. **Change my aim** or a break also work.
- [ ] **Set aim** from the indicator on a video page: that video plays. From the homepage, with no search yet: any video asks you to search first.
- [ ] The indicator menu shows Your aim, "No time limit · Set one", what's hidden, Take a break, Done with this aim, Change my aim, Save, Hide or warn.

### 5. Breaks during an aim

- [ ] Menu → Take a break → 15m. The indicator shows "Break", the menu says "Your aim is waiting".
- [ ] **Back to my aim** ends the break; the indicator shows the aim again.
- [ ] Let a break run out while **no** video plays: the aim resumes and a toast says the break is over.
- [ ] Let a break run out **while a video plays**: a notice says "Your break is over. Finish this video…". When the video ends (or after the grace period, 15 min by default), the video is paused and checked against your aim.
- [ ] To skip waiting, run this in the service worker console during a break:
      `chrome.storage.local.get("brk").then(({brk}) => chrome.storage.local.set({brk: {...brk, usedSec: brk.durationMin * 60 - 5}}))`

### 6. Limits

- [ ] **Daily leisure time** (Settings, default 1 hour): breaks are capped to what's left. When it's used up, the break chips are disabled with "Today's leisure time is used up". It resets at midnight.
- [ ] **Purpose time limit**: menu → Set one → 15m. When it runs out, a card on the player says "Time's up" with Done with this aim / Add 15 minutes / a break.
- [ ] **Daily YouTube limit** (Advanced): when reached, every video shows "That's today's YouTube time" and the homepage says so too. Nothing extends it until midnight.
- [ ] **Finish the current video** (Advanced): set "Stop right away" and let a break run out mid-video. The video pauses immediately.

### 7. Distractions (whenever you're not on a break)

- [ ] With an aim, or before choosing: no Shorts shelves on the homepage feed (during a break you'll see them), search results or channel pages, and no Shorts link in the left menu or mini menu.
- [ ] On a watch page: no recommendations in the sidebar or below the video on narrow windows, and no end-screen cards or suggestions when the video ends.
- [ ] YouTube's autoplay switch (in the player controls) is off. Take a break: it turns back on, and the sidebar and Shorts return. End the break: off again.
- [ ] If autoplay was already off before Aim, it stays off during breaks.
- [ ] A Short opened from a link during an aim shows "Shorts are hidden while you're on your aim" on the player.
- [ ] Subscriptions and Trending show "Feeds are hidden…" with break options instead of the feed.
- [ ] The indicator menu says what's hidden, and **Adjust** opens Settings → Advanced → Distractions. Each switch there takes effect in open tabs right away.
- [ ] Hard-refresh a search results page: Shorts never flash before disappearing.
- [ ] Playlists in the sidebar (opened from a playlist) and live chat still show during an aim.

### 8. Done with this aim

- [ ] Menu → **Done with this aim** (or the results bar, homepage, time-up card or popup) ends it in one tap and lands on the homepage.
- [ ] A light card follows at the top of the homepage card (a notice elsewhere, so it never covers anything): "Done · N min on …", the videos, a quiet **Found what you needed? Yes · Partly · No** (answering says thanks in place), **Test my understanding** (Plus, learning aims) and **Not done? Pick it back up**.
- [ ] Homepage with no aims: "What brings you here?", one rounded field ("Tell me what you're looking for…") with a small arrow inside, three example requests, and no big Search YouTube button. Enter and the arrow both work.
- [ ] Popup with an aim: Resume (red), Take a Break, Done, then small Change my aim · Set aside · All aims links. It shows "N min so far" (time left only with a limit). **Resume** on a YouTube tab goes to the last video at the moment you left; on another site it opens a new tab instead. "Your activity" is folded.
- [ ] Results after a plain search, signed in: the librarian is folded behind the speech-bubble icon; clicking it opens the ask box. After a request it opens by itself.
- [ ] Up next from your search shows each video's length on its thumbnail, and no untitled "Video" entries (sponsored results are skipped).
- [ ] Recent in the popup (under Your activity) shows the aim (with its pivots), minutes, number of videos and your answer.

### 9. Step D details

- [ ] Homepage card: the line under "What brings you here?" reads "Whether you're preparing for an exam…", and the example chips (Study for my biology exam, Learn cabinetmaking…) fill the search box when tapped.
- [ ] Break chips everywhere include **Custom**: it becomes a minutes box with Start break.
- [ ] During a timed break the indicator counts down by the second ("Break 14:59 left") with an × that ends the break.
- [ ] When a break runs out with nothing playing: a "Break time is up" card offers Back to my aim (or Set aim) and Extend break (15 min) while leisure time is left.
- [ ] Change my aim and Set aim list your recent aims; tapping one fills the box.
- [ ] Popup: current aim with a time ring (when there's a limit), Take a break / Change my aim / Done with this aim working inline; This week (7 bars: on your aim dark, breaks light) with totals and how many purposes found what you needed.
- [ ] The mark has a red bullseye (no play triangle) everywhere: toolbar (light and dark), YouTube, popup, settings.

### 10. Timer accuracy

- [ ] **Two YouTube windows side by side**, both visible, for 2 minutes. Today's time grows by about 2 minutes, not 4.
- [ ] **A video in a background tab** keeps counting while it plays.
- [ ] Miniplayer: start a video, open the miniplayer, browse. Time keeps counting.

### 11. Channels

- [ ] On a video: menu → Hide or warn about this channel → **Hide channel**. The toast confirms and the video keeps playing.
- [ ] That channel's videos disappear from the homepage feed (during a break), search results and the sidebar.
- [ ] Opening one of its videos directly shows "You chose to hide …" on the player, with Go back / Continue.
- [ ] **Warn me** on another channel: its videos ask before playing unless you have an aim.
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

- [ ] Set an aim, watch part of a video, then **Change my aim** (menu or a "Not on your aim" card). The homepage shows the new one as **Your aim** with **Continue**, and the old one under **Recent aims** with "Last active today" and **Resume**. No example chips.
- [ ] **Resume** the old one: the video opens at about the moment you left it, and plays (it's part of that aim). The other aim is now under Recent aims.
- [ ] An aim with searches but no video resumes on its last search's results.
- [ ] Menu → **Set aside for later**: back on the homepage, no current aim, both under Recent aims (at most two show).
- [ ] **View all aims** (homepage, or the popup's All aims link) opens a page with Current, Set aside (Resume, Remove) and Completed (Start again). **Start again** opens the last video watched for it.
- [ ] Searching related things ("spark plugs", "ignition coils" for "repair my engine") stays one aim; nothing new appears under Recent aims.
- [ ] Resuming never opens TeachBack or anything AI.
- [ ] Popup: the Current card has "Set aside for later".

### 14. The librarian (signed in to an Aim account, free or Plus)

- [ ] Signed out: the homepage says "Your search becomes your aim", and nothing calls Aim's server (service worker Network panel).
- [ ] Signed in: the homepage says "Tell Aim what you want to accomplish. It'll help you find it."
- [ ] A plain search ("sourdough starter") goes straight to YouTube, as before.
- [ ] A request ("I need to replace the alternator on my 2014 Tacoma") shows "Aim is looking…", then opens YouTube results for a better search. The results bar shows the aim in your words with the librarian open: a short note, and maybe one question as choices ("2.7L / 4.0L V6") and "Also try" searches.
- [ ] Within a few seconds, "Aim's picks from these results" appears above YouTube's results: up to 3 groups, each video with a reason. YouTube's results are still below. Reloading shows the same picks immediately.
- [ ] Tapping a choice refines: new searches, same aim. "Find something that explains that last part more clearly" after watching a video understands what "that last part" was.
- [ ] A request for something unrelated starts a new aim and sets the old one aside.
- [ ] The librarian never writes instructions or long answers, only short notes and searches. Check a medical or repair question.
- [ ] Free accounts: after about 40 requests in a day, requests fall back to plain YouTube searches with a note.
- [ ] Studying ("I have a biology exam Friday on cellular respiration") on Plus shows "Studying this? Test my understanding".

### 15. Your data (signed in)

- [ ] Settings → Aim Plus → **Download my data** saves `aim-data-YYYY-MM-DD.json` with your account, AI use, TeachBack sessions and progress, and a `browser` section with your aims, history and settings. No sign-in tokens anywhere in it.
- [ ] **Delete account…** asks you to type DELETE; the button stays disabled until you do. After deleting: Settings shows the sign-in form, and in Supabase the user, profile, learners, assessments, turns, progress and AI usage rows are all gone.
- [ ] Signing in again with the same email starts a fresh, empty account.

### 16. Study sessions (Aim Plus)

- [ ] A learning request ("I'm struggling with cellular respiration and have an exam Friday") shows "Studying this? Organize a study session · Test my understanding" in the results bar. A repair request doesn't.
- [ ] Organize a study session → paste a study guide → Start: "Planning…", then results for topic 1, headed "Topic 1 of N", with its brief. Aim's picks appear; the top ones become the topic's videos.
- [ ] Open one: the sidebar shows the study plan instead of Up next, with Check yourself, Next topic and the topic list. After it plays a little, the topic counts it as watched.
- [ ] Check yourself opens TeachBack with the topic and its brief filled in. After the results, the topic shows Checked or Review.
- [ ] Next topic goes to the next topic's results; the last topic offers See summary.
- [ ] The summary page (also "Overview" in the sidebar) shows each topic's videos (✓ watched), its check, Review links for weak spots, and Worth reviewing. End study session keeps the summary; the sidebar returns to Up next.
- [ ] Set the aim aside and resume it: the study session comes back where it was.

### 17. TeachBack (Aim Plus account on the plus plan)

- [ ] Settings → Aim Plus → **Test my understanding** opens TeachBack in a new tab. On YouTube, **Done with this aim?** shows "Learned something? Test my understanding" (Plus only; not when signed out or on Free).
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
- [ ] With everything done: "You're done for today.", Go deeper searches and break choices, and the last lesson is no longer the aim.
- [ ] Dark theme and a narrow window (the side column moves below). "Turn off" brings back "What brings you here?". Reset sample plan (Settings) starts the day over.

### 19. Pathways (Aim Plus; signed in for "Where could this take me?")

- [ ] After a TeachBack check and a study session's summary: "Want more of this?" (Yes / Maybe / Not really) and "Where could this take me?". The latter unfolds four fields, each with a short problem; Hint and Answer stay hidden until clicked.
- [ ] On YouTube: "Where could this take me?" in a study topic's panel and on Today's lessons opens a dialog with the same.
- [ ] Settings → Pathways (or the link at the end of "Where could this take me?"): off at first, explains what it uses, asks where you are. Turn it on.
- [ ] Type an interest → careers (or kinds of work, for middle school) → Explore this path: hero, Overview with four step cards (Try it marked most important), Quick facts with an O*NET link instead of pay figures, "You might enjoy this if…", Related paths, and "Real people. Real stories." YouTube searches. No Prepare step for middle school.
- [ ] Try it: a brief with a client, constraints, deliverable, materials, steps, a professional's rubric, and "Do this together" when it needs a parent. I did it → three reflection questions; "Not for me" ends the path and shows under "What you've found out".
- [ ] After a few "Yes"/"Maybe" answers: a theme appears on the Pathways page, and once on YouTube's homepage (or Today) as "You've been exploring … Want to see …?". Not now and Don't suggest this both stop it showing.
- [ ] Turn off Pathways and delete its data: everything goes, including the answers.

### 20. In this video (Aim Plus, a learning aim)

- [ ] Watch a video with chapters for a learning aim (or a study session or Today lesson): "In this video" appears beside it, says it's from the title, description and chapters, and lists the concepts. Chapter times jump the video; "likely" marks concepts not named on the page.
- [ ] Open a concept: a one-line summary and "See it in another context" searches, which open in a new tab.
- [ ] A regulated subject (a private pilot oral exam video) names its references (the FAA's Airman Certification Standards, the Pilot's Handbook of Aeronautical Knowledge) and says Aim doesn't replace a certified instructor.
- [ ] Nothing appears for music or entertainment, or without a learning aim.
- [ ] When the video ends: "Finished. Test yourself on this video?" → TeachBack on the video, with its concepts as the notes. In a study session the result goes back to the topic.
- [ ] Reloading the video doesn't ask the AI again.

### 21. Relax with a theme, and notes (signed in)

- [ ] With an aim, type "I just want to enjoy some engineering videos" on the homepage: a 30-minute break starts (the Aim button reads "Relax: …"), the aim waits, and the results have a slim "Relaxing" bar with the librarian's note and other searches. No study offers, no picks to work through, no "In this video".
- [ ] A vague request ("engineering videos") leans toward recent aims, and the note says so.
- [ ] Beside a video: "More on <theme>" from the theme's searches, above YouTube's own suggestions (which show, as on any break). It counts against leisure time; Add 15 minutes works.
- [ ] During any break, the Aim menu lists set-aside aims as "Resume: …".
- [ ] Aim menu → Add notes: type, close, reopen: the notes are there. Suggest questions adds a few, never answers. The results bar's notes icon gets a dot.
- [ ] Notes stay with the aim through Set aside, Resume, Done with this aim and Start again, and show on the aims page.

### 22. YouTube's own AI

- [ ] "In this video" → open a concept → **Ask YouTube about this**: the question is copied. With YouTube's Ask button under the video, it's outlined for a few seconds; without it, the search bar is, and the question names the video. Paste it in: YouTube answers.
- [ ] On an aim, use Ask in the search bar. Videos in its answer play without "Is this part of your aim?", and show up in Up next from your search. If Ask YouTube opens a page of its own, a video picked there plays too. Note the page's address and what Aim did, for selectors.
- [ ] A video from the homepage feed, a channel page or the sidebar still asks first.

### 23. Sync and reload

- [ ] Done with this aim from the popup while a YouTube tab is on a video: that tab shows the "What brings you here?" card on the player within a few seconds.
- [ ] Two YouTube tabs: starting a break or setting an aim in one updates the other's indicator, and a card waiting on the other tab's player clears if the new state allows its video.
- [ ] Reload the extension from `chrome://extensions` with a YouTube tab open. Aim's indicator disappears from that tab, videos play normally, and the tab console shows no repeating errors. Refreshing the tab brings Aim back.

### 24. Picking up an aim, with its videos (0.36)
- [ ] Watch two or three videos for an aim, then go to YouTube's home page. Under **Pick up where you left off**, the current aim shows its last video: thumbnail, title, channel, "Stopped at m:ss", and a coral line on the thumbnail showing how far you got. Clicking it continues at that moment.
- [ ] **See more (N)** opens a row of small thumbnails of the aim's other videos, newest first; clicking one plays it from where you stopped, still on the aim. **See less** folds the row away.
- [ ] Only videos you watched for that aim appear, never YouTube's suggestions; nothing plays or previews on hover.
- [ ] An aim with no videos yet (only searches) keeps the plain text card.
- [ ] Each Recent aim shows a small thumbnail of its last video; clicking it resumes that aim.
- [ ] All aims: each aim with videos shows its last video's thumbnail (click to continue) and **See more videos (N)**.
- [ ] Light and dark themes.

### 25. Saved for later, Still looking?, Got my answer, your channels (0.37)
- [ ] Save a video for later (Aim menu → Save this video for later). YouTube's home page shows **Saved for later** with its thumbnail; hovering shows ×, which removes it.
- [ ] Clicking a saved video plays it as a one-video break (your aim's time doesn't count it). Watching it to the end removes it from the list.
- [ ] With something saved, start a 15-minute break: a notice offers your saved videos.
- [ ] With an aim, search three different ways without watching anything for more than a minute and a half: one quiet line under the results bar says **Still looking?** Signed in, **Tell Aim what you need** opens the librarian with the box focused; signed out, it gives a tip. The × puts it away.
- [ ] Ask the librarian a quick question ("how do I reset my router?"): the aim's done button says **Got my answer** (home card, results bar, Aim menu) and ends it in one tap, with no questions.
- [ ] While watching, Aim menu → **Prefer, warn about or hide this channel** → Prefer. Its videos show a **Your channel** badge in search results; it never warns or blocks. Signed in, the librarian's picks put a fitting video from it first. Settings → Advanced → **Your channels** lists it with Prefer / Warn / Hide / Remove.

### 26. Your path, strict mode (0.38)
- [ ] All aims: an aim with two or more searches shows **Your path: first → second → third**.
- [ ] Settings → Advanced → **Strict mode** on. "Add 15 minutes" (Time's up), "Continue" past a warned channel, and "Yes, it's part of it" for an unrelated search each ask why first; Continue stays disabled until you write a short sentence; "Never mind" changes nothing.
- [ ] The popup → Your activity → **Reasons you gave** lists them, newest first, with the aim. Strict mode off: no questions.

### 27. Put it to work, and a syllabus file (0.39, Plus)
- [ ] In a study session, check a topic, then open the summary: **Put it to work** offers **Suggest a project**. It suggests one small project with steps, a time estimate and what finishing it shows, aimed at what your check said to practice; regulated subjects get a safety note.
- [ ] **I did it** asks what you made or found out and keeps it with the session; **Suggest another** gives something different.
- [ ] Organize a study session → **Upload a file**: a .docx, a .pdf exported from Word or Google Docs, and a .txt each fill the study guide box with their text, to check before Start. A scanned PDF says to paste the text instead. Over 6,000 characters, it says only the start fits.

### 28. Today, for a study session (0.40, Plus)
- [ ] With a study session going, YouTube's home page shows **Today · <session>** in the current aim's card: how many topics are checked, **Next up** with Start (goes to that topic's search).
- [ ] A day after a check that found gaps, that topic shows as **Review today**, and Review searches for what needs practice.
- [ ] With every topic checked: **Put it to work** (or See summary once you've done it).

### 29. Learning record (0.41)
- [ ] Popup → **Learning record** (also linked from All aims and a study session's summary) opens one page: totals (aims completed, time on aims, study topics checked, ideas demonstrated, projects done), then each aim you worked on, newest first.
- [ ] A finished aim that had a study session still shows its topics, what each check showed, and the Put it to work project with your note.
- [ ] **Study sessions** and **Completed** filter the list; **Print or save as PDF** prints just the record (no buttons).

### 30. Learn something (0.42; replaced by Explore in 0.50, see 39)
- [ ] With no topics chosen and no aim, YouTube's home page has one quiet line, **Learn something new? Choose topics** (opens Design your YouTube → Home); its × hides it for good.
- [ ] Pick Math and Engineering: the home page shows **Learn something**, six new videos (three by two) from those channels, newest first, at most two per channel, no Shorts, each labeled with its channel and topic. The first visit takes a few seconds while feeds load; after that it's instant for a day.
- [ ] **Check every curated channel loads** (Settings lists them, each linked): a channel that never shows up has a wrong handle in content/topics.js.
- [ ] Clicking one starts the aim "Exploring: <title>"; the watch page's sidebar says **More from your topics** with the rest of the row.
- [ ] Videos you've watched aren't offered again; **Take out** a channel in Settings and its videos disappear; channels you marked Prefer join the row.
- [ ] With an aim going, the row isn't shown. Light and dark themes.

### 31. Plus page and subscribing (0.43–0.44, Plus)
- [ ] With a Plus server configured, the popup shows **Aim Plus**; it opens the Plus page. With none configured, the link isn't there.
- [ ] Signed out or on Free, the page lists the seven Plus features with no action buttons, and offers **Sign in to get started** or **Upgrade to Plus** (or "Subscriptions open soon" when billing isn't set up).
- [ ] **Upgrade to Plus** opens Stripe Checkout (test mode: card 4242 4242 4242 4242). After paying, the Plus page opens once with **Welcome to Aim Plus**, and each feature now has its button and a live line (your current study session, record totals).
- [ ] Settings → Aim Plus shows when it renews and **Manage subscription** (Stripe's portal). Cancelling there shows "Ends on …"; at the end, the plan goes back to Free.
- [ ] Deleting the account cancels the subscription in Stripe.

### 32. Sync across devices (0.45, Plus)
- [ ] Settings → Aim Plus shows **Sync across devices**, off. Turning it on says **Synced** and **Last synced just now**.
- [ ] In a second Chrome profile, sign in to the same account and turn sync on: Aims set aside appear under Set aside (one in progress elsewhere says so), finished ones and their study sessions appear on the aims page and in the learning record, and Saved for later, settings and channel rules match.
- [ ] Finish an aim in one profile, then **Sync now** in the other: it's finished there too. Remove a saved video: it's gone in both. Time per day stays separate.
- [ ] **Remove synced copy from Aim's server** turns sync off and keeps everything in this browser. Signing out turns sync off.

### 33. Shorts from your topics (0.45)
- [ ] Settings → Learn something → **Shorts from your topics** on (with a topic chosen): YouTube's home page shows **Quick review**, five Shorts from your topics' channels, upright thumbnails, no "#shorts" in titles.
- [ ] After a study session on a topic (or an aim), a Short about it comes first, labeled **Reviews: <topic>**.
- [ ] Clicking one starts the aim "Quick review: …" and the Short plays, with a bar: **Quick review · 1 of 5** and **Next**. The last one says **Done reviewing**, which finishes the aim.
- [ ] Swiping to a Short YouTube picked: it waits behind **Only Shorts from your topics**, with **Next review**.
- [ ] Turn the setting off: every Short waits again, and Quick review is gone.

### 34. Your channels (0.46)
- [ ] Settings → Your channels → **Sort your channels** opens the page: four columns, Not sorted, Learn from, For breaks, Keep out.
- [ ] **Get my subscriptions from YouTube** (signed in to YouTube) opens your subscriptions page; Aim scrolls through it and says how many it found. Back on the page, they're all under Not sorted. Signed out, it says to sign in.
- [ ] Channels Learn something already lists are suggested under their topic; one you watched for two aims is suggested too. **Accept suggestions** sorts them.
- [ ] Tap **Learn / Break / Out** on a card, or drag it to a column. Add a topic of your own (Woodworking) and drag a channel into it. × unsorts. Find a channel filters.
- [ ] Learn something on YouTube's home page now includes Learn from channels, labeled with your topic.
- [ ] On an aim, opening a video from a For breaks channel asks first, with **Just this video** as a break; on a break it just plays.
- [ ] Keep out → Hide removes its videos from the homepage, results and sidebar; Ask first asks before watching without an aim.
- [ ] Aim's menu while watching → **Sort this channel** offers Learn from, For breaks, Hide and **All your channels**.

### 35. Aim Homeschool: the parent website and the student's Chrome (0.47, pilot)
- [ ] On the website, sign in (code or link). A new family starts setup; stop halfway and Overview says **Finish setting up**.
- [ ] Setup: a student with a level per subject; "The whole plan" isn't offered; a curriculum file (.pdf, .docx or .txt) is read in the browser and can't be added without ticking the confirmation.
- [ ] **Organize my curriculum**: only what's in the file appears; lines Aim inferred say "check this". Move a unit above one it builds on: a warning, nothing blocked. Approve.
- [ ] **Propose this week**: lessons by school day with objectives and why; a TeachBack check; a project with materials and safety. Subjects without a preferred channel are one decision each; the week can't be approved until each is decided.
- [ ] Edit, move, remove, pick a video by link, "Find another", and ask for a change in plain words. Approve the week. Edit it again: "Changed since you approved it"; the student still sees the approved version; **Undo my changes** works.
- [ ] Projects & Materials: the next four weeks; tick what you own; Copy what's needed; Print; Materials ready, Completed.
- [ ] Student's Chrome: Aim's Settings → **A student? Connect to my family** → the code from the website. YouTube's homepage shows Today with that day's approved lessons. Mark one done: the parent's Overview counts it. A TeachBack from Today shows on Progress as Demonstrated, Developing or Needs review, with its evidence.
- [ ] Settings → Disconnect the browser: on its next refresh, the student's Chrome is back to plain Aim.

### 36. Design your YouTube (0.48)
- [ ] The welcome tour's Make it yours screen offers **Customize with a preview** (Design your YouTube); it opens at Step 1 of 3 with a preview of YouTube's homepage.
- [ ] Every choice changes the preview at once. Home: **A clean page with my aim** (no videos), **Videos from channels I choose** (topic picks appear under it; real thumbnails once they've loaded on YouTube), **The regular YouTube feed**. Shorts: **Hide**, **Only from selected channels** (asks for channels if none), **Show all**. Watching: the watch page, with Up next from your search or recommendations, and autoplay. (Time limits aren't a stage for now; they're in More settings.)
- [ ] After applying **A clean page**, YouTube's homepage shows only What brings you here?, even with topics picked.
- [ ] **Before** shows YouTube as it was. Nothing changes on YouTube until **Apply to YouTube** on the before-and-after; then YouTube matches the design.
- [ ] Settings → **Design your YouTube**, and its Jump to links, open a stage directly. Clicking a part of the preview opens its stage. A change shows **Changes not applied yet**, with Undo.
- [ ] A student's browser connected to a family shows the design but can't change it.

### 48. References and Ways to practice (0.58)
- [ ] Library → **References** (also Settings → Your references). Add a PDF, Word or text protocol: "Read …: about Nk characters", the name filled from the file. Pick EMT, add a region, **Add to references**: it's listed with its passages and level.
- [ ] Paste text instead of a file: same result. Under 200 characters: "That document has too little text to use…".
- [ ] **See what Aim reads**: "epinephrine anaphylaxis" shows the protocol's passages on it, each with a citation like [R1.4] and its heading. A scanned PDF reads as little or no text (paste instead).
- [ ] Change a document's level from its list; Remove asks first, then it's gone.
- [ ] An aim's page has **Ways to practice**: Talk it through, Put it into practice, and Put it together (with a map) or Check yourself (study sessions); one marked **Best for this aim** (ready to put it together → that; a practice not tried → that; otherwise Talk it through). A health or EMS aim ("EMT medications") adds **Scenario**, pointing to your references.
- [ ] A "how does X work" learn aim's parts follow what's happening → why → what counteracts it; the librarian's questions follow that order and never quiz doses.

## Known issues (not regressions)

- The word check knows words, not meanings: synonyms ("tap" vs "faucet") get the question once; answering Yes teaches it that search.
- Up next links reload the page instead of using YouTube's in-page navigation, so they're a little slower than YouTube's own.
- Hiding the Shorts menu link matches YouTube's English label ("Shorts") as well as its link; other languages rely on the link alone.
- Aim changes YouTube's own autoplay switch. If Aim is removed during an aim, autoplay stays off until you switch it back on.
- Hiding channels depends on the channel link in each video tile. Tiles that only link the channel by ID, not by @handle, may not be matched.
- Miniplayer time counting relies on YouTube's `ytd-miniplayer` element and needs checking on real YouTube.

### 37. Aims, and fewer interruptions (0.49)
- [ ] Nowhere in the extension says "Target": it's **your aim** (Set aim, Back to my aim, Change my aim, Your aims, Done with this aim).
- [ ] Each moment in docs/INTERRUPTIONS.md behaves as its "Now" column says: one-tap Done with the light card after, "Part of your aim?" asked less often and with a Yes, quiet lines for Still looking? and Learn something new?, two first-time tips, a three-screen welcome.

### 38. Polish (0.49.1)
- [ ] The homepage card is short: the question, the box, one hint, and on a first visit one line of two examples ("Try …"). No paragraph under the title.
- [ ] Settings → **Your YouTube** describes the current design in three lines (Home, Shorts, Watching), each with **Change** opening that stage. There are no separate switches for Shorts, recommendations, feeds, autoplay, strict mode or topics anywhere else in Settings.
- [ ] Settings → **Learn something channels** lists the channels behind your topics, with Take out / Put back; with no topics, it links to Choose topics.

### 39. Explore (0.50)
- [ ] YouTube's homepage: under the box and examples, one line, **Not sure what you're looking for? Explore**. No row of videos on the homepage.
- [ ] Explore with no interests: "A bit of everything", picks from several subjects. **Pick interests** shows the subjects as chips; tapping one saves it and the picks change.
- [ ] With interests: **From your interests** (newest first, taking turns between channels, no Shorts, nothing you've watched) and **Something different** (up to four from subjects you haven't picked; the subjects change daily). About twelve in all.
- [ ] The list ends with "That's today's picks." **Show others** shows ones you haven't seen; when they run out: "That's everything new for today."
- [ ] Picking one starts **Exploring <subject>**. Other picks, and other videos from the same channels, play without asking. The sidebar says **More to explore**, with **Go deeper on this? Make it my aim** at the top.
- [ ] **Make it my aim** turns it into an aim named after the video, keeping the video and its time; the chip shows the new aim and the Go deeper line goes away.
- [ ] With Shorts from your topics on, Explore shows the Quick review row.
- [ ] Set-aside aims on the homepage say what's next: "Next: review Glycolysis", "Next: Krebs cycle", or "Next: finish “…” · N min left".
- [ ] Design your YouTube → Home has two choices: a clean page (with Explore) or YouTube's feed.

### 40. Talking it through with the librarian (0.51)
Needs a signed-in account and the server redeployed with `supabase/functions/ai/talk.ts`.
- [ ] Finish a learning aim with a couple of videos watched: the card after Done asks one question about **this** session, naming something from it (a video's subject, a search, what you were trying to do). Not "What did you learn?". No "Found what you needed?" and no Test my understanding beside it.
- [ ] **Reply** opens a small panel at the bottom right. Answer in a sentence: the librarian reacts to what you said (no "Great answer!"), maybe asks one more, and ends on a remark, not a question. Focus: up to three questions. Explore: one.
- [ ] Say something wrong on purpose: it corrects it plainly, in a sentence. Ask it something it can't know from titles: it doesn't pretend to have seen the video.
- [ ] Free account: one conversation a day; a second one says "That's today's conversation." Plus: no limit.
- [ ] Plus: after it ends, "Remembered: …". Settings → **What the librarian remembers** lists it with Forget, Forget everything, and an off switch (off: nothing new is kept).
- [ ] Plus, exploring: after three videos (or 30 minutes), going back to the homepage shows one invitation at the top of the card. Maybe later: gone, and not offered again for that session; the next one waits two days.
- [ ] Plus: watch a video whose title shares a subject with something remembered from a few days ago: the sidebar shows "This connects to something you were into: …" with **Talk about it**.
- [ ] Plus, in a study session: Aim's menu → **Talk it through**; afterwards, the topics it covered show their result (Review today / the homepage's next step).
- [ ] Signed out: none of this appears.

### 41. Your understanding and the finish line (0.52)
Needs a signed-in account and the server redeployed (the librarian's map and talk.ts's Synthesis mode).
- [ ] Ask the librarian a learning goal ("I want to understand why the Western Roman Empire fell"): the homepage's current aim shows **Your understanding**: 3 to 6 parts in no particular order, each "Not yet explored", plus *How these fit together*, and "Worth exploring next: … · Search". A repair or a quick question shows no map.
- [ ] Watch a minute or more of a video on one part (found by its search, or plainly about it): that part becomes **Explored**. Nothing else moves it further.
- [ ] Talk a session through and explain a part: it becomes **Explained** (or **Getting there**). Explaining it badly later moves it back to Getting there.
- [ ] Hover a part: × removes it ("Not part of it for me").
- [ ] With two or more explained and most at least partly: **Put it together**. The librarian asks for the whole answer in a few sentences, then says what it does well and what it leaves out (or where experts disagree). If it's solid: **Call it done** ends the aim; **Explore the debates** starts a new aim on where people disagree.
- [ ] Finishing an aim that's ready (Done) asks the put-it-together question in the card after Done.
- [ ] Set-aside aims with a map say "Next: <part> · N of M explained" or "Next: put it together".
- [ ] Off-aim card: **Follow this instead** opens Change my aim with the video's subject filled in; the old aim waits.

### 42. The visual refresh (0.53)
- [ ] Popup: **Focus** and **Explore** at the top (the one you're in is filled in; Explore opens Explore on YouTube), your aim with its last video's thumbnail and **Change**, Resume / Done, **Session tools** (Take a Break, Ask the Librarian when signed in, Save for later on a video), and a Session limit bar when the aim has a limit.
- [ ] Your aims: **Active**, **Exploring** and **Completed** tabs with counts, **+ New aim**, and a progress line for aims with a map ("2 of 4 explained") or a study session.
- [ ] Settings: a menu on the left (General, YouTube experience, and The librarian / Aim Plus when they apply) that jumps to each group and marks where you are; on a narrow window it's a row of links.
- [ ] Explore: "Good morning/afternoon/evening." with subject chips (All, then each subject in today's picks) that filter the picks.
- [ ] Welcome: "Make YouTube work for you." then "What would you like to change?" with four switches on and **Set a daily time limit** off (checking it shows how long).
- [ ] The librarian's panel: a microphone next to Send (Chrome asks for the microphone once); what you say appears in the reply box.
- [ ] A video playing for your aim shows a small **Staying on track** pill on the player for a few seconds; tapping it opens Aim's menu.

### 43. Captions for the librarian (0.54, Aim Plus, preview)
Needs Aim Plus and the server redeployed.
- [ ] Settings → The librarian → **Video understanding (Preview)**: "Let the librarian read captions" is off. Turn it on.
- [ ] Watch two or three videos with captions for a learning aim, then Done: the librarian's question can mention what a video said, with a time that's a link ("… 0:45"). Clicking it opens that video at that moment (or jumps there, if it's the one playing).
- [ ] A video without captions: the conversation still works, from titles.
- [ ] Settings now says "Captions were there for N of the last M videos it looked at." Note what it says after a week of normal use: that's how often this can help.
- [ ] "In this video" on a captioned video: it says "From the video's captions, title, description…", and concepts have times even without chapters.
- [ ] Turn it off: no caption requests at all (DevTools → Network on YouTube: no `timedtext`).

### 44. Put it into practice (0.55)
Needs a signed-in account and the server redeployed.
- [ ] Talk through a practical aim after a few videos (cabinet doors, circuits, budgeting, photography): sometimes the closing message comes with **Put it into practice**: one small activity (under an hour, beginner tools), why it helps, **Find a project video** and **Save for later**. Often there's none; that's intended.
- [ ] A history or "why" aim gets no practice suggestion (Put it together is the application). Explore never gets one.
- [ ] Hazardous subjects (mains wiring, power tools, chemicals) only get a beginner-safe version, or none.
- [ ] **Find a project video** searches YouTube for it within the aim (no "part of your aim?" question), with the librarian's picks.
- [ ] **Save for later**: it's on the homepage under the aim. **I tried it** takes an optional note. Set-aside aims say "Next: try it · …".
- [ ] The next conversation on that aim starts by asking how it went, using your note.
- [ ] Study sessions' project step is now called **Put it into practice** too.

### 45. The library and aim pages (0.56)
- [ ] Popup → **My library** (or the homepage's **Your library**): every aim is a book: the subject's color and icon (History, Science, Craft, …), its name in a serif, and a progress line when there's something to measure. Under each: where it stands. All / In progress / Completed, a search box, and a **+ New aim** book.
- [ ] Open a book: the aim's page. The book on the left with its sections; the aim's state and name; **Continue on YouTube** / **Pick it up** / **Start again**.
- [ ] A learning aim with a map: Your understanding (each part, Search for it), **A question to explore** (or **Ready to put it together** → opens the librarian on YouTube), **Put it into practice** (Find a project video, I tried it).
- [ ] What you've learned (what you explained to the librarian about it), Key videos (thumbnails with where you stopped; click plays from there), Notes & ideas (save works for set-aside and finished aims too), your path, Related aims.
- [ ] The homepage's aim name and the popup's aim open its page. Light and dark both look right.

### 46. Popup, pill and suggested videos (0.57)
- [ ] Popup: your aim with its book (as on the library shelf), Resume / Done, and tiles for **Take a Break**, **Librarian** (signed in; opens the conversation on your YouTube tab) and **My Library**. With a time limit: "Session · 32 of 90 minutes" and a bar.
- [ ] The Staying on track pill on the player also names the aim ("Learning: …", or "Exploring: History").
- [ ] Talking it through: sometimes, after you reply, the librarian suggests a video ("A visual explanation", "A simpler explanation", "A different perspective", "Going deeper") with why. The card is a real video (YouTube's top result for its search). Clicking it plays it as part of your aim. It never says it will draw or show something itself.

### 47. Book covers (0.57.1)
- [ ] The library is a bookcase: dark wood, each row of books on a plank. Covers are clothbound: woven texture, a spine with raised bands, a double gilt frame, the subject in small capitals between rules, the name in gold serif type, and an engraved emblem (the Colosseum for history, an atom for science, a hand plane for craft, a column for leadership, an open book, a seedling…).
- [ ] Long names fit (a smaller size), and so does a single long word. The aim page's large cover and the popup's small one match.
