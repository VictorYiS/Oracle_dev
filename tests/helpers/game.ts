// Shared helpers for tests of the world (replaces the grid-era tests/helpers/world.ts).
import type { Pack, RawPack } from "../../src/core/content/pack";
import { assemblePack } from "../../src/core/content/pack";
import { Game } from "../../src/core/game/game";
import { route, type Spot } from "../../src/core/world/places";
import { spotOf } from "../../src/core/world/query";
import { loadPack, readRawPack } from "../../tools/lib/read-pack";

export function defaultPack(): Pack {
  const r = loadPack("interpreter");
  if (!r.ok) throw new Error(JSON.stringify(r.issues));
  return r.pack;
}

/** The default pack with extra files merged on top (an event that fires on day 2, say). */
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

/** dawn → morning → day */
export function startDay(game: Game): void {
  while (game.world.clock.phase !== "day") {
    const r = game.submit({ type: "phase.advance" });
    if (!r.ok) throw new Error(r.reason);
  }
}

/** Finish the day, then go through the night to the next day's daytime. */
export function nextDay(game: Game): void {
  if (game.world.clock.phase === "day") game.advance(10_000);
  while (game.world.clock.phase !== "day") game.submit({ type: "phase.advance" });
}

/** Walk the hero to `x` on their layer and let the clock run until they are there. */
export function walk(game: Game, x: number): void {
  const r = game.submit({ type: "hero.walk", to: x });
  if (!r.ok) throw new Error(r.reason);
  for (let i = 0; i < 500 && game.world.hero.target !== null; i++) game.advance(1);
}

/** Walk and cross passages to a place, the way the player would. */
export function goTo(game: Game, to: Spot): void {
  const h = game.world.hero;
  const steps = route(game.ix, { layer: h.layer, x: h.x }, to);
  if (!steps) throw new Error(`no way to ${to.layer} ${to.x}`);
  for (const s of steps) {
    if ("walk" in s) walk(game, s.walk);
    else {
      const r = game.submit({ type: "hero.cross", passage: s.cross });
      if (!r.ok) throw new Error(r.reason);
    }
  }
}

/** Go and stand in front of a building. */
export function visit(game: Game, building: string): void {
  goTo(game, spotOf(game.ix, building)!);
}

/** Back to the window. */
export function toWindow(game: Game): void {
  goTo(game, { layer: game.ix.window.layer, x: game.ix.window.x });
}

/** Let time pass until a visitor is waiting at the window (or the day ends). */
export function untilVisitor(game: Game, kind?: string): string | null {
  for (let i = 0; i < 800 && game.world.clock.phase === "day"; i++) {
    const c = game.world.cases.find(
      (k) => k.status === "waiting" && (!kind || game.ix.cases.get(k.type)?.kind === kind),
    );
    if (c) return c.id;
    game.advance(1);
  }
  return null;
}

export function eventsOf(game: Game, kind: string) {
  return game.events.filter((e) => e.kind === kind);
}

/** A deep copy of the state without the pending tray: what "nothing else changed" compares. */
export function withoutTray(game: Game): unknown {
  const s = JSON.parse(JSON.stringify(game.world)) as Record<string, unknown>;
  delete s.pending;
  return s;
}
