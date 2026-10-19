// What every unit does on one day-phase tick: walk, gather, deliver, build.
import {
  addStock,
  completeBuilding,
  type Ctx,
  emit,
  findBuilding,
  moveUnit,
  notice,
  setJob,
  setNodeAmount,
  setPath,
} from "./mutate";
import { lookup } from "./pack-index";
import { findPath } from "./path";
import { grid, nearestDepot, nodeAt } from "./query";
import { tileIndex, type UnitState } from "./types";

export function tickUnits(ctx: Ctx): void {
  for (const unit of ctx.s.units) {
    if (unit.disabledDays > 0 || !unit.job) continue;
    if (unit.path.length > 0) {
      walk(ctx, unit);
      continue;
    }
    switch (unit.job.kind) {
      case "move":
        setJob(unit, null);
        break;
      case "gather":
        gather(ctx, unit);
        break;
      case "build":
        build(ctx, unit);
        break;
    }
  }
}

function walk(ctx: Ctx, unit: UnitState): void {
  const next = unit.path[0]!;
  const terrain = ctx.ix.terrain[ctx.s.terrain[next] ?? -1];
  const cost = lookup(ctx.ix.units, unit.type, "unit type").ticks_per_tile * (terrain?.move_cost ?? 1);
  unit.step++;
  if (unit.step >= cost) {
    moveUnit(ctx, unit, next);
    unit.path.shift();
    unit.step = 0;
  }
}

/** Route a unit to a tile; false (and the job dropped) if it cannot get there. */
export function routeTo(ctx: Ctx, unit: UnitState, tile: number): boolean {
  const path = findPath(grid(ctx), tileIndex(ctx.s, unit.x, unit.y), tile);
  if (!path) return false;
  setPath(unit, path);
  return true;
}

function headToDepot(ctx: Ctx, unit: UnitState): void {
  const job = unit.job;
  if (job?.kind !== "gather") return;
  const depot = nearestDepot(ctx, unit.x, unit.y);
  if (!depot || !routeTo(ctx, unit, tileIndex(ctx.s, depot.x, depot.y))) {
    emit(ctx, "gather.no_depot", { unit: unit.id }, job.cause);
    setJob(unit, null);
    return;
  }
  job.stage = "to_depot";
}

function gather(ctx: Ctx, unit: UnitState): void {
  const job = unit.job;
  if (job?.kind !== "gather") return;
  const node = nodeAt(ctx.s, job.node);
  const here = tileIndex(ctx.s, unit.x, unit.y);

  if (job.stage === "to_node") {
    if (here !== job.node) {
      if (!routeTo(ctx, unit, job.node)) setJob(unit, null);
      return;
    }
    job.stage = "gathering";
  }

  if (job.stage === "gathering") {
    const capacity = lookup(ctx.ix.units, unit.type, "unit type").carry;
    if (!node || node.amount === 0 || (unit.carrying?.amount ?? 0) >= capacity) {
      if (unit.carrying) headToDepot(ctx, unit);
      else setJob(unit, null);
      return;
    }
    const def = lookup(ctx.ix.nodes, node.type, "node");
    unit.work++;
    if (unit.work < def.gather_ticks) return;
    unit.work = 0;
    setNodeAmount(ctx.s, node.tile, node.amount - 1);
    unit.carrying = { resource: def.yields, amount: (unit.carrying?.amount ?? 0) + 1 };
    if (node.amount === 0) emit(ctx, "node.exhausted", { tile: node.tile, node: node.type }, job.cause);
    if (unit.carrying.amount >= capacity || node.amount === 0) headToDepot(ctx, unit);
    return;
  }

  // to_depot, and the path has run out: deliver.
  const depot = nearestDepot(ctx, unit.x, unit.y);
  if (!depot || depot.x !== unit.x || depot.y !== unit.y) {
    headToDepot(ctx, unit);
    return;
  }
  if (unit.carrying) {
    const added = addStock(ctx, unit.carrying.resource, unit.carrying.amount);
    const lost = unit.carrying.amount - added;
    const resource = unit.carrying.resource;
    unit.carrying = null;
    if (lost > 0) {
      // No room: what does not fit is left on the ground, so a full store never traps a unit.
      notice(ctx, "storage.full", { unit: unit.id, resource, lost }, job.cause);
      setJob(unit, null);
      return;
    }
  }
  if (node && node.amount > 0) {
    job.stage = "to_node";
    if (!routeTo(ctx, unit, job.node)) setJob(unit, null);
  } else {
    setJob(unit, null);
  }
}

function build(ctx: Ctx, unit: UnitState): void {
  const job = unit.job;
  if (job?.kind !== "build") return;
  const site = findBuilding(ctx.s, job.site);
  if (!site || site.complete) {
    setJob(unit, null);
    return;
  }
  if (unit.x !== site.x || unit.y !== site.y) {
    if (!routeTo(ctx, unit, tileIndex(ctx.s, site.x, site.y))) setJob(unit, null);
    return;
  }
  job.stage = "working";
  site.progress++;
  if (site.progress >= lookup(ctx.ix.buildings, site.type, "building").build_ticks) {
    completeBuilding(ctx, site);
    const cause = site.placedBy !== null ? { event: site.placedBy } : job.cause;
    emit(ctx, "building.completed", { building: site.id, type: site.type }, cause);
    setJob(unit, null);
  }
}
