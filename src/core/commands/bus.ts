// The command bus: schema → permission → version → targets and preconditions → execute.
// Every accepted command bumps the world version and is the cause of the events it produces.
import {
  bumpVersion,
  type Ctx,
  emit,
  placeBuilding,
  setJob,
  setPath,
  setWorkplace,
  takeStock,
} from "../world/mutate";
import { lookup } from "../world/pack-index";
import { findPath } from "../world/path";
import { buildingAt, buildingById, grid, isExplored, nodeAt, unitById, workersAt } from "../world/query";
import { nextPhase } from "../world/time";
import { type Cause, inBounds, tileIndex, type UnitState } from "../world/types";
import { Command, type CommandResult, PERMISSIONS, type Rejection } from "./schema";

class Refused extends Error {
  constructor(
    readonly code: Rejection,
    reason: string,
  ) {
    super(reason);
  }
}

const refuse = (code: Rejection, reason: string): never => {
  throw new Refused(code, reason);
};

export function submit(ctx: Ctx, raw: unknown, seq: number): CommandResult {
  const parsed = Command.safeParse(raw);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return {
      ok: false,
      seq,
      code: "SCHEMA_INVALID",
      reason: `${first?.path.join(".") ?? ""} ${first?.message ?? ""}`.trim(),
    };
  }
  const cmd = parsed.data;
  if (!PERMISSIONS[cmd.type].includes(cmd.source)) {
    return { ok: false, seq, code: "NO_PERMISSION", reason: `${cmd.source} may not issue ${cmd.type}` };
  }
  if (cmd.basedOnVersion !== undefined && cmd.basedOnVersion !== ctx.s.version) {
    return {
      ok: false,
      seq,
      code: "STALE_VERSION",
      reason: `based on version ${cmd.basedOnVersion}, world is at ${ctx.s.version}`,
    };
  }
  try {
    execute(ctx, cmd, { command: seq });
  } catch (e) {
    if (e instanceof Refused) return { ok: false, seq, code: e.code, reason: e.message };
    throw e;
  }
  bumpVersion(ctx.s);
  return { ok: true, seq };
}

function unitFor(ctx: Ctx, id: string): UnitState {
  return unitById(ctx.s, id) ?? refuse("INVALID_TARGET", `no unit ${id}`);
}

function tileFor(ctx: Ctx, [x, y]: [number, number]): number {
  if (!inBounds(ctx.s, x, y)) refuse("INVALID_TARGET", `(${x},${y}) is outside the map`);
  return tileIndex(ctx.s, x, y);
}

function controllable(unit: UnitState): void {
  if (unit.role === "resident") refuse("PRECONDITION_FAILED", "residents work on their own");
  if (unit.disabledDays > 0) refuse("PRECONDITION_FAILED", `${unit.id} is out of action`);
}

function pathFor(ctx: Ctx, unit: UnitState, to: number): number[] {
  return (
    findPath(grid(ctx), tileIndex(ctx.s, unit.x, unit.y), to) ?? refuse("PRECONDITION_FAILED", "no way there")
  );
}

function execute(ctx: Ctx, cmd: Command, cause: Cause): void {
  switch (cmd.type) {
    case "phase.advance": {
      if (!nextPhase(ctx)) refuse("PRECONDITION_FAILED", "the day runs until dusk");
      emit(ctx, "phase.changed", { phase: ctx.s.clock.phase, day: ctx.s.clock.day }, cause);
      return;
    }
    case "unit.move": {
      const unit = unitFor(ctx, cmd.unit);
      const to = tileFor(ctx, cmd.to);
      controllable(unit);
      const path = pathFor(ctx, unit, to);
      setJob(unit, { kind: "move", target: to, cause });
      setPath(unit, path);
      return;
    }
    case "unit.gather": {
      const unit = unitFor(ctx, cmd.unit);
      const tile = tileFor(ctx, cmd.at);
      controllable(unit);
      if (!isExplored(ctx.s, cmd.at[0], cmd.at[1]))
        refuse("PRECONDITION_FAILED", "that tile has not been seen");
      const node = nodeAt(ctx.s, tile);
      if (!node || node.amount === 0) refuse("INVALID_TARGET", "nothing to gather there");
      if (lookup(ctx.ix.units, unit.type, "unit type").carry === 0)
        refuse("PRECONDITION_FAILED", `${unit.id} cannot carry`);
      const yields = lookup(ctx.ix.nodes, node!.type, "node").yields;
      const deliverFirst = unit.carrying !== null && unit.carrying.resource !== yields;
      const path = deliverFirst ? [] : pathFor(ctx, unit, tile);
      setJob(unit, { kind: "gather", node: tile, stage: deliverFirst ? "to_depot" : "to_node", cause });
      setPath(unit, path);
      return;
    }
    case "unit.build": {
      const unit = unitFor(ctx, cmd.unit);
      controllable(unit);
      const site = buildingById(ctx.s, cmd.site) ?? refuse("INVALID_TARGET", `no site ${cmd.site}`);
      if (site.complete) refuse("PRECONDITION_FAILED", `${site.id} is already built`);
      const path = pathFor(ctx, unit, tileIndex(ctx.s, site.x, site.y));
      setJob(unit, { kind: "build", site: site.id, stage: "to_site", cause });
      setPath(unit, path);
      return;
    }
    case "unit.stop": {
      const unit = unitFor(ctx, cmd.unit);
      setJob(unit, null);
      return;
    }
    case "unit.assign": {
      const unit = unitFor(ctx, cmd.unit);
      if (unit.role !== "resident") refuse("PRECONDITION_FAILED", "only residents take workplaces");
      if (cmd.building === null) {
        setWorkplace(unit, null);
        return;
      }
      const building =
        buildingById(ctx.s, cmd.building) ?? refuse("INVALID_TARGET", `no building ${cmd.building}`);
      const slots = lookup(ctx.ix.buildings, building.type, "building").workers;
      if (!building.complete || slots === 0)
        refuse("PRECONDITION_FAILED", `${building.id} has no work places`);
      if (unit.workplace !== building.id && workersAt(ctx.s, building.id) >= slots) {
        refuse("PRECONDITION_FAILED", `${building.id} is full`);
      }
      setWorkplace(unit, building.id);
      return;
    }
    case "build.place": {
      const def =
        ctx.ix.buildings.get(cmd.building) ?? refuse("INVALID_TARGET", `no building type ${cmd.building}`);
      const tile = tileFor(ctx, cmd.at);
      const [x, y] = cmd.at;
      if (!isExplored(ctx.s, x, y)) refuse("PRECONDITION_FAILED", "that tile has not been seen");
      if (!ctx.ix.terrain[ctx.s.terrain[tile] ?? -1]?.buildable)
        refuse("PRECONDITION_FAILED", "cannot build on this ground");
      if (buildingAt(ctx.s, x, y)) refuse("PRECONDITION_FAILED", "something is already built here");
      if ((nodeAt(ctx.s, tile)?.amount ?? 0) > 0) refuse("PRECONDITION_FAILED", "clear the tile first");
      if (!takeStock(ctx.s, def.cost)) refuse("INSUFFICIENT_RESOURCE", "not enough materials");
      const site = placeBuilding(ctx, def.id, x, y, false, null);
      site.placedBy = emit(ctx, "site.placed", { building: site.id, type: def.id }, cause).id;
      return;
    }
  }
}
