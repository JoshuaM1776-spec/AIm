# Aim — Roadmap

Where Aim stands, what comes next, and the decisions that shape it. Includes Addendum 01 (learning experiences, marketing). The future homeschool product is specified separately in [HOMESCHOOL.md](HOMESCHOOL.md) and is **not in scope** for current development.

## Product principles

**Brand idea:** Set a Target. Stay on Target. Reach your Target. This is a guiding concept, not a tagline that has to appear everywhere. Aim should feel useful and encouraging, not militaristic, rigid or productivity-obsessed.

From the original specification:

- Feel like part of YouTube, not a separate productivity app.
- Two states: a purpose or a break. Breaks are deliberate and share a daily leisure allowance.
- Aim Free works fully on its own, with no account, server or AI, and isn't an advertisement for Aim Plus.

Added by Addendum 01:

1. **Progressive assistance.** Aim does more as the goal gets more complex: a quick answer gets almost nothing, a study session gets organized, a long-term goal gets a course.
2. **Purpose before features.** Users never pick a mode. Their stated purpose leads to an *offer*, and they stay in control.
3. **Understanding over consumption.** Watching a video isn't learning.
4. **Application over memorization.** Prefer meaningful problems to recall questions.
5. **Connected learning.** Concepts build toward practical accomplishments.
6. **Curiosity matters.** Exploration is allowed without abandoning structure.
7. **Reading matters** (homeschool).
8. **Offline learning matters.** Videos lead to experiments, projects and real activity.
9. **Parents retain authority** (homeschool).
10. **Build only what is in scope.**

No gamification: no points, streaks or badges. This already matches Aim Free.

## Terminology: Target (done in 0.15.0)

| Interface element | Wording |
|---|---|
| Opening prompt | What brings you here? |
| Search placeholder | What do you want to find or learn? |
| Establish | Set Target |
| Active objective | Current Target |
| Change | Change Target |
| Finish | Target complete |
| Browse freely | Take a break |
| Return after a break | Back on Target |

- **"Target" is capitalized** as Aim's own term. Everything else keeps YouTube's sentence case ("Take a break", "Target complete").
- **Natural phrasing stays where it reads better:** "What brings you here?", "Not on your Target", "Is … part of your Target?".
- **Code and stored data keep `purpose`.** Renaming them would need a storage migration for no user benefit.

## Out of scope: ad blocking

- **Aim doesn't block, skip or alter YouTube ads.** Ad blocking brings reliability, maintenance and platform risk, and Aim is about intentional viewing, not ad removal.
- **Aim stays compatible** with ad blockers people install separately.
- Ad blocking isn't on the roadmap. It may be evaluated separately later.

## Development order (approved)

1. **Aim Free:** the focused YouTube experience. Native searches, Targets, fewer distractions, Take a break, student-focused copy. *Built; real-YouTube testing pending.*
2. **Aim Plus, study sessions:** short-term objectives, study guidance, video selection, and TeachBack. Transcript-dependent features wait for the legal review.
3. **Aim Plus, learning paths:** a persistent curriculum over many sessions, with progress and personalization.
4. **Aim Homeschool:** a separate platform, outside the extension (see HOMESCHOOL.md).

Validate study sessions with real students before investing heavily in learning paths.

### Decisions from the six questions

| Question | Decision |
|---|---|
| Study sessions before learning paths? | **Yes.** Build the shared foundation now: learning objectives and assessment records that learning paths will reuse. Not the learning-path interface. |
| Students' own YouTube searches instead of the Search API? | **Yes, to start.** It isn't a permanent rule: learning paths may need the Data API for specific objectives. Reading the results a user's own page shows them isn't permission to scrape, so whatever Aim sends to its server is part of the legal review. |
| Who sees Plus offers? | **Contextual offers, never during a video:** see Offers below. |
| Legal review before transcript features? | **Yes, a prelaunch dependency.** Qualified counsel reviews the actual implementation (transcript access, storage, AI processing, YouTube terms). A review isn't a guarantee of permission. Until then, use the student's own notes, uploads and other authorized material. |
| Student-focused copy now? | **Yes. Done in 0.16.0** (see Marketing). |
| Homeschool teaser? | **Website only.** Nothing about homeschool goes in the extension. |

