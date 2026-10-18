# Aim — Chrome Web Store listing (draft)

Everything the Chrome Web Store submission form asks for, ready to paste. Items marked **TODO** need a decision or an asset from you.

## Product details

**Name:** Aim (from `manifest.json`)

**Summary** (132 characters max, currently 115):
> Study on YouTube without getting distracted. Your search becomes your Target, and Aim helps you stay focused on it.

**Rule for this listing:** describe only what works in the submitted build. Don't mention AI study sessions, TeachBack or Aim Plus until they ship (Chrome Web Store policy requires an accurate listing).

**Category:** Productivity → Workflow & Planning

**Language:** English

**Description:**

> Want to study on YouTube without getting distracted? You came to YouTube for a reason. Aim helps you accomplish it, whether you're preparing for an exam, learning a new skill or finding a quick answer, without blocking what's useful about YouTube.
>
> **Your search becomes your Target.** Search YouTube as usual. Aim remembers why you're there, keeps later searches on the same Target, and asks only when a search seems to head somewhere new.
>
> **Stay on track without trying.** While you're on Target you watch what your own searches found. Shorts, recommendations, end screens and autoplay step out of the way, and the sidebar shows "Up next from your search" instead.
>
> **Change direction deliberately.** Changing your Target is one tap. Changing it without noticing is what Aim prevents.
>
> **Take a break when you want one.** Browse YouTube freely for 15 minutes, an hour, or just one video. Breaks share a daily leisure allowance you set, and Aim lets the video you're watching finish when time runs out.
>
> **Reach your Target.** Tell Aim when you've found what you needed. It won't push you to keep watching.
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
| Screenshots | 1280×800 (1 to 5) | Suggested: homepage card · results with your Target · watch page with Up next · "Not on your Target" · the popup |
| Small promo tile | 440×280 | `icons/wordmark.png` on cream (#f8f1e7) + one line |
| Marquee (optional) | 1400×560 | |

Don't show YouTube's logo prominently in screenshots or promos, and don't make the name read as "YouTube ___", to avoid implying affiliation.

## Privacy practices tab

**Single purpose:**
> Help people use YouTube intentionally: set a Target for each visit, keep viewing on that Target, and take deliberate, time-limited breaks.

**Permission justifications:**
- `storage`: stores the user's Targets, searches, watch time, settings and history locally on their device. Nothing is transmitted.
- Host access to `https://www.youtube.com/*` (content scripts): shows Aim's interface on YouTube and hides distractions. Aim runs on no other site.

**Remote code:** No, Aim does not use remote code. All code is in the package.

**Data usage** (for a build with an empty `config.js`, i.e. Aim Free only): Aim does not collect or transmit any user data. In the form, leave every data category unchecked. Under Chrome Web Store definitions, "collection" means transmitting off the device, and Aim's data stays in local extension storage. Certify the three disclosures:
- not sold to third parties;
- not used or transferred for purposes unrelated to the single purpose;
- not used or transferred to determine creditworthiness or for lending.

**When Aim Plus ships** (a build with `config.js` filled in), the answers change: tick **Personally identifiable information** (email address, for sign-in) and **Authentication information** (the sign-in session), keep the three certifications, mention the account in the description, and update "Private by design" to say Aim Free needs no account. Also add the Supabase project's host to the single-purpose and permission notes if Chrome asks.

**Privacy policy URL:** **TODO.** Publish `PRIVACY.md` at a public URL, for example the GitHub repo once it's connected, or a simple web page, and fill in the contact email first.

## Before submitting

- [ ] **Decide Free-only or with Plus.** `config.js` now points at the Aim Plus project. For a Free-only release, empty both values first. For a release with Plus, update PRIVACY.md and the privacy answers above.
- [ ] **Remove the `"key"` line from `manifest.json` in the uploaded copy.** It pins Aim's ID for development; the Chrome Web Store assigns its own ID. Then add `chrome-extension://<store ID>/**` to Supabase's Redirect URLs, and set `AIM_EXTENSION_ORIGINS` to the store ID.
- [ ] Run `TESTING.md` on real YouTube (light and dark, wide and narrow windows).
- [x] Logo chosen (October 2026): the forward triangle with a road and a coral arrowhead; forest green, sage and coral. Tagline idea: "Learn forward." See README → Rebranding.
- [ ] Before launch, a trademark search for "Aim" in software and education (USPTO classes 9 and 41), since other products use the word.
- [ ] Fill in the contact email in `PRIVACY.md` and publish it.
- [ ] Build the zip without `tests/`: `git archive --format=zip -o aim.zip HEAD ':!tests' ':!supabase' ':!docs' ':!tools'`.
- [ ] Developer account: one-time $5 registration fee, and verify a contact email.
