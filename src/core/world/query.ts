// Read-only questions about a world. Safe to use from anywhere: everything here takes and returns
// read-only views. Code that needs to change what it finds uses the find* helpers in ./mutate.
import { lookup, type PackIndex } from "./pack-index";
import type { Grid } from "./path";
import { inBounds, tileIndex, type WorldView } from "./types";

type World = { s: WorldView; ix: PackIndex };
export type UnitView = WorldView["units"][number];
export type BuildingView = WorldView["buildings"][number];
export type NodeView = WorldView["nodes"][number];

export function terrainAt(w: World, tile: number) {
  return w.ix.terrain[w.s.terrain[tile] ?? -1];
}

export function grid(w: World): Grid {
  return {
    width: w.s.width,
    height: w.s.height,
    cost: (tile) => {
      const t = terrainAt(w, tile);
      return t?.walkable ? t.move_cost : 0;
    },
  };
}

/** Index of the node on `tile` in the (tile-sorted) node list, or -1. Binary search. */
export function nodeIndex(s: WorldView, tile: number): number {
  let lo = 0;
  let hi = s.nodes.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const n = s.nodes[mid]!;
    if (n.tile === tile) return mid;
    if (n.tile < tile) lo = mid + 1;
    else hi = mid - 1;
  }
  return -1;
}

export function nodeAt(s: WorldView, tile: number): NodeView | undefined {
  return s.nodes[nodeIndex(s, tile)];
}

export function buildingAt(s: WorldView, x: number, y: number): BuildingView | undefined {
  return s.buildings.find((b) => b.x === x && b.y === y);
}

export function unitById(s: WorldView, id: string): UnitView | undefined {
  return s.units.find((u) => u.id === id);
}

export function buildingById(s: WorldView, id: string): BuildingView | undefined {
  return s.buildings.find((b) => b.id === id);
}

/** The closest completed depot by walking distance estimate (Manhattan), ties by id. */
export function nearestDepot(w: World, x: number, y: number): BuildingView | undefined {
  let best: BuildingView | undefined;
  let bestDist = Infinity;
  for (const b of w.s.buildings) {
    if (!b.complete || !lookup(w.ix.buildings, b.type, "building").depot) continue;
    const d = Math.abs(b.x - x) + Math.abs(b.y - y);
    if (d < bestDist) [best, bestDist] = [b, d];
  }
  return best;
}

/** Storage capacity: the start's base plus every completed building's storage. */
export function capacity(w: World): number {
  let total = w.ix.pack.start.base_storage;
  for (const b of w.s.buildings) if (b.complete) total += lookup(w.ix.buildings, b.type, "building").storage;
  return total;
}

export function stored(s: WorldView): number {
  let total = 0;
  for (const amount of Object.values(s.stock)) total += amount;
  return total;
}

export function housing(w: World): number {
  let total = 0;
  for (const b of w.s.buildings) if (b.complete) total += lookup(w.ix.buildings, b.type, "building").housing;
  return total;
}

export function residents(s: WorldView): number {
  return s.units.filter((u) => u.role === "resident").length;
}

export function workersAt(s: WorldView, buildingId: string): number {
  return s.units.filter((u) => u.role === "resident" && u.workplace === buildingId).length;
}

export function isExplored(s: WorldView, x: number, y: number): boolean {
  return s.explored[tileIndex(s, x, y)] === 1;
}

export interface PlacementProblem {
  code: "INVALID_TARGET" | "PRECONDITION_FAILED" | "INSUFFICIENT_RESOURCE";
  reason: string;
}

/**
 * Why `building` cannot go at (x, y) right now, or null if it can. The command bus refuses with
 * this; the map's placement preview shows it, so the two never disagree.
 */
export function placementProblem(w: World, building: string, x: number, y: number): PlacementProblem | null {
  const def = w.ix.buildings.get(building);
  if (!def) return { code: "INVALID_TARGET", reason: `no building type ${building}` };
  if (!inBounds(w.s, x, y)) return { code: "INVALID_TARGET", reason: `(${x},${y}) is outside the map` };
  const tile = tileIndex(w.s, x, y);
  if (w.s.explored[tile] !== 1) return { code: "PRECONDITION_FAILED", reason: "that tile has not been seen" };
  if (!terrainAt(w, tile)?.buildable)
    return { code: "PRECONDITION_FAILED", reason: "cannot build on this ground" };
  if (buildingAt(w.s, x, y))
    return { code: "PRECONDITION_FAILED", reason: "something is already built here" };
  const node = nodeAt(w.s, tile);
  if (node && (node.amount > 0 || lookup(w.ix.nodes, node.type, "node").regrow_per_day > 0)) {
    // A node that grows back would come back under the building.
    return { code: "PRECONDITION_FAILED", reason: "clear the tile first" };
  }
  for (const [res, n] of Object.entries(def.cost)) {
    if ((w.s.stock[res] ?? 0) < n) return { code: "INSUFFICIENT_RESOURCE", reason: "not enough materials" };
  }
  return null;
}
