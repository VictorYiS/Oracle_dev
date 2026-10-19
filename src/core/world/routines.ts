// What happens once a day: dawn rolls the scenario's events and puts residents to work;
// dusk settles production, food, departures and regrowth.
import type { Effect, GameEvent } from "../content/schema";
import {
  addStock,
  type Ctx,
  drainStock,
  emit,
  markFired,
  removeUnit,
  revealAll,
  setJob,
  setNodeAmount,
  setWeather,
  setWorkplace,
  spawnUnit,
  takeStock,
  withRng,
} from "./mutate";
import { lookup } from "./pack-index";
import { buildingById, housing, nearestDepot, residents, workersAt } from "./query";
import { type Cause, inBounds, tileIndex } from "./types";

const DAWN: Cause = { routine: "dawn" };
const DUSK: Cause = { routine: "dusk" };
/** Residents who go this many days in a row without enough food leave. */
export const HUNGER_DAYS_BEFORE_LEAVING = 3;

export function dawn(ctx: Ctx): void {
  for (const event of ctx.ix.events) {
    if (shouldFire(ctx, event)) fire(ctx, event);
  }
  assignResidents(ctx);
  revealAll(ctx);
}

function shouldFire(ctx: Ctx, event: GameEvent): boolean {
  const t = event.trigger;
  if (ctx.s.clock.day < t.min_day) return false;
  if (t.once && ctx.s.fired[event.id] !== undefined) return false;
  if (t.needs_free_housing && housing(ctx) - residents(ctx.s) <= 0) return false;
  if (t.weather_in && !t.weather_in.includes(ctx.s.weather)) return false;
  const chanceBp = Math.round(t.chance_per_day * 10000);
  return withRng(ctx.s, (rng) => rng.chanceBp(chanceBp));
}

function fire(ctx: Ctx, event: GameEvent): void {
  markFired(ctx.s, event.id);
  const announced = emit(ctx, "scenario", { event: event.id, message: event.message }, DAWN);
  const cause: Cause = { event: announced.id };
  for (const effect of event.effects) apply(ctx, effect, cause);
}

function apply(ctx: Ctx, fx: Effect, cause: Cause): void {
  switch (fx.type) {
    case "add_resource": {
      const amount =
        fx.amount >= 0 ? addStock(ctx, fx.resource, fx.amount) : -drainStock(ctx.s, fx.resource, -fx.amount);
      emit(ctx, "stock.changed", { resource: fx.resource, amount }, cause);
      break;
    }
    case "set_weather":
      setWeather(ctx.s, fx.weather);
      emit(ctx, "weather.changed", { weather: fx.weather }, cause);
      break;
    case "spawn_unit":
      for (let i = 0; i < fx.count; i++) {
        const tile = spawnTile(ctx);
        if (tile === undefined) break;
        const unit = spawnUnit(ctx, fx.unit, tile % ctx.s.width, Math.floor(tile / ctx.s.width));
        emit(ctx, "unit.arrived", { unit: unit.id, type: fx.unit }, cause);
      }
      break;
    case "disable_worker": {
      const candidates = ctx.s.units.filter((u) => u.role === "worker" && u.disabledDays === 0);
      if (candidates.length === 0) break;
      const unit = withRng(ctx.s, (rng) => rng.pick(candidates));
      unit.disabledDays = fx.days;
      setJob(unit, null);
      emit(ctx, "unit.disabled", { unit: unit.id, days: fx.days }, cause);
      break;
    }
    case "node_bonus": {
      const cap = lookup(ctx.ix.nodes, fx.node, "node").amount * 2;
      for (const node of ctx.s.nodes) {
        if (node.type === fx.node && node.amount > 0)
          setNodeAmount(ctx.s, node.tile, Math.min(cap, node.amount + fx.amount));
      }
      emit(ctx, "node.bonus", { node: fx.node, amount: fx.amount }, cause);
      break;
    }
  }
}

