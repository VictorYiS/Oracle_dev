// The handful of facts about a building you can tell by looking at it, and how they are drawn.
// The same four facts come from three places that may disagree: the records (what the Oracle
// draws), the truth (what is there now) and the player's memory (what they saw last).

export interface Facts {
  exists: boolean;
  power: boolean;
  damaged: boolean;
  occupied: boolean;
}

/** What a building looks like, as one word: the visual compiler's state input. */
export type VisualState = "vacant" | "damaged" | "powered" | "empty" | "candle" | "dark";

export const VISUAL_STATES: readonly VisualState[] = [
  "powered",
  "dark",
  "damaged",
  "candle",
  "empty",
  "vacant",
];

export function visualState(f: Facts): VisualState {
  if (!f.exists) return "vacant";
  if (f.damaged) return "damaged";
  if (f.power) return f.occupied ? "powered" : "empty";
  return f.occupied ? "candle" : "dark";
}

export const FACT_FIELDS = ["power", "damaged", "occupied"] as const;
export type FactField = (typeof FACT_FIELDS)[number];

/** The fields that differ between two sets of facts, in a fixed order. */
export function differences(a: Facts, b: Facts): FactField[] {
  return FACT_FIELDS.filter((f) => a[f] !== b[f]);
}
