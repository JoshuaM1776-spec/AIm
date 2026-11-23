import type { ChallengeSeed } from "../types.ts";

export const failingExpedition: ChallengeSeed = {
  number: 4,
  slug: "the-failing-expedition",
  title: "The Failing Expedition",
  summary:
    "Your polar expedition is running out of food and time, and one of your party is injured. Decide what the group should do, and how you will lead them through it.",
  subjects: ["Leadership", "Physiology", "Resource Management"],
  scenario_kind: "fictional",
  scenario_note:
    "A fictional polar expedition in the early 20th century. The party and its situation are invented; the physiology and the history it draws on are real.",
  role: {
    title: "The Expedition Leader",
    body:
      "You lead a party of eight hauling sledges across a polar ice sheet. Every person's life depends on the decisions you make in the next few days, and they will look to you for how you make them.",
  },
  situation:
    "A storm has pinned your party in its tents for six days. You are about 180 miles from your base hut and 70 miles from a supply depot laid last season, if it is still there. You have food for about 18 days at full rations and paraffin to melt snow for about 14. One man has a badly sprained ankle and cannot pull a sledge. Two others show early frostbite. The weather is improving, but the season is turning colder each week.",
  final_task:
    "Decide what the party should do (press on to the depot, return to base, split up, or wait) and explain how you will manage food, fuel, health and morale along the way. Defend your plan and its risks.",
  expectations: {
    easy: "Choose a plan and explain why it gives the party the best chance of survival.",
    moderate:
      "Compare the main options, justify your choice with the numbers you have (distances, food, fuel, pace), and explain the trade-offs and risks.",
    hard:
      "Evaluate the options under uncertainty (the depot may be gone, the weather may turn), plan for what would make you change course, consider the physiology of cold and hunger, and address the human side of leading a frightened group, including the ethics of splitting up.",
  },
  cards: [
    { kind: "role", image: { key: "polar-camp", alt: "Two canvas tents and a loaded sledge on an ice sheet under a low sun." } },
    { kind: "situation", image: { key: "ice-field", alt: "A field of jagged pressure ridges and drifting snow stretching to the horizon." } },
    { kind: "constraints", image: { key: "rations", alt: "Wooden supply boxes, a paraffin tin and a ration tally on a sledge." } },
    { kind: "investigation", image: null },
    { kind: "decision", image: { key: "polar-camp", alt: "Two canvas tents and a loaded sledge on an ice sheet under a low sun." } },
  ],
  constraints: [
    { label: "Food for 18 days, fuel for 14", detail: "Without fuel you cannot melt snow to drink.", icon: "package" },
    { label: "An injured member", detail: "He cannot pull, and someone must help him or carry him.", icon: "heart-pulse" },
    { label: "Worsening cold", detail: "Each week brings lower temperatures and shorter days.", icon: "thermometer-snowflake" },
    { label: "A frightened team", detail: "Fear, exhaustion and disagreement can break a group.", icon: "users" },
  ],
  investigation: [
    {
      title: "Physiology",
      questions: [
        "How much energy does hauling a sledge in extreme cold demand, and what happens when people eat less than they burn?",
        "How do cold, dehydration and injury affect what a person can do?",
      ],
    },
    {
      title: "Resource Management",
      questions: [
        "How far can the party travel each day, and do the food and fuel last the distance under each plan?",
        "What could you leave behind, ration or reorganise to change the numbers?",
      ],
    },
    {
      title: "Leadership",
      questions: [
        "How have expedition leaders kept groups together in desperate situations, and what went wrong when they failed?",
        "How should a leader make and explain a decision that puts some people at greater risk than others?",
      ],
    },
  ],
  reference: {
    background: `Energy: man-hauling sledges in polar cold is among the most energy-demanding sustained work humans do; estimates for polar sledging commonly run around 5,000-7,000 kcal per day or more, and historical rations often provided far less, producing steady weight loss and weakness. Reduced rations extend the time food lasts but reduce strength and pace and increase vulnerability to cold.
Water and fuel: on ice, drinking water comes from melting snow, which needs fuel; running out of fuel causes dehydration even with food remaining. Dehydration worsens fatigue and frostbite risk.
Cold injury: hypothermia impairs judgement and coordination; frostbite risk rises with wind, wet clothing, dehydration and poor circulation; injuries slow the whole party.
Pace: loaded man-hauling parties often managed somewhere around 8-15 miles a day in reasonable conditions, much less in soft snow, rough ice or bad weather. Carrying or helping an injured person reduces pace.
The arithmetic in the scenario: 70 miles to the depot at ~10 miles/day is about 7 days, well within 14 days of fuel and 18 of food, but if the depot is missing the party would then be ~110+ miles from base with roughly half its fuel gone. Returning 180 miles at ~10 miles/day takes about 18 days, beyond the fuel supply unless pace improves or fuel is rationed; at a slower pace with the injured man, it is worse. Splitting the party (a fast group to the depot to bring supplies back, or to fetch help) can improve the arithmetic but adds risks to both groups and raises ethical questions.
Historical comparisons: Ernest Shackleton's Endurance expedition (1914-1917) is often cited for leadership that kept every member alive through extreme hardship; Robert Falcon Scott's party died returning from the South Pole in 1912, with short rations, fuel shortages at depots, cold and injury all contributing. These are comparisons, not part of the scenario.
Leadership: clear decision-making, honest communication, fair sharing of hardship, keeping the group together, contingency plans with explicit decision points, and maintaining routine and morale are commonly identified factors in survival situations.`,
    approaches: [
      { title: "Press on to the depot", summary: "Shortest distance to resupply; risk if the depot is missing, so set a turnaround point and ration fuel from now." },
      { title: "Return to base", summary: "Certain destination but the fuel arithmetic is tight; requires strict rationing and a faster pace." },
      { title: "Split the party", summary: "A strong group goes ahead to the depot or base to bring back supplies or help while others follow or wait; faster but risky and ethically fraught." },
      { title: "Wait for better conditions", summary: "Rest and recover, but food and fuel keep burning while the season worsens; generally weak unless rescue is expected." },
    ],
    misconceptions: [
      "Treating food as the only limiting resource and ignoring fuel for water.",
      "Assuming the party can maintain its normal pace with an injured member and reduced rations.",
      "Assuming the depot is certainly there.",
      "Ignoring morale and cohesion as practical survival factors.",
    ],
    evaluator_notes:
      "There is no single correct choice; the depot plan is strong on arithmetic but needs a contingency, and other plans can be well defended. Credit responses that do the arithmetic (distance, pace, days of food and fuel), recognise fuel as the binding constraint, plan for uncertainty (a turnaround point or decision rule), and address the injured member and morale. For splitting, credit explicit discussion of its risks and ethics. Do not require knowledge of specific historical expeditions.",
    sources: [
      { title: "Histories of the Endurance (1914-1917) and Terra Nova (1910-1913) expeditions", note: "Leadership, rations and survival in polar conditions." },
      { title: "Introductory texts on exercise physiology in cold environments", note: "Energy expenditure, hypothermia and frostbite." },
    ],
  },
  samples: [
    {
      display_name: "Sample",
      title: "To the depot, with a line in the snow",
      selected_label: "Press On, With a Limit",
      body: `We go for the depot, together, with a firm rule about when to turn back.

The numbers favour it. Seventy miles at about ten miles a day is seven days, within both our food (18 days) and our fuel (14 days). Returning to base is 180 miles: eighteen days at that pace, more with the injured man, and our fuel runs out first. Waiting burns fuel and the season gets colder.

The risk is that the depot is gone. So we cut fuel use now (one hot meal a day, melting snow only for drinking) and set a rule: if we have not found it by day nine, we turn for base on whatever we have left. Everyone hears the rule before we leave.

The injured man rides on a sledge, which slows us, but leaving him is not an option I will consider. The two with frostbite rotate to the lighter sledge. I will tell the team the plan, the numbers and the turnaround rule plainly. Fear grows in silence.`,
    },
    {
      display_name: "Sample",
      title: "Send the strongest ahead",
      selected_label: "Split the Party",
      body: `I would split the party: three of the fittest go to the depot light and fast, and return with fuel; the other five follow at the injured man's pace.

Fuel is our real limit. A light party could cover fifteen miles a day and reach the depot in five days. If the depot is there, they bring fuel back to meet the main group, which by then has covered half the distance. If it is not, they return with the bad news quickly, and we turn for base together with more time than if we had all walked there.

Splitting is dangerous, and history is full of parties that separated and never met again. We would agree a route, marker cairns and a meeting rule before leaving, and the advance party would carry its own tent and full equipment.

I would lead the slower group myself. The person asking others to take a risk should not take the easier role.`,
    },
    {
      display_name: "Sample",
      title: "Back to the hut we know",
      selected_label: "Return to Base",
      body: `I would turn for base. It is far, but it is certain, and certainty matters when lives depend on it.

The depot was laid last season. Snow, wind and ice may have buried it, and if we march seventy miles to find nothing, we will be more than a hundred miles from the hut with half our fuel gone. That is the disaster I most want to avoid.

The fuel arithmetic for the return is tight, so we must change it. From today: one hot meal a day, melt snow only for drinking, and leave behind every non-essential item to lighten the sledges and keep our pace above ten miles a day.

I would explain my reasoning to the team, and ask for objections before we leave. If the weather stays clear and we make good progress, we keep going; if it turns, we reconsider the depot.`,
    },
  ],
};
