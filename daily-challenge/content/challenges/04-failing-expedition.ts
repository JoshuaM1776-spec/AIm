import type { ChallengeSeed } from "../types.ts";

export const failingExpedition: ChallengeSeed = {
  number: 4,
  slug: "the-failing-expedition",
  title: "The Failing Expedition",
  summary:
    "Your polar expedition is running out of food and time, and one of your party is injured. Decide what the group should do, and how you will lead them through it.",
  subjects: ["Leadership", "Physiology", "Resource Management"],
  challenge_type: "decide",
  research_minutes: 35,
  scenario_kind: "fictionalized_historical",
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
    { kind: "role", image: { key: "polar-camp", alt: "Two canvas tents and a loaded sledge on an ice sheet under a low sun." }, direction: "Two canvas tents and a loaded sledge on an ice sheet under a low sun with a halo." },
    { kind: "situation", image: { key: "ice-field", alt: "A field of jagged pressure ridges and drifting snow stretching to the horizon." }, direction: "Pressure ridges, drifting snow and dark leads of open water stretching to the horizon." },
    { kind: "constraints", image: { key: "rations", alt: "Wooden supply boxes, a paraffin tin and a ration tally on a sledge." }, direction: "Expedition stores on a sledge: wooden ration crates, a paraffin tin and a tally card of days left." },
    { kind: "investigation", image: null, direction: "No picture: the questions are the content." },
    { kind: "decision", image: { key: "polar-camp", alt: "Two canvas tents and a loaded sledge on an ice sheet under a low sun." }, direction: "The camp again, as the party prepares to move." },
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
        { text: "How much energy does hauling a sledge in extreme cold demand, and what happens when people eat less than they burn?", priority: "essential" },
        { text: "How do cold, dehydration and injury affect what a person can do?", priority: "exploratory" },
      ],
    },
    {
      title: "Resource Management",
      questions: [
        { text: "How far can the party travel each day, and do the food and fuel last the distance under each plan?", priority: "essential" },
        { text: "What could you leave behind, ration or reorganise to change the numbers?", priority: "exploratory" },
      ],
    },
    {
      title: "Leadership",
      questions: [
        { text: "How have expedition leaders kept groups together in desperate situations, and what went wrong when they failed?", priority: "essential" },
        { text: "How should a leader make and explain a decision that puts some people at greater risk than others?", priority: "exploratory" },
      ],
    },
  ],
  reference: {
    background: `Energy: man-hauling sledges in polar cold is among the most energy-demanding sustained work humans do. A modern team hauling sledges of up to 80 kg measured about 6,500 kcal per day (Spear-17, 2017), and one unsupported crossing exceeded 40 MJ (roughly 9,500 kcal) per day on its hardest climb. Historical rations often provided far less, producing steady weight loss and weakness. Reduced rations extend the time food lasts but reduce strength and pace and increase vulnerability to cold.
Water and fuel: on ice, drinking water comes from melting snow, which needs fuel; running out of fuel causes dehydration even with food remaining. Dehydration worsens fatigue and frostbite risk.
Cold injury: hypothermia impairs judgement and coordination; frostbite risk rises with wind, wet clothing, dehydration and poor circulation; injuries slow the whole party.
Pace: loaded man-hauling parties often managed somewhere around 8-15 miles a day in reasonable conditions, much less in soft snow, rough ice or bad weather. Carrying or helping an injured person reduces pace.
The arithmetic in the scenario: 70 miles to the depot at ~10 miles/day is about 7 days, well within 14 days of fuel and 18 of food, but if the depot is missing the party would then be ~110+ miles from base with roughly half its fuel gone. Returning 180 miles at ~10 miles/day takes about 18 days, beyond the fuel supply unless pace improves or fuel is rationed; at a slower pace with the injured man, it is worse. Splitting the party (a fast group to the depot to bring supplies back, or to fetch help) can improve the arithmetic but adds risks to both groups and raises ethical questions.
Historical comparisons: Ernest Shackleton's Endurance expedition (1914-1917) is often cited for leadership that brought every member of the ship's party home alive (its separate Ross Sea party lost three men); Robert Falcon Scott's party died returning from the South Pole in 1912, with short rations, fuel shortages at depots, cold and injury all contributing. These are comparisons, not part of the scenario.
Leadership: clear decision-making, honest communication, fair sharing of hardship, keeping the group together, contingency plans with explicit decision points, and maintaining routine and morale are commonly identified factors in survival situations.`,
    core_knowledge: "The energy cost of hauling in extreme cold and the effects of underfeeding; fuel as the source of drinking water; hypothermia, frostbite and dehydration; realistic daily distances; decision rules under uncertainty; what keeps groups cohesive in crisis.",
    uncertainties: "Whether the depot still exists; the weather; daily pace with an injured member and reduced rations. These should shape a plan with explicit decision points.",
    investigation_map: "Essential: energy demand and the effects of short rations; daily pace and whether food and fuel cover each plan. Exploratory: how leaders kept groups together or failed to; the ethics of splitting up. Physiology meets resource management because rationing extends supplies but slows the party; leadership meets both because a plan only works if the group follows it.",
    approaches: [
      {
        title: "Press on to the depot",
        summary: "Go for the depot together, ration fuel now, and set a turnaround point.",
        strengths: "Shortest distance to resupply; fits within food and fuel on reasonable pace.",
        weaknesses: "Disastrous if the depot is gone and the turnaround rule is ignored.",
        conditions: "Works if the party commits in advance to a firm decision point.",
      },
      {
        title: "Return to base",
        summary: "Head for the certain destination with strict rationing and lighter sledges.",
        strengths: "No dependence on an uncertain depot.",
        weaknesses: "Fuel arithmetic is tight; slower with the injured man; colder weeks ahead.",
        conditions: "Works only if pace can be kept up and fuel stretched.",
      },
      {
        title: "Split the party",
        summary: "A strong group goes ahead to the depot or base and returns with supplies or help.",
        strengths: "Can improve the arithmetic and get answers about the depot quickly.",
        weaknesses: "Risks to both groups; history has many parties that separated and never met again; ethically fraught.",
        conditions: "Works with agreed routes, markers and meeting rules, and full equipment for each group.",
      },
      {
        title: "Wait",
        summary: "Rest and recover before moving.",
        strengths: "Lets the injured and frostbitten recover a little.",
        weaknesses: "Food and fuel keep running down while the season worsens.",
        conditions: "Rarely sensible unless rescue is expected.",
      },
    ],
    misconceptions: [
      "Treating food as the only limiting resource and ignoring fuel for water.",
      "Assuming the party can maintain its normal pace with an injured member and reduced rations.",
      "Assuming the depot is certainly there.",
      "Ignoring morale and cohesion as practical survival factors.",
    ],
    critical_reasoning: "A weak answer picks a direction without doing the arithmetic. A strong answer works through distance, pace and days of food and fuel, recognises fuel (water) as the binding constraint, plans for the depot being missing, and addresses the injured man and the group's morale.",
    evidence_expectations: "Simple calculations from the scenario's numbers; reference to measured energy costs of sledge hauling or to historical expeditions; awareness of cold injuries and dehydration.",
    difficulty_guide: {"easy": "A plan with a clear reason it gives the best chance of survival.", "moderate": "Compares the main options using distances, pace, food and fuel, and explains the risks.", "hard": "Plans for uncertainty with explicit decision points; uses physiology; addresses leadership and the ethics of splitting up; answers the strongest objection."},
    fairness_notes: "There is no single correct choice. The depot plan is strong on arithmetic but needs a contingency; returning or splitting can be well defended. Knowledge of specific historical expeditions is not required.",
    evaluator_notes:
      "There is no single correct choice; the depot plan is strong on arithmetic but needs a contingency, and other plans can be well defended. Credit responses that do the arithmetic (distance, pace, days of food and fuel), recognise fuel as the binding constraint, plan for uncertainty (a turnaround point or decision rule), and address the injured member and morale. For splitting, credit explicit discussion of its risks and ethics. Do not require knowledge of specific historical expeditions.",
    sources: [
      { title: "Energy expenditure of the Spear-17 and Ice Maiden Antarctic expeditions (Scientific Reports, 2020)", note: "About 6,461 kcal per day measured for a male team hauling sledges of up to 80 kg; also cites over 40 MJ per day on the hardest stretch of an unsupported crossing.", url: "https://doi.org/10.1038/s41598-020-70296-4", verified: true, critical: true },
      { title: "American Museum of Natural History: The Shackleton Expedition", note: "Endurance expedition, 1914-1917; the ship's party survived.", url: "https://www.amnh.org/exhibitions/shackleton/the-expedition", verified: true, critical: false },
      { title: "PBS NOVA: Quest for the South Pole", note: "Scott's polar party died on the return from the Pole in 1912.", url: "https://www.pbs.org/wgbh/nova/article/quest-south-pole", verified: true, critical: false },
    ],
  },
  quality: {
    scores: {"intrigue": 5, "responsibility": 5, "research_depth": 4, "integration": 4, "reasoning": 5, "researchability": 4, "clarity": 5, "articulation": 5},
    weaknesses: "A survival emergency and an expedition, both of which the standard warns against overusing. The scenario's numbers let users reason well with modest research; physiology research mainly sharpens the answer.",
    recommendation: "approved",
    assessed_by: "ai",
  },
  editorial_status: "approved",
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
