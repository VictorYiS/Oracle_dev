import type { WorldView } from "../../core/world/types";

export type DeepReadonlyUnit = WorldView["units"][number];
export type DeepReadonlyBuilding = WorldView["buildings"][number];

export type Selection =
  | { kind: "unit"; id: string }
  | { kind: "building"; id: string }
  | { kind: "tile"; x: number; y: number }
  | null;

/** What the next tap on the map does. */
export type Mode =
  { kind: "move" | "gather" | "build"; unit: string } | { kind: "place"; building: string } | null;

export interface Camera {
  /** World tile at the canvas's top-left corner (fractional). */
  x: number;
  y: number;
  /** Pixels per tile. */
  tile: number;
}
