import type { ChallengeSeed } from "../types.ts";

export const theOutbreak: ChallengeSeed = {
  number: 2,
  slug: "the-outbreak",
  title: "The Outbreak",
  summary:
    "A deadly illness is spreading through a river town and nobody agrees on why. Decide what to do now, and how to find out what is causing it.",
  subjects: ["Epidemiology", "Statistics", "Governance"],
  scenario_kind: "fictional",
  scenario_note:
    "A fictional English river town in the mid-19th century. The town, people and numbers are invented; the methods of investigation are real.",
  role: {
    title: "The Medical Officer",
    body:
      "The town council has just appointed you its first Medical Officer of Health. You have a small budget, two clerks, the authority to advise the council, and very little time.",
  },
  situation:
    "In ten days, a severe illness with violent diarrhoea and vomiting has struck about 140 people, and more than 40 have died. Cases are concentrated in a few streets near the river. Some councillors blame foul air from the tannery and the open sewer; others suspect the water. Two companies supply water to different parts of town, one drawing from the river below the sewer outfall and one from springs above the town, and many poorer households still use a public pump. The workhouse, with its own well, has had almost no cases.",
  final_task:
    "Recommend what the council should do now to protect the town, and explain how you will find out what is causing the outbreak. Defend your recommendations with evidence and reasoning, and be honest about what you do not yet know.",
  expectations: {
    easy: "Recommend sensible immediate actions and explain how you would start investigating the cause.",
    moderate:
      "Weigh the competing explanations, propose how to test them with the evidence available, and justify immediate actions given the uncertainty.",
    hard:
      "Design an investigation that could distinguish the explanations (including what would change your mind), address confounding and small numbers, consider the political and economic costs of acting before you are certain, and defend your plan against its strongest objection.",
  },
  cards: [
    { kind: "role", image: { key: "ledger", alt: "An open case register with a quill pen and an oil lamp on a desk." } },
    { kind: "situation", image: { key: "pump", alt: "A cast-iron public water pump on a cobbled street corner." } },
    { kind: "constraints", image: { key: "street-map", alt: "A hand-drawn street map of a river town with small marks clustered around one street." } },
    { kind: "investigation", image: null },
    { kind: "decision", image: { key: "pump", alt: "A cast-iron public water pump on a cobbled street corner." } },
  ],
  constraints: [
    { label: "Lives at stake every day", detail: "Waiting for certainty has a cost measured in deaths.", icon: "heart-pulse" },
    { label: "Disagreement about the cause", detail: "Respected people hold opposite views, and the evidence is incomplete.", icon: "scale" },
    { label: "Limited data and staff", detail: "Records are patchy; you have two clerks and no laboratory.", icon: "notebook-pen" },
    { label: "Powerful interests", detail: "A water company and the tannery owner sit on the council.", icon: "landmark" },
  ],
  investigation: [
    {
      title: "Epidemiology",
      questions: [
        "How does an illness like this spread, and what pattern would each explanation produce?",
        "What can you learn from where and when people fell ill, and who did not?",
      ],
    },
    {
      title: "Statistics",
      questions: [
        "How would you compare illness rates between groups fairly?",
        "What could make a pattern misleading: confounding, small numbers, missing records?",
      ],
    },
    {
      title: "Governance",
      questions: [
        "What can you ask the council to do before the cause is certain, and how will you persuade them?",
        "Who bears the cost of each action, and how would you handle their objections?",
      ],
    },
  ],
  reference: {
    background: `The scenario is modelled on 19th-century cholera outbreaks. Cholera is caused by the bacterium Vibrio cholerae and spreads mainly through water or food contaminated with faeces from infected people. Symptoms can begin within hours to about five days of exposure; severe watery diarrhoea can kill through dehydration within hours if fluids are not replaced. (Oral rehydration therapy was developed in the 20th century.)
In the mid-19th century the dominant "miasma" theory held that disease came from foul air. John Snow argued from evidence that cholera was waterborne. In the 1854 Broad Street outbreak in London he mapped deaths around a public pump and persuaded the local authorities to remove its handle; he also noted that a nearby workhouse and brewery with their own water had few deaths. In his study of 1853-54 he compared death rates among households supplied by two water companies, one drawing from the Thames below London's sewage outfalls and one from above, finding far higher mortality among customers of the downstream company (a "natural experiment", because the companies' customers were otherwise mixed in the same streets).
Useful investigative ideas: map cases and the time of onset (an epidemic curve); count cases per household by water source and compute rates, not just counts; look for exceptions (people far away who fell ill, people nearby who did not) and find out what they drank; compare groups similar in other respects (to control confounding such as poverty, crowding and proximity to the sewer, which correlate with both bad air and bad water); be aware that small numbers produce noisy rates and that records may be incomplete.
Precaution under uncertainty: closing a suspected pump or advising boiling water is cheap relative to the potential lives saved, even before the cause is proven, and stopping exposure can itself be a test (cases should fall after a few days if water is the cause, though outbreaks also decline on their own as people flee or susceptible people are exhausted, which complicates the inference).`,
    approaches: [
      { title: "Act on the water now", summary: "Treat the water as the likely source: close or disable the public pump, warn customers of the downstream company, advise boiling; investigate in parallel." },
      { title: "Investigate to decide", summary: "Rapidly collect case data by household, water source and onset date, compare rates, then act decisively on what the data show." },
      { title: "Cover both explanations", summary: "Take low-cost measures against both bad air and bad water (clearing the sewer, closing the pump), while running a comparison that can tell them apart." },
    ],
    misconceptions: [
      "Comparing raw numbers of cases between groups of different sizes instead of rates.",
      "Assuming that because cases cluster near the sewer, the smell must be the cause (proximity to the sewer correlates with both air and water exposure).",
      "That nothing should be done until the cause is certain.",
      "That a fall in cases after closing a pump proves the pump was the cause (outbreaks may decline on their own).",
    ],
    evaluator_notes:
      "Do not require the user to name John Snow or to reach a specific answer. Strong responses separate immediate protective action from the investigation, explain how evidence would distinguish the explanations (comparison of rates by water source, attention to exceptions such as the workhouse, timing), deal with uncertainty and confounding, and handle the governance problem of persuading a divided council with conflicts of interest. Modern knowledge of cholera is acceptable; credit responses that also consider what could be done with the tools of the period. Penalise confident claims unsupported by the scenario (for example asserting the tannery is definitely innocent without evidence).",
    sources: [
      { title: "John Snow, On the Mode of Communication of Cholera (2nd ed., 1855)", note: "The Broad Street map and the comparison of two water companies." },
      { title: "World Health Organization, cholera fact sheet", note: "Modern summary of transmission, incubation and treatment." },
    ],
  },
  samples: [
    {
      display_name: "Sample",
      title: "Close the pump today, prove it next week",
      selected_label: "Act on the Water",
      body: `My first recommendation is to take the handle off the public pump today and warn households supplied by the river company to boil their water.

The pattern points to water more than air. Cases cluster in a few streets, but the workhouse sits in the same neighbourhood, breathes the same air, and has almost no cases. Its difference is its own well. If foul air were the cause, the workhouse should suffer too.

I am not certain, and closing the pump will anger people who depend on it, so I would pair it with free water carts from the spring-fed company. The cost of being wrong is a few weeks of inconvenience; the cost of waiting is more deaths.

To test the idea, my clerks will visit every household with a case and record where it gets its water and when the illness began. If water is the cause, death rates should be much higher for the river company's customers than for the spring company's, even in the same streets. I will report rates, not counts, since the companies serve different numbers of houses.

One caution: if cases fall after the pump closes, that alone does not prove my case, because outbreaks often fade by themselves. The comparison of water companies is the stronger test.`,
    },
    {
      display_name: "Sample",
      title: "Get the numbers first, then act decisively",
      selected_label: "Investigate to Decide",
      body: `Before asking the council to do anything costly, I would spend two or three days gathering evidence, because a wrong decision will cost us their trust for the rest of the outbreak.

My clerks would list every case with address, date of onset, occupation and water source. I would plot them on a street map and by day. Then I would calculate the rate of illness for each water source and for households near and far from the sewer.

The two theories predict different things. If the air is to blame, illness should follow distance from the sewer and tannery regardless of water. If the water is to blame, households in the same street should differ depending on their supplier, and outlying cases should trace back to the river company or the pump.

The risk is that people die while we count. To limit that, I would immediately issue advice that costs nothing: boil drinking water and keep the sick apart from food preparation. Then, with the data, I can ask for the expensive measures with confidence.`,
    },
    {
      display_name: "Sample",
      title: "Cheap measures against both theories",
      selected_label: "Cover Both Explanations",
      body: `The council is split, and I cannot settle the argument in a day. So I would recommend measures that are cheap and help whichever theory is right, and design them so they also teach us something.

Against the water theory: close the public pump and supply clean water by cart. Against the air theory: clear the open sewer near the worst streets. Both are affordable and can be done this week.

Crucially, I would not do everything everywhere at once. If the sewer is cleared in one district first while the pump closes town-wide, and illness falls everywhere, that suggests water. Meanwhile my clerks would compare death rates among the two water companies' customers.

The difficulty is politics. The river company's director will resist any suggestion that his water kills. I would present rates, not accusations, and ask the council to commit in advance to acting on whatever the comparison shows.`,
    },
  ],
};
