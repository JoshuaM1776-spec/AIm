import type { ChallengeSeed } from "../types.ts";

export const mountainPass: ChallengeSeed = {
  number: 3,
  slug: "the-mountain-pass",
  title: "The Mountain Pass",
  summary:
    "Two valleys divided by a mountain range need a railway between them. Choose how to cross the mountains, and defend the route you would build.",
  subjects: ["Engineering", "Geography", "Logistics"],
  scenario_kind: "fictional",
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
    { kind: "role", image: { key: "survey", alt: "A surveyor's theodolite on a tripod beside rolled maps." } },
    { kind: "situation", image: { key: "pass", alt: "A road zig-zagging up a steep mountainside to a high pass." } },
    { kind: "constraints", image: { key: "avalanche", alt: "Snow-covered slopes above a narrow track, with an avalanche path cut through the forest." } },
    { kind: "investigation", image: null },
    { kind: "decision", image: { key: "pass", alt: "A road zig-zagging up a steep mountainside to a high pass." } },
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
        "How steep can a railway be, and how have engineers gained height on mountain lines?",
        "What makes long tunnels difficult, slow and dangerous to build?",
      ],
    },
    {
      title: "Geography",
      questions: [
        "How do snow, avalanches and spring floods affect each route?",
        "What does each route mean for the towns and land along it?",
      ],
    },
    {
      title: "Logistics",
      questions: [
        "How much traffic must the line carry, and how fast and how reliably?",
        "How do construction time, building cost and running costs compare between the routes?",
      ],
    },
  ],
  reference: {
    background: `Gradient: conventional (adhesion) railways rely on friction between wheel and rail. Main lines are usually kept to gentle gradients (often under about 2.5%), and steep mountain main lines rarely exceed roughly 3-4%. Steeper climbs need rack (cog) railways, which are slow and carry limited loads, or cable systems.
Gaining height: engineers lengthen the route to reduce the gradient, using curves along valley sides, horseshoe curves, spiral (helical) tunnels, and zig-zag switchbacks (which require trains to reverse, limiting speed and capacity). The Gotthard line in Switzerland (opened 1882) used spiral tunnels on its approaches.
Summit vs base tunnels: a tunnel beneath a pass removes the highest, snowiest section. 19th-century examples include the Fréjus (Mont Cenis) tunnel, opened 1871, and the Gotthard tunnel, about 15 km, built 1872-1882 at great cost and with the deaths of many workers. Long tunnels faced unknown geology, water inflows, heat, ventilation problems and slow progress; the compressed-air rock drill and dynamite (1860s) sped construction. A lower, longer tunnel shortens the climb but costs more and takes longer.
Winter: lines over high passes face snow and avalanches; protections include snow sheds/galleries, avalanche barriers, and choosing routes on less exposed slopes, but closures can still occur. Rivers in gorges flood in spring snowmelt; lines need embankments, bridges and protection, and gorge routes can face rockfall.
Economics: building cost vs running cost. A longer, flatter route can cost more to build but less to operate (lighter locomotives, heavier trains), while a short steep route may need extra locomotives (banking engines) on every train. Reliability through winter often matters as much as speed for freight. Phased approaches (e.g., a cheaper line first, improved later) and the risk of cost overruns on tunnels are real considerations.`,
    approaches: [
      { title: "Tunnel beneath the pass", summary: "Accept a long, costly build for a shorter, gentler, year-round line with high capacity." },
      { title: "Gorge route", summary: "Avoid the mountain: longer but gentler and quicker to build, with flood and rockfall protection." },
      { title: "Climb to the pass", summary: "Use loops, spirals or rack sections and snow sheds for a cheaper, faster-to-build line, accepting winter risk and lower capacity." },
      { title: "Phased", summary: "Build the gorge or climbing line first to earn revenue, and plan a tunnel later if traffic justifies it." },
    ],
    misconceptions: [
      "That trains can climb gradients similar to roads.",
      "That a tunnel's cost and duration can be predicted precisely before the rock is known.",
      "Comparing routes only by distance rather than by gradient, reliability and operating cost.",
      "That snow sheds or avalanche defences make a high route fully reliable.",
    ],
    evaluator_notes:
      "Any of the routes can be defended. Credit responses that reason about gradient (and why it matters for rail), winter reliability, construction time and cost, and the traffic the line must serve. Strong hard-level responses treat the tunnel's geology as genuine uncertainty, distinguish building cost from operating cost, and consider phasing. Do not require exact historical figures; correct clear errors such as assuming ordinary trains can climb 10% grades.",
    sources: [
      { title: "Histories of the Gotthard and Mont Cenis (Fréjus) railway tunnels", note: "Construction methods, timelines, costs and dangers." },
      { title: "Introductory railway engineering texts on adhesion and ruling gradients", note: "Why railways need gentle slopes." },
    ],
  },
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
