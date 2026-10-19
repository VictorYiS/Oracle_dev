// The command bus: schema → permission → version → targets and preconditions → execute.
// Every accepted command bumps the world version and is the cause of the events it produces.
import { decide, readOriginal } from "../world/cases";
import { heroThrough } from "../world/hero";
import { addPending, bumpVersion, type Ctx, emit, findBuilding, setRecord } from "../world/mutate";
import { observe } from "../world/observe";
import { ends } from "../world/places";
import { advanceTicks, nextPhase, ticksUntilDusk } from "../world/time";
import type { Cause } from "../world/types";
import { decisionProblem, readProblem, suggestionFor } from "../world/window";
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

const daytime = (ctx: Ctx, what: string) => {
  if (ctx.s.clock.phase !== "day") refuse("PRECONDITION_FAILED", `${what} only while the day runs`);
};

const problem = (p: { code: Rejection; reason: string } | null) => {
  if (p) refuse(p.code, p.reason);
};

function execute(ctx: Ctx, cmd: Command, cause: Cause): void {
  const { s, ix } = ctx;
  switch (cmd.type) {
    case "phase.advance": {
      if (!nextPhase(ctx)) refuse("PRECONDITION_FAILED", "the day runs until dusk");
      emit(ctx, "phase.changed", { phase: s.clock.phase, day: s.clock.day }, cause);
      return;
    }
    case "hero.walk": {
      const layer = ix.layers.get(s.hero.layer);
      const [lo, hi] = layer?.walk ?? [s.hero.x, s.hero.x];
      if (cmd.to < lo || cmd.to > hi)
        refuse("INVALID_TARGET", `x=${cmd.to} is off the walkable stretch [${lo}, ${hi}]`);
      daytime(ctx, "you can walk");
      s.hero.target = cmd.to === s.hero.x ? null : cmd.to;
      return;
    }
    case "hero.cross": {
      const p = ix.passages.get(cmd.passage) ?? refuse("INVALID_TARGET", `no passage ${cmd.passage}`);
      daytime(ctx, "you can go out");
      const end = ends(p, s.hero.layer);
      if (!end || Math.abs(end.here.x - s.hero.x) > ix.params.passage_reach)
        refuse("PRECONDITION_FAILED", `you are not at either end of ${p.id}`);
      // The way through takes its time; you are on the other side when it is over.
      s.hero.target = null;
      const minutes = heroThrough(ctx, p.id);
      observe(ctx, cause);
      advanceTicks(ctx, minutes);
      return;
    }
    case "hero.wait":
      daytime(ctx, "time passes");
      advanceTicks(ctx, Math.min(cmd.minutes, ticksUntilDusk(ctx)));
      return;
    case "case.decide":
      problem(decisionProblem(ctx, cmd.case, cmd.action));
      decide(ctx, cmd.case, cmd.action, "manual", cause);
      return;
    case "case.adopt": {
      const suggestion = suggestionFor(ctx, cmd.case) ?? refuse("INVALID_TARGET", `no case ${cmd.case}`);
      problem(decisionProblem(ctx, cmd.case, suggestion.action));
      const c = s.cases.find((k) => k.id === cmd.case)!;
      decide(ctx, cmd.case, suggestion.action, "oracle", cause);
      addPending(s, {
        case: c.id,
        type: c.type,
        building: c.building,
        reason: suggestion.reason,
        claims: suggestion.claims,
        day: s.clock.day,
        verdict: null,
        how: null,
        checked: null,
      });
      return;
    }
    case "pending.read":
      problem(readProblem(ctx, cmd.item));
      advanceTicks(ctx, Math.min(ix.params.original_minutes, ticksUntilDusk(ctx)));
      readOriginal(ctx, cmd.item, cause);
      return;
    case "debug.truth": {
      const b = findBuilding(s, cmd.building) ?? refuse("INVALID_TARGET", `no building ${cmd.building}`);
      if (cmd.power !== undefined) b.power = cmd.power;
      if (cmd.damaged !== undefined) b.damaged = cmd.damaged;
      emit(ctx, "truth.changed", { building: b.id }, cause);
      observe(ctx, cause);
      return;
    }
    case "debug.record":
      if (!findBuilding(s, cmd.building)) refuse("INVALID_TARGET", `no building ${cmd.building}`);
      setRecord(s, cmd.building, { known: cmd.known, power: cmd.power, damaged: cmd.damaged });
      emit(ctx, "record.changed", { building: cmd.building }, cause);
      return;
  }
}
