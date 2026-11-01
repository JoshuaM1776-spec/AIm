# Aim — Product Specification and User Experience

The reference every change is checked against. Written by the product owner (November 2026),
with the revisions that followed it; implementation status is tracked in ROADMAP.md.

**Product goal:** Optimize YouTube for learning by reducing distractions, encouraging intentionality,
and making staying on target the effortless choice.

**The promise:** Tell Aim what you want to accomplish. It helps you find worthwhile videos, stay
focused, understand what you're learning, and put that knowledge to use.

Aim is not another learning platform that happens to use YouTube. It's an intelligent learning layer
built into YouTube. YouTube remains the primary place where people watch; Aim changes the experience
around those videos.

**Guiding principle:** Aim should do the organizational work so the user can do the intellectual work.
Fewer screens, fewer decisions, fewer unnecessary prompts, and better recommendations. Aim shouldn't
try to make people watch more educational videos. It should help them learn more from the videos they
watch. Learning may require effort. Using Aim shouldn't.

## 1. Architecture: three levels of involvement (not modes)

1. **Intentional YouTube** (everyone, including free): state your aim, a cleaner homepage, more relevant
   suggestions, intentional breaks.
2. **Guided learning** (when the goal calls for it): an optional route, help finding videos, TeachBack,
   practical exercises, a record of progress.
3. **Long-term growth:** the Library preserves learning, reviews reinforce it, Pathways connect interests
   to real skills and possibilities.

Users move between them naturally.

### Core rules

1. One active aim at a time; many saved.
2. The goal comes before the content: recommendations are chosen because they help accomplish the aim,
   not merely because they're related.
3. Exploration is allowed; curiosity isn't punished.
4. The interface stays quiet while watching; deeper features appear when relevant or requested.
5. Learning is not measured by watch time: Aim distinguishes watching, explaining, reviewing and applying.
6. The user stays in control: Aim suggests routes and next steps, never a rigid curriculum.
7. Free Aim is useful by itself; paid features deepen learning.

## 2. Four places, not thirteen screens

- **YouTube:** set an aim, search, watch, contextual suggestions. The main experience.
- **Library:** aims, lessons, notes, explanations, projects, and the learning record (inside the Library).
- **Pathways:** interests developing into skills, hobbies, careers and opportunities.
- **Settings:** the YouTube experience, breaks, learning preferences, account.

TeachBack, study sessions, practice and routes open contextually from YouTube or inside a book.
Study sessions and Homeschool stay as optional structured experiences on the same engine.

## 3. An aim versus a simple search

Aim infers the intention; users never classify their own requests, and can change the interpretation.

| User enters | Aim does |
| --- | --- |
| "How do I change a tire?" | Finds a good tutorial immediately |
| "I want to learn automotive maintenance" | Creates an aim with an optional route |
| "Why is the sky blue?" | Finds a clear explanation, no course |
| "I want to understand atmospheric physics" | Offers structured, multi-step learning |
| "I'm just browsing" | Opens Explore without requiring a goal |

Library saving: quick searches stay in recent activity and don't become books; substantial learning
goals become books automatically; any quick search can be saved by hand; an automatic book can be
removed, and automatic saving can be turned off.

## 4. The journey

1. **Open YouTube:** a clean homepage asks what brings you here; Explore is there when you have no goal.
2. **State your intention:** Aim understands quick answer, exploration, or a larger goal; at most one
   short clarifying question.
3. **Find a useful video:** the librarian recommends content for the goal, with a reason.
4. **Watch normally:** the video stays the focus. A compact panel in place of Up Next holds the goal and
   one recommended next step.
5. **Choose the next action:** at the end, one useful next step is suggested prominently (another
   video, explaining, or applying); the others are available; skipping is always possible.
6. **Learn more effectively:** TeachBack finds possible gaps; Aim helps address them. AI judgments are
   provisional.
7. **Build your library:** meaningful goals are kept, with what you explored, explained and applied.

## 5. The watch page panel (the most important screen)

Default, while watching: small. The aim ("You're learning …"), **Up next:** one recommended video with
why ("Builds on your previous lesson about lift", "Addresses the question you struggled with in
TeachBack"), then **Explain it · Notes · Library**. Expand for the rest (Learn / Explain / Apply, a break,
change aim). No progress bar unless following a structured route with defined steps.

Controls: current aim (expand), change aim, recommended video, more recommendations, Explain it, Notes,
Library, save video, expand/collapse, take a break, report an irrelevant suggestion.

