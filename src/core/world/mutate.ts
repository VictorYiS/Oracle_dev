// The only module that writes the true world state. It may be imported by src/core/world/**
// (the simulation's own systems) and src/core/commands/** (the command bus); nothing else.
// Enforced by eslint.config.js and tests/architecture/write-boundary.test.ts.
import { Rng } from "../random/prng";
import type { Ctx } from "./ctx";
import { lookup } from "./pack-index";
import {
  type BuildingState,
  type Cause,
  inBounds,
  type Job,
  tileIndex,
  type UnitState,
  type WorldEvent,
  type WorldState,
} from "./types";

export type { Ctx };

export function emit(ctx: Ctx, kind: string, data: WorldEvent["data"], cause: Cause): WorldEvent {
  const event: WorldEvent = {
    id: ctx.s.nextEventId++,
    day: ctx.s.clock.day,
    tick: ctx.s.clock.tick,
    kind,
    data,
    cause,
  };
  ctx.log.push(event);
  return event;
}

/** Like emit, but at most once per day for this kind. */
export function notice(ctx: Ctx, kind: string, data: WorldEvent["data"], cause: Cause): void {
  if (ctx.s.noticed[kind] === ctx.s.clock.day) return;
  ctx.s.noticed[kind] = ctx.s.clock.day;
  emit(ctx, kind, data, cause);
}

export function withRng<T>(s: WorldState, fn: (rng: Rng) => T): T {
  const rng = Rng.fromState(s.rng);
  const result = fn(rng);
  s.rng = rng.state();
  return result;
}

export function bumpVersion(s: WorldState): void {
  s.version++;
}

// ---- stock ------------------------------------------------------------------------------------

export function capacity(ctx: Ctx): number {
  let total = ctx.ix.pack.start.base_storage;
  for (const b of ctx.s.buildings)
    if (b.complete) total += lookup(ctx.ix.buildings, b.type, "building").storage;
  return total;
}

export function stored(s: WorldState): number {
  let total = 0;
  for (const amount of Object.values(s.stock)) total += amount;
  return total;
}

/** Add up to `amount`, limited by free capacity. Returns what was actually added. */
export function addStock(ctx: Ctx, resource: string, amount: number): number {
  const added = Math.max(0, Math.min(amount, capacity(ctx) - stored(ctx.s)));
  if (added > 0) ctx.s.stock[resource] = (ctx.s.stock[resource] ?? 0) + added;
  return added;
}

export function hasStock(s: WorldState, amounts: Record<string, number>): boolean {
  return Object.entries(amounts).every(([res, n]) => (s.stock[res] ?? 0) >= n);
}

/** Take all of `amounts` or nothing. */
export function takeStock(s: WorldState, amounts: Record<string, number>): boolean {
  if (!hasStock(s, amounts)) return false;
  for (const [res, n] of Object.entries(amounts)) {
    s.stock[res] = (s.stock[res] ?? 0) - n;
    if (s.stock[res] === 0) delete s.stock[res];
  }
  return true;
}

/** Remove up to `amount` of one resource (events may take what is there). */
export function drainStock(s: WorldState, resource: string, amount: number): number {
  const taken = Math.min(amount, s.stock[resource] ?? 0);
  if (taken > 0) {
    s.stock[resource] = (s.stock[resource] ?? 0) - taken;
    if (s.stock[resource] === 0) delete s.stock[resource];
  }
  return taken;
}

// ---- units ------------------------------------------------------------------------------------

export function spawnUnit(ctx: Ctx, type: string, x: number, y: number): UnitState {
  const def = lookup(ctx.ix.units, type, "unit type");
  const unit: UnitState = {
    id: `u${ctx.s.nextId++}`,
    type,
    role: def.role,
    x,
    y,
    carrying: null,
    job: null,
    path: [],
    step: 0,
    work: 0,
    disabledDays: 0,
    hunger: 0,
    workplace: null,
  };
  ctx.s.units.push(unit);
  reveal(ctx, x, y, sightOf(ctx, unit));
  return unit;
}

export function removeUnit(s: WorldState, id: string): void {
  s.units = s.units.filter((u) => u.id !== id);
}

export function setJob(unit: UnitState, job: Job | null): void {
  unit.job = job;
  unit.path = [];
  unit.step = 0;
  unit.work = 0;
}

export function setPath(unit: UnitState, path: number[]): void {
  unit.path = path;
  unit.step = 0;
}

export function moveUnit(ctx: Ctx, unit: UnitState, tile: number): void {
  unit.x = tile % ctx.s.width;
  unit.y = Math.floor(tile / ctx.s.width);
  reveal(ctx, unit.x, unit.y, sightOf(ctx, unit));
}

export function setWorkplace(unit: UnitState, building: string | null): void {
  unit.workplace = building;
}

// ---- buildings ----------------------------------------------------------------------------------

export function placeBuilding(
  ctx: Ctx,
  type: string,
  x: number,
  y: number,
  complete: boolean,
  placedBy: number | null,
): BuildingState {
  const building: BuildingState = {
    id: `b${ctx.s.nextId++}`,
    type,
    x,
    y,
    complete,
    progress: complete ? lookup(ctx.ix.buildings, type, "building").build_ticks : 0,
    placedBy,
  };
  ctx.s.buildings.push(building);
  if (complete) revealFromBuilding(ctx, building);
  return building;
}

export function completeBuilding(ctx: Ctx, building: BuildingState): void {
  building.complete = true;
  building.progress = lookup(ctx.ix.buildings, building.type, "building").build_ticks;
  revealFromBuilding(ctx, building);
}

// ---- nodes, weather, fog -----------------------------------------------------------------------

export function setNodeAmount(s: WorldState, tile: number, amount: number): void {
  const node = s.nodes.find((n) => n.tile === tile);
  if (node) node.amount = Math.max(0, amount);
}

export function setWeather(s: WorldState, weather: string): void {
  s.weather = weather;
}

export function markFired(s: WorldState, eventId: string): void {
  s.fired[eventId] = s.clock.day;
}

/** Sight radius after the weather, never below 1. */
export function sightOf(ctx: Ctx, unit: UnitState): number {
  const base = lookup(ctx.ix.units, unit.type, "unit type").sight;
  const delta = ctx.ix.weathers.get(ctx.s.weather)?.sight_delta ?? 0;
  return Math.max(1, base + delta);
}

function revealFromBuilding(ctx: Ctx, b: BuildingState): void {
  const sight = lookup(ctx.ix.buildings, b.type, "building").sight;
  reveal(ctx, b.x, b.y, Math.max(1, sight));
}

/** Mark every tile within `radius` (Euclidean) of (x, y) as explored. */
export function reveal(ctx: Ctx, x: number, y: number, radius: number): void {
  const r2 = radius * radius;
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      if (dx * dx + dy * dy > r2 || !inBounds(ctx.s, x + dx, y + dy)) continue;
      ctx.s.explored[tileIndex(ctx.s, x + dx, y + dy)] = 1;
    }
  }
}

export function revealAll(ctx: Ctx): void {
  for (const u of ctx.s.units) reveal(ctx, u.x, u.y, sightOf(ctx, u));
  for (const b of ctx.s.buildings) if (b.complete) revealFromBuilding(ctx, b);
}
