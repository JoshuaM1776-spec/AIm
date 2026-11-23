// The built-in TEST drafting model, for local development and automated tests only. It returns
// the same fixed draft every time, titled as a test draft, so the drafting flow can be exercised
// without an AI model. It is used only when EVAL_PROVIDER=test; the Edge Function never loads it.
import type { EvalProvider, ProviderResult } from "../evaluation/types.ts";

export const TEST_DRAFT = {
  title: "Test Draft: The Winter Bells",
  preview: "A town's bells carry clearly across the river on winter mornings but are barely heard in summer. Work out why.",
  challenge_type: "explain",
  subjects: ["Physics", "Meteorology"],
  research_minutes: 30,
  scenario_kind: "fictional",
  scenario_note: "A fictional river town. The physics of sound in air is real.",
  role: { title: "The Town Surveyor", body: "The council has asked you to explain a puzzle residents argue about, and whether a new bell tower would help." },
  situation: "On still winter mornings the church bells can be heard in villages three miles away across the river. On summer afternoons they fade within a mile. The bells and the ringers have not changed.",
  constraints: [
    { label: "No instruments", detail: "You have a thermometer, a watch and willing helpers.", icon: "gauge" },
    { label: "Competing explanations", detail: "Residents blame the wind, the leaves and the river.", icon: "scale" },
    { label: "A costly proposal", detail: "A taller tower would cost the town a year's budget.", icon: "coins" },
  ],
  investigation: [
    { title: "Sound in Air", questions: [{ text: "How does air temperature affect the speed and path of sound?", priority: "essential" }] },
    { title: "Weather Near the Ground", questions: [{ text: "How does the air above a river change between still winter mornings and summer afternoons?", priority: "essential" }] },
    { title: "Testing Explanations", questions: [{ text: "What simple observations could tell the competing explanations apart?", priority: "exploratory" }] },
  ],
  final_task: "Explain the most plausible cause of the difference, how you would test it with simple observations, and whether a taller tower would help.",
  expectations: {
    easy: "Give a plausible explanation and say why it fits the pattern.",
    moderate: "Compare explanations and propose observations that would distinguish them.",
    hard: "Weigh all the explanations, design a fair test, and judge whether the tower is worth its cost.",
  },
  image_directions: {
    role: "A surveyor's notebook and thermometer on a stone wall above a river.",
    situation: "A church tower across a misty winter river at dawn.",
    constraints: "Residents in conversation at a market cross, with leafy trees behind.",
    investigation: "No picture: the questions are the content.",
    decision: "The bell tower seen from a far bank on a clear morning.",
  },
  reference: {
    background: "Sound travels faster in warmer air. When air near the ground is colder than the air above (a temperature inversion, common on still, clear nights and mornings), sound bends back towards the ground and can carry much farther. When the ground is warm (summer afternoons), sound bends upwards and fades sooner. Wind direction and foliage also matter.",
    core_knowledge: "Refraction of sound by temperature gradients; temperature inversions; the effects of wind and absorption.",
    uncertainties: "Local wind and terrain are not described.",
    investigation_map: "Physics explains the mechanism; meteorology explains when the conditions occur.",
    approaches: [
      { title: "Temperature inversion", summary: "Cold air near the water bends sound downwards in winter.", strengths: "Matches the pattern.", weaknesses: "Needs observations to confirm.", conditions: "Still, clear mornings." },
      { title: "Wind and leaves", summary: "Summer winds and foliage absorb or carry sound away.", strengths: "Plausible contributors.", weaknesses: "Doesn't explain still days alone.", conditions: "Windy or leafy periods." },
    ],
    critical_reasoning: "A strong answer connects the pattern (season, time of day, stillness) to a mechanism and proposes a test.",
    misconceptions: ["That cold air carries sound because it is denser."],
    evidence_expectations: "Reference to how temperature affects sound speed and examples of inversions.",
    difficulty_guide: { easy: "A plausible mechanism.", moderate: "Compares mechanisms and proposes a test.", hard: "Designs a fair test and weighs the tower's cost." },
    fairness_notes: "Several contributing factors can be combined.",
    sources: [{ title: "An introductory acoustics textbook chapter on outdoor sound propagation", note: "Refraction by temperature gradients.", url: "", critical: true }],
  },
  quality: {
    scores: { intrigue: 4, responsibility: 4, research_depth: 4, integration: 4, reasoning: 4, researchability: 5, clarity: 5, articulation: 4 },
    tests: [{ test: "Immediate Answer Test", passed: true, note: "Needs research into sound and weather." }],
    weaknesses: "This is a fixed test draft, not a real AI draft.",
    recommendation: "pending_verification",
  },
};

export function testGenerator(): EvalProvider {
  return {
    name: "test",
    model: "test-generator",
    async run(): Promise<ProviderResult> {
      return { ok: true, output: structuredClone(TEST_DRAFT), model: "test-generator", inputTokens: 0, outputTokens: 0 };
    },
  };
}
