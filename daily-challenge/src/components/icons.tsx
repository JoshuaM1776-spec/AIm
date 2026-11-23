import {
  BookOpen, Circle, Coins, Compass, Feather, Flame, Gauge, HeartPulse, Hourglass, Landmark, Layers, Leaf, Map as MapIcon, Mountain,
  NotebookPen, Package, Pickaxe, Route, Scale, Settings, Snowflake, Target, ThermometerSnowflake, Timer, TrendingUp, Users, Wallet,
  Wind, Zap, type LucideIcon,
} from "lucide-react";

/** Icons a challenge author can attach to a constraint, by name. */
export const CONSTRAINT_ICONS: Record<string, LucideIcon> = {
  coins: Coins, users: Users, mountain: Mountain, leaf: Leaf, "heart-pulse": HeartPulse, scale: Scale, "notebook-pen": NotebookPen,
  landmark: Landmark, "trending-up": TrendingUp, snowflake: Snowflake, pickaxe: Pickaxe, package: Package,
  "thermometer-snowflake": ThermometerSnowflake, hourglass: Hourglass, zap: Zap, timer: Timer, wallet: Wallet, wind: Wind,
  route: Route, map: MapIcon, compass: Compass, target: Target, gauge: Gauge, flame: Flame, circle: Circle,
};

export const constraintIcon = (name: string) => CONSTRAINT_ICONS[name] ?? Circle;

/** The four evaluation categories. */
export const CATEGORY_META = {
  understanding: { label: "Understanding", icon: BookOpen, question: "Did you understand the problem and its context?" },
  reasoning: { label: "Reasoning & Evidence", icon: Settings, question: "Is your argument logical and supported by evidence?" },
  clarity: { label: "Clarity", icon: Feather, question: "Did you communicate your ideas clearly and precisely?" },
  organization: { label: "Organization", icon: Layers, question: "Is your response coherent and easy to follow?" },
} as const;
