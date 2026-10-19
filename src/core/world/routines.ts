// What happens once a day. Dawn: the scenario's events, everyone wakes at home, the day's visitors
// are chosen. Dusk: the crews carry out the day's orders, whoever is still waiting goes home, and
// people who have sat in the dark too long give up and leave (without telling the registry).
import type { Effect, GameEvent } from "../content/schema";
import { executeOrders, expireCases, generateCases } from "./cases";
import { heroToStart } from "./hero";
import { type Ctx, emit, findBuilding, findResident, markFired, setRecord, withRng } from "./mutate";
import { observe } from "./observe";
import { placeAtHome } from "./residents";
import type { Cause } from "./types";

const DAWN: Cause = { routine: "dawn" };
const DUSK: Cause = { routine: "dusk" };

export function dawn(ctx: Ctx): void {
  for (const event of ctx.ix.events) {
    if (shouldFire(ctx, event)) fire(ctx, event);
  }
  ctx.s.crews = {};
  for (const r of ctx.s.residents) {
    r.visiting = null;
    if (r.here) placeAtHome(ctx, r);
  }
  heroToStart(ctx);
  generateCases(ctx);
  observe(ctx, DAWN);
}

function shouldFire(ctx: Ctx, event: GameEvent): boolean {
  const t = event.trigger;
  if (t.once && ctx.s.fired[event.id] !== undefined) return false;
  if (t.day !== undefined) return ctx.s.clock.day === t.day;
  if (ctx.s.clock.day < t.min_day) return false;
  const chanceBp = Math.round(t.chance_per_day * 10000);
  return chanceBp > 0 && withRng(ctx.s, (rng) => rng.chanceBp(chanceBp));
}

function fire(ctx: Ctx, event: GameEvent): void {
  markFired(ctx.s, event.id);
  // Only events with a message are news; the rest just happen.
  const announced = event.message
    ? emit(ctx, "scenario", { event: event.id, message: event.message }, DAWN)
    : null;
  const cause: Cause = announced ? { event: announced.id } : DAWN;
  for (const effect of event.effects) apply(ctx, effect, cause);
}

function apply(ctx: Ctx, fx: Effect, cause: Cause): void {
  const { s } = ctx;
  switch (fx.type) {
    case "power": {
      const b = findBuilding(s, fx.building);
      if (b) b.power = fx.on;
      emit(ctx, "truth.power", { building: fx.building, on: fx.on }, cause);
      break;
    }
    case "damage": {
      const b = findBuilding(s, fx.building);
      if (b) b.damaged = fx.damaged;
      emit(ctx, "truth.damage", { building: fx.building, damaged: fx.damaged }, cause);
      break;
    }
    case "record":
      setRecord(s, fx.building, { known: fx.known, power: fx.power, damaged: fx.damaged });
      emit(ctx, "record.changed", { building: fx.building }, cause);
      break;
    case "move_out": {
      const r = findResident(s, fx.person);
      if (r?.here) leave(ctx, r.id, cause);
      break;
    }
    case "move_in": {
      const r = findResident(s, fx.person);
      if (!r) break;
      r.here = true;
      r.home = fx.building;
      placeAtHome(ctx, r);
      emit(ctx, "person.arrived", { person: r.id, building: fx.building }, cause);
      break;
    }
  }
}

function leave(ctx: Ctx, person: string, cause: Cause): void {
  const r = findResident(ctx.s, person)!;
  const home = r.home;
  r.here = false;
  r.home = null;
  r.visiting = null;
  r.legs = [];
  r.going = null;
  emit(ctx, "person.left", { person, building: home }, cause);
}

export function dusk(ctx: Ctx): void {
  executeOrders(ctx);
  expireCases(ctx);
  const limit = ctx.ix.params.leave_after_dark_days;
  for (const r of ctx.s.residents) {
    if (!r.here || !r.home) continue;
    const lit = findBuilding(ctx.s, r.home)?.power ?? false;
    r.darkDays = lit ? 0 : r.darkDays + 1;
    if (r.darkDays >= limit) leave(ctx, r.id, DUSK);
  }
  observe(ctx, DUSK);
  const s = ctx.s;
  emit(
    ctx,
    "day.settled",
    {
      day: s.clock.day,
      decided: s.cases.filter((c) => c.day === s.clock.day && c.status === "decided").length,
      expired: s.cases.filter((c) => c.day === s.clock.day && c.status === "expired").length,
      powered: s.buildings.filter((b) => b.power).length,
    },
    DUSK,
  );
}
