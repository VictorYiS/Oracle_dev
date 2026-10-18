// A scripted manual player for headless runs (determinism, bench, smoke). It decides only from
// the world it can see and never uses randomness, so the same seed always produces the same
// command log. It also sends a few commands that must be refused, so every rejection path runs.
import type { Game } from "../../src/core/game/game";
import { COMMAND_TYPES } from "../../src/core/commands/schema";
import type { WorldView } from "../../src/core/world/types";

type Tile = [number, number];

const BUILD_ORDER = ["warehouse", "farm", "house", "well", "lookout", "workshop", "windmill", "house"];

const xy = (w: WorldView, tile: number): Tile => [tile % w.width, Math.floor(tile / w.width)];
const dist = (a: Tile, b: Tile) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]);

function nearestNode(game: Game, from: Tile, yields: string): Tile | undefined {
  const w = game.world;
  let best: Tile | undefined;
  for (const n of w.nodes) {
    if (n.amount === 0 || w.explored[n.tile] !== 1) continue;
    if (game.ix.nodes.get(n.type)?.yields !== yields) continue;
    const t = xy(w, n.tile);
    if (!best || dist(t, from) < dist(best, from)) best = t;
  }
  return best;
}

function home(w: WorldView): Tile {
  const fire = w.buildings[0];
  return fire ? [fire.x, fire.y] : [Math.floor(w.width / 2), Math.floor(w.height / 2)];
}

/** An explored, buildable, empty tile on rings around home. */
function buildSpot(game: Game): Tile | undefined {
  const w = game.world;
  const [hx, hy] = home(w);
  for (let r = 2; r < 12; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r || (dx + dy) % 2 !== 0) continue;
        const x = hx + dx;
        const y = hy + dy;
        if (x < 0 || y < 0 || x >= w.width || y >= w.height) continue;
        const tile = y * w.width + x;
        if (w.explored[tile] !== 1) continue;
        if (!game.ix.terrain[w.terrain[tile] ?? -1]?.buildable) continue;
        if (w.buildings.some((b) => b.x === x && b.y === y)) continue;
        if (w.nodes.some((n) => n.tile === tile && n.amount > 0)) continue;
        if (w.units.some((u) => u.x === x && u.y === y)) continue;
        return [x, y];
      }
    }
  }
  return undefined;
}

/** The nearest unexplored walkable tile, scanning in rings (for scouting). */
function frontier(game: Game, from: Tile): Tile | undefined {
  const w = game.world;
  for (let r = 3; r < Math.max(w.width, w.height); r += 2) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const x = from[0] + dx;
        const y = from[1] + dy;
        if (x < 0 || y < 0 || x >= w.width || y >= w.height) continue;
        const tile = y * w.width + x;
        if (w.explored[tile] === 1 || !game.ix.terrain[w.terrain[tile] ?? -1]?.walkable) continue;
        return [x, y];
      }
    }
  }
  return undefined;
}

export interface BotStats {
  submitted: number;
  accepted: number;
  byType: Record<string, number>;
  rejections: Record<string, number>;
}

export function botStats(game: Game): BotStats {
  const stats: BotStats = { submitted: 0, accepted: 0, byType: {}, rejections: {} };
  for (const rec of game.commands) {
    stats.submitted++;
    const type = (rec.command as { type?: string }).type ?? "(invalid)";
    stats.byType[type] = (stats.byType[type] ?? 0) + 1;
    if (rec.result === "ok") stats.accepted++;
    else stats.rejections[rec.result] = (stats.rejections[rec.result] ?? 0) + 1;
  }
  return stats;
}

/** What a unit should fetch: the avatar keeps everyone fed, the wisps bring building material. */
function wanted(w: WorldView, role: string): string[] {
  const food = (w.stock["res.berry"] ?? 0) + (w.stock["res.fish"] ?? 0);
  const wood = w.stock["res.wood"] ?? 0;
  const stone = w.stock["res.stone"] ?? 0;
  if (role === "avatar" ? food < 40 : food < 8) return ["res.berry", "res.fish", "res.wood"];
  if (stone < 15) return ["res.stone", "res.wood", "res.berry"];
  if (wood < 40) return ["res.wood", "res.stone", "res.berry"];
  return ["res.berry", "res.fish", "res.stone"];
}

