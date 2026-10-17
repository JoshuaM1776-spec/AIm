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

## 11. Key User Flows

### Initial setup

Create parent account → add student and subject levels → choose curriculum role and subjects → review big-picture curriculum → optionally select preferred channels by subject → review and approve first week.

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

## 15. Brand Note — Founder Story

Optional About-page line: “Built by a homeschool kid.” Support it with a short, authentic founder explanation of the freedom, responsibility, curiosity, and lifelong learning that inspired Aim. Use sparingly; do not make the founder story a substitute for demonstrating product value.
