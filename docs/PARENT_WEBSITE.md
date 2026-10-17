# Aim Homeschool — Parent Website Specification

> Reference copy of the founder's planning document (October 2026). Future product phase: not in current scope. See [HOMESCHOOL.md](HOMESCHOOL.md) for how it fits the rest of Aim.

Standalone planning document \| October 2026 \| Future product phase

Purpose: Define a parent-controlled planning and oversight website that works with the future Aim Homeschool student experience and Aim YouTube extension. This is a product specification, not a request to implement during the current Aim Free / Aim Plus phase.

## 1. Product Vision

Aim helps families provide an education that makes children want to learn more. The parent website is the command center: parents decide the educational direction, review AI-proposed plans, prepare real-world activities, and understand what their children can actually do—not merely what they watched.

Guiding principle: Sophisticated planning behind the scenes; a calm, simple experience for parents. Parent authority is explicit, and AI recommendations are editable proposals.

## 2. Three Connected Experiences

- Aim Parent (website): curriculum direction, approvals, preferences, preparation, progress, portfolio.

- Aim Student (future): daily lessons, reading, experiments, projects, reflection.

- Aim Extension / TeachBack: intentional YouTube learning, guided instruction, conversational checks of understanding.

Use a shared backend for student profiles, curriculum objectives, lesson plans, resources, approvals, progress evidence, and role-based permissions. Parent and student access must be separated.

## 3. Navigation & Information Architecture

Primary navigation: Overview · Curriculum · Weekly Plan · Projects & Materials · Progress · Portfolio · Library. Settings holds family/student profiles, content preferences, and account management. Keep field trips and parent participation embedded in existing screens—not new top-level sections.

### Overview

- Show each student’s current week, next major project, and progress against meaningful objectives.

- Show one concise “Needs your attention” area: weekly plan approvals, source gaps, upcoming supplies.

- Prioritize actionable items; avoid streaks, excessive charts, alerts, or school-administration clutter.

## 4. Curriculum — The Big Picture

Parents review a year- or term-level curriculum by subject, unit, learning objective, prerequisites, approximate timing, and planned culminating applications. Begin with established, reviewed curriculum frameworks; AI must not invent the required core curriculum.

- Parent can add, remove, replace, reorder, or reschedule subjects, units, and objectives.

- Parent can select whether Aim supplements an existing curriculum, leads selected subjects, or (only after adequate validation) serves as a primary curriculum.

- Show impact warnings for changes affecting prerequisites or coverage, without blocking the parent’s choice.

- Preserve the baseline curriculum for comparison, and identify objectives added, moved, replaced, or omitted.

- Support subject-specific student level rather than assuming every subject matches a single grade.

- Clearly distinguish curriculum coverage from demonstrated understanding.

### Use your own curriculum

A parent can upload a curriculum they already have the right to use (their own purchase, an openly licensed curriculum such as one for noncommercial use, or their own materials). Aim reads it to build the big picture and the weekly plans for that family only. The full rules are in HOMESCHOOL.md → "Bring your own curriculum"; for the website:

- **Upload screen:** title, what it is (purchased / openly licensed / my own materials), the file, and a required checkbox: "I have the right to use this curriculum for my family. Aim uses it only to plan for my family and never shares it."
- **Private to the household:** uploads and everything made from them appear only in that family's account. No shared library, no "families also used", no reuse across households.
- **Aim never supplies the curriculum:** no pre-loaded third-party curricula, no download links, no fetching on the parent's behalf.
- **Remove any time:** a Delete button on each upload removes the file and its extracted text.
- **Wording:** "Use your own curriculum" or "Works alongside the curriculum you already use". No publisher names or logos implying a partnership.
- **Legal pages before launch:** upload terms, a copyright complaint and takedown page (with counter-notice), a registered takedown agent, and a repeat-infringer policy, all reviewed by a lawyer.

Homeschool regulations vary by jurisdiction. Do not claim legal compliance or accreditation without verified, location-specific support.

## 5. Weekly Plan — From Objectives to Lessons

Aim proposes a coherent weekly plan based on the approved curriculum, student progress, family schedule, and resource preferences. Parents approve the whole week after reviewing its essentials—not every individual lesson.

- Each week shows objectives, video selections, books, AI-guided activities, TeachBack checkpoints, project, and estimated time.

