// The true state of a world. Plain JSON-serialisable data: no Map/Set, integers only, and every
// list kept in a fixed order, so hashing, saving and replaying are exact.
//
// Three views of the town live side by side and may disagree:
// - the truth: `buildings`, `residents` (what is really there);
// - the records: `records` (what the institutions believe; the only part the Oracle reads);
// - the player's memory: `memory` (what they last saw with their own eyes, and when).
import type { RngState } from "../random/prng";
import type { Claim, RecordsState } from "./records";

export const PHASES = ["dawn", "planning", "day", "dusk", "night"] as const;
export type Phase = (typeof PHASES)[number];

export interface Clock {
  day: number;
  phase: Phase;
  /** Minutes after midnight. Only moves during the day phase. */
  minute: number;
  /** Day-phase minutes elapsed since the world began. Commands are stamped with it. */
  tick: number;
}

/** Why something happened: a command, an earlier event, or a scheduled routine. */
export type Cause = { command: number } | { event: number } | { routine: "start" | "dawn" | "day" | "dusk" };

/** A position: which scene, which layer of it, and how far along. */
export interface Place {
  scene: string;
  layer: string;
  x: number;
}

export interface HeroState extends Place {
  /** Where they are walking to on this layer, if anywhere. */
  target: number | null;
  /** Buildings close enough to see, as of the last look around. Sorted by id. */
  near: string[];
}

/** One leg of a journey: along the current layer to x, or through a passage. */
export type Leg = { walk: number } | { cross: string; left: number };

export interface ResidentState extends Place {
  id: string;
  /** Where they really live; null once they have left town. */
  home: string | null;
  /** In town at all. */
  here: boolean;
  /** The place they are heading for ("home", "work", a building or spot id, or "window"). */
  going: string | null;
  legs: Leg[];
  /** The case that brought them to the window. */
  visiting: string | null;
  /** Dusks in a row their home had no power. */
  darkDays: number;
}

/** The truth about a building. Who lives there follows from the residents. */
export interface BuildingState {
  id: string;
  power: boolean;
  damaged: boolean;
}

/** What the player saw at a building, and the last day they saw it. Never updates by itself. */
export interface MemoryEntry {
  building: string;
  day: number;
  power: boolean;
  damaged: boolean;
  occupied: boolean;
}

export type CaseStatus = "scheduled" | "waiting" | "decided" | "expired";
export type CaseAction = "approve" | "deny";

export interface CaseState {
  id: string;
  /** The case type's content id. */
  type: string;
  applicant: string;
  building: string;
  /** The day it was filed. */
  day: number;
  /** Minute of the day the applicant sets off for the window. */
  leaves: number;
  status: CaseStatus;
  action: CaseAction | null;
}

/** A suggestion the player adopted without checking: what it took for granted, and whether that held. */
export interface PendingItem {
  id: number;
  case: string;
  /** The case type, so the tray can say what it was about after the case is filed away. */
  type: string;
  building: string;
  /** Why the Oracle suggested what it did (an oracle reason code). */
  reason: string;
  claims: Claim[];
  day: number;
  verdict: "right" | "wrong" | null;
  how: "sight" | "original" | null;
  checked: number | null;
}

export interface WorldState {
  format: 2;
  seed: number;
  pack: { id: string; version: string };
  clock: Clock;
  /**
   * The number of accepted commands. Time passing does not bump it. A command may say which
   * version it was based on, and is refused if another command got in first.
   */
  version: number;
  rng: RngState;
  hero: HeroState;
  /** Sorted by id. */
  buildings: BuildingState[];
  /** Sorted by id. */
  residents: ResidentState[];
  records: RecordsState;
  /** Sorted by building. */
  memory: MemoryEntry[];
  /** In the order they were filed. */
  cases: CaseState[];
  /** Kept apart from everything else, so adopting a suggestion changes nothing but this tray. */
  pending: { next: number; items: PendingItem[] };
  /** Repair crews sent out today, per district. */
  crews: Record<string, number>;
  /** Events that may only fire once, keyed by event id: the day they fired. */
  fired: Record<string, number>;
  nextId: number;
  nextEventId: number;
}

export interface WorldEvent {
  id: number;
  day: number;
  tick: number;
  /** Engine event kind, e.g. "case.decided", or "scenario" for pack events. */
  kind: string;
  data: Record<string, string | number | boolean | null>;
  cause: Cause;
}

type DeepReadonly<T> = T extends (infer U)[]
  ? readonly DeepReadonly<U>[]
  : T extends object
    ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
    : T;

/** What everything outside the simulation gets to see. */
export type WorldView = DeepReadonly<WorldState>;
export type EventView = DeepReadonly<WorldEvent>;