## Status

| Step | What | State |
|---|---|---|
| 0–3, A–D | **Aim Free.** Purpose from search, word check, allowed list, breaks with a daily leisure allowance, grace period, distractions hidden, Done and reflection, popup with a week view, Advanced settings | Built and tested against mock pages. **Real-YouTube run of TESTING.md still needed.** |
| — | **Target wording** in every Aim Free screen (0.15.0) | Done, tests updated |
| — | **Student-focused copy:** store summary, description, homepage line and example (0.16.0) | Done |
| — | **Account controls (0.22.0):** Download my data (server + this browser, one JSON file) and Delete account (type DELETE; removes the account and all its server data via cascade) in Settings | Built and tested |
| F2 | **Study sessions (0.20.0, Aim Plus):** offered on learning goals; topics planned from the goal and an optional pasted study guide; the librarian picks each topic's videos; the plan in the watch page's sidebar; TeachBack per topic, reported back; summary page. Kept with the Target in the browser. Not yet: file uploads (PDF/DOCX), the instructor's discussion after videos | Built and tested on stand-in pages |
| — | **The librarian v1 (0.19.0):** for signed-in accounts (free has a small daily allowance). Requests vs plain searches; better YouTube searches, a short note, at most one question as choices; picks from YouTube's own results, grouped with reasons; Target memory kept in the browser. **Needs the real-YouTube quality check** (does ranking from titles and snippets pick well?) | Built and tested on stand-in pages |
| — | **Resume Targets (0.18.0):** Targets are active, set aside or completed. "Pick up where you left off" on the homepage (current + two recent), View all Targets page, Resume to the last video and moment, Start again for completed ones. Change Target now sets the old Target aside instead of rewriting it | Built and tested |
| F2a | **TeachBack, text MVP (0.17.0):** questions only, five students, hints and skips recorded, results derived from quoted evidence, learners/assessments/progress tables. Entry: Settings and "Target complete?" (Plus) | **Live:** sign-in (custom SMTP via Resend), Plus plan, AI connection and TeachBack confirmed working on the Supabase project (Oct 2026) |
| E | **Plus backend foundation.** Accounts with an emailed code, plans, AI endpoint with per-user limits, Settings sign-in | **Live** on the Supabase project, verified end to end (Oct 2026). |

## The three learning experiences share one flow

```
Purpose (search box, as today)
  │
  ├─ Quick answer ........ Aim Free behavior. Nothing more is offered.
  │
  ├─ Study session ....... Offer: "Organize a study session?"
  │                        → topics or an uploaded study guide → ordered videos
  │                        → brief intro → watch → discussion → review list → summary
  │                        Temporary: ends with Done, like any purpose.
  │
  └─ Learning path ....... Offer: "Build a learning path?"
                           → editable course of lessons → persists across sessions
                           → progress, gaps, extra lessons, applied exercises
```

- **The purpose stays the root of everything.** A study session or learning path is a *plan attached to a purpose*, not a separate mode. Breaks, the leisure allowance, the allowed list, distraction hiding and Done all keep working unchanged.
  - A plan's videos simply join the purpose's allowed list.
- **Offers depend on who's using Aim:**

  | User | What they see |
  |---|---|
  | Signed out | Aim Free with no account asked for. Sign-in is offered only when they start something that needs an account. |
  | Free account | An occasional invitation to Plus, only when they ask for a study capability (for example "Organize a study session?" on a clearly study-shaped Target). |
  | Plus | The feature itself, offered directly, with no upgrade pitch. |

- **Rules for every offer:**
  - It never interrupts a video someone is watching for their Target.
  - It shows at most once per Target and is easy to dismiss.
  - It never makes Aim Free feel like an advertisement.
- **When to offer:** at first, a word-based check of the Target ("exam", "study for", "learn", "certificate", "course"). For signed-in users, a cheap AI classification later.

## Revised Plus roadmap

Study sessions come **before** learning paths. They're smaller, they serve the student audience the marketing now targets, and they build most of what learning paths need (side panel, curation, instructor, progress events).

### F1 — Plus shell