- Parents can replace, remove, reorder, or edit lessons and resources before approving.

- Show why each resource was selected and its connection to an objective.

- Offer conversational editing (“We are camping next week; adapt science for outdoors”).

- Surface all source decisions and materials needs within the same approval flow.

- If the plan changes, make it clear what needs renewed approval.

## 6. Preferred YouTube Channels by Subject

During optional setup, show a small, genuinely reviewed shortlist (approximately 3–5) of suggested channels for each selected subject. Parents preview channels, explicitly choose which to prefer, and may add their own. No channels are automatically parent-approved.

- Preferences are subject-specific and may apply to multiple subjects.

- Allow “Prefer this channel for Science” directly from weekly video review.

- Store verified stable channel IDs, not names alone.

- A preferred channel receives ranking priority only when an individual video is relevant, accurate where assessable, age-suitable, and instructionally useful.

- Optionally allow “Do not recommend this channel”; keep these controls lightweight.

### Coverage-gap review

If no preferred channel offers a suitable resource for an objective, Aim searches more broadly and flags a decision during weekly plan review. Present the strongest verified video recommendation, a small number of alternatives when useful, and a concise explanation.

- Use this video for this lesson only.

- Prefer this channel for the relevant subject going forward.

- Compare other suitable videos.

- Choose a video manually.

- Optional global preference: let Aim choose suitable outside videos without prompting for each gap.

Group gaps into a single weekly attention item instead of sending many notifications. Distinguish one-video approval from ongoing channel preference. If video is not the best medium, suggest a book, experiment, or discussion instead.

## 7. Projects & Materials

Show a rolling 2–4-week preview of upcoming Culmination Projects so families can prepare supplies ahead of time. The weekly plan remains the detailed approval point.

- Each project shows objective, date, expected duration, parent involvement, materials, deliverables, and preparation steps.

- Automatically consolidate shopping needs across projects; combine quantities when reasonable.

- Mark materials already owned, still needed, reusable, or consumable.

- Offer copyable or printable missing-items list; optional substitutions should preserve the learning objective.

- Flag advance preparation and safety/supervision requirements.

- Statuses: proposed, approved, materials ready, completed.

The normal rhythm is a Monday project reveal, connected lessons through the week, optional Thursday TeachBack, and a Friday practical culmination. One featured project per week rotates among subjects; frequency depends on subjects and schedule, not a hard-coded two-week cycle.

## 8. Parent Participation — “Want to Do This One Together?”

Provide contextual invitations within lessons and projects, never a separate participation management system or required parent-involvement setting.

- Discuss Together: a concise parent-led TeachBack sheet with key facts, 5 questions, suggested answers, misconceptions, and follow-ups. No prior expertise required.

- Build Together: a brief guide identifying what the student should figure out, how a parent can coach, and which steps require supervision.

- Explore Together: optional curriculum-connected field-trip suggestions with why it matters, what to observe, and 1–2 reflection questions.

Parent observations may be recorded optionally, but do not require grading or detailed data entry. Field-trip suggestions should be location-authorized and verified; avoid booking, ticketing, itinerary management, and unnecessary tracking.

## 9. Progress & Portfolio

Progress must represent evidence of understanding, not minutes watched or AI-generated confidence scores. Show objectives as Not Assessed, Needs Review, Developing, or Demonstrated, with clear evidence and appropriate caveats.

- Link assessments to actual objectives and show what the student independently explained or applied.

- TeachBack measures explanation, reasoning, misconceptions, and connections; note when hints were provided.

- Culmination Projects measure application, design, testing, revision, and reflection.

- Offer an understandable concept/prerequisite map, not an intimidating analytics dashboard.

- Portfolio collects student writing, sketches, photos, calculations, experiments, and revisions.

- Parents can inspect evidence and choose targeted review or practice together.

## 10. Library & Reading

Maintain a simple library of videos, books, experiments, and resources. Support both curriculum reading and independent pleasure reading. Not every book needs a quiz or measurable objective. Recommendations should not be distorted by affiliate incentives.

## 10a. Onboarding walkthroughs

Aim's extension already has a short welcome for everyone (what Aim is, how it works, a few choices, pin it) and one-time tips on YouTube. Homeschool adds two walkthroughs, one for each person:

### The parent walkthrough (on this website, at setup)

