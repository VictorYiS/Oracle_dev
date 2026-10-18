// Read-only questions about a world. Safe to use from anywhere in src/core.
import { lookup, type PackIndex } from "./pack-index";
import type { Grid } from "./path";
import { type BuildingState, type NodeState, tileIndex, type UnitState, type WorldView } from "./types";

type World = { s: WorldView; ix: PackIndex };

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

/** Nodes are kept sorted by tile, so this is a binary search. */
export function nodeAt(s: WorldView, tile: number): NodeState | undefined {
  let lo = 0;
  let hi = s.nodes.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const n = s.nodes[mid]!;
    if (n.tile === tile) return n as NodeState;
    if (n.tile < tile) lo = mid + 1;
    else hi = mid - 1;
  }
  return undefined;
}

export function buildingAt(s: WorldView, x: number, y: number): BuildingState | undefined {
  return s.buildings.find((b) => b.x === x && b.y === y) as BuildingState | undefined;
}

export function unitById(s: WorldView, id: string): UnitState | undefined {
  return s.units.find((u) => u.id === id) as UnitState | undefined;
}

export function buildingById(s: WorldView, id: string): BuildingState | undefined {
  return s.buildings.find((b) => b.id === id) as BuildingState | undefined;
}

/** The closest completed depot by walking distance estimate (Manhattan), ties by id. */
export function nearestDepot(w: World, x: number, y: number): BuildingState | undefined {
  let best: BuildingState | undefined;
  let bestDist = Infinity;
  for (const b of w.s.buildings) {
    if (!b.complete || !lookup(w.ix.buildings, b.type, "building").depot) continue;
    const d = Math.abs(b.x - x) + Math.abs(b.y - y);
    if (d < bestDist) [best, bestDist] = [b as BuildingState, d];
  }
  return best;
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
