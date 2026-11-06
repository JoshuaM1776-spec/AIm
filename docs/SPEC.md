# Aim — Product Description and Functional Specification (challenge edition)

The reference every change is checked against. Written by the product owner (November 2026). It
replaces the earlier spec, kept as `docs/SPEC-0.66.md`; where this one is silent, that one still
applies. Implementation status is tracked in ROADMAP.md.

**Aim. Give your curiosity a target.** Discover a challenge. Learn what you need. Prove what you
understand.

> **The challenge is the product. YouTube is the resource. AI is the guide. Understanding is the reward.**

## Decisions (November 2026)

1. **Challenges are offered alongside "What brings you here?", not instead of it.** A specific need
   ("how do I change a tire") still goes straight to the right video; curiosity ("aviation, 30
   minutes") gets three challenges. The search box tells them apart.
2. **The look moves to Modern Explorer** (§21): a light canvas, navy and copper, a refined serif for
   questions and headings, subject artwork on discovery screens and almost none on working screens.
   Artwork must be owned or licensed; the reference images in the product owner's drafts belong to
   others and are mood only.
3. **Evidence only.** Aim never awards an "Understood" status, a mastery score, achievements or
   streaks. It keeps and shows the evidence: what you explained, in your words, when; what you made;
   what you watched. A completed challenge says what you demonstrated, with the evidence, and is
   marked completed, nothing more. This overrides "Understood" in §14 and §17 below and any
   "achievements" in drafts.
4. **The Watch Companion has three areas: Challenge, Ask, Notes.** A clue is a note marked as helping
   the challenge, not a separate tab (§13).
5. **Video content only where it may be read.** Mark Moment and I'm Confused come first; AI insights
   from captions only where reading them is allowed (the captions preview awaits legal review); no tab
   audio capture until it has been reviewed (§12).

## 1. The vision

You open YouTube with 30 minutes, interested in aviation but not sure what to study. Aim asks what
you're curious about and how much time you have, and offers three challenges:

- **Understand:** Why can an airplane stall at different airspeeds?
- **Investigate:** How can an airplane generate lift while flying upside down?
- **Hands-on:** Build and test a simple wing to see how airflow affects lift.

You choose the second. Now you have a reason to learn: you're investigating a question you want
answered. Aim recommends videos, helps you notice what matters, answers questions as you watch, and
keeps unrelated distractions away. The Curious Peer checks what you've understood. Finally you return
to the challenge and explain how inverted flight is possible. The completed challenge is kept in your
library with the videos, explanations and concepts behind it, and next time Aim can build on it.

The purpose: turn passive video consumption into intentional learning with a meaningful outcome.

## 2. Product identity

Aim is not primarily a YouTube blocker, a note-taking app, a course platform or an AI tutor. It
combines elements of each around one central feature: **the Challenge**, a specific reason to learn
with a recognizable finish line. Everything else helps the learner reach that finish line.

| Priority | Objective |
|---|---|
| 1 | Help users develop genuine understanding and practical ability |
| 2 | Give users compelling, achievable reasons to learn |
| 3 | Keep learning focused and reduce unnecessary distraction |
| 4 | Preserve demonstrated knowledge and connect it to future learning |
| 5 | Make the experience attractive, enjoyable and effortless |

Judge the product on learning outcomes, not time spent or videos watched.

## 3. The learning hierarchy

**Interest** (Aviation) → **Larger Aim**, optional (Develop a strong understanding of aerodynamics) →
**Session Challenge** (Why can an airplane fly upside down?) → **Learning activities** (videos,
questions, notes, practice, final demonstration).

- **Interests** are subjects someone cares about. Never completed; they organize knowledge and
  generate challenges.
- **Larger Aims** are substantial outcomes over many sessions (a basic conversation in Polish,
  furniture joinery). Optional: nobody has to commit to a long journey.
- **Session Challenges** are the primary unit: a focused, achievable objective for the time available
  and what the learner already knows. One primary challenge per session.
- **Learning activities** serve the challenge; not every challenge needs every activity. Build around
  the outcome, never one lesson format for every subject.

## 4. Three kinds of challenge

- **Understand:** answer a question, explain a process or a phenomenon. *Why can airplanes stall at
  different airspeeds?*
- **Build & Do:** perform a skill, build, repair or test something. *Cut your first accurately fitted
  dovetail joint.*
- **Investigate:** analyze evidence, compare explanations, defend a conclusion. *What contributed
  most to the Roman Republic's collapse?*

A language challenge may combine all three. The kinds help discovery; they aren't rigid modes.

## 5. The journey

1. Choose an interest and the time available.
2. Choose or customize a challenge.
3. Review the objective and the proposed approach.
4. Watch relevant videos and collect what's useful.
5. Use Ask Aim, notes and the Curious Peer to understand.
6. Attempt the final challenge.
7. Save it, with its evidence, to the library.
8. Get suggestions for what's next.

Flexible throughout: skip videos, search freely, revisit, change the challenge, take a break, finish
early. Direction without removing autonomy.

## 6. Onboarding

Skippable steps, then the first challenge: interests ("What are you curious about?"); how you like to
learn (exploratory, practical, conceptual, structured: preferences, not modes); what motivates you
(hard questions, useful skills, how things work, a bigger goal: changes how challenges are framed);
typical session time (15, 30, 60 minutes, custom: a default, not a limit). Then a few challenges to
choose from, regenerate, or write your own. The first experience should show the value fast. Keeps
the conversational form of 0.68.

## 7. Home

Replaces YouTube's recommendation-heavy homepage. One of the simplest screens. The question
(**Decision 1**) is "What brings you here?" with "What are you curious about?" beside it: a field for
a subject, skill, question or outcome; the time available; **Find a challenge**. Also: the active
challenge, a small section for Larger Aims, Take a Break. Not a dashboard of statistics.

| Control | Behavior |
|---|---|
| Search | An interest, question or skill |
| Time | Available learning time |
| Find a Challenge | Generate challenges |
| Continue | Resume a session |
| Larger Aims | Ongoing goals |
| Take a Break | Casual viewing for a while |

## 8. Discover: choosing a challenge

"Polish", 30 minutes → *Introduce yourself in Polish* · *Order food in Polish* · *Ask for directions
in Polish*. Each card: the goal, time, difficulty, kind, and for hands-on, materials. Regenerate,
change difficulty or time, or write your own.

Every challenge must: have a meaningful, specific outcome; fit the learner's knowledge and time; be
achievable with available resources; be demonstrable (explanation, performance, evidence); be
interesting. No unrealistic promises (fluency in 30 minutes).

## 9. Challenge details and the session plan

Before starting: what you're trying to accomplish, why it's interesting, what you need, and the
**success condition**, decided before the session. A short plan (for example: learn the essentials ·
hear it in context · practice · complete the challenge), each step with a rough time. The plan adapts:
replace an unhelpful video, skip what you know, save to continue if time runs out. The time is a
target, not a timer that decides success.

## 10. The YouTube watch experience

The most important surface. YouTube's player stays recognizable and takes most of the space; Aim sits
beside it as a light companion. **The Watch Companion** (Decision 4): Challenge (the goal, the step,
what to look for; the default), Ask, Notes. Only one prominent at a time; it keeps its tab, notes and
conversation when collapsed.

During a challenge Aim encourages relevant viewing without controlling every action. Searching,
another explanation, a related subject are all fine; an unrelated video gets a quiet note that it
doesn't seem to advance the challenge. Never punishment.

## 11. Ask Aim

Available while watching, knowing the challenge, the video, the notes and what the learner has
demonstrated before. "What does that mean?", "simpler?", "why?", "how does this relate to what I
know?", "an example?", "is that actually correct?", "how does this help my challenge?" Typed or
spoken (hands busy in a workshop). **Don't give away the challenge:** offer an explanation, hint or
clue first; a direct answer is always available on request. Context, best first: the challenge; the
video's title, metadata and time; permitted captions; the session's notes; the library; reliable
references. If Aim doesn't know what was said at this moment, it says so.

## 12. Capture Insight, Mark Moment, I'm Confused

**Mark Moment:** the time, plus a short written or spoken note. **I'm Confused:** marks the moment and
opens help; the Curious Peer can ask about it later. **Capture Insight** (Decision 5): from the marked
moment, where Aim may read the content, a concise original note: concept, explanation, time link,
source, your notes, why it matters for the challenge, and what Aim had access to. Reviewed and edited
before saving. Tab audio is not captured until reviewed for permission and copyright.

## 13. Notes and clues

Notes capture information; a clue is a note that helps solve the challenge (Decision 4: a mark on a
note). Promote a note to a clue, reject a suggested clue, mark something uncertain; "What remains
unclear?" lists the open pieces. Clues support reasoning, never a list of answers handed over, and
never collectibles.

## 14. The Curious Peer

During videos (through Ask): a quick check, a hint, working through a concept. After a video: an
optional check. At the end of a session: one session-level check of whether the objective is met,
rather than four questions after every video. Questions examine recall, explanation, application and
connection, adapted to the kind (a history investigation interprets evidence; woodworking covers
technique, safety, troubleshooting and judging the result; a language challenge is a spoken
exchange). Feedback is constructive; an incomplete answer gets a clarifying question or a pointer to
the video moment. **Decision 3:** the result is evidence (what was explained, when), never an
"Understood" status. Builds on TeachBack's one-student conversation.

## 15. The Final Challenge

Everything leads here: resolving the reason you started, not another quiz. *Explain how an airplane
can sustain lift while inverted* · *Hold a short introductory conversation in Polish* · *Present your
dovetail, explain your process and assess its fit.* Judged against the success condition set at the
start: **demonstrated**, **partly: what to improve**, or **not enough evidence to tell**. Never claim
to verify what can't be observed (a photo shows alignment, not hidden strength). Struggling means a
specific next step and another attempt, never a failing grade. Completion is restrained: "Challenge
complete", what you can now demonstrate, the evidence, and a related next challenge. No points or
badges.

## 16. Hands-on challenges

Building, repairing, experimenting, languages, code. Shown alongside the others, filterable by time,
difficulty, materials, equipment and setting. Materials and equipment before starting, required vs
optional, with safety notes; without the equipment, a different challenge, a simulation or a
preparatory activity. Videos stay the instruction; Aim doesn't invent complex physical procedures.
Evidence may be photos, video, measurements, code, observations or a spoken explanation (stored under
a privacy policy written before launch). High-risk tasks: AI assessment is never a substitute for
qualified instruction, inspection or supervision. Big projects are Larger Aims made of challenges.

## 17. The Library

A record of demonstrated learning, not watch history. **Challenges** (completed and in progress, with
the question, final answer or work, videos, notes, concepts); **Videos** (studied, linked to the
challenges they helped; Decision 3: no "Understood" mark); **Knowledge** (search "What have I learned
about torque?" across concepts and the evidence behind them). Each completed challenge keeps: the
challenge, its success condition, videos, notes and clues, the Curious Peer's questions and the
answers, the final demonstration, key concepts, connections, and later reviews.

## 18. Connections

From demonstrated concepts, useful next challenges: "You understand these two ideas. Here's
something they can help you figure out." (engines + mechanical advantage → why a car needs a
transmission). Supported relationships kept apart from speculative ones. Shown when relevant, after a
challenge, or in the library; never constant interruptions. An optional concept map, never the main
navigation.

## 19. Review and retention

Brief reinforcement later, preferably a new scenario needing the same knowledge. Prioritize what
matters to active goals or was hard; skip what's clearly solid. No mandatory streaks, no reward
mechanics. The reward is growing capability.

## 20. Focus

Supports the challenge rather than being a separate productivity tool: challenge-aware suggestions
with a reason ("Explains how angle of attack relates to inverted lift"), fewer unrelated
recommendations, intentional topic changes (start a new challenge or save the idea), Take a Break
with no assessments during it.

## 21. Visual design: Modern Explorer

Intellectual discovery, not outdoor adventure. Clean and spacious, with editorial subject artwork on
important screens. Working colors: canvas, surface, navy, ink, copper. A refined serif for questions,
challenges, subjects and milestones; a readable sans for controls and instructions. Subject-driven
imagery (aircraft and diagrams for aviation; architecture and maps for history; machinery for
engineering), never mountain landscapes as default decoration.

| Screen | Artwork |
|---|---|
| Home, Discover | Rich but restrained |
| Challenge selection | Strong, subject-specific |
| Challenge overview | Moderate |
| Session plan | Minimal to moderate |
| Watch Companion, Curious Peer | Minimal |
| Notes | Functional |
| Library | Strong, editorial |
| Challenge complete | Rich, subject-specific |
| Settings | Almost none |

**Discovery screens create wonder. Working screens create clarity.**

## 22. Settings

Learning preferences (depth, difficulty, explanation style); challenge preferences (duration,
conceptual or practical); Curious Peer (voice or text, feedback style, difficulty); focus
(recommendations, Shorts, breaks); capture and notes (permissions, storage, retention); appearance
(light/dark, artwork emphasis, accessibility); privacy (history, export, deletion, account); the
education hub (optional). Preferences never stop a different choice in the moment.

## 23. The AI architecture

One learning system, seven logical responsibilities (not seven services): intent and motivation;
challenge generation; discovery and context; the learning companion; the understanding evaluator;
the knowledge engine; connections and retention. Store learning **evidence**, not the AI's summary of
what someone knows: every concept links to the answers, demonstrations or activities behind it.

## 24. Technical notes

Manifest V3: scoped content scripts on YouTube; the **side panel** for the Watch Companion (less
dependent on YouTube's page structure); the background worker; local storage for settings and drafts;
the backend for accounts, AI, records and connections. The biggest feasibility issue is video
context: YouTube's caption API is not a general transcript service, and capturing tab audio raises
terms and copyright questions. Aim must work when no transcript exists, when the video's meaning is
visual, and when an explanation lacks evidence.

## 25. The education hub

Aim stays independently valuable as the YouTube part. Later, one shared learning record: a challenge
in Aim can count toward a Larger Aim in the hub, and the hub's reading and projects can inform Aim's
challenges. Never required.

## 26. Roadmap

| Phase | Deliverable | Proves |
|---|---|---|
| 1. Challenge foundation | Home, challenge generation, selection, active challenge, success conditions | Specific outcomes motivate people |
| 2. Watch & understand | The companion, Ask Aim, notes, the Curious Peer | People get more from videos |
| 3. Challenge completion | Final demonstrations, feedback, records | People reach session objectives |
| 4. The library | Challenges, videos, concepts, search | Understanding is kept and findable |
| 5. Connections | Recommendations, relationships, retention | Prior knowledge helps new learning |
| 6. Advanced | Permitted media processing, richer evidence, hub integration | Wider range of activities |

First prototype: three very different challenges (an aviation explanation, a Polish speaking
exercise, a hands-on woodworking task), to show whether the system adapts to the outcome or repeats
one template.

## 27. Measuring success

Challenge completion; quality of explanations and demonstrations; retention; time to meaningful
progress; focus (fewer unwanted detours); transfer; satisfaction. Check AI assessments against expert
evaluation on a test set. No confident mastery reporting until the assessments are validated.

## 28. What Aim must not become

A course platform of rigid curricula; repetitive quizzes or long onboarding before watching; a
gamified achievement system; a blocker that treats YouTube as the problem; a design that overwhelms
watching, questioning and learning. Every feature must make the challenge easier to pursue,
understand or complete.

## 29. One session, end to end

Woodworking, 30 minutes. "Cut your first accurately fitted dovetail joint" — no prepared stock, so
Aim offers "Learn to lay out and mark a dovetail joint accurately." A demonstration on YouTube with
the companion; "why does the baseline matter?" answered for this step; a captured note on setting the
marking gauge; practice on scrap; a photo and an explanation of the baseline and layout; the Curious
Peer asks what could make the joint fit poorly; feedback on what the photo shows, without claiming
measurements it can't see. Completed, kept with its evidence, and the next challenge: "Cut and fit
your first dovetail joint."

**Choose a Challenge → Learn → Demonstrate → Build On.**