- **Chrome side panel** (`sidePanel` permission) as the Plus surface, next to the normal YouTube player.
- The offer on purposes (above).
- **Data model on the server** (see Decisions): learners, plans, plan items, concepts, progress events.
- Account deletion and data export from Settings.

### F2 — Study sessions, with TeachBack

**TeachBack's text MVP is the first deliverable of this stage.** It needs only a Target (or a typed topic), so it can ship and gather feedback before the rest of study sessions. See [TeachBack](#teachback).

**Shared foundation built here** and reused by F3: `objectives` (per plan or standalone Target), `assessments` and `assessment_turns`, and progress events.

- Objective, plus optional topics, plus an **optional upload**: study guide, syllabus, notes, reading (PDF, DOCX, text, pasted text).
- **Ordered video list:**
  1. The AI writes search queries.
  2. Aim runs them in the user's own YouTube tab and captures the results, as it does today.
  3. The AI ranks those results for relevance and instructional quality from their title, channel, duration, description and chapters.
- **Instructor:**
  - a short brief before each video;
  - a conversation afterwards: explain it in your own words, apply it, follow-up questions, hints before answers;
  - misconceptions noted.
- **Review list:** the topics needing more work.
- **Summary at the end:** what was viewed, what was discussed, where understanding was shown, and what to review next.
- Breaks and resume reuse Aim Free.

### F3 — Learning paths

- An editable course organized into lessons, persisted across sessions and devices.
- **Progress** with gap detection, and recommended extra lessons with the user's approval. The course never silently changes the user's objective.
- **Applied exercises and scenarios**, scoped to the learner.
- Questions and side exploration at any point.
- **Regulated or safety-critical subjects** (aviation, medicine, law, electrical work and similar):
  - cite authoritative references (for example FAA handbooks for pilots);
  - show a standing note that Aim is educational support, not certified instruction or a substitute for a qualified instructor.

### G — Deeper instruction

- Multi-concept applied problems ("diagnose this ecosystem", "evaluate this flight plan").
- Misconception tracking over time, and connecting related concepts.
- Video content beyond metadata, **only after the transcript legal review** (see Decisions).

### H — Business

- Billing (Stripe through Supabase) changes `profiles.plan`.
- Monitoring, cost dashboards and abuse controls.
- Web app (Chrome side panel first; web later).

### I — Pathways (Plus and Homeschool)

