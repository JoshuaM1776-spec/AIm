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

The "Up next from your search" list shows video thumbnails from YouTube's image server (i.ytimg.com), the same images YouTube itself shows.

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
- **TeachBack** (Aim Plus only): when you test your understanding, the topic, any notes you paste, the questions and your answers are stored on Aim's server with the results, so you can come back to them. Your answers are sent to the AI to evaluate them. Results are estimates, never shared, and deleted with your account.
- **Your Targets, searches, watch history and settings stay in your browser** as described above. They aren't uploaded unless a future feature asks you first.
- The sign-in session is kept in the extension's own storage on your computer, not readable by web pages.
- **Signing out** ends the session on this computer and on the server. To delete your account and everything stored with it, email us (below).

Aim Plus data is processed by Supabase (account service and database) and Anthropic (AI), each under their own privacy terms.

## Changes

If Aim adds features that send data anywhere else, this policy will be updated before that happens, and those features will be opt-in.

## Contact

Questions: [contact email]

Aim is not affiliated with, endorsed by or sponsored by YouTube or Google.
