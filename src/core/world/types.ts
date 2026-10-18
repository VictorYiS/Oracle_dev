// The true state of a world. Plain JSON-serialisable data: no Map/Set, integers only, and every
// list kept in a fixed order, so hashing, saving and replaying are exact.
import type { UnitRole } from "../content/schema";
import type { RngState } from "../random/prng";

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
export type Cause = { command: number } | { event: number } | { routine: "start" | "dawn" | "dusk" };

export type Job =
  | { kind: "move"; target: number; cause: Cause }
  | { kind: "gather"; node: number; stage: "to_node" | "gathering" | "to_depot"; cause: Cause }
  | { kind: "build"; site: string; stage: "to_site" | "working"; cause: Cause };

export interface UnitState {
  id: string;
  type: string;
  role: UnitRole;
  x: number;
  y: number;
  carrying: { resource: string; amount: number } | null;
  job: Job | null;
  /** Remaining tiles to walk, as tile indices. */
  path: number[];
  /** Ticks spent toward entering the next tile. */
  step: number;
  /** Ticks spent toward the next unit of work. */
  work: number;
  /** Days left out of action. */
  disabledDays: number;
  /** Days in a row without enough food. */
  hunger: number;
  /** Building a resident works at. */
  workplace: string | null;
}

export interface BuildingState {
  id: string;
  type: string;
  x: number;
  y: number;
  complete: boolean;
  /** Build ticks done. */
  progress: number;
  /** The event that placed this site, so completion can point back to it. */
  placedBy: number | null;
}

export interface NodeState {
  tile: number;
  type: string;
  amount: number;
}

export interface WorldState {
  format: 1;
  seed: number;
  pack: { id: string; version: string };
  clock: Clock;
  /** Bumped by every accepted command; commands may say which version they were based on. */
  version: number;
  rng: RngState;
  width: number;
  height: number;
  /** Index into the pack's terrain list, per tile. */
  terrain: number[];
  /** Sorted by tile. */
  nodes: NodeState[];
  /** 1 once a tile has been seen. */
  explored: number[];
  /** Sorted by id. */
  units: UnitState[];
  /** Sorted by id. */
  buildings: BuildingState[];
  stock: Record<string, number>;
  weather: string;
  /** Events that may only fire once, keyed by event id. */
  fired: Record<string, number>;
  /** Notices shown at most once a day, keyed by kind: the day last shown. */
  noticed: Record<string, number>;
  nextId: number;
  nextEventId: number;
}

export interface WorldEvent {
  id: number;
  day: number;
  tick: number;
  /** Engine event kind, e.g. "building.completed", or "scenario" for pack events. */
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

export const tileIndex = (s: { width: number }, x: number, y: number): number => y * s.width + x;
export const tileXY = (s: { width: number }, tile: number): [number, number] => [
  tile % s.width,
  Math.floor(tile / s.width),
];
export const inBounds = (s: { width: number; height: number }, x: number, y: number): boolean =>
  x >= 0 && y >= 0 && x < s.width && y < s.height;
