# Aim — Privacy Policy

_Last updated: October 2026. Applies to the Aim Chrome extension._

**The short version:** everything Aim knows stays in your browser. Aim Free has no account, no server, no analytics and no AI. Nothing you do is sent to the developer or anyone else. An optional Aim Plus account, if you choose to create one, is described [below](#aim-plus-accounts-optional).

## What Aim stores, and where

Aim keeps the following in your browser's extension storage (`chrome.storage.local`) on your computer:

- **Your purposes:** what you typed or searched, when, any time limit you set, whether you said you found what you needed, and changes of purpose.
- **Searches you made during a purpose,** and the search results those searches found. These decide which videos you can watch during that purpose.
- **Videos you watched** during a purpose or a break: the video ID, title, channel and how long you watched.
- **Time spent on YouTube** per day (on purpose, on breaks, in total), for the last 14 days.
- **Your settings,** **saved-for-later videos,** and **channels you chose to hide or be warned about.**
- **History** of your last 200 purposes and breaks.

This data never leaves your computer. Aim does not sell, share or transfer it, and there is nothing to transfer it to.

## Network requests

Aim itself makes one kind of request: when you open a video, it asks YouTube's public "oEmbed" address on youtube.com for that video's title and channel, so it can tell which video is on screen. This request goes to YouTube, the site you're already on, and contains only the video's address.

The "Up next from your search" list, and the videos you've watched for a Target on the home screen and the Targets page, show thumbnails from YouTube's image server (i.ytimg.com), the same images YouTube itself shows.

Your use of YouTube remains subject to YouTube's and Google's own privacy policies.

## Permissions

- **Storage:** to keep the data listed above on your computer.
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
- **The librarian** (any signed-in account): when you type a request into Aim's search box (not a plain search), Aim sends it to Aim's server and on to the AI, with the current Target's name, its recent searches, the titles of videos you watched for it and the librarian's earlier replies, so it can find better videos. On the results page it also sends the titles, channels and descriptions of the results YouTube showed you, to pick and explain the best ones. The server records only usage (time, feature, amount), not the requests. The conversation itself stays in your browser, with the Target. Signed out, Aim never does any of this.
- **Study sessions** (Aim Plus only): when you organize one, the Target and any study guide or notes you paste are sent to Aim's server and the AI to plan topics; nothing of it is stored there. The plan, the videos picked and your progress stay in your browser with the Target. Checks use TeachBack (below).
- **Relax with a theme and suggested questions** (any signed-in account): a request to the librarian also carries the names of your few most recent Targets, so "something fun to watch" can lean toward them. "Suggest questions" in a Target's notes sends the Target's name, your notes, its searches and the titles of videos you watched for it. Nothing of either is stored on the server; notes stay in your browser with the Target.
- **"In this video"** (Aim Plus only, on videos you watch for a learning Target): sends the video's title, channel, description and chapters, and your Target's name, to Aim's server and the AI to list the concepts it covers. Never the video's audio or transcript, and nothing is stored on the server; the result is kept in your browser so a video is only looked at once. "Test me on this video" uses TeachBack (below).
- **"Where could this take me?"** (any signed-in account): sends the subject or topic you asked about (and the lesson's one-line description) to Aim's server and the AI. Nothing about you, and nothing is stored.
- **Pathways** (Aim Plus only, off until you turn it on): your answers to "Want more of this?", the topics they're about, your reflections, the themes found and the paths you explore are kept in your browser. To find themes and write a path's steps, Aim sends the AI those topics and answers (never your watch history), the stage you chose (middle school, high school…), and the career or interest you're exploring; nothing of it is stored on the server. Pathways never uses your gender, background, family, income or location, gives no scores, and is never shared or sold. Turning it off deletes all of it from your browser.
- **TeachBack** (Aim Plus only): when you test your understanding, the topic, any notes you paste, the questions and your answers are stored on Aim's server with the results, so you can come back to them. Your answers are sent to the AI to evaluate them. Results are estimates, never shared, and deleted with your account.
- **Your Targets, searches, watch history and settings stay in your browser** as described above. They aren't uploaded unless a future feature asks you first.
- The sign-in session is kept in the extension's own storage on your computer, not readable by web pages.
- **Signing out** ends the session on this computer and on the server.
- **Download my data** (Settings → Aim Plus) gives you one file with everything Aim's server holds for your account, plus what Aim keeps in your browser.
- **Delete account** (same place) permanently deletes your account and everything stored with it on Aim's server, right away. Aim's data in your browser stays until you clear it or remove the extension. Usage records Anthropic or Supabase keep under their own policies (for example for abuse prevention) follow their terms.

Aim Plus data is processed by Supabase (account service and database) and Anthropic (AI), each under their own privacy terms.

## Changes

If Aim adds features that send data anywhere else, this policy will be updated before that happens, and those features will be opt-in.

## Contact

Questions: [contact email]

Aim is not affiliated with, endorsed by or sponsored by YouTube or Google.