/** Give idle units something to do. */
function directIdleUnits(game: Game, day: number): void {
  const w = game.world;
  for (const unit of w.units) {
    if (unit.role === "resident" || unit.job || unit.disabledDays > 0) continue;
    const at: Tile = [unit.x, unit.y];
    const site = w.buildings.find((b) => !b.complete);
    if (site && (unit.role === "worker" || day % 2 === 0)) {
      game.submit({ type: "unit.build", unit: unit.id, site: site.id });
      continue;
    }
    if (unit.role === "avatar" && day % 3 === 0) {
      const scout = frontier(game, at);
      if (scout) {
        game.submit({ type: "unit.move", unit: unit.id, to: scout });
        continue;
      }
    }
    for (const want of wanted(w, unit.role)) {
      const target = nearestNode(game, at, want);
      if (target) {
        game.submit({ type: "unit.gather", unit: unit.id, at: target });
        break;
      }
    }
  }
}

function plan(game: Game, day: number): void {
  const w = game.world;
  // Next building in the order that is not built yet and affordable.
  const built = w.buildings.map((b) => b.type);
  const counts: Record<string, number> = {};
  for (const type of built) counts[type] = (counts[type] ?? 0) + 1;
  const seen: Record<string, number> = {};
  for (const short of BUILD_ORDER) {
    const type = `bld.${short}`;
    seen[type] = (seen[type] ?? 0) + 1;
    if ((counts[type] ?? 0) >= seen[type]!) continue;
    const def = game.ix.buildings.get(type);
    if (!def) break;
    const spot = buildSpot(game);
    if (!spot) break;
    game.submit({ type: "build.place", building: type, at: spot });
    break;
  }

  // Residents: keep the farm staffed; every fifth day move one off and back on (exercises unit.assign).
  const farm = w.buildings.find((b) => b.type === "bld.farm" && b.complete);
  const resident = w.units.find((u) => u.role === "resident");
  if (farm && resident) {
    if (day % 5 === 0) game.submit({ type: "unit.assign", unit: resident.id, building: null });
    game.submit({ type: "unit.assign", unit: resident.id, building: farm.id });
  }

  // Now and then: commands that must be refused, one per rejection code.
  const avatar = w.units.find((u) => u.role === "avatar");
  if (avatar) {
    switch (day % 6) {
      case 0:
        game.submit({ type: "unit.move", unit: avatar.id, to: "north" });
        break; // SCHEMA_INVALID
      case 1:
        game.submit({ type: "build.place", building: "bld.farm", at: home(w), source: "script" });
        break; // NO_PERMISSION
      case 2:
        game.submit({ type: "unit.stop", unit: avatar.id, basedOnVersion: Math.max(0, w.version - 1) });
        break; // STALE_VERSION
      case 3:
        game.submit({ type: "unit.gather", unit: avatar.id, at: home(w) });
        break; // INVALID_TARGET: nothing to gather at the campfire
      case 4:
        game.submit({ type: "build.place", building: "bld.windmill", at: home(w) });
        break; // INSUFFICIENT_RESOURCE or PRECONDITION_FAILED (occupied)
      case 5:
        game.submit({ type: "phase.advance" }); // planning -> day is fine; the refusal comes below
        game.submit({ type: "phase.advance" }); // PRECONDITION_FAILED: the day runs until dusk
        return;
    }
  }
  directIdleUnits(game, day);
  // Every few days, stop the wisp and re-task it (exercises unit.stop).
  const wisp = w.units.find((u) => u.role === "worker" && u.job);
  if (wisp && day % 4 === 1) {
    game.submit({ type: "unit.stop", unit: wisp.id });
    directIdleUnits(game, day);
  }
  game.submit({ type: "phase.advance" }); // planning -> day
}

/** Play until the end of `days`, from wherever the game is. */
export function playBot(game: Game, days: number, chunk = 90): void {
  while (game.world.clock.day <= days) {
    const day = game.world.clock.day;
    switch (game.world.clock.phase) {
      case "dawn":
        game.submit({ type: "phase.advance" });
        break;
      case "planning":
        plan(game, day);
        break;
      case "day":
        game.advance(chunk);
        if (game.world.clock.phase === "day") directIdleUnits(game, day);
        break;
      case "dusk":
        game.submit({ type: "phase.advance" });
        break;
      case "night":
        if (day === days) return;
        game.submit({ type: "phase.advance" });
        break;
    }
  }
}

export const ALL_COMMAND_TYPES = COMMAND_TYPES;
