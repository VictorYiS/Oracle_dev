// A scripted player for headless runs (determinism, bench, smoke). It decides only from what it can
// see in the world and never uses randomness, so the same seed always produces the same command
// log. It works the window (adopting the Oracle's suggestion for some cases, deciding others by
// hand), goes out on foot every other day through the passages to look at things, reads originals
// for what it adopted, and now and then sends a command that must be refused, so every rejection
// path runs. Nothing here names scenario content: routes and targets come from the pack.
import type { Game } from "../../src/core/game/game";
import { route, type Spot } from "../../src/core/world/places";
import { atWindow, spotOf, waitingCases } from "../../src/core/world/query";
import { decisionProblem, readProblem } from "../../src/core/world/window";
import { COMMAND_TYPES } from "../../src/core/commands/schema";

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
    const type = (rec.command as { type?: string } | null)?.type ?? "(invalid)";
    stats.byType[type] = (stats.byType[type] ?? 0) + 1;
    if (rec.result === "ok") stats.accepted++;
    else stats.rejections[rec.result] = (stats.rejections[rec.result] ?? 0) + 1;
  }
  return stats;
}

const daytime = (game: Game) => game.world.clock.phase === "day";
/** The read-only view the window rules and queries take. */
const view = (game: Game) => ({ s: game.world, ix: game.ix });

/** Let the clock run until the hero stops walking (or the day ends). */
function arrive(game: Game): void {
  while (daytime(game) && game.world.hero.target !== null) {
    const h = game.world.hero;
    const ticks = Math.ceil(Math.abs((h.target ?? h.x) - h.x) / game.ix.params.hero_speed);
    game.advance(Math.max(1, ticks));
  }
}

/** Walk and take passages to `to`. False if the day ended on the way. */
function go(game: Game, to: Spot): boolean {
  const h = game.world.hero;
  const steps = route(game.ix, { layer: h.layer, x: h.x }, to);
  if (!steps) return false;
  for (const step of steps) {
    if (!daytime(game)) return false;
    if ("walk" in step) {
      game.submit({ type: "hero.walk", to: step.walk });
      arrive(game);
    } else {
      game.submit({ type: "hero.cross", passage: step.cross });
    }
  }
  return daytime(game);
}

/** Work the queue: adopt some suggestions, decide others by the procedure's obvious reading. */
function workTheWindow(game: Game, day: number): void {
  if (!daytime(game) || !atWindow(view(game))) return;
  for (const c of waitingCases(game.world)) {
    const n = Number(c.id.slice(1));
    const suggestion = game.suggestion(c.id);
    if ((n + day) % 3 !== 0 && suggestion) {
      game.submit({ type: "case.adopt", case: c.id });
      continue;
    }
    // By hand: approve if the window allows it, else refuse. Every so often, try anyway.
    const blocked = decisionProblem(view(game), c.id, "approve");
    if (blocked && blocked.code === "INSUFFICIENT_RESOURCE")
      game.submit({ type: "case.decide", case: c.id, action: "approve" });
    game.submit({ type: "case.decide", case: c.id, action: blocked ? "deny" : "approve" });
  }
}

/** Fetch the originals for the oldest item that has them. */
function readOne(game: Game): void {
  const item = game.world.pending.items.find((p) => readProblem(view(game), p.id) === null);
  if (item) game.submit({ type: "pending.read", item: item.id });
}

/** Where to look today: what the tray says to check first, then a few buildings in turn. */
function targets(game: Game, day: number): Spot[] {
  const out: string[] = [];
  for (const p of game.world.pending.items) {
    if (p.verdict === null && !out.includes(p.building)) out.push(p.building);
  }
  const all = game.ix.pack.buildings.map((b) => b.id);
  for (let k = 0; k < 3; k++) {
    const id = all[(day * 3 + k) % all.length]!;
    if (!out.includes(id)) out.push(id);
  }
  return out.slice(0, 4).flatMap((id) => {
    const s = spotOf(game.ix, id);
    return s ? [s] : [];
  });
}

/** Commands that must be refused, one kind a day in turn. */
function refusals(game: Game, day: number): void {
  const w = game.world;
  switch (day % 5) {
    case 0:
      game.submit({ type: "hero.walk", to: "north" }); // SCHEMA_INVALID
      break;
    case 1:
      game.submit({ type: "hero.walk", to: w.hero.x, source: "script" }); // NO_PERMISSION
      break;
    case 2:
      game.submit({ type: "hero.wait", minutes: 1, basedOnVersion: Math.max(0, w.version - 1) }); // STALE_VERSION
      break;
    case 3:
      game.submit({ type: "case.decide", case: "c999999", action: "approve" }); // INVALID_TARGET
      break;
    case 4:
      game.submit({ type: "phase.advance" }); // PRECONDITION_FAILED: the day runs until dusk
      break;
  }
}

function playDay(game: Game, day: number, chunk: number): void {
  const ix = game.ix;
  const home = ix.window;
  refusals(game, day);
  // The morning at the window.
  while (daytime(game) && game.world.clock.minute < ix.dayStart + 150) {
    workTheWindow(game, day);
    game.advance(Math.min(chunk, 30));
  }
  // Every other day, go and look.
  if (day % 2 === 1) {
    for (const spot of targets(game, day)) if (!go(game, spot)) break;
    // Through a door and back, if one is on the way home.
    const door = ix.pack.passages.find((p) => p.kind === "door" && p.from.layer === game.world.hero.layer);
    if (door && daytime(game) && go(game, door.from)) {
      game.submit({ type: "hero.cross", passage: door.id });
      if (daytime(game)) game.submit({ type: "hero.cross", passage: door.id });
    }
    go(game, { layer: home.layer, x: home.x });
  }
  // Now and then the truth or the records change behind everyone's back (the debug hook).
  if (day % 7 === 3) {
    const b = ix.pack.buildings[day % ix.pack.buildings.length]!;
    game.submit({ type: "debug.truth", building: b.id, damaged: true, source: "debug" });
  }
  if (day % 7 === 5) {
    const b = ix.pack.buildings[(day * 2) % ix.pack.buildings.length]!;
    game.submit({ type: "debug.record", building: b.id, power: day % 2 === 0, source: "debug" });
  }
  // The afternoon at the window: the queue, an original or two, and some waiting.
  while (daytime(game)) {
    workTheWindow(game, day);
    if (game.world.clock.minute % 120 < chunk) readOne(game);
    if (game.world.clock.minute > ix.dusk - 90 && day % 3 === 0)
      game.submit({ type: "hero.wait", minutes: 60 });
    else game.advance(chunk);
  }
}

/** Play until the end of `days`, from wherever the game is. */
export function playBot(game: Game, days: number, chunk = 45): void {
  while (game.world.clock.day <= days) {
    const day = game.world.clock.day;
    switch (game.world.clock.phase) {
      case "dawn":
      case "planning":
      case "dusk":
        game.submit({ type: "phase.advance" });
        break;
      case "day":
        playDay(game, day, chunk);
        break;
      case "night":
        if (day === days) return;
        game.submit({ type: "phase.advance" });
        break;
    }
  }
}

export const ALL_COMMAND_TYPES = COMMAND_TYPES;
