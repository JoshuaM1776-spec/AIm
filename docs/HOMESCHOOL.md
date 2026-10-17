# Aim Homeschool — future product specification

> **Not in scope.** Nothing here is built during Aim Free or Aim Plus development: no onboarding, placement, weekly plans, approvals, reading library, experiment planning, culmination projects or their rotation, history (Precedent) modules, parent participation, preferred channels, homeschool TeachBack, portfolios or homeschool billing. This document preserves the vision (Addendum 01, Revision 02, and Addenda 03 and 04) so current decisions don't block it. The only prepared groundwork is listed at the end.

## Philosophy

Develop lifelong learners, not assignment completers. **Teach students to figure things out, not merely answer questions.**

Its principles:

1. Academic rigor.
2. Parent-directed education.
3. Personalized instruction.
4. Curiosity-driven exploration.
5. Practical application.
6. Reading and independent learning.
7. Hands-on experiments and projects.
8. Integrated problem solving.

Favor intrinsic motivation and real accomplishment over points and rewards.

## Parent setup

**Aim's role**, chosen by the parent:

- **Supplement:** Aim adds lessons, activities, tutoring and resources alongside an existing curriculum.
- **Selected subjects:** Aim manages instruction for the subjects the parent picks.
- **Primary curriculum:** Aim proposes a full plan for parent approval. Don't market Aim as a complete primary curriculum until the curriculum is professionally developed and validated.

**Settings**, all editable later:

- grade level, and a level per subject;
- learning objectives and the subjects to include;
- daily and weekly time, and school days;
- reading expectations;
- projects and experiments;
- student interests;
- parent preferences and constraints.

**Optional placement:**

- Per subject: a student can be ahead in math and need support in writing.
- Uses validated methods and demonstrated work.
- Parents can skip it and choose starting levels themselves.

## Curriculum foundation

- An **established curriculum**, developed and reviewed against chosen standards, defines *what* is learned. **AI decides *how* to teach it.** Aim doesn't invent a curriculum each week.
- Requirements differ by jurisdiction. Assume no single national standard.

### Bring your own curriculum (parent uploads)

Besides a curriculum Aim develops with educators, a parent can upload a curriculum they already have the right to use. Many good curricula are free to read but licensed **for noncommercial use only**. A family homeschooling its own children is a noncommercial use, and Aim acts as the parent's tool when it reads that copy to plan their weeks. US courts have treated a paid service working for a noncommercial licensee this way: *Great Minds v. FedEx Office* (2d Cir. 2018) and *Great Minds v. Office Depot* (9th Cir. 2019). That protection depends on Aim staying the family's tool, never the distributor. These rules are requirements, not suggestions:

