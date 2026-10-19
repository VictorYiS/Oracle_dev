// A new world from a pack and a seed. Same pack + same seed = the same world, everywhere.
import { Rng } from "../random/prng";
import { type Ctx, emit } from "./mutate";
import type { PackIndex } from "./pack-index";
import { sceneOf } from "./places";
import { spotOf } from "./query";
import { dawn } from "./routines";
import type { WorldEvent, WorldState } from "./types";

const byId = <T extends { id: string }>(a: T, b: T) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

export function createWorld(ix: PackIndex, seed: number): { s: WorldState; log: WorldEvent[] } {
  const { pack } = ix;
  const start = pack.start.hero;
  const s: WorldState = {
    format: 2,
    seed,
    pack: { id: pack.manifest.id, version: pack.manifest.version },
    clock: { day: 1, phase: "dawn", minute: ix.dayStart, tick: 0 },
    version: 0,
    rng: Rng.fromSeed(seed).state(),
    hero: { scene: sceneOf(ix, start.layer), layer: start.layer, x: start.x, target: null, near: [] },
    buildings: [...pack.buildings]
      .sort(byId)
      .map((b) => ({ id: b.id, power: b.truth.power, damaged: b.truth.damaged })),
    residents: [...pack.residents].sort(byId).map((r) => {
      const home = r.home ? spotOf(ix, r.home) : undefined;
      const at = home ?? { layer: start.layer, x: start.x };
      return {
        id: r.id,
        home: r.home,
        here: r.home !== null,
        scene: sceneOf(ix, at.layer),
        layer: at.layer,
        x: at.x,
        going: null,
        legs: [],
        visiting: null,
        darkDays: 0,
      };
    }),
    records: {
      buildings: [...pack.buildings].sort(byId).map((b) => ({
        id: b.id,
        known: b.record.known,
        power: b.record.power ?? b.truth.power,
        damaged: b.record.damaged ?? b.truth.damaged,
        updated: 0,
      })),
      residents: [...pack.residents]
        .sort(byId)
        .map((r) => ({
          id: r.id,
          registered: r.registered === undefined ? r.home : r.registered,
          updated: 0,
        })),
      orders: [],
    },
    memory: [],
    cases: [],
    pending: { next: 1, items: [] },
    crews: {},
    fired: {},
    nextId: 1,
    nextEventId: 1,
  };
  const ctx: Ctx = { s, ix, log: [] };
  emit(ctx, "world.created", { seed, pack: pack.manifest.id }, { routine: "start" });
  dawn(ctx);
  return { s, log: ctx.log };
}