Automatic behavior: unobtrusive while playing; the aim persists across relevant videos; a gentle
redirect for unrelated navigation; never repeated interruptions; respects breaks.

### When a video ends

A quiet prompt, never a blocking end screen. One primary action chosen by context:

- after a conceptual explanation: **Explain what you learned**
- after a woodworking tutorial: **Try this technique**
- after the first video of a complex topic: **Keep learning**
- after a quick how-to: **Done for now**

The others stay reachable (Keep learning, Explain it, Try it, Save for later, Done for now). If no
meaningful practical exercise exists, don't invent one.

## 6. Recommendations: more intelligent, not more numerous

The next video is chosen from: what the user wants to accomplish; what they've watched or studied;
what they've shown they understand; what remains uncertain; the most useful next step. Never simply
from the last video watched. Every suggestion says why. Aim claims to know what a video covers only
when it has adequate information: titles alone don't establish quality or completeness. When nothing
convincing is found, say so and offer to broaden or refine.

## 7. TeachBack

Almost ridiculously simple by default: one student, one question, voice first, typing available.
Explain → a useful question → respond → another question or feedback. No setup, no scores up front.
It sometimes challenges a correct but shallow answer. "I don't know" is useful information, not failure.
The full classroom lives in longer study sessions.

Feedback distinguishes: explained convincingly; still uncertain; possible misconceptions; questions to
revisit; material for further study. Never AI grades as proof of mastery. Safety-critical subjects are
grounded in references and never treated as certification.

**The gap loop:** when TeachBack finds something the user couldn't explain, Aim recommends targeted
material for it; after they watch it, TeachBack asks a follow-up.

## 8. Progress

Three kinds, kept apart, the foundation of the record:

- **Explored:** topics and materials encountered.
- **Explained:** ideas articulated, questioned or demonstrated in TeachBack.
- **Applied:** exercises, projects or problems worked through.

Percentages only for clearly defined things (eight lessons in a course), never "70% proficient".

## 9. Explore and Focus

One experience; the aim provides the context. A specific aim narrows recommendations; an open interest
widens them; a break removes learning expectations. **Intentional pivot:** "Explore Roman engineering?"
— make it the new aim, explore it for a while, or stay; suggested videos never quietly change the goal.

## 10. Long-term retention

Optional, well-timed review: "Last week you learned how angle of attack affects lift. Want to see if
you still remember?" A 60-second TeachBack. Never an intrusive notification.

## 11. Plus

Kept out of the main learning flow: users see the relevant action; if it needs Plus, a brief note and an
upgrade offer, without derailing the session. Suggested split (final limits depend on AI costs):

| Free | Plus |
| --- | --- |
| Clean homepage, aims, Explore, breaks | AI-guided learning routes |
| Relevant video search | Deeper personalized recommendations |
| Basic Library and saved aims | Extended voice TeachBack |
| Focus and distraction controls | Study sessions |
| A small amount of TeachBack | Personalized review and gap analysis |
| | Advanced records and projects |

## 12. Interaction states

No active aim: the simple prompt, no empty dashboard. Wants entertainment: "Just unwinding" or a break,
respected. Unrelated video: a small prompt (stay, change aim, break), not an immediate block. No good
recommendation: say so; offer to broaden or refine. No transcript: TeachBack asks from the goal, never
pretends to know what the video taught. Doesn't want TeachBack: nothing is marked failed. Several aims:
one active, each keeps its own context. Offline or AI unavailable: distraction controls and local data
keep working; AI controls explain they're unavailable.

## 13. Systems

YouTube integration (content scripts; recover when YouTube changes); aim manager; learning intelligence;
TeachBack engine; Library and sync (the source of truth: the panel reads and writes the same record).
AI credentials stay server-side. Local versus transmitted data is clear to the user. Recommendations are
inspectable and correctable. Transcripts are never assumed.

## 14. Measuring whether it works

Intentionality (watching relevant to the stated goal), understanding (can explain or use it),
retention (days or weeks later), and friction (extra work, dismissed prompts, continued use). Time spent
watching is secondary. Stronger evidence needs controlled comparisons with ordinary YouTube.

## 15. Deliberately left out

Mandatory quizzes, elaborate achievements, AI percentage mastery scores, overlapping focus modes, a chat
screen per feature, automatic career judgments from viewing history.

## Settled decisions

1. Light routes only for goals that clearly need several steps.
2. TeachBack is a quick one-student conversation; the classroom lives in study sessions.
3. Substantial learning goals become books automatically; quick searches and casual exploration don't,
   unless saved.
