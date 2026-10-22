# Aim — Privacy Policy

_Last updated: October 2026. Applies to the Aim Chrome extension._

**The short version:** everything Aim knows stays in your browser. Aim Free has no account, no server, no analytics and no AI. Nothing you do is sent to the developer or anyone else. An optional Aim Plus account, if you choose to create one, is described [below](#aim-plus-accounts-optional).

## What Aim stores, and where

Aim keeps the following in your browser's extension storage (`chrome.storage.local`) on your computer:

- **Your purposes:** what you typed or searched, when, any time limit you set, whether you said you found what you needed, and changes of purpose.
- **Searches you made during a purpose,** and the search results those searches found. These decide which videos you can watch during that purpose.
- **Videos you watched** during a purpose or a break: the video ID, title, channel and how long you watched.
- **Time spent on YouTube** per day (on purpose, on breaks, in total), for the last 14 days.
- **Your settings,** **saved-for-later videos,** and **how you sorted channels** (Learn from, with your own topics; For breaks; Keep out).
- **Your YouTube subscriptions,** only if you ask Aim to read them (Your channels → Get my subscriptions): each channel's name, address and picture, read from YouTube's own subscriptions page in your YouTube tab.
- **History** of your last 200 purposes and breaks.
- **Your references,** only if you add them (Library → References): the text of protocols or course documents you upload or paste, with the name, level and region you give them. Files are read in your browser; the file itself isn't kept, only its text.

This data never leaves your computer. Aim does not sell, share or transfer it, and there is nothing to transfer it to.

## Network requests

Aim itself makes one kind of request: when you open a video, it asks YouTube's public "oEmbed" address on youtube.com for that video's title and channel, so it can tell which video is on screen. This request goes to YouTube, the site you're already on, and contains only the video's address.

Your references stay in this browser. When a scenario runs (Aim Plus), each turn sends the scenario's topic, your level and region, the names of the references you chose, the passages it needs (cited by document and passage, at most about 16,000 characters), and the scenario so far to Aim's server and the AI. Nothing of it is stored there beyond usage. The scenario in progress is kept in that browser tab; when it ends, its debrief is kept with the aim in your browser. **Go deeper** (Aim Plus) works the same way: the aim's name, the thing you're going deeper into, the levels so far and, for medical and flying aims, related passages from your references go to Aim's server for each new level; the chain is kept with the aim in your browser.

A study guide file you upload for a study session (Aim Plus) is read in your browser; only its text, which you see and can edit first, is sent, exactly as if you had pasted it.

"Learn something" reads the public video feeds of the channels for the topics you picked, from youtube.com, in your YouTube tab, about once a day (with "Shorts from your topics" on, also each channel's public Shorts list). It sends nothing about you; which topics you picked stays in this browser. Matching those Shorts to what you've learned happens in this browser, with no AI.

Paying for Aim Plus happens on Stripe's pages; Aim never sees your card. Aim's server keeps your Stripe customer id and your subscription's status and renewal date, to know your plan; deleting your account cancels the subscription and removes them.

Strict mode (off unless you turn it on) keeps the reasons you give for bending a rule in this browser, with the aim they were for; they never leave it.

The "Up next from your search" list, and the videos you've watched for an aim on the home screen and the aims page, show thumbnails from YouTube's image server (i.ytimg.com), the same images YouTube itself shows.

Your use of YouTube remains subject to YouTube's and Google's own privacy policies.

## Permissions

- **Storage:** to keep the data listed above on your computer.
- **Unlimited storage:** so long protocol documents fit in your browser's storage. It lets Aim keep more on your computer; it sends nothing anywhere.
- **Access to www.youtube.com:** to show Aim on YouTube pages: the purpose indicator, the cards and the distraction controls. Aim runs on no other site.

Aim switches YouTube's own autoplay setting off while you're not on a break, and back on afterwards if Aim was the one that switched it off. It changes no other YouTube settings.

## Your control

- **Clear history** in Aim's toolbar popup deletes your history of purposes and breaks.
- Settings, hidden channels and saved videos can be changed or removed in Aim's settings and popup.
- **Removing the extension deletes everything Aim stored.**

## Children

Aim Free collects no personal information from anyone, including children. Aim Plus accounts are for people aged 13 and over (or the minimum age in their country); a parent can create one for their household.

## Aim Plus accounts (optional)

<!-- Publish this section only in a build whose config.js names Aim's server. A build with an empty
     config.js has no account features, and the sections above describe it completely. -->

Signing in is optional, and Aim Free works the same without it. If you sign in under Settings → Aim Plus:

- **Your email address** is sent to Aim's account service (Supabase, our hosting provider) to email you a sign-in code and to identify your account. We don't use it for marketing.
- **Your account** stores your email, your plan (Free or Plus) and when it was created.
- **AI use** (Aim Plus only): when you use an AI feature, Aim sends what that feature needs (for example the topic you want to learn) to Aim's server, which sends it to Anthropic's Claude API to produce the answer. The server records the time, the feature, the model and the amount of text processed, to apply fair-use limits. Under Anthropic's commercial terms, this content isn't used to train their models.
- **The librarian** (any signed-in account): when you type a request into Aim's search box (not a plain search), Aim sends it to Aim's server and on to the AI, with the current aim's name, its recent searches, the titles of videos you watched for it and the librarian's earlier replies, so it can find better videos. On the results page it also sends the titles, channels and descriptions of the results YouTube showed you, and the names of channels you marked as preferred, to pick and explain the best ones. The server records only usage (time, feature, amount), not the requests. The conversation itself stays in your browser, with the aim. Signed out, Aim never does any of this.
- **Talking it through with the librarian** (any signed-in account; free accounts get one conversation a day): after you finish an aim (or, with Aim Plus, after a long stretch of exploring, or when you choose Talk it through), Aim sends the aim's name, its searches, the titles and channels of the videos you watched for it with roughly how long you watched each, your notes, a study session's topic names, and the conversation so far to Aim's server and the AI, so the librarian can ask about it. Never a video's audio. With Aim Plus and **Let the librarian read captions** turned on (Settings → The librarian; off until you turn it on), it also sends excerpts of the captions of the two or three videos you watched longest (the creator's captions or YouTube's automatic ones, read from YouTube in your browser at that moment), so its questions can be about what was said. Nothing of it is stored on the server beyond usage. With Aim Plus, the ideas you explained in your own words are kept **in your browser** (Settings → What the librarian remembers lists each, and you can forget any or all, or turn remembering off); a few related ones are sent along with later conversations. They aren't synced to Aim's server.
- **Speaking your reply** (optional): the microphone button in the librarian's panel uses Chrome's own speech recognition, which Chrome runs on Google's servers, to turn what you say into text in the reply box. Aim never records or keeps audio; nothing happens unless you press the button, and Chrome asks once for permission to use the microphone on YouTube.
- **Study sessions** (Aim Plus only): when you organize one, the aim and any study guide or notes you paste are sent to Aim's server and the AI to plan topics; nothing of it is stored there. The plan, the videos picked and your progress stay in your browser with the aim. Checks use TeachBack (below).
- **Relax with a theme and suggested questions** (any signed-in account): a request to the librarian also carries the names of your few most recent aims, so "something fun to watch" can lean toward them. "Suggest questions" in an aim's notes sends the aim's name, your notes, its searches and the titles of videos you watched for it. Nothing of either is stored on the server; notes stay in your browser with the aim.
- **"In this video"** (Aim Plus only, on videos you watch for a learning aim): sends the video's title, channel, description and chapters, and your aim's name, to Aim's server and the AI to list the concepts it covers; with captions turned on, also excerpts of the video's captions. Never the video's audio, and nothing is stored on the server; the result is kept in your browser so a video is only looked at once. "Test me on this video" uses TeachBack (below).
- **"Where could this take me?"** (any signed-in account): sends the subject or topic you asked about (and the lesson's one-line description) to Aim's server and the AI. Nothing about you, and nothing is stored.
- **Pathways** (Aim Plus only, off until you turn it on): your answers to "Want more of this?", the topics they're about, your reflections, the themes found and the paths you explore are kept in your browser. To find themes and write a path's steps, Aim sends the AI those topics and answers (never your watch history), the stage you chose (middle school, high school…), and the career or interest you're exploring; nothing of it is stored on the server. Pathways never uses your gender, background, family, income or location, gives no scores, and is never shared or sold. Turning it off deletes all of it from your browser.
- **TeachBack** (Aim Plus only): when you test your understanding, the topic, any notes you paste, the questions and your answers are stored on Aim's server with the results, so you can come back to them. Your answers are sent to the AI to evaluate them. Results are estimates, never shared, and deleted with your account.
- **Sync across devices** (Aim Plus only, off until you turn it on in Settings → Aim Plus): keeps a copy of your aims (their searches, the videos you watched for them with titles and channels, notes, study sessions and checks), your Saved for later videos, your settings and your channel rules on Aim's server with your account, so every browser where you sign in and turn it on has them. Time spent per day, breaks, strict-mode reasons and Pathways stay in each browser. **Remove synced copy from Aim's server** (same place) deletes the copy right away and turns sync off; deleting your account deletes it too; Download my data includes it.
- **Otherwise, your aims, searches, watch history and settings stay in your browser** as described above.
- The sign-in session is kept in the extension's own storage on your computer, not readable by web pages.
- **Signing out** ends the session on this computer and on the server.
- **Download my data** (Settings → Aim Plus) gives you one file with everything Aim's server holds for your account, plus what Aim keeps in your browser.
- **Delete account** (same place) permanently deletes your account and everything stored with it on Aim's server, right away. Aim's data in your browser stays until you clear it or remove the extension. Usage records Anthropic or Supabase keep under their own policies (for example for abuse prevention) follow their terms.

**Aim Homeschool** (a pilot; a separate account plan for families):

- **The parent's account** holds the family: each student's first name, their level in each subject, interests (optional), the curriculum plan (subjects, units, objectives, pacing) with each approved version, weekly plans with what was approved and when, preferred channels per subject, the materials marked as owned, and the curriculum files the parent adds.
- **Curriculum files** are read in the parent's browser; their text is kept for that family only, used only to plan for that family (sent to the AI to organize the curriculum and plan weeks), never shared with other families, never used to improve Aim or to train AI, and deleted when the parent deletes it or the account.
- **Students have no email or password.** A student's Chrome is connected to the family with a one-time code; Aim's server knows that browser only as an anonymous account tied to the student. It receives that day's approved plan and the family's preferred channels, and sends back which lessons were finished and which video was watched for a lesson. TeachBack checks from that browser are kept with the student, like any TeachBack.
- **What the parent sees:** the plan, lessons finished, and what TeachBack checks and projects showed for each objective. Lessons watched are shown apart from understanding.
- **Deleting:** the parent can disconnect a student's browser, remove a student (and everything for them), delete a curriculum file, or delete the account, which deletes the whole family's data on Aim's server. Download my data (on the website) includes all of it.

Aim Plus data is processed by Supabase (account service and database) and Anthropic (AI), each under their own privacy terms.

## Changes

If Aim adds features that send data anywhere else, this policy will be updated before that happens, and those features will be opt-in.

## Contact

Questions: [contact email]

Aim is not affiliated with, endorsed by or sponsored by YouTube or Google.
