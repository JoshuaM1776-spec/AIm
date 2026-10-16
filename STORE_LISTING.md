# Aim — Chrome Web Store listing (draft)

Everything the Chrome Web Store submission form asks for, ready to paste. Items marked **TODO** need a decision or an asset from you.

## Product details

**Name:** Aim (from `manifest.json`)

**Summary** (132 characters max, currently 122):
> Use YouTube on purpose. Your search becomes your purpose, Aim keeps you on it, and breaks are a choice with a daily limit.

**Category:** Productivity → Workflow & Planning

**Language:** English

**Description:**

> Aim helps you get what you came to YouTube for, without blocking what's useful about it.
>
> **Your search becomes your purpose.** Search YouTube as usual. Aim remembers why you're there, keeps later searches under the same purpose, and asks only when a search seems to head somewhere new.
>
> **Stay on track without trying.** While you're on purpose you watch what your own searches found. Shorts, recommendations, end screens and autoplay step out of the way, and the sidebar shows "Up next from your search" instead.
>
> **Change direction on purpose.** Changing purpose is one tap. Changing it without noticing is what Aim prevents.
>
> **Take a break when you want one.** Browse YouTube freely for 15 minutes, an hour, or just one video. Breaks share a daily leisure allowance you set, and Aim lets the video you're watching finish when time runs out.
>
> **Done means done.** Tell Aim when you've found what you needed. It won't push you to keep watching.
>
> **Looks like YouTube.** Aim follows YouTube's light and dark themes and fits into its top bar.
>
> **Private by design.** No account, no server, no analytics, no AI. Everything stays in your browser.
>
> Aim is not affiliated with YouTube or Google.

## Graphics (TODO: capture on real YouTube)

| Asset | Size | Notes |
|---|---|---|
| Store icon | 128×128 | `icons/128.png` |
| Screenshots | 1280×800 (1 to 5) | Suggested: homepage card · results with your purpose · watch page with Up next · "Not part of your purpose" · the popup |
| Small promo tile | 440×280 | Mark + name + one line |
| Marquee (optional) | 1400×560 | |

Don't show YouTube's logo prominently in screenshots or promos, and don't make the name read as "YouTube ___", to avoid implying affiliation.

## Privacy practices tab

**Single purpose:**
> Help people use YouTube intentionally: set a purpose for each visit, keep viewing on that purpose, and take deliberate, time-limited breaks.

**Permission justifications:**
- `storage`: stores the user's purposes, searches, watch time, settings and history locally on their device. Nothing is transmitted.
- Host access to `https://www.youtube.com/*` (content scripts): shows Aim's interface on YouTube and hides distractions. Aim runs on no other site.

**Remote code:** No, Aim does not use remote code. All code is in the package.

**Data usage** (for a build with an empty `config.js`, i.e. Aim Free only): Aim does not collect or transmit any user data. In the form, leave every data category unchecked. Under Chrome Web Store definitions, "collection" means transmitting off the device, and Aim's data stays in local extension storage. Certify the three disclosures:
- not sold to third parties;
- not used or transferred for purposes unrelated to the single purpose;
- not used or transferred to determine creditworthiness or for lending.

**When Aim Plus ships** (a build with `config.js` filled in), the answers change: tick **Personally identifiable information** (email address, for sign-in) and **Authentication information** (the sign-in session), keep the three certifications, mention the account in the description, and update "Private by design" to say Aim Free needs no account. Also add the Supabase project's host to the single-purpose and permission notes if Chrome asks.

**Privacy policy URL:** **TODO.** Publish `PRIVACY.md` at a public URL, for example the GitHub repo once it's connected, or a simple web page, and fill in the contact email first.

## Before submitting

- [ ] Run `TESTING.md` on real YouTube (light and dark, wide and narrow windows).
- [ ] Confirm the logo (`icons/`, see README → Rebranding). The name is Aim.
- [ ] Fill in the contact email in `PRIVACY.md` and publish it.
- [ ] Build the zip without `tests/`: `git archive --format=zip -o aim.zip HEAD ':!tests' ':!supabase' ':!docs'`.
- [ ] Developer account: one-time $5 registration fee, and verify a contact email.
