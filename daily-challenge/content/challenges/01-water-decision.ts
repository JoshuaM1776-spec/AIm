import type { ChallengeSeed } from "../types.ts";

export const waterDecision: ChallengeSeed = {
  number: 1,
  slug: "the-water-decision",
  title: "The Water Decision",
  summary:
    "A growing provincial city is running short of clean water, and illness is rising. Research the options and recommend what the city should do.",
  subjects: ["Engineering", "Economics", "Public Health"],
  challenge_type: "decide",
  research_minutes: 45,
  scenario_kind: "fictionalized_historical",
  scenario_note:
    "A fictional city in a Roman province, around the 2nd century AD. The situation is invented; the engineering, costs and customs it draws on are real.",
  role: {
    title: "The Governor",
    body:
      "You have been appointed governor of a growing provincial city. Its council, its merchants and its poorest districts all look to you to solve a problem that will shape the city for generations.",
  },
  situation:
    "The city's wells are failing. Several have run low after two dry summers, and the water from others tastes foul. Illness is increasing in the crowded lower districts, where wells sit close to latrines and drains. Meanwhile the population keeps growing as traders and veterans settle here. A spring rises in the hills about fifteen miles away, and a river runs past the city's edge, below the town and downstream of its tanneries.",
  final_task:
    "Research the problem, evaluate the options available to a Roman provincial city (and any others you discover), and recommend a course of action. Defend your decision with evidence, clear reasoning and an honest account of the trade-offs.",
  expectations: {
    easy: "Recommend a reasonable solution and explain why it should work for this city.",
    moderate:
      "Compare at least two alternatives, justify your recommendation, and explain the most important trade-offs in cost, health and time.",
    hard:
      "Evaluate competing approaches, address what you cannot know for certain, examine second-order consequences (for example on growth, maintenance and who benefits), and defend your plan against the strongest objection to it.",
  },
  cards: [
    { kind: "role", image: { key: "forum", alt: "The forum of a Roman provincial city: a temple front with columns above a paved square." }, direction: "The forum of a Roman provincial city at dusk: a temple front with columns, colonnades either side, a few citizens. Warm engraved style." },
    { kind: "situation", image: { key: "well", alt: "An old stone well with a wooden windlass and bucket in a crowded street." }, direction: "A stone well with a wooden windlass and bucket in a crowded lower street, with plain house fronts close around it." },
    { kind: "constraints", image: { key: "aqueduct-sketch", alt: "An architect's pen sketch of an arched aqueduct crossing a valley." }, direction: "An engineer's pen sketch of an aqueduct crossing a valley, with a dashed line showing a gentle, continuous fall." },
    { kind: "investigation", image: null, direction: "No picture: the questions are the content." },
    { kind: "decision", image: { key: "aqueduct", alt: "A stone aqueduct of tall arches crossing a river valley at sunset." }, direction: "A long stone aqueduct of arches crossing a river valley at sunset." },
  ],
  constraints: [
    { label: "Limited funds", detail: "The city treasury is modest. Large works need wealthy patrons, new taxes or help from the province.", icon: "coins" },
    { label: "A growing population", detail: "Whatever you build must serve a larger city in twenty years, not just today's.", icon: "users" },
    { label: "Difficult terrain", detail: "Hills and a valley lie between the spring and the city.", icon: "mountain" },
    { label: "Long-term impact on the region", detail: "Water shapes where people live, trade and farm for generations.", icon: "leaf" },
  ],
  investigation: [
    {
      title: "Engineering",
      questions: [
        { text: "What methods could reliably supply the city with water, and how did Roman engineers move water over long distances?", priority: "essential" },
        { text: "What are the limitations of each approach: distance, gradient, valleys, maintenance?", priority: "exploratory" },
      ],
    },
    {
      title: "Public Health",
      questions: [
        { text: "What might explain the increase in illness, and why is it worse in the lower districts?", priority: "essential" },
        { text: "How could different water sources, and how water and waste are handled, affect health?", priority: "exploratory" },
      ],
    },
    {
      title: "Economics",
      questions: [
        { text: "What can the city realistically afford, and who could pay for large public works?", priority: "essential" },
        { text: "How do the costs of building compare with the costs of keeping a system running?", priority: "exploratory" },
      ],
    },
    {
      title: "Long-Term Consequences",
      questions: [
        { text: "What happens as the city keeps growing?", priority: "essential" },
        { text: "What unintended consequences might your choice create, and for whom?", priority: "exploratory" },
      ],
    },
  ],
  reference: {
    background: `Roman water supply drew on several techniques, often in combination:
- Wells and rainwater cisterns were the traditional supply for most towns. Shallow wells near cesspits, latrines and drains can be contaminated by seepage; deepening wells or moving waste away from them reduces this. Roman writers did not have germ theory, but they did connect bad water with illness and judged water by its source, clarity, taste and the health of people who drank it (Vitruvius, Book VIII).
- Aqueducts carried water by gravity in channels (mostly underground or on low walls, with arched bridges only where valleys required). They needed a continuous gentle downhill gradient over the whole route, careful surveying, and in deep valleys either long detours around the contours, arched bridges, or inverted siphons in pressurised pipes (used in some places, such as Lyon, but costly and difficult). Construction of a long aqueduct could take years and a very large investment; funding came from emperors, provincial governments, city treasuries and wealthy patrons (civic benefaction was a recognised source of prestige).
- Aqueducts required ongoing maintenance: clearing mineral deposits (sinter), repairing leaks, guarding against illegal tapping. Frontinus, appointed curator of Rome's water supply by Nerva in AD 97, wrote about fraud, leaks and administration in De aquaeductu.
- Vitruvius (Book VIII, ch. 6) describes a distribution tank with three compartments: one feeding public basins and fountains, one the baths, and one private houses, whose payments helped maintain the supply. Settling tanks helped clear sediment.
- Water-lifting machines existed (bucket chains, waterwheels, the Archimedean screw, the force pump attributed to Ctesibius), useful for raising river water short heights, but they need constant labour or power and do not purify water.
- River water downstream of a town and its industries (tanneries, fulleries) is likely to be polluted; water from a protected spring upstream is generally cleaner.
- Drains and sewers that carry waste away from wells and streets reduce contamination; an aqueduct's constant flow can also flush drains.
Key trade-off: an aqueduct from the hill spring offers a large, steady, cleaner supply that supports growth, but costs heavily, takes years, and must be maintained and governed. Cheaper short-term measures (protecting and deepening wells, cisterns, moving latrines, regulating tanneries, rationing) can act quickly but may not meet long-term demand. Many strong answers combine immediate public-health measures with a phased long-term supply.`,
    core_knowledge: "How gravity-fed supply works and why it needs a continuous downhill gradient; why shallow wells near latrines and drains become contaminated; storage, settling and distribution; the difference between building and maintaining infrastructure; how Roman cities paid for public works (civic benefaction, provincial and city funds, charges for private connections).",
    uncertainties: "The scenario gives no costs, flow rates or terrain profile, so answers must reason about conditions and orders of magnitude rather than precise figures. Roman construction costs and timelines varied widely. The cause of the illness is strongly suggested (contamination near waste) but not stated outright.",
    investigation_map: "Essential: how water can be moved over distance and valleys; why illness clusters near latrines and drains; what the city can afford to build and keep running. Exploratory: growth over decades; who benefits from each option; effects downstream. Engineering meets economics because the cheapest route can be the most expensive to maintain; public health meets engineering because more water does not by itself fix contaminated wells.",
    approaches: [
      {
        title: "Infrastructure first",
        summary: "Build an aqueduct from the hill spring, financed by patrons, the province and the city.",
        strengths: "A large, steady, cleaner supply that can serve a growing city for generations.",
        weaknesses: "Costly, slow (years), needs a feasible route across the valley and lasting maintenance; does not by itself fix contaminated wells.",
        conditions: "Works if funding can be found and the survey shows a route with a workable gradient.",
      },
      {
        title: "Protect and manage what exists",
        summary: "Deepen and protect wells, build cisterns, move latrines and drains away from wells, restrict tanneries, share water by priority.",
        strengths: "Cheap, fast, and aimed directly at the likely cause of illness.",
        weaknesses: "Limited supply; depends on rainfall; may fall behind a fast-growing population.",
        conditions: "Works if demand grows slowly and contamination is the main driver of illness.",
      },
      {
        title: "Phased and integrated",
        summary: "Immediate public-health measures now, cisterns next, and an aqueduct surveyed and funded in stages, with public fountains in poorer districts first.",
        strengths: "Addresses both the urgent and the long-term problem; spreads cost.",
        weaknesses: "Complex to govern; the long-term stage can stall if money or will runs out.",
        conditions: "Works if the city can sustain a multi-year plan and set aside money for upkeep.",
      },
      {
        title: "River water, lifted and settled",
        summary: "Draw river water upstream of the city's pollution and lift it with machines into settling tanks.",
        strengths: "Cheaper than an aqueduct and uses an existing source.",
        weaknesses: "Lifting needs constant labour or animal power; river water may still be unclean; intake must be upstream of the tanneries.",
        conditions: "Works if a clean intake upstream is reachable and labour is available.",
      },
    ],
    misconceptions: [
      "That aqueducts were mainly tall arched bridges; most of a typical route ran at or below ground level, and arches were used only where the terrain required them.",
      "That Romans understood germs; they linked bad water with disease through observation, not microbiology. (Using modern knowledge in a response is fine if it is clearly applied.)",
      "That an aqueduct, once built, is free; maintenance, administration and preventing theft were continuing costs.",
      "That water can be carried uphill in an open channel; gravity channels need a continuous downward slope.",
    ],
    critical_reasoning: "A superficial answer names a solution (usually an aqueduct) without linking it to the scenario's causes. A strong answer separates the immediate health problem from the long-term supply problem, explains which measure addresses which cause, weighs cost and time honestly, and recognises that a new supply needs funding and maintenance to last.",
    evidence_expectations: "Accurate use of how Roman water systems worked (gravity channels, siphons, cisterns, distribution tanks); real examples or writers where relevant (Vitruvius, Frontinus, specific aqueducts); reasoning about contamination of shallow wells; sensible reasoning about cost and time. Citations welcome, not required.",
    difficulty_guide: {"easy": "A plausible plan that deals with the failing, contaminated wells, a basic reason it should work, and one limitation.", "moderate": "Compares at least two options on health, cost and time, recommends one with reasons, and names the main trade-off.", "hard": "Integrates engineering, public health and economics; examines assumptions about terrain, funding and growth; addresses maintenance and who benefits; answers the strongest objection."},
    fairness_notes: "Do not favour the aqueduct because it is iconic. A well-argued plan built on cisterns, well protection and drainage can score as highly as an aqueduct or a phased plan. Modern germ theory may be used if it is applied clearly.",
    evaluator_notes:
      "There is no single correct answer. Credit responses that connect the cause of illness (contamination near latrines and drains in the lower districts, polluted river water) to the remedy, weigh cost and time honestly, and think about growth and maintenance. A well-argued case for an aqueduct alone, for cheaper measures alone, or for a combination can all score highly. Do not penalise a reasonable plan for not naming specific historical aqueducts or writers. Treat imprecise but plausible engineering claims gently; correct clear errors (such as water flowing uphill in an open channel).",
    sources: [
      { title: "Vitruvius, On Architecture, Book VIII, chapter 6 (Morgan translation, Perseus)", note: "Distribution tank in three compartments: public basins and fountains, baths, private houses; household payments help maintain the supply.", url: "https://cts.perseids.org/read/latinLit/phi1056/phi001/perseus-eng1/8.6.1-8.6.3", verified: true, critical: true },
      { title: "R. H. Rodgers (ed.), Frontinus: De Aquaeductu Urbis Romae (Cambridge University Press, 2004)", note: "Frontinus appointed curator aquarum by Nerva in AD 97; his report on Rome's aqueducts, upkeep and abuses.", url: "https://assets.cambridge.org/97805218/32519/excerpt/9780521832519_excerpt.htm", verified: true, critical: false },
      { title: "Aqueduct of the Gier (Lugdunum / Lyon)", note: "Inverted siphons in pressurised lead pipes carried the line across deep valleys.", url: "https://en.wikipedia.org/wiki/Aqueduct_of_the_Gier", verified: true, critical: false },
    ],
  },
  quality: {
    scores: {"intrigue": 4, "responsibility": 5, "research_depth": 5, "integration": 5, "reasoning": 5, "researchability": 5, "clarity": 5, "articulation": 5},
    weaknesses: "A Roman governor and a water shortage are familiar choices the standard warns against overusing; vary settings in the challenges that follow. The scenario gives few numbers, so answers lean on qualitative reasoning.",
    recommendation: "approved",
    assessed_by: "ai",
  },
  editorial_status: "approved",
  samples: [
    {
      display_name: "Sample",
      title: "Build the aqueduct, but start with the wells",
      selected_label: "The Infrastructure Plan",
      body: `I recommend an aqueduct from the hill spring as the city's long-term supply, with immediate repairs to the existing wells while it is built.

The wells are failing for two reasons: drought is lowering the water table, and in the lower districts wells sit beside latrines and drains. Fixing the wells treats the second problem but not the first. A growing city needs a supply that does not depend on local rainfall, and a protected spring in the hills is cleaner than anything near the city. The river is no answer: it passes the tanneries before it reaches us.

Fifteen miles is a long route, and the valley in between is the hardest part. Roman engineers usually followed the contours to keep a gentle downhill slope and used arches only where a valley could not be avoided, so I would ask surveyors for a route that minimises bridges. It will take years and far more money than the treasury holds, so I would seek a patron's gift and a contribution from the province, and charge private houses for connections.

The trade-off is time and cost: people are ill now. That is why the wells come first: deepen the best ones, close those nearest latrines, and build public cisterns. But only the aqueduct lets the city keep growing.`,
    },
    {
      display_name: "Sample",
      title: "Clean, protect and share the water we have",
      selected_label: "The Conservation Plan",
      body: `My recommendation is to make the existing supply safe and to manage demand, rather than commit the city to an aqueduct it cannot yet afford.

The illness is worst where wells are close to latrines and drains. That points to contamination, not only shortage. So the first measures are cheap and fast: close or deepen the wells nearest to waste, move latrines downhill of wells, cover the remaining wells, and build a drain to carry waste away from the lower districts. Tanneries should be moved downstream so the river does not get worse.

For quantity, every large roof (temples, the basilica, the baths) can feed a cistern. Water should be shared by priority: drinking fountains first, then the baths, with private use limited during dry summers.

An aqueduct would bring more water, but it would take years, cost more than the treasury holds, and need constant maintenance. If the city borrows or taxes heavily for it, the poorest districts, where people are ill now, may wait longest for help.

The risk of my plan is that it may not keep up if the city keeps growing quickly. I would review it after a few years and, if demand outgrows the cisterns, begin surveying for an aqueduct then, with the health measures already in place.`,
    },
    {
      display_name: "Sample",
      title: "Health now, supply in stages",
      selected_label: "The Integrated Plan",
      body: `I would do three things at once, in order of urgency.

Within weeks: protect public health. Close the wells nearest the latrines, build drains in the lower districts, and set up public fountains supplied from the cleanest wells. This targets the likely cause of the illness at little cost.

Within a year: increase storage. Cisterns under public buildings and a regulation keeping tanneries downstream will stretch the supply through dry summers.

Over the next decade: build an aqueduct from the hill spring in stages. A survey first, to find a route that follows the hills and avoids deep crossings; then funding from a mix of patrons (who gain honour from public works), the province, and fees for private connections. The first water should go to fountains in the poorer districts, then the baths, then private houses.

The main trade-off is that the aqueduct ties the city to maintenance for generations. I would set aside part of the connection fees for upkeep from the start, so the system does not decay after the patron's money is spent.

I am least certain about the terrain. If the survey shows the valley crossing would be enormously expensive, I would extend the cisterns and look again at drawing river water upstream of the town.`,
    },
  ],
};