**Built in 0.26.0 (first version):** "Where could this take me?" (any signed-in account: TeachBack results, study sessions, Today's lessons), "Want more of this?" (TeachBack, study sessions, learning Targets marked complete, Today), and Pathways itself for Plus: themes, careers or kinds of work, a path's page with See it / Try it / Meet it / Prepare for it, reflections, theme offers on the homepage and Today. All of it stored in the browser for now (the server writes content and keeps nothing); moving it to server-side progress events comes with F1's data model. **Not yet:** adding a Try it to the Homeschool weekly plan with the parent's approval, and the parent's termly summary (both need the parent website).

What interests me → what could I do with it → what would it take to get there. Designed in HOMESCHOOL.md → "Pathways"; this is the Plus version, for students who use Aim Plus on their own (many Plus users are students, and they already generate the evidence: learning goals, study sessions, TeachBack).

- **"Where could this take me?" first, and for everyone.** A link on study session topics and TeachBack results (and an answer in the librarian to "why do I need to learn this?"): where the subject is used, each with a short real-world problem from that field. It uses no profile, so it needs no opt-in. It's the smallest piece and can ship before the rest.
- **Interests lead to paths.** No assessment to start. Once Pathways is on, Aim notices a theme in what the user chose to study and offers it once, lightly ("You've been studying aviation and weather. Want to see some careers connected to them?"), never during a video, easy to dismiss.
- **Opt-in by the user.** The first such offer is also the opt-in, with a plain explanation of what it uses; it can be turned on or off in Settings, and off deletes it.
- **What feeds it:** "Want more of this?" (Yes / Maybe / Not really) at the end of a study session, a TeachBack check and a completed learning Target; TeachBack results by topic; and the topics of study sessions and learning Targets the librarian classed as `learn`. Only topics and ratings leave the browser, never watch history, and only after opting in.
- **Stage instead of age:** "middle school / high school / college / working / other" at opt-in. Middle school: kinds of work, See it and Try it. High school and up: specific occupations and Prepare for it (Plus is 13+).
- **Explore a path:** See it, **Try it** (the heart: a realistic brief with real constraints and a deliverable), Meet it, Prepare for it. Built on F3's plan model, so a path is a learning path, not a new system.
- **Reflection, not scores:** each Try It and each stopped path ends with "What did you enjoy? What was harder or less interesting than expected? Explore further?" "Not for me" is a success. No match percentages.
- **Adults too:** someone learning timber framing and cabinetmaking might want to know those are trades with apprenticeships.
- **Same rules and safeguards as Homeschool:** no sensitive inputs, no hidden profile, no scores, no paid placement, Aim never contacts anyone, never shared or sold, and the legal review (Plus includes 13–17-year-olds).
- **Data:** a `pathway_signals` view over progress events (`interest`, reflections, TeachBack evidence), `pathway_explorations` (path, step, reflection in the user's words), RLS read-own, deleted with the account.
- **Order:** "Where could this take me?" can come with or soon after F2. The rest after F3, once there's real history. Groundwork now: the "Want more of this?" tap and subject, skill and theme tags on evidence.

## TeachBack

Conversational assessment for Aim Plus: AI "students" ask questions, and the learner explains. *If you understand something, you should be able to explain it.* The AI instructor helps people learn; TeachBack checks what they can explain on their own. The two never share evidence.

### Status

- **Approved.** Phase A (reviewing the prototype) is done; see [Prototype review](#prototype-review-phase-a).
- **Nothing is built yet.** It's the first deliverable of F2 and depends on F1 (the Plus shell and the learner and progress tables).

### Proposed architecture (smallest maintainable)

**Where it runs:** a dedicated extension page, `teachback.html`, in its own tab. A conversation doesn't fit the popup or a card on YouTube.

**Ways in:**
- **Test My Understanding** in the "Target complete?" dialog (Plus users only).
- Plan checkpoints in the side panel (F2 and F3).
- A standalone start where you type a topic.

**Session introduction:** "Your students have some questions. See how well you can explain what you've learned."

**Server:** three new tasks in the existing AI endpoint's task registry. Same sign-in, limits and server-held key; nothing AI-related lives in the extension.

| Task | Does |
|---|---|
| `teachback-start` | Builds 2–4 learning objectives from the Target, the plan, or uploaded material (when available) and asks the first question |
| `teachback-turn` | Evaluates one answer against its objective as structured JSON (evidence quote, rating per dimension, misconception, whether help was given), then picks the next move: follow up, harder, different angle, next objective, or finish |
| `teachback-finish` | Writes the results from the recorded evidence |

**Data:**
- **The conversation and evidence are stored on the server,** in `assessments` and `assessment_turns` keyed by `learner_id`. The client can't rewrite evidence, and an unfinished session can be resumed for 7 days. After that it closes as **Incomplete**, and untested objectives show **Not assessed**.

**Honest results** (no unsupported claims of mastery):
- The **status for each objective comes from code, not the model:**
  - **Demonstrated** needs at least one answer rated sound *without* substantive help, plus one application or follow-up answer.
  - Answers that needed help count as **Developing**.
  - Objectives with no evidence are **Not assessed**.
- **The model writes only the narrative,** and it may cite only recorded evidence quotes.
- **Results are labeled as estimates.** There's no single overall score.

**Results screen:**
- a summary;
- strengths;
- gaps and misconceptions;
- evidence quotes;
- recommended review, with links to the plan's video for that objective, or a suggested search that becomes a new Target;
- **next actions:** Review weak areas, Try again, or Continue learning.

**Progress:**
- Results write `demonstrated` and `needs_review` events into the progress model (Decision 3), with `source: teachback`.
- The instructor's help is recorded with `source: instructor`.

**AI students:**
- The prototype's five students, with Addendum 02's styles mapped onto them (see the prototype review). The server rotates them; the user never picks.
- They're short and plain, not theatrical.

**Rules during an assessment:**
- No answers handed out. The students can clarify a question or give a small hint, and the hint is recorded.
- The learner can skip a question or end early.

**Difficulty adapts from the first answers:** questions run from level 1 (say it in plain words) to 5 (edge cases and transfer). A session starts at 2. Each sound answer without hints raises the level, a partly right one keeps it, and a wrong, unclear or skipped one lowers it. The level carries across objectives, so a strong start means harder questions on later parts too. The server computes the level and tells the AI which level to aim for depending on how it rates the answer.

**Limits:**
- At most 4 objectives, 3 follow-ups per objective and 15 turns per session.
- Answers up to about 2,000 characters.
- Each turn counts against the user's AI limits, and the model is chosen per task.
- The server trims the history it sends to the model.

**Grounding:**
- Assessments are grounded in the objectives plus reference material: the plan, video titles, descriptions and chapters, and uploaded study guides once F2 has them.
- Without reference material, the results say they're based on general subject knowledge.

**Privacy:**
- Answers are learning data under the account (Decision 4).
- They can be deleted with the account, and aren't used for anything else.

### Phases

| Phase | Scope |
|---|---|
| A | Inspect the prototype source; map what to reuse |
| B | Text-only Questions Only MVP: standalone and from "Target complete?" |
| C | Study session and learning path checkpoints; review links to plan items |
| D | Voice input (Web Speech API on the TeachBack page), refined student styles, history, and a full "teach the class" format |

Homeschool use (a Thursday check before Friday's project, and parent review) is future work; see HOMESCHOOL.md.

### Prototype review (Phase A)

The prototype (`TeachBack.html`) is a complete single-page app: learn-by-teaching classes with a planner, AI students, voice, grading and report cards. It runs inside Claude's own artifact environment (`window.claude.use("sample")`) and keeps everything in `localStorage`.

**Carry over (the substance):**

| Prototype piece | In Aim |
|---|---|
| **Questions-only mode**, and the **director** pattern: one AI call per turn returns the student's reaction (with a follow-up when an answer was vague or wrong), the next question, which goals are now covered, and whether it's ready to wrap | This *is* adaptive questioning. It becomes the `teachback-turn` server task, with goals as objectives |
| **Five students tied to skills:** Milo (Curious → clarity), Reese (Skeptic → evidence), Grant (Stickler → precision), Ivy (What-if → reasoning and application), Sam (states a common misconception to see whether it's corrected) | Kept. Addendum 02's styles map onto them: Curious = Milo, Skeptic = Reese, Practical = Ivy. Connector becomes the prototype's `connection` question kind |
| **Question kinds:** question, follow-up, misconception, connection, pattern | Kept. Each is evidence for a specific dimension |
| **Content types** shaping the questions: concepts, events (causes and patterns rather than dates, which fits Precedent), procedures (steps, limits, failure cases; fits safety-critical subjects), texts, language | Kept as an objective-set property |
| **Skills with "untested" when no question targeted them** | Becomes **Not assessed**, as Addendum 02 requires |
| **Grading rules:** don't flag reasonable simplifications; an uncorrected misconception counts heavily; "I don't know, let me check" followed by a right answer beats bluffing | Kept in the `teachback-finish` instructions |
| **Gaps,** each with an explanation and a search query, and **fact flags** with an "I think I was right" re-check | Gaps become review links. A gap's search query starts a new Target on YouTube |
| **Research break** (limited, and recorded on the question) | Becomes **"Give me a hint"**: limited, and recorded as assistance |
| **Retry:** the same students re-ask what was missed, plus new questions; unresolved gaps come back in the next session | Kept. This is "Try again", and gaps resurface at the next checkpoint |
| **Voice:** Web Speech recognition (push to talk, or open mic), a different synthesized voice per student, "let me check" detection | Phase D, on the TeachBack page |
| **Study planner:** chunks with goals and named sources, each with a YouTube search query | The seed of study sessions and learning paths (F2 and F3). Its source queries open as Targets |

**Change for Aim:**

- **Prompts move to the server task registry.** The extension never calls an AI directly and holds no key. State moves from `localStorage` to server tables keyed by `learner_id`.
- **No single 0–100 score** and no pass mark at 70. The model's numeric scores become evidence. The status of each objective is derived in code (see Honest results).
- **Drop for Aim:** the multiple-choice warm-up (the addendum says no multiple choice), roster setup and the gradual class ramp-up (users don't configure students), class reminders and schedules, interests and suggestions, the pace multiplier, and the delivery/filler-word and say-it-back language drills (possibly Phase D).
- **The full teach-a-lesson format** stays a future option (Phase D).
- **The interface is rebuilt in Aim's design** (DOM-built and theme-aware), not ported. The prototype builds its HTML from template strings with an `esc()` helper; Aim builds everything with `el()`.

**Costs, measured against the prototype's shape:**

- **One model call per answer** (the director), plus one to start and one to finish. That fits Aim's limits: a 15-turn session is about 17 calls.
- The prototype sends up to 9,000 characters of transcript per turn. The server keeps a running summary of evidence instead, to bound the tokens per turn.

## YouTube's own AI (decided October 2026)

YouTube now has two Gemini features: the per-video **Ask** button (questions about the video it's on, quizzes on some academic videos) and **Ask YouTube**, a conversational search across videos (both mostly for Premium members 18+ in the US so far, with no public API).

- **Don't drive it.** Aim won't type into, click through or read YouTube's AI: there's no API, automating it would be fragile and likely against YouTube's terms, it only exists for some adults, and what it returns comes from the same transcripts that wait on legal review.
- **Work alongside it.** When a person uses it themselves, Aim treats its searches and the videos it leads to like any other search toward the Target, and doesn't get in its way. **Built in 0.29.0:** any video link on the results page counts as a result (including an AI answer's), and a video picked from a search-style page of YouTube's own (where Ask YouTube may open) counts toward the Target; feeds, channels and videos still ask first. Selectors to confirm against the real pages once seen.
- **Aim asks, YouTube answers (built in 0.29.0).** In "In this video", each concept has "Ask YouTube about this": Aim copies a good question and points to YouTube's Ask button under the video, or, without one (no Premium), to Ask in the search bar with the video named in the question. Aim doesn't type into it or read the answer.
- **Don't duplicate it.** Within-one-video Q&A and summaries are YouTube's job now; the transcript stage of "In this video" drops in priority, since anyone with YouTube's Ask already has exact answers about a single video.
- **What Aim is for, that YouTube's AI isn't:** the person's goal across many videos and days (Targets, study sessions, Resume), keeping YouTube from pulling them off it (no feed, no recommendations, time limits, breaks that end), evidence of understanding in their own words (TeachBack), Pathways, and everything for under-18s and their parents (YouTube's AI is 18+). YouTube's AI is built to help you watch; Aim is built to help you do what you came for, and stop.

## Decisions needed now (to avoid rework)

### 1. Learners are separate from accounts (household-ready)

- Every Plus learning table keys on `learner_id`, not the auth user.
- For now each account has exactly one learner: themselves.
- Homeschool later adds child learners under a parent account, **without email logins for children**, and needs no migration of Plus data.

### 2. One plan model for every experience

`plans(kind: session | path, purpose, objective, status)` → `plan_items(order, type: video | brief | discussion | exercise | reading | activity, concept_ids, state)`.

- A study session is a short, temporary plan; a learning path is a long, editable one.
- Homeschool's weekly plans later reuse this with an `approval` state.

### 3. Progress is evidence, not a percentage

Store **events**, per learner and per concept:

- `viewed` (with watch time);
- `item_completed`;
- `discussed`;
- `demonstrated` (with the excerpt or work that shows it, and who judged it);
- `needs_review`.

What the user sees is derived from the events: "viewed" is never shown as "learned", and nothing claims mastery from watch time or chat alone. These are the five categories Addendum §3.4 asks to keep apart.

### 4. Where data lives

- **Aim Free data stays on the device,** as today.
- **Plus learning data** (plans, conversations, progress, uploads) lives on the server, so it persists and syncs. It's opt-in by signing in, and covered in PRIVACY.md before launch.
- Uploads go to a **private Supabase Storage bucket**, per user.
  - The server extracts their text; there are size and page caps.
  - Deleting an upload deletes the extracted text too.

### 5. Finding videos: the student's own searches first

The Data API allows about **100 searches a day for the whole app** (10,000 quota units, 100 per search). That rules it out for curation at any scale.

- **Start with the student's own searches,** which Aim already sees in their tab, plus oEmbed. This also keeps the server from fetching YouTube pages, which YouTube's terms forbid.
- **Not a permanent rule.** Learning paths that need a video for one specific objective may need the Data API, with a quota extension.
- **Reading the results a user's own page shows them isn't permission to scrape.** What Aim sends to its server about those results goes through the same legal review as transcripts.

### 6. What the instructor knows about a video

- **Without legal risk:** title, description, chapters, channel and the user's own uploads.
- **Transcripts:**
  - the official caption API covers only videos you own or that allow contributions;
  - reading the transcript from the page is a grey area under YouTube's terms.
- **Decision:** the legal review is a **prelaunch dependency** for anything that retrieves, stores or processes transcripts. Qualified counsel reviews the specific implementation; a review isn't a guarantee of permission.
- **Until then,** F2 and TeachBack work from metadata, chapters, the student's own notes and uploads, and other authorized material.
- **"In this video" (built in 0.27.0, stage 1):** for a learning Target on Plus, the concepts a video covers, worked out from its title, description and chapters only, and labelled that way; chapter jumps; "See it in another context" (two searches per concept, run in the student's own tab); and "Test me on this video" (TeachBack with the concepts as notes) offered when the video ends, never during it. Regulated subjects name their authoritative references (for a private pilot checkride: the FAA Airman Certification Standards and the Pilot's Handbook of Aeronautical Knowledge).
- **Stage 2, waiting on the transcript review:** the same features from the transcript: concepts with exact timestamps, quotes, and test questions about what the video actually said ("At 12:40 the examiner asks about…"). Nothing about transcripts is built until counsel has reviewed the specific implementation.
  - Addendum §4.6 ("summary or transcript" in homeschool lesson review) depends on the same review.

### 7. AI endpoint growth

- **Keep the server-side task registry.** Clients never send raw prompts.
- **Add:**
  - streaming responses for conversations;
  - a model per task: a small fast model for classification and ranking, the strongest model for instruction;
  - server-stored conversation history with trimming;
  - versioned instructor prompts.
- **Re-set limits once real usage is measured.** Today's 300 calls and 400k tokens a day suit single calls, not tutoring conversations.

### 8. Channels are stored by channel ID in Plus and later

- **Aim Free's hidden and warned channels are keyed by the `@handle` link,** which is all a tile reliably shows. That's fine for a local list.
- **Server-side Plus and homeschool preferences** (Preferred and Don't Recommend) must store the stable `UC…` channel ID, with the name only as a label.
- Curation captures the ID when a result shows it, and looks it up from the channel page in the user's tab otherwise.

### 9. Age and consent

- **Aim Plus is 13+.**
- **Homeschool serves younger children.** That brings COPPA (verifiable parental consent) and similar laws elsewhere, so it needs its own privacy design and legal review before any build.
  - Decision 1 keeps that possible.

## Marketing direction (no build without approval)

- **Lead with students:** "Want to study on YouTube without getting distracted?" Keep Aim useful for professionals, hobbyists and researchers.
- **Aim Free promise:** stay focused and get what you came for.
- **Aim Plus promise:** turn YouTube into a structured learning experience, with study plans, an AI instructor and personalized review.
- **Promo sequence:**
  1. Biology study.
  2. Distraction.
  3. Aim.
  4. Same YouTube, distractions gone.
  5. Focused results.
  6. Plus study session.
- **Other lines to use:**
  - "You came to YouTube to learn. Stay on track."
  - "Make more of YouTube."
  - "Watch with intention."
- The landing page waits until approved.
- **Homeschool teaser:** on the future website only, not in the extension. The website can introduce Aim Plus and Aim Homeschool, including the parent dashboard. The extension's message stays: *You came to YouTube for a reason. Aim helps you accomplish it.*
- **Done in 0.16.0:**
  - **Store summary:** "Study on YouTube without getting distracted. Your search becomes your Target, and Aim helps you stay focused on it."
  - **Store description** opens with the student hook.
  - **Homepage line:** "Whether you're preparing for an exam, learning a new skill, or finding a quick answer, Aim helps you stay focused on what you came to YouTube to accomplish."
  - **Homepage example:** "Study for my biology exam".
- **The listing describes only what works.** AI study sessions, TeachBack and Plus aren't mentioned until they ship.
