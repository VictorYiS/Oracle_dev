// The clock: ticks only pass during the day; the other phases wait for the player.
import { tickCases } from "./cases";
import { tickHero } from "./hero";
import type { Ctx } from "./mutate";
import { observe } from "./observe";
import { tickResidents } from "./residents";
import { dawn, dusk } from "./routines";
import type { Cause } from "./types";

const DAY: Cause = { routine: "day" };

/** Run up to `n` day ticks. Stops early at dusk. Returns the ticks actually run. */
export function advanceTicks(ctx: Ctx, n: number): number {
  let done = 0;
  while (done < n && ctx.s.clock.phase === "day") {
    tickResidents(ctx);
    tickCases(ctx);
    tickHero(ctx);
    ctx.s.clock.minute++;
    ctx.s.clock.tick++;
    done++;
    observe(ctx, DAY);
    if (ctx.s.clock.minute >= ctx.ix.dusk) {
      ctx.s.clock.phase = "dusk";
      dusk(ctx);
    }
  }
  return done;
}

/** Ticks left before dusk (0 outside the day phase). */
export function ticksUntilDusk(ctx: Pick<Ctx, "s" | "ix">): number {
  return ctx.s.clock.phase === "day" ? ctx.ix.dusk - ctx.s.clock.minute : 0;
}

/** dawn → planning → day; dusk → night → next dawn. Returns false during the day. */
export function nextPhase(ctx: Ctx): boolean {
  const clock = ctx.s.clock;
  switch (clock.phase) {
    case "dawn":
      clock.phase = "planning";
      return true;
    case "planning":
      clock.phase = "day";
      return true;
    case "dusk":
      clock.phase = "night";
      return true;
    case "night":
      clock.day++;
      clock.minute = ctx.ix.dayStart;
      clock.phase = "dawn";
      dawn(ctx);
      return true;
    case "day":
      return false;
  }
}
