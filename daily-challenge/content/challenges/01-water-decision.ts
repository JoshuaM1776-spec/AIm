import type { ChallengeSeed } from "../types.ts";

export const waterDecision: ChallengeSeed = {
  number: 1,
  slug: "the-water-decision",
  title: "The Water Decision",
  summary:
    "A growing provincial city is running short of clean water, and illness is rising. Research the options and recommend what the city should do.",
  subjects: ["Engineering", "Economics", "Public Health"],
  scenario_kind: "fictional",
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
    { kind: "role", image: { key: "forum", alt: "The forum of a Roman provincial city: a temple front with columns above a paved square." } },
    { kind: "situation", image: { key: "well", alt: "An old stone well with a wooden windlass and bucket in a crowded street." } },
    { kind: "constraints", image: { key: "aqueduct-sketch", alt: "An architect's pen sketch of an arched aqueduct crossing a valley." } },
    { kind: "investigation", image: null },
    { kind: "decision", image: { key: "aqueduct", alt: "A stone aqueduct of tall arches crossing a river valley at sunset." } },
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
        "What methods could reliably supply the city with water, and how did Roman engineers move water over long distances?",
        "What are the limitations of each approach: distance, gradient, valleys, maintenance?",
      ],
    },
    {
      title: "Public Health",
      questions: [
        "What might explain the increase in illness, and why is it worse in the lower districts?",
        "How could different water sources, and how water and waste are handled, affect health?",
      ],
    },
    {
      title: "Economics",
      questions: [
        "What can the city realistically afford, and who could pay for large public works?",
        "How do the costs of building compare with the costs of keeping a system running?",
      ],
    },
    {
      title: "Long-Term Consequences",
      questions: [
        "What happens as the city keeps growing?",
        "What unintended consequences might your choice create, and for whom?",
      ],
    },
  ],
  reference: {
    background: `Roman water supply drew on several techniques, often in combination:
- Wells and rainwater cisterns were the traditional supply for most towns. Shallow wells near cesspits, latrines and drains can be contaminated by seepage; deepening wells or moving waste away from them reduces this. Roman writers did not have germ theory, but they did connect bad water with illness and judged water by its source, clarity, taste and the health of people who drank it (Vitruvius, Book VIII).
- Aqueducts carried water by gravity in channels (mostly underground or on low walls, with arched bridges only where valleys required). They needed a continuous gentle downhill gradient over the whole route, careful surveying, and in deep valleys either long detours around the contours, arched bridges, or inverted siphons in pressurised pipes (used in some places, such as Lyon, but costly and difficult). Construction of a long aqueduct could take years and a very large investment; funding came from emperors, provincial governments, city treasuries and wealthy patrons (civic benefaction was a recognised source of prestige).
- Aqueducts required ongoing maintenance: clearing mineral deposits (sinter), repairing leaks, guarding against illegal tapping. Frontinus, water commissioner of Rome around AD 97, wrote about fraud, leaks and administration in De aquaeductu.
- Water was distributed from a distribution tank (castellum) to public fountains, baths and paying private connections. Vitruvius describes giving priority to public basins and fountains. Settling tanks helped clear sediment.
- Water-lifting machines existed (bucket chains, waterwheels, the Archimedean screw, the force pump attributed to Ctesibius), useful for raising river water short heights, but they need constant labour or power and do not purify water.
- River water downstream of a town and its industries (tanneries, fulleries) is likely to be polluted; water from a protected spring upstream is generally cleaner.
- Drains and sewers that carry waste away from wells and streets reduce contamination; an aqueduct's constant flow can also flush drains.
Key trade-off: an aqueduct from the hill spring offers a large, steady, cleaner supply that supports growth, but costs heavily, takes years, and must be maintained and governed. Cheaper short-term measures (protecting and deepening wells, cisterns, moving latrines, regulating tanneries, rationing) can act quickly but may not meet long-term demand. Many strong answers combine immediate public-health measures with a phased long-term supply.`,
    approaches: [
      { title: "Infrastructure first", summary: "Build an aqueduct from the hill spring, financed by patrons, the province and the city, as the only supply that can serve a growing city long term." },
      { title: "Protect and manage what exists", summary: "Deepen and protect wells, build cisterns, move latrines and drains away from wells, restrict tanneries, and allocate water fairly: cheaper and faster, at the cost of a smaller supply." },
      { title: "Phased and integrated", summary: "Act immediately on public health and water management while surveying and funding an aqueduct in stages, with fountains for the poorer districts first." },
      { title: "Use the river with treatment and lifting", summary: "Draw river water upstream of the city's pollution and lift it with machines into settling tanks; cheaper than an aqueduct but labour-intensive." },
    ],
    misconceptions: [
      "That aqueducts were mainly tall arched bridges; most of a typical route ran at or below ground level, and arches were used only where the terrain required them.",
      "That Romans understood germs; they linked bad water with disease through observation, not microbiology. (Using modern knowledge in a response is fine if it is clearly applied.)",
      "That an aqueduct, once built, is free; maintenance, administration and preventing theft were continuing costs.",
      "That water can be carried uphill in an open channel; gravity channels need a continuous downward slope.",
    ],
    evaluator_notes:
      "There is no single correct answer. Credit responses that connect the cause of illness (contamination near latrines and drains in the lower districts, polluted river water) to the remedy, weigh cost and time honestly, and think about growth and maintenance. A well-argued case for an aqueduct alone, for cheaper measures alone, or for a combination can all score highly. Do not penalise a reasonable plan for not naming specific historical aqueducts or writers. Treat imprecise but plausible engineering claims gently; correct clear errors (such as water flowing uphill in an open channel).",
    sources: [
      { title: "Vitruvius, De architectura, Book VIII", note: "Finding and testing water, aqueducts, distribution." },
      { title: "Frontinus, De aquaeductu", note: "Administration, maintenance and fraud in Rome's water system." },
    ],
  },
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