/** First free walkable tile around the nearest depot, searching outward ring by ring. */
function spawnTile(ctx: Ctx): number | undefined {
  const home = nearestDepot(ctx, Math.floor(ctx.s.width / 2), Math.floor(ctx.s.height / 2));
  const cx = home?.x ?? Math.floor(ctx.s.width / 2);
  const cy = home?.y ?? Math.floor(ctx.s.height / 2);
  const occupied = new Set(ctx.s.units.map((u) => tileIndex(ctx.s, u.x, u.y)));
  for (let r = 1; r < Math.max(ctx.s.width, ctx.s.height); r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const x = cx + dx;
        const y = cy + dy;
        if (!inBounds(ctx.s, x, y)) continue;
        const tile = tileIndex(ctx.s, x, y);
        if (!occupied.has(tile) && ctx.ix.terrain[ctx.s.terrain[tile] ?? -1]?.walkable) return tile;
      }
    }
  }
  return undefined;
}

/** Residents without a valid workplace take the first free slot, in building order. */
export function assignResidents(ctx: Ctx): void {
  for (const unit of ctx.s.units) {
    if (unit.role !== "resident") continue;
    const current = unit.workplace ? buildingById(ctx.s, unit.workplace) : undefined;
    if (current?.complete) continue;
    setWorkplace(unit, null);
    for (const b of ctx.s.buildings) {
      const slots = lookup(ctx.ix.buildings, b.type, "building").workers;
      if (b.complete && slots > workersAt(ctx.s, b.id)) {
        setWorkplace(unit, b.id);
        break;
      }
    }
  }
}

export function dusk(ctx: Ctx): void {
  produce(ctx);
  feed(ctx);
  for (const node of ctx.s.nodes) {
    const def = lookup(ctx.ix.nodes, node.type, "node");
    if (def.regrow_per_day > 0 && node.amount < def.amount) {
      setNodeAmount(ctx.s, node.tile, Math.min(def.amount, node.amount + def.regrow_per_day));
    }
  }
  for (const unit of ctx.s.units) if (unit.disabledDays > 0) unit.disabledDays--;
}

function produce(ctx: Ctx): void {
  const bonus = ctx.ix.weathers.get(ctx.s.weather)?.produce_bonus ?? {};
  for (const b of ctx.s.buildings) {
    const def = lookup(ctx.ix.buildings, b.type, "building");
    if (!b.complete || !def.produces) continue;
    const workers = ctx.s.units.filter((u) => u.workplace === b.id && u.disabledDays === 0).length;
    const shifts = Math.min(workers, def.workers);
    for (let i = 0; i < shifts; i++) {
      if (def.consumes && !takeStock(ctx.s, def.consumes)) {
        emit(ctx, "production.short", { building: b.id, type: b.type }, DUSK);
        break;
      }
      for (const [resource, amount] of Object.entries(def.produces)) {
        const added = addStock(ctx, resource, amount + (bonus[resource] ?? 0));
        emit(ctx, "production", { building: b.id, resource, amount: added }, DUSK);
      }
    }
  }
}

function feed(ctx: Ctx): void {
  let fed = 0;
  let hungry = 0;
  for (const unit of [...ctx.s.units]) {
    const need = lookup(ctx.ix.units, unit.type, "unit type").food_per_day;
    if (need === 0) continue;
    let eaten = 0;
    for (const food of ctx.ix.foods) {
      if (eaten >= need) break;
      eaten += drainStock(ctx.s, food, need - eaten);
    }
    if (eaten >= need) {
      unit.hunger = 0;
      fed++;
      continue;
    }
    unit.hunger++;
    hungry++;
    emit(ctx, "unit.hungry", { unit: unit.id, short: need - eaten, days: unit.hunger }, DUSK);
    if (unit.role === "resident" && unit.hunger >= HUNGER_DAYS_BEFORE_LEAVING) {
      removeUnit(ctx.s, unit.id);
      // The unit is gone from the state, so the event carries what readers need to name it.
      emit(ctx, "unit.left", { unit: unit.id, type: unit.type }, DUSK);
    }
  }
  emit(ctx, "day.settled", { day: ctx.s.clock.day, fed, hungry }, DUSK);
}
