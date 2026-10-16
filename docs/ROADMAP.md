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

## Status

| Step | What | State |
|---|---|---|
| 0–3, A–D | **Aim Free.** Purpose from search, word check, allowed list, breaks with a daily leisure allowance, grace period, distractions hidden, Done and reflection, popup with a week view, Advanced settings | Built and tested against mock pages. **Real-YouTube run of TESTING.md still needed.** |
| — | **Target wording** in every Aim Free screen (0.15.0) | Done, tests updated |
| E | **Plus backend foundation.** Accounts with an emailed code, plans, AI endpoint with per-user limits, Settings sign-in | Built and tested locally. Needs a Supabase project to go live. |

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
- **Offers:**
  - Only signed-in Plus users see them. Aim Free shows no upsell beyond one quiet line in Settings.
  - The offer appears once per purpose, is easy to dismiss, and never blocks the video.
  - When to offer: a cheap AI classification of the purpose text (quick / study / long-term), with a word-based fallback ("exam", "study for", "learn", "certificate", "course").

## Revised Plus roadmap

Study sessions come **before** learning paths. They're smaller, they serve the student audience the marketing now targets, and they build most of what learning paths need (side panel, curation, instructor, progress events).

### F1 — Plus shell

- **Chrome side panel** (`sidePanel` permission) as the Plus surface, next to the normal YouTube player.
- The offer on purposes (above).
- **Data model on the server** (see Decisions): learners, plans, plan items, concepts, progress events.
- Account deletion and data export from Settings.

### TB — TeachBack MVP (approved, Addendum 02)

Right after F1, because it's self-contained: it needs only a Target (or a topic typed in) and works before study sessions or learning paths exist. See [TeachBack](#teachback) below.

### F2 — Study sessions

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

## TeachBack

Conversational assessment for Aim Plus: AI "students" ask questions, and the learner explains. *If you understand something, you should be able to explain it.* The AI instructor helps people learn; TeachBack checks what they can explain on their own. The two never share evidence.

### Status

- **Approved.** It's waiting on the original TeachBack prototype's source, so its mechanics and interaction patterns can be reused (Phase A).
- **Nothing is built yet.** It depends on F1 (the Plus shell and the learner and progress tables).

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
  - Answers that needed help count as **Partial**.
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
- Four questioning styles (Curious, Skeptic, Connector, Practical) that the server rotates. The user never picks them.
- They're short and plain, not theatrical.

**Rules during an assessment:**
- No answers handed out. The students can clarify a question or give a small hint, and the hint is recorded.
- The learner can skip a question or end early.

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

### 5. Finding videos without the YouTube Data API

The Data API allows about **100 searches a day for the whole app** (10,000 quota units, 100 per search). That rules it out for curation at any scale.

- **Recommendation:** curate from searches run in the user's own YouTube tab, which Aim already captures, plus oEmbed. This also keeps the server from fetching YouTube pages, which YouTube's terms forbid.
- Apply for a Data API quota extension later, only for things that need it.

### 6. What the instructor knows about a video

- **Without legal risk:** title, description, chapters, channel and the user's own uploads.
- **Transcripts:**
  - the official caption API covers only videos you own or that allow contributions;
  - reading the transcript from the page is a grey area under YouTube's terms.
- **Recommendation:** build F2 to work from metadata, chapters and the study guide. Add transcript use only as an opt-in, after a lawyer's review.
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
- **Low-cost changes, proposed for approval:**
  - Store summary: "Study on YouTube without getting distracted. Your search becomes your Target, and Aim keeps you on it." (112 characters)
  - Homepage example chips: add a study example (for example "Study for my biology exam") and keep the general ones.
  - The landing page waits until approved.
- **Homeschool teaser:** on the future website only, not in the extension. A teaser inside Aim Free would break the no-advertising rule.
