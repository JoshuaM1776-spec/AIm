import type { ChallengeSeed } from "../types.ts";

export const energyDilemma: ChallengeSeed = {
  number: 5,
  slug: "the-energy-dilemma",
  title: "The Energy Dilemma",
  summary:
    "An island's only large power station is closing in six years. Decide what should replace it, keeping the lights on, bills affordable and emissions falling.",
  subjects: ["Physics", "Economics", "Environmental Science"],
  scenario_kind: "hypothetical",
  scenario_note:
    "A hypothetical island region in the present day. The island and its figures are invented; the technologies, costs and trade-offs are real.",
  role: {
    title: "Head of the Energy Authority",
    body:
      "You run the island's energy authority. The island's government will follow your recommendation, and its 400,000 residents will live with the result: their bills, their air and their winter evenings.",
  },
  situation:
    "The island's coal-fired power station supplies about 70% of its electricity and must close in six years: it is old, expensive to repair, and the island has committed to cutting emissions. Demand peaks on cold, still winter evenings, and is rising as homes switch to electric heating and cars. The island is windy, has some sun, a long coastline, and sits 60 miles from a mainland grid. Residents already pay more for electricity than mainland households.",
  final_task:
    "Recommend what should replace the power station by the time it closes, and defend your plan. Explain how it keeps power reliable through winter peaks, what it costs and who pays, and how it affects emissions.",
  expectations: {
    easy: "Recommend a replacement and explain clearly why it would work for the island.",
    moderate:
      "Compare at least two options on reliability, cost and emissions, justify your recommendation, and explain its main trade-offs.",
    hard:
      "Evaluate a mix of options, address uncertainty (prices, demand growth, construction delays), explain how the system copes with a still, cold week, consider second-order effects (on jobs, land, the grid and future demand), and defend your plan against its strongest objection.",
  },
  cards: [
    { kind: "role", image: { key: "pylons", alt: "Electricity pylons and cables crossing open country." } },
    { kind: "situation", image: { key: "power-station", alt: "An old power station with tall chimneys and cooling towers beside the sea." } },
    { kind: "constraints", image: { key: "wind-coast", alt: "Wind turbines along a rocky coastline under a wide sky." } },
    { kind: "investigation", image: null },
    { kind: "decision", image: { key: "wind-coast", alt: "Wind turbines along a rocky coastline under a wide sky." } },
  ],
  constraints: [
    { label: "Six years until closure", detail: "Whatever you choose must be built and working in time.", icon: "hourglass" },
    { label: "Winter evening peaks", detail: "The highest demand comes when it is cold, dark and often still.", icon: "zap" },
    { label: "Bills already high", detail: "Many households struggle to pay; investment costs reach them eventually.", icon: "coins" },
    { label: "Emissions commitments", detail: "The island has promised to cut its emissions steeply.", icon: "leaf" },
  ],
  investigation: [
    {
      title: "Physics",
      questions: [
        "How much electricity do wind turbines and solar panels produce on average, and how does that vary by hour and season?",
        "What can batteries, other storage and grid connections do, and for how long?",
      ],
    },
    {
      title: "Economics",
      questions: [
        "How do the costs of building and running each option compare, and who pays for them?",
        "How should you compare an option that is cheap to run but expensive to build with one that is the reverse?",
      ],
    },
    {
      title: "Environmental Science",
      questions: [
        "What are the emissions and land or sea impacts of each option, over its whole life?",
        "What happens to emissions as heating and transport switch to electricity?",
      ],
    },
  ],
  reference: {
    background: `Variability: wind and solar output depends on weather; their average output relative to capacity (capacity factor) is roughly 25-45% for wind (offshore at the higher end) and roughly 10-25% for solar depending on latitude and climate. Solar output is lowest in winter evenings, exactly when demand peaks in a cold climate. Extended cold, still periods (sometimes called "Dunkelflaute") are a key reliability challenge.
Storage: lithium-ion batteries are well suited to shifting energy by hours (commonly 1-4 hours of discharge) and to fast grid services, but are not economic for covering multi-day or seasonal gaps at scale today. Pumped hydro offers longer storage where geography allows. Hydrogen and other long-duration storage exist but are less mature and less efficient.
Firm capacity: something must cover a still, cold week: dispatchable generation (gas turbines, which emit CO2 but can run rarely as backup; biomass; nuclear), an interconnector to a larger grid, demand flexibility, or long-duration storage. A system with mostly wind and solar plus a backup that runs rarely can cut emissions steeply while keeping reliability.
Interconnectors: a subsea cable to the mainland shares resources and backup; costs are substantial and depend on length and capacity; projects can take many years to plan and build, and the island depends on mainland supply and prices during shortages.
Nuclear: large reactors have very low operating emissions but long construction times (often a decade or more) and high capital costs; small modular reactors are promoted as faster and cheaper but are not yet widely proven commercially, so a six-year timeline is very uncertain.
Gas: combined-cycle gas plants emit roughly half the CO2 of coal per unit of electricity; open-cycle gas turbines are cheaper to build and suitable for occasional peaks; gas depends on fuel imports and prices.
Economics: levelised cost (cost per unit of energy over a lifetime) favours wind and solar in many places today, but whole-system cost also includes backup, storage, grid upgrades and balancing. Capital-intensive options shift costs to the present and depend on interest rates; fuel-based options expose consumers to price volatility. Who pays (taxpayers, bill-payers, investors) and how costs are spread matter for fairness.
Demand side: efficiency, insulation, smart charging, time-of-use pricing and flexible heating can reduce peaks; electrification of heat and transport raises total demand and winter peaks. Closing a plant affects local jobs; transition planning is a real consideration.`,
    approaches: [
      { title: "Renewables with firm backup", summary: "Large wind (and some solar) build-out, batteries for hours, and a gas plant kept for rare still, cold spells, with a plan to cut its use over time." },
      { title: "Interconnector-led", summary: "A cable to the mainland plus local wind; shares backup across a larger grid, but depends on the mainland and takes years." },
      { title: "Nuclear", summary: "Firm low-carbon power, but very unlikely within six years; needs a bridge solution." },
      { title: "Demand-first", summary: "Cut and shift demand through efficiency and flexibility to shrink the peak before building supply." },
    ],
    misconceptions: [
      "Treating installed capacity as average output (ignoring capacity factors).",
      "Assuming batteries can cover multi-day still periods economically.",
      "Assuming a new nuclear plant could reliably be built within six years.",
      "Ignoring that electrification raises winter peak demand.",
      "Comparing only generation cost while ignoring backup, storage and grid costs.",
    ],
    evaluator_notes:
      "Several plans can be well defended. Credit responses that address the winter peak and still periods explicitly, distinguish capacity from output, deal with the six-year timeline, and consider cost and who pays as well as emissions. Hard-level responses should handle uncertainty and second-order effects (jobs, grid, rising demand). Do not require precise figures; correct clear physical or economic errors.",
    sources: [
      { title: "International Energy Agency (IEA) reports on renewables, storage and system integration", note: "Capacity factors, costs and flexibility." },
      { title: "Lazard Levelized Cost of Energy+ analyses", note: "Comparative generation and storage costs (US-based)." },
    ],
  },
  samples: [
    {
      display_name: "Sample",
      title: "Wind first, gas only when it must",
      selected_label: "Renewables With Backup",
      body: `I recommend building offshore and onshore wind to supply most of the island's electricity, with batteries for daily balancing and a small gas plant that runs only during long still, cold periods.

The island is windy, and wind is now among the cheapest new sources of electricity. Turbines produce on average perhaps a third to under half of their capacity, so we must build roughly two to three times the old plant's capacity, but that is achievable in six years.

The hard part is the winter evening with no wind. Batteries cover a few hours, not a week. Rather than pretend otherwise, I would keep a gas plant that runs perhaps a few percent of the year, which still cuts emissions sharply compared with coal.

Costs will raise bills at first, so I would fund construction through long-term contracts at fixed prices and protect low-income households with targeted support.`,
    },
    {
      display_name: "Sample",
      title: "Connect the island to the mainland",
      selected_label: "The Interconnector",
      body: `The island's problem is that it must be self-sufficient on its worst day. A cable to the mainland removes that problem.

With a 60-mile subsea connection, the island can import power on still winter evenings and export its surplus wind on stormy days. A larger grid has more variety of weather and more backup, so the island no longer needs to build its own plant for a rare week.

The risks are time and dependence. Cables like this can take many years to approve and build, so I would start immediately and keep the old plant on standby for a year or two if needed. During mainland shortages, the island would pay mainland prices.

Combined with new wind on the island, the cable gives a cleaner and more reliable system than either could alone.`,
    },
    {
      display_name: "Sample",
      title: "Shrink the peak before building for it",
      selected_label: "Demand First",
      body: `Every option is expensive because it must cover the winter evening peak. So my first recommendation is to make that peak smaller.

Insulating homes, time-of-use prices, smart charging for cars and heat pumps that pre-heat homes in the afternoon can move demand away from the evening. Each megawatt of peak we avoid is a megawatt we never have to build.

That alone will not replace 70% of our electricity. Alongside it I would build wind and batteries, and procure firm backup for rare still spells. But the backup can be smaller and cheaper if the peak is lower.

The risk is that demand measures depend on thousands of household decisions and may deliver less than planned, so I would track results each year and adjust the supply plan accordingly.`,
    },
  ],
};
