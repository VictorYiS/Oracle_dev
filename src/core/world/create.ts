// A new world from a pack and a seed. Same pack + same seed = the same world, everywhere.
import { Rng } from "../random/prng";
import { type Ctx, emit, placeBuilding, spawnUnit } from "./mutate";
import { lookup, type PackIndex } from "./pack-index";
import { dawn } from "./routines";
import type { NodeState, WorldEvent, WorldState } from "./types";

export function createWorld(ix: PackIndex, seed: number): { s: WorldState; log: WorldEvent[] } {
  const { pack } = ix;
  const { map, start } = pack;
  const terrain: number[] = [];
  const nodes: NodeState[] = [];
  map.rows.forEach((row, y) => {
    [...row].forEach((ch, x) => {
      const entry = map.legend[ch]!;
      terrain.push(ix.terrainIndex.get(entry.terrain)!);
      if (entry.node) {
        nodes.push({
          tile: y * map.width + x,
          type: entry.node,
          amount: lookup(ix.nodes, entry.node, "node").amount,
        });
      }
    });
  });

  const s: WorldState = {
    format: 1,
    seed,
    pack: { id: pack.manifest.id, version: pack.manifest.version },
    clock: { day: 1, phase: "dawn", minute: ix.dayStart, tick: 0 },
    version: 0,
    rng: Rng.fromSeed(seed).state(),
    width: map.width,
    height: map.height,
    terrain,
    nodes,
    explored: new Array<number>(map.width * map.height).fill(0),
    units: [],
    buildings: [],
    stock: { ...start.stock },
    weather: start.weather,
    fired: {},
    noticed: {},
    nextId: 1,
    nextEventId: 1,
  };
  const ctx: Ctx = { s, ix, log: [] };
  for (const b of start.buildings) placeBuilding(ctx, b.building, b.at[0], b.at[1], true, null);
  for (const u of start.units) spawnUnit(ctx, u.unit, u.at[0], u.at[1]);
  emit(ctx, "world.created", { seed, pack: pack.manifest.id }, { routine: "start" });
  dawn(ctx);
  return { s, log: ctx.log };
}
