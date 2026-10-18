// Shared helpers for world tests.
import type { Pack, RawPack } from "../../src/core/content/pack";
import { assemblePack } from "../../src/core/content/pack";
import { Game } from "../../src/core/game/game";
import { loadPack, readRawPack } from "../../tools/lib/read-pack";

export function defaultPack(): Pack {
  const r = loadPack("interpreter");
  if (!r.ok) throw new Error(JSON.stringify(r.issues));
  return r.pack;
}

/** The default pack with extra files merged on top (e.g. events with chance 1). */
export function packWith(files: RawPack["files"], locales: RawPack["locales"] = {}): Pack {
  const parent = readRawPack("interpreter")!;
  const r = assemblePack(
    {
      origin: "test",
      manifest: {
        id: "test",
        version: "0.1.0",
        engine: "0",
        extends: "interpreter",
        title: "@scenario.title",
      },
      files,
      locales,
    },
    (id) => (id === "interpreter" ? parent : undefined),
  );
  if (!r.ok) throw new Error(JSON.stringify(r.issues));
  return r.pack;
}

export function newGame(seed = 1, pack: Pack = defaultPack()): Game {
  return Game.create(pack, seed);
}

/** dawn → planning → day */
export function startDay(game: Game): void {
  while (game.world.clock.phase !== "day") {
    const r = game.submit({ type: "phase.advance" });
    if (!r.ok) throw new Error(r.reason);
  }
}

/** Finish the day, then go through night to the next day's planning. */
export function nextDay(game: Game): void {
  if (game.world.clock.phase === "day") game.advance(10_000);
  while (game.world.clock.phase !== "day") game.submit({ type: "phase.advance" });
}

export function avatar(game: Game) {
  return game.world.units.find((u) => u.role === "avatar")!;
}

export function wisp(game: Game) {
  return game.world.units.find((u) => u.role === "worker")!;
}

/** The nearest explored node yielding `resource`, as [x, y]. */
export function nearestNode(game: Game, resource: string, from = avatar(game)): [number, number] {
  const w = game.world;
  let best: [number, number] | undefined;
  let bestD = Infinity;
  for (const n of w.nodes) {
    if (n.amount === 0 || w.explored[n.tile] !== 1) continue;
    if (game.ix.nodes.get(n.type)?.yields !== resource) continue;
    const x = n.tile % w.width;
    const y = Math.floor(n.tile / w.width);
    const d = Math.abs(x - from.x) + Math.abs(y - from.y);
    if (d < bestD) [best, bestD] = [[x, y], d];
  }
  if (!best) throw new Error(`no explored ${resource}`);
  return best;
}

/** An explored, buildable, empty tile near the start. */
export function freeTile(game: Game): [number, number] {
  const w = game.world;
  const a = avatar(game);
  for (let r = 1; r < 10; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const x = a.x + dx;
        const y = a.y + dy;
        const tile = y * w.width + x;
        if (w.explored[tile] !== 1 || !game.ix.terrain[w.terrain[tile]!]?.buildable) continue;
        if (w.buildings.some((b) => b.x === x && b.y === y)) continue;
        if (w.nodes.some((n) => n.tile === tile && n.amount > 0)) continue;
        if (w.units.some((u) => u.x === x && u.y === y)) continue;
        return [x, y];
      }
    }
  }
  throw new Error("no free tile");
}

export function eventsOf(game: Game, kind: string) {
  return game.events.filter((e) => e.kind === kind);
}
