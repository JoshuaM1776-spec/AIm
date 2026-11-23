import type { ChallengeSeed } from "./types.ts";
import { waterDecision } from "./challenges/01-water-decision.ts";
import { theOutbreak } from "./challenges/02-the-outbreak.ts";
import { mountainPass } from "./challenges/03-mountain-pass.ts";
import { failingExpedition } from "./challenges/04-failing-expedition.ts";
import { energyDilemma } from "./challenges/05-energy-dilemma.ts";

export const seedChallenges: ChallengeSeed[] = [waterDecision, theOutbreak, mountainPass, failingExpedition, energyDilemma];