A calm, skippable, resumable sequence. Each step saves as it goes; the parent can stop and pick up later from Overview, which shows "Finish setting up" until it's done.

1. **Welcome:** what Aim Homeschool is in one sentence ("You set the direction. Aim plans the week, finds the videos, and shows you what your child understood.") and what setup involves (about 15 minutes, 6 steps).
2. **Your student:** name, and level per subject (not one grade). Optional quick placement later.
3. **Aim's role:** supplement your curriculum, lead selected subjects, or (once validated) the full curriculum. Option to upload your own curriculum (see §4, "Use your own curriculum").
4. **The big picture:** a guided first look at the year plan: units, objectives, what "approve" means, and that you can change anything later. One highlighted example edit so the parent sees impact warnings before they matter.
5. **Trusted channels (optional):** pick a few per subject, or skip and let Aim suggest.
6. **Your first week:** review it with a short guided pass (one lesson, one project, the TeachBack check, "Do this together"), then approve.
7. **Set up your student's device:** install the extension, sign the student in, and a "Send the student a welcome" button. Explains what the student will see (Today on YouTube's homepage) and how to check progress.

After setup, short contextual tips the first time the parent meets: the weekly review, a coverage-gap choice, the first TeachBack result ("watched" vs "showed they understood"), and the portfolio.

### The student tour (in the extension, the first time Today appears)

Built in the preview (`content/onboarding.js`): five spotlighted stops on Today: this is Today, start with the highlighted one, check things off, Ask Aim, see what's coming. Skippable, with Back, and replayable from "Take the tour" on Today. Student-friendly words, no account or setup questions: the parent did that.

## 11. Key User Flows

### Initial setup

Create parent account → guided setup walkthrough (§10a) → add student and subject levels → choose curriculum role and subjects → optionally upload your own curriculum → review big-picture curriculum → optionally select preferred channels by subject → review and approve first week.

### Weekly review

Open Overview → review proposed week → resolve grouped source gaps → check project materials → edit if needed → approve the week.

### During learning

Student follows approved plan; parent optionally joins TeachBack or project; progress and portfolio evidence flow back to the parent website.

### Curriculum adjustment

Parent edits a future unit → Aim shows prerequisite/coverage implications → parent confirms → future weekly proposals reflect the new curriculum. Previously approved weeks are not silently rewritten.

## 12. Experience & Visual Direction

Warm, calm, trustworthy, spacious, and organized—closer to a thoughtful family planner than an institutional school portal. Clear typography, understated subject accents, readable project cards, modest use of progress visuals, and simple mobile-responsive layouts. No cheesy gamification or crowded notifications. Multi-student support should be accommodated in the data model, with a simple student switcher in the UI.

## 13. Scope & Implementation Phases

### MVP for the future parent website

- Parent/student profiles and secure permissions.

- Curriculum overview and editable subject/unit/objective plan.

- Weekly AI-proposed plans with parent approval and resource replacement.

- Subject-specific preferred channels and grouped coverage-gap decisions.

- Project calendar and consolidated materials checklist.

- Basic objective-level progress and evidence links.

### Later, after core flows work well

- Parent-led TeachBack guides and participation prompts.

- Expanded project coaching and student portfolio presentation.

- Curriculum-connected local field-trip suggestions.

- Richer reading library, sophisticated concept maps, and optional family-level customization.

Explicitly out of scope initially: ticket bookings, e-commerce checkout, complex grades/transcripts, social networks, exhaustive analytics, automatic curriculum accreditation claims, and mandatory parent scoring.

## 14. Acceptance Criteria

- A parent can understand the next action in under a minute on Overview.

- A parent can edit the year-level curriculum and see meaningful prerequisite warnings.

- A parent can approve a coherent week without approving each lesson individually.

- A parent can select trusted channels per subject and resolve gaps with a few clear choices.

- A parent can see and prepare supplies before project day.

- A parent can distinguish watched material from demonstrated understanding.

- The system never silently changes parent-approved curriculum or lesson decisions.

- A parent's uploaded curriculum, and everything built from it, is visible only to that household and can be deleted at any time.

## 15. Brand Note — Founder Story

Optional About-page line: “Built by a homeschool kid.” Support it with a short, authentic founder explanation of the freedom, responsibility, curiosity, and lifelong learning that inspired Aim. Use sparingly; do not make the founder story a substitute for demonstrating product value.
