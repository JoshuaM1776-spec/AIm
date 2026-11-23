import type { ChallengeSeed } from "../types.ts";

export const mountainPass: ChallengeSeed = {
  number: 3,
  slug: "the-mountain-pass",
  title: "The Mountain Pass",
  summary:
    "Two valleys divided by a mountain range need a railway between them. Choose how to cross the mountains, and defend the route you would build.",
  subjects: ["Engineering", "Geography", "Logistics"],
  challenge_type: "decide",
  research_minutes: 45,
  scenario_kind: "fictionalized_historical",
  scenario_note:
    "A fictional Alpine-style region in the 1870s. The valleys, company and figures are invented; the engineering choices are the real ones railway builders faced.",
  role: {
    title: "The Chief Engineer",
    body:
      "A new railway company has hired you to connect two prosperous valleys separated by a mountain range. Its investors want an answer this season: which way should the line cross?",
  },
  situation:
    "The valleys sit about 30 miles apart as the crow flies, but the range between them rises nearly 4,000 feet above the valley floors. Today goods cross a high pass by mule and cart, and the pass closes for four to five months each winter. A river gorge winds around the end of the range, adding roughly 40 miles, and floods each spring. Surveyors have identified three possibilities: a line climbing to the pass, a long tunnel beneath it, or a line through the gorge.",
  final_task:
    "Recommend a route and a method for crossing the mountains, and defend it. Explain how it handles gradient, winter, cost, construction time and the traffic the railway must carry.",
  expectations: {
    easy: "Recommend a route and explain clearly why it suits the problem better than the alternatives.",
    moderate:
      "Compare the routes on gradient, cost, time to build and year-round reliability, justify your choice, and explain the trade-offs.",
    hard:
      "Evaluate the routes against each other, address the major uncertainties (geology, weather, traffic forecasts), consider long-term operating costs and second-order effects on the region, and defend your choice against the strongest case for an alternative.",
  },
  cards: [
    { kind: "role", image: { key: "survey", alt: "A surveyor's theodolite on a tripod beside rolled maps." }, direction: "A surveyor's theodolite on a tripod with rolled maps, Alpine slopes behind." },
    { kind: "situation", image: { key: "pass", alt: "A road zig-zagging up a steep mountainside to a high pass." }, direction: "A road zig-zagging up a steep mountainside to a high pass, with a mule train at the bottom." },
    { kind: "constraints", image: { key: "avalanche", alt: "Snow-covered slopes above a narrow track, with an avalanche path cut through the forest." }, direction: "Snow-covered slopes with an avalanche path cut through pine forest, and a snow shed over a narrow track." },
    { kind: "investigation", image: null, direction: "No picture: the questions are the content." },
    { kind: "decision", image: { key: "pass", alt: "A road zig-zagging up a steep mountainside to a high pass." }, direction: "The pass road again, from further back." },
  ],
  constraints: [
    { label: "Steep gradients", detail: "Ordinary locomotives lose grip and power on steep slopes.", icon: "trending-up" },
    { label: "Winter snow and avalanches", detail: "The pass is closed for months; slopes above it slide every winter.", icon: "snowflake" },
    { label: "Investors' money and patience", detail: "The company can raise a lot, but not without limit, and wants returns.", icon: "coins" },
    { label: "Unknown rock", detail: "Nobody knows exactly what lies inside the mountain.", icon: "pickaxe" },
  ],
  investigation: [
    {
      title: "Engineering",
      questions: [
        { text: "How steep can a railway be, and how have engineers gained height on mountain lines?", priority: "essential" },
        { text: "What makes long tunnels difficult, slow and dangerous to build?", priority: "exploratory" },
      ],
    },
    {
      title: "Geography",
      questions: [
        { text: "How do snow, avalanches and spring floods affect each route?", priority: "essential" },
        { text: "What does each route mean for the towns and land along it?", priority: "exploratory" },
      ],
    },
    {
      title: "Logistics",
      questions: [
        { text: "How much traffic must the line carry, and how fast and how reliably?", priority: "essential" },
        { text: "How do construction time, building cost and running costs compare between the routes?", priority: "exploratory" },
      ],
    },
  ],
  reference: {
    background: `Gradient: conventional (adhesion) railways rely on friction between wheel and rail, so gradients must stay gentle: freight lines are preferably kept below about 1.5%, few standard-gauge main lines exceed about 4-6%, and the steepest adhesion railways reach around 11%. Steeper climbs need rack (cog) railways: the common Abt rack system was limited to about 25% in the 19th century, and the Pilatus railway reaches 48%. Rack lines are slow and carry limited loads.
Gaining height: engineers lengthen the route to reduce the gradient, using curves along valley sides, horseshoe curves, spiral (helical) tunnels, and zig-zag switchbacks (which require trains to reverse, limiting speed and capacity). The Gotthard line in Switzerland uses spiral tunnels on its approach ramps.
Summit vs base tunnels: a tunnel beneath a pass removes the highest, snowiest section. 19th-century examples include the Fréjus (Mont Cenis) tunnel, about 13.7 km, built 1857-1871, and the Gotthard tunnel, about 15 km, built 1872-1882 and then the world's longest rail tunnel; roughly 170-200 workers died building it. Long tunnels faced unknown geology, water inflows, heat, ventilation problems and slow progress; the compressed-air rock drill and dynamite (1860s) sped construction. A lower, longer tunnel shortens the climb but costs more and takes longer.
Winter: lines over high passes face snow and avalanches; protections include snow sheds/galleries, avalanche barriers, and choosing routes on less exposed slopes, but closures can still occur. Rivers in gorges flood in spring snowmelt; lines need embankments, bridges and protection, and gorge routes can face rockfall.
Economics: building cost vs running cost. A longer, flatter route can cost more to build but less to operate (lighter locomotives, heavier trains), while a short steep route may need extra locomotives (banking engines) on every train. Reliability through winter often matters as much as speed for freight. Phased approaches (e.g., a cheaper line first, improved later) and the risk of cost overruns on tunnels are real considerations.`,
    core_knowledge: "Why adhesion railways need gentle gradients and how engineers gain height (loops, spirals, switchbacks, rack sections); what makes long tunnels slow, costly and dangerous; snow, avalanches and floods as threats to reliability; building cost versus operating cost; capacity and reliability as what makes a railway pay.",
    uncertainties: "No one knows the rock inside the mountain, so tunnel cost and time are genuinely uncertain. Traffic forecasts are unknown. The scenario's distances are approximate.",
    investigation_map: "Essential: realistic railway gradients and ways of gaining height; why long tunnels are hard; how winter affects each route. Exploratory: traffic and operating costs; effects on towns along each route. Engineering meets logistics because the cheapest line to build may be the costliest to run; geography constrains both.",
    approaches: [
      {
        title: "Tunnel beneath the pass",
        summary: "A long tunnel with gentle approaches, avoiding the highest, snowiest ground.",
        strengths: "Year-round, gentle, high capacity; lowest running costs.",
        weaknesses: "Very costly and slow to build; unknown geology; dangerous construction.",
        conditions: "Works if investors accept a long wait and the risk of overruns.",
      },
      {
        title: "Gorge route",
        summary: "Follow the river around the range on gentle gradients, protected against floods and rockfall.",
        strengths: "Quicker and more predictable to build; avoids snow and unknown rock.",
        weaknesses: "Longer forever; spring floods and rockfall need defences.",
        conditions: "Works if flood defences are affordable and the extra distance is acceptable for traffic.",
      },
      {
        title: "Climb to the pass",
        summary: "Loops, spirals or rack sections and snow sheds over the worst slopes.",
        strengths: "Cheapest and fastest to open.",
        weaknesses: "Steep, slow, lower capacity; winter disruption remains.",
        conditions: "Works if traffic is modest and winter closures are tolerable.",
      },
      {
        title: "Phased",
        summary: "Open a gorge or climbing line first and tunnel later if traffic justifies it.",
        strengths: "Earns revenue early and proves demand.",
        weaknesses: "The tunnel may never be funded; some work is duplicated.",
        conditions: "Works if profits are set aside for the later stage.",
      },
    ],
    misconceptions: [
      "That trains can climb gradients similar to roads.",
      "That a tunnel's cost and duration can be predicted precisely before the rock is known.",
      "Comparing routes only by distance rather than by gradient, reliability and operating cost.",
      "That snow sheds or avalanche defences make a high route fully reliable.",
    ],
    critical_reasoning: "A weak answer compares routes by distance alone or assumes trains can climb like roads. A strong answer reasons about gradient and its effect on loads and locomotives, winter reliability, construction time and risk, and the difference between building and running costs, and treats the tunnel's geology as real uncertainty.",
    evidence_expectations: "Reference to real railway practice (ruling gradients, rack railways, spiral tunnels, snow sheds) and historical Alpine tunnels such as the Fréjus and Gotthard; reasoning about operating costs and seasonal closure.",
    difficulty_guide: {"easy": "A route and method with a clear reason it fits the problem better than the alternatives.", "moderate": "Compares routes on gradient, cost, construction time and year-round reliability, and explains the trade-offs.", "hard": "Handles uncertainty about geology, weather and traffic; distinguishes building and operating cost; considers phasing and effects on the region; answers the strongest case for another route."},
    fairness_notes: "Any of the routes can be well defended. Do not require exact historical figures. Correct clear physical errors, such as ordinary trains climbing 10% grades.",
    evaluator_notes:
      "Any of the routes can be defended. Credit responses that reason about gradient (and why it matters for rail), winter reliability, construction time and cost, and the traffic the line must serve. Strong hard-level responses treat the tunnel's geology as genuine uncertainty, distinguish building cost from operating cost, and consider phasing. Do not require exact historical figures; correct clear errors such as assuming ordinary trains can climb 10% grades.",
    sources: [
      { title: "List of steepest gradients on adhesion railways", note: "Freight lines preferably below 1.5%; steepest standard-gauge main-line inclines around 4-6%; steepest adhesion railways around 11%.", url: "https://en.wikipedia.org/wiki/List_of_steepest_gradients_on_adhesion_railways", verified: true, critical: true },
      { title: "Pilatus Railway: technical details", note: "Steepest rack railway, 48%; the Abt rack system was limited to 25% at the time.", url: "https://pilatus.ch/en/discover/cogwheel-railway/technical-details", verified: true, critical: false },
      { title: "Encyclopaedia Britannica: Saint Gotthard Tunnel", note: "Built 1872-1882, about 15 km; then the world's longest rail tunnel.", url: "https://www.britannica.com/place/Saint-Gotthard-Tunnel-railway-tunnel-Switzerland", verified: true, critical: false },
      { title: "Encyclopaedia Britannica: Mount Cenis Tunnel", note: "Fréjus / Mont Cenis tunnel, about 13.7 km, built 1857-1871.", url: "https://www.britannica.com/topic/Mount-Cenis-Tunnel", verified: true, critical: false },
    ],
  },
  quality: {
    scores: {"intrigue": 4, "responsibility": 5, "research_depth": 5, "integration": 4, "reasoning": 5, "researchability": 5, "clarity": 5, "articulation": 4},
    weaknesses: "Another infrastructure decision; the next challenges should vary the type of work. Answers can lean on engineering more than geography or logistics.",
    recommendation: "approved",
    assessed_by: "ai",
  },
  editorial_status: "approved",
  samples: [
    {
      display_name: "Sample",
      title: "Pay once for the tunnel",
      selected_label: "The Tunnel",
      body: `I recommend a long tunnel beneath the pass, approached by gentle loops on each side.

A railway is only valuable if it runs all year. The pass line would close or be disrupted for months every winter, exactly when the valleys most need supplies. Avalanche sheds help, but they cannot make a 4,000-foot climb safe and reliable. The gorge line avoids the mountain but floods every spring and adds 40 miles to every journey forever.

The tunnel's problem is cost and uncertainty. Nobody knows the rock, and tunnels of this era took around a decade. I would begin with test borings at both ends and drive from both sides at once with modern rock drills. I would also tell the investors honestly that the cost estimate could rise substantially.

The trade-off is a slower return. But over decades, a short, gentle, year-round line means lighter locomotives, longer trains and lower running costs, which is where a railway makes or loses money.`,
    },
    {
      display_name: "Sample",
      title: "Go around, and open in three years",
      selected_label: "The Gorge",
      body: `The gorge route is longer, but it is the one I am confident we can build on time and on budget.

Its gradients are gentle because it follows the river, so ordinary locomotives can haul full trains. It avoids the snow at the pass and the unknown rock inside the mountain, the two largest risks in the other plans. Floods are a known problem with known answers: raise the line on embankments, build bridges above the highest flood marks, and protect the banks.

The extra 40 miles cost time and fuel on every train. I accept that, because a working railway in three years earns money and goodwill, while a tunnel might take ten and could bankrupt the company.

If traffic grows enough to justify it, the company can build a tunnel later, paid for by the revenue this line earns.`,
    },
    {
      display_name: "Sample",
      title: "Climb now, tunnel later",
      selected_label: "Phased Approach",
      body: `I would build the line over the pass first, then tunnel beneath its summit once the railway is earning.

The climbing line is the cheapest and quickest way to connect the valleys. Spirals and horseshoe curves can keep the gradient manageable, and a short summit tunnel avoids the very top. Snow sheds over the worst avalanche paths will keep it open most of the winter.

It will not be perfect: heavy trains will need a second locomotive on the climb, and severe storms will still close it. But it proves the traffic exists, which makes it far easier to raise money for a long base tunnel later.

The risk is that the company never finds the money for the tunnel and the region is stuck with a slow line. I would ask the investors to set aside a share of profits for it from the start.`,
    },
  ],
};