1. **Private to the family.** An upload, and everything Aim makes from it (big-picture plan, weekly plans, lessons, questions), is visible only to that household. It is never shared with, shown to, or suggested to other families, and never collected into a shared or "community" library.
2. **The parent brings it.** Aim doesn't ship, pre-load, host, link to a download of, or fetch any third-party curriculum. Uploading is always the parent's own action.
3. **The license matters, not just whether it's free to read.** At upload, the parent confirms they're allowed to use it for their family and picks what it is (their own purchase, an openly licensed curriculum, their own materials). "Free to read" can still mean all rights reserved; that's the parent's call to make, and the upload terms say so.
4. **Used only for that family's plan.** Uploads are never used to improve Aim's own curriculum, as examples for other households, or to train or fine-tune any model. Sending it to the AI to build that family's plan is fine (API data isn't used for training); PRIVACY.md must say so.
5. **Deletable.** Removing an upload deletes the file and its extracted text. Plans already approved keep their objectives but stop quoting it. Deleting the account deletes everything (it cascades, like the rest of Aim's data).
6. **Safe-harbor basics before launch** (as for any service that holds user uploads):
   - terms of service in which the parent confirms they have the right to use what they upload;
   - a published copyright complaint and takedown process, and a counter-notice process;
   - a takedown agent registered with the US Copyright Office;
   - a repeat-infringer policy;
   - acting promptly on a valid complaint, and never encouraging uploads Aim knows aren't licensed.
7. **No publisher names as endorsement.** Say "use your own curriculum" or "works alongside the curriculum you already use". Don't use a publisher's or curriculum's name or logo in marketing, listings or the product in a way that suggests a partnership, unless there is one.
8. **Have a lawyer review** the upload terms, the takedown process and this design before the parent website launches.

Data shape: a `curriculum_upload` row (household, title, kind, license note the parent gave, file reference, extracted text, created/deleted) with read and write limited to that household by RLS. Plans that use it reference it by ID and never copy it into shared tables.

## The parent website

The parents' side is a website, specified in [PARENT_WEBSITE.md](PARENT_WEBSITE.md):

- **Navigation:** Overview, Curriculum, Weekly Plan, Projects & Materials, Progress, Portfolio, Library.
- **Settings:** profiles, preferences and account.

Where it refines this document, **the parent website spec wins**:

- **Weekly approval is for the whole week,** after reviewing its essentials (objectives, videos, books, activities, TeachBack checkpoints, project, time). Parents can still replace, remove, reorder or edit lessons before approving, but they don't approve each lesson one by one. If the plan changes afterwards, it's clear what needs approving again.
- **Preferred channels are per subject:**
  - Setup suggests a small, reviewed shortlist of 3–5 per subject; nothing is approved automatically.
  - "Prefer this channel for Science" is available right from the weekly review.
  - **Coverage gaps are grouped into one weekly decision.** When no preferred channel has a suitable video, the parent can:
    - use this video for this lesson only;
    - prefer the channel for that subject;
    - compare alternatives;
    - choose a video manually;
    - or let Aim choose suitable outside videos from now on.
- **The big-picture curriculum** keeps a baseline to compare against, showing what was added, moved, replaced or omitted. Prerequisite and coverage warnings never block the parent's choice.
- **Progress uses four words:** Not Assessed, Needs Review, Developing, Demonstrated. TeachBack, study sessions and the parent website all use these.
- **Projects & Materials:**
  - a rolling 2–4-week preview;
  - one consolidated shopping list, with items marked owned, needed, reusable or consumable;
  - project statuses: proposed, approved, materials ready, completed.
- **Parent and student access are separate,** with a student switcher for families with several children.

## Two levels of parent approval

Parents direct the education at two levels. Aim proposes; the parent adjusts and approves, and nothing reaches the student without that approval.

### 1. The big-picture plan (approved at setup, editable any time)

**Built from the parent setup:**

- Aim's role (supplement, selected subjects or primary);
- grade and subject levels, and the optional placement;
- objectives and subjects;
- time per day and week, and school days;
- reading expectations;
- projects and student interests.

**What it shows, for each subject in the plan:**

- the units and learning objectives for the term or year, drawn from the curriculum foundation;
- their order and approximate pacing, in weeks;
- the culmination project rotation;
- the reading plan, both curriculum reading and reading for enjoyment;
- expected time per day and week, and school days.

**The parent:**

- reviews the plan;
- adjusts it: reorders units, changes pacing, drops or adds subjects or objectives, swaps projects or books;
- approves it.

Each approved version is kept, so parents can see what changed and when. For the Supplement and Selected subjects roles it covers only the parts Aim handles, alongside the family's existing curriculum.

### 2. The weekly plan (the details, every week)

- **Generated from the approved big-picture plan,** plus the student's progress, what needs review, upcoming projects, available materials and time. Described in detail below.
- **Approval is for the whole week,** after reviewing its essentials. Parents can edit, swap, reorder or ask for changes in plain words first. See the parent website spec.

### How the levels connect

- **Weekly plans stay inside the approved big picture.** Aim never silently changes the big-picture objectives or pacing.
- **When a week would change the big picture,** Aim shows the effect and asks first. For example, extra review of fractions might mean "This moves Unit 4 back one week." The parent then approves a new version of the big-picture plan, or keeps the original.
- **Changes to the big-picture plan flow into the upcoming weeks,** not into weeks already approved, unless the parent asks.

### Marketing and legal care

How this is described matters legally as well as commercially.

- **Describe it as parent-directed:** "Aim proposes, you decide." The parent remains the educator of record. This matches how homeschooling works in most places, and the two-level approval is what makes it true.
- **Don't claim these without professional and legal review, per jurisdiction:**
  - accreditation;
  - "complete curriculum";
  - "meets your state's requirements";
  - grade placement or credit equivalence.

  Homeschool law varies by state and country.
- **Record keeping:** approved plans, completed lessons, TeachBack results and the portfolio form a record of what was taught and learned. This can help families who must keep records. Say "helps you keep records", not "satisfies your state's requirements".

## Weekly plans

- **Aim proposes one week at a time,** not a whole year in detail. It uses:
  - curriculum objectives and progress;
  - understanding already demonstrated, and what needs review;
  - the subjects selected and the time available;
  - interests, upcoming projects and available materials.
- **The parent reviews and approves the plan,** for the whole week or lesson by lesson. They can ask for changes in plain language:
  - "Make Wednesday lighter."
  - "More hands-on science."
  - "More review of fractions."
  - "Connect history to our museum visit."

**Each lesson shows:**

- objectives and how they relate to the curriculum;
- recommended videos, with their length;
- a summary or transcript where permitted (pending the transcript legal review in ROADMAP.md);
- the instructor's planned discussion;
- reading, exercises and materials;
- estimated time;
- its link to the unit's culmination project.

**Parent actions on a lesson:**

- **Find New Video** (an AI replacement covering the same objective);
- **Find My Own Video** (search YouTube, or paste a link);
- **Remove Video** (replace it with reading, an experiment or another method);
- **Edit Lesson**;
- **Approve**.

## Reading

**Two kinds, both central:**

- **Curriculum reading:** books chosen to support objectives.
- **Reading for enjoyment:** books matched to the student's interests, such as mysteries (for example *The Hardy Boys*), fantasy, science, biography or adventure. These don't need quizzes.

**Possible features:**

- recommendations;
- parent-approved lists;
- a student bookshelf and reading history;
- library borrowing, purchase, ebooks and audiobooks. Audiobooks supplement reading practice; they don't replace it.

**Affiliate links** are allowed only if disclosed, and recommendations must stay independent of commissions.

## Hands-on learning

- **Experiments and real-world applications are central,** not extras. Examples by subject:
  - **Math:** measuring, budgeting, construction.
  - **Science:** experiments, observations, investigations.
  - **History:** primary sources, models, historical decisions.
  - **English:** letters, persuasion, presentations.
  - **Life skills:** cooking, money, household maintenance.
- **Each week comes with a materials list.** Parents can swap activities for cost, safety, space or time.
- Screen time regularly leads to offline activity.

## Culmination projects (core assessment model)

**Units are built in three stages:**

1. **Foundational lessons:** single concepts through video, reading, discussion and practice.
2. **Connected challenges:** small problems that combine two or more concepts.
3. **Culmination project:** a larger, realistic problem that draws on several lessons and subjects.

**The final challenge is shown at the start,** so each lesson has a reason. For example: "You'll design a bridge. Today: how triangles distribute forces."

**Example: Build a Bridge.** Each subject contributes:

| Subject | Concepts | Application |
|---|---|---|
| Math | Fractions, geometry, measurement | Dimensions |
| Science | Forces, tension, compression | Structural design |
| History | Historical bridge designs | Compare approaches |
| Economics | Costs, trade-offs | Materials budget |
| Writing | Reasoned argument | Defend choices |
| Practical | Planning, construction | Build and test a model |

To finish, the student:

1. designs the bridge;
2. calculates its dimensions;
3. estimates materials and cost;
4. builds a safe model;
5. tests it;
6. analyzes its weaknesses;
7. revises the design;
8. defends the final design.

**Assessment** weighs:

- accuracy;
- reasoning and application;
- decisions and creativity;
- the problem-solving process;
- finding mistakes, and revising;
- communication.

Projects complement foundational skill checks; they don't replace them.

**Portfolio:** written work, photos, sketches, calculations, results, presentations, reflections and revisions. It's evidence of what the student actually did.

### Rotating featured projects (Revision 02: core curriculum requirement)

**Every subject regularly builds toward a culmination project, but only one is *featured* each week,** so students never juggle several big projects at once:

- Week 1: Science.
- Week 2: Math.
- Week 3: History.
- Week 4: English.
- Then repeat, with new projects and objectives.

How the rotation works:

- **All subjects keep their regular lessons;** shorter in-subject challenges still happen.
- **The featured presentation or demonstration is usually on Friday.**
- **How often projects come round is a setting,** not a promise. With four subjects and one featured project a week, each subject gets a major project about every four weeks. Parents adjust the rotation by subjects, age, time and needs.
- **Larger interdisciplinary projects** (for example, designing a small community: infrastructure, finances, geography, government, persuasion) may come once a quarter or semester. This is a curriculum design consideration, not an initial feature.

**The weekly rhythm:**

| Day | What happens |
|---|---|
| Monday | **Introduce the challenge** before the student can solve it: the problem, why it matters, and the deliverable |
| Tuesday–Wednesday | **Build understanding:** videos, reading, discussion, guided practice, small experiments, connected challenges, independent investigation. Each lesson says how it feeds the project ("You'll need today's geometry for your bridge's dimensions.") |
| Thursday | **Short TeachBack check** to find gaps before the project (see ROADMAP.md → TeachBack) |
| Friday | **Apply, test and reflect:** build, experiment, solve, present, analyze, write or simulate. Friday isn't a single pass-or-fail attempt: students find mistakes, revise and explain their reasoning |

TeachBack tests explanation. Culmination projects test integrated application. Together they give the fuller picture.

**In the weekly plan,** the featured project sits at the top and shows:

- the challenge and its objectives;
- the lessons that prepare for it;
- deliverables, materials, time and the assessment criteria;
- how much parent involvement it needs.

Parents can approve, edit, replace or reschedule it.

### The overall model

**Established curriculum objectives → weekly featured challenge → connected lessons → practical application → reflection and assessment → next plan**

The culmination format suits the subject:

| Subject | Culmination format |
|---|---|
| Math | A realistic quantitative or design problem |
| Science | Investigate, experiment, test, explain |
| History | Evaluate historical dilemmas and consequences |
| English | Write, persuade, analyze, present |
| Personal finance | Decisions under constraints |
| Life skills | Demonstrate a practical capability |

Projects must be educationally meaningful, not just entertaining. Foundational instruction, reading, practice and conventional assessment stay where they're needed.

## History: the Precedent method (Revision 02)

**History lessons build on the methodology of Precedent,** the separate history-learning app. History should be *useful*: causes, decisions, consequences and recurring patterns, not just names and dates. **The two products and their codebases stay separate,** and nothing is shared until there's a demonstrated need.

**Lesson sequence** (age-appropriate):

1. **Context:** the people, institutions, conditions and pressures.
2. **Dilemma:** a historically grounded problem people faced at the time.
3. **Evidence:** sources, competing perspectives, uncertainties.
4. **Decision:** weigh the options and defend a recommendation.
5. **Consequences:** what happened, and why.
6. **Historical parallel:** compare with another situation. What's similar, what's different, why approaches succeeded or failed, which circumstances mattered, what might reasonably transfer, and what questions it raises. No superficial analogies, and no "history always repeats".
7. **Reflection:** similarities, differences, lessons, open questions.

**How students engage with it:**

- **Students think for themselves** rather than repeating the instructor's conclusions.
- **The instructor separates** documented fact, plausible interpretation and speculation.
- **History projects are often immersive decisions.** For example, "Rome Is in Crisis — What Would You Do?": the student advises during a specific crisis, learns the institutions, pressures, interests, people, options and evidence through the week, presents and defends a recommendation on Friday, and then the real outcome is revealed and examined.
- **Look and feel:** the history section may borrow from Precedent's visual language (classical artwork, museum-style layouts, timelines, maps, primary documents, curated exhibits) within Aim's own navigation and design system.

## Doing it together (Addendum 03)

Aim should make it easier for parents to take part, not replace the parent–child relationship. Taking part is encouraged, never required.

**There's no Parent Participation section.** One unobtrusive prompt, **"Want to do this one together?"**, appears where it fits: in the weekly plan, on lessons, on TeachBack checks and on projects.

**The three formats, built in this order:**

1. **Discuss together.** The parent leads a TeachBack check instead of the AI.
   - Aim gives a short printable or mobile reference sheet:
     - key concepts;
     - five good questions;
     - suggested answers;
     - common misconceptions;
     - optional follow-ups.
   - No subject expertise is needed, and there's no recording or grading.
   - The parent can optionally mark "understood" or "needs review".
2. **Build together.** A short guide for culmination projects:
   - what the project teaches;
   - what the student does alone;
   - where the parent can guide;
   - what needs adult supervision;
   - questions that keep the student reasoning.

   Parents help students think; they don't hand over solutions.
3. **Explore together.** Occasional, optional field trips tied to current objectives: museums, historic sites, trails, wildlife and science centers, workshops, farms, landmarks.
   - Each suggestion gives:
     - the objective it supports;
     - why the place is relevant;
     - what to observe;
     - one or two questions for afterwards.
   - Location is used only with permission, and places must be verified, never invented.
   - No bookings, tickets, itineraries or trip management. Field trips never displace required coverage.

**None of this is a separate system.** It reuses lesson objectives, TeachBack questions and project data.

**The test for any parent-facing feature:** does it meaningfully improve the child's education, or reduce the parent's workload? If not, leave it out.

## Preferred channels (Addendum 04)

Parents can mark YouTube channels they trust as **Preferred**, or as **Don't Recommend**.

**Where parents set them:**

- by link or channel search, in the existing Learning Library or content preferences (no new top-level section);
- with a small **Prefer This Channel** action next to videos in the weekly plan review.

Preferences are per student or per family, and parents can view and remove them.

**How Preferred is used:**

- **Preferred is a ranking boost, not an approval.** Every video is still judged on relevance to the objective, age appropriateness, instructional quality, accuracy where it can be assessed, and availability and metadata.
- Preferred content is never forced in when better material exists elsewhere.
- Recommendations are never limited to preferred channels, unless a separate, explicit parent control is added that explains the limitations.

**Storage:**

- channels are stored by their stable `UC…` ID, not their display name (see ROADMAP.md → Decision 8);
- preferences are kept separate from video approvals and curriculum objectives.

## Curiosity

- When a student is fascinated by something, Aim may suggest books, videos, activities or projects about it.
- The parent decides whether to schedule them, and curriculum coverage is preserved.

## Groundwork already planned in Aim Plus (see ROADMAP.md → Decisions)

- **Learners are separate from accounts,** so child learners can sit under a parent account without their own logins.
- **One plan model** with ordered items of mixed types (video, reading, exercise, activity), nested for homeschool:
  - a big-picture plan, versioned, made of units with objectives and pacing;
  - weekly plans generated from it;
  - their items.

  Both levels carry an approval state: who approved what, and when.
- **Evidence-based progress events,** which a portfolio and project assessment can build on.
- **Content structures the plan model must allow** (`plan_items` with typed `content`), so these become item types rather than new systems:
  - a featured `project` (subject, deliverables, materials, rubric, parent guide, schedule);
  - a `history_case` in Precedent's shape: event, objectives, context, sources with uncertainty, dilemma, student response, recorded outcome, parallels, reflection prompts, rubric;
  - `together` guides, generated from the item they belong to.
- **Rotation is a household setting** (subject order, frequency), not hard-coded.
- **Progress events take a `source`** (`teachback`, `instructor`, `parent`, `project`), so a parent's quick "understood" mark, TeachBack evidence and project results stay distinguishable.
- **Channel preferences are their own table**, keyed by learner or household and channel ID.
- **Curriculum uploads are household-private** (see "Bring your own curriculum"): their own table, RLS by household, never in shared tables, never used beyond that family's plans.
- **Before any build:** a separate privacy and legal design for children (COPPA and equivalents), and curriculum development with qualified educators.
