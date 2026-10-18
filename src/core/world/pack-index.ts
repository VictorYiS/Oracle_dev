// Fast lookups into a pack's content, built once per game. Read-only.
import type { Pack } from "../content/pack";
import type {
  Building,
  GameEvent,
  Resource,
  ResourceNode,
  Terrain,
  UnitType,
  Weather,
} from "../content/schema";

/** Resources carrying this tag feed units with `food_per_day`. */
export const FOOD_TAG = "food";

export interface PackIndex {
  pack: Pack;
  terrain: Terrain[];
  terrainIndex: Map<string, number>;
  resources: Map<string, Resource>;
  /** Food resources, in pack order: eaten in this order. */
  foods: string[];
  nodes: Map<string, ResourceNode>;
  buildings: Map<string, Building>;
  units: Map<string, UnitType>;
  weathers: Map<string, Weather>;
  events: GameEvent[];
  dayStart: number;
  dusk: number;
}

export function indexPack(pack: Pack): PackIndex {
  return {
    pack,
    terrain: pack.terrain,
    terrainIndex: new Map(pack.terrain.map((t, i) => [t.id, i])),
    resources: new Map(pack.resources.map((r) => [r.id, r])),
    foods: pack.resources.filter((r) => r.tags.includes(FOOD_TAG)).map((r) => r.id),
    nodes: new Map(pack.nodes.map((n) => [n.id, n])),
    buildings: new Map(pack.buildings.map((b) => [b.id, b])),
    units: new Map(pack.units.map((u) => [u.id, u])),
    weathers: new Map(pack.weathers.map((w) => [w.id, w])),
    events: pack.events,
    dayStart: pack.calendar.day_start_minute,
    dusk: pack.calendar.dusk_minute,
  };
}

export function lookup<T>(map: Map<string, T>, id: string, what: string): T {
  const found = map.get(id);
  if (!found) throw new Error(`unknown ${what} "${id}"`);
  return found;
}
