// Seeing with your own eyes. Whenever the hero stands near a building, the player's memory of it
// is refreshed from the truth; when they walk away it stays as it was, however the town changes.
// Arriving somewhere that is not as remembered (or not as the records said) is news, and so is
// a pending check that this sight settles.
import { differences, type Facts } from "./facts";
import { type Ctx, emit, remember, settlePending } from "./mutate";
import { memoryFacts, memoryOf, nearHero, recordFacts, trueFacts } from "./query";
import { CHECKABLE, type Claim } from "./records";
import type { Cause, WorldState } from "./types";

/** Does a claim hold, given the truth about its building (and the line, for line_full)? */
export function claimHolds(claim: Claim, truth: Facts, lineFull: boolean): boolean {
  switch (claim.field) {
    case "exists":
      return truth.exists === claim.value;
    case "power":
      return truth.power === claim.value;
    case "damaged":
      return truth.damaged === claim.value;
    case "occupied":
      return truth.occupied === claim.value;
    case "line_full":
      return lineFull === claim.value;
  }
}

function factsData(prefix: string, f: Facts): Record<string, boolean> {
  return {
    [`${prefix}_power`]: f.power,
    [`${prefix}_damaged`]: f.damaged,
    [`${prefix}_occupied`]: f.occupied,
  };
}

/** Settle every open check whose claims are all about `building` and can all be seen. */
function checkBySight(ctx: Ctx, building: string, truth: Facts, cause: Cause): void {
  for (const item of ctx.s.pending.items) {
    if (item.verdict !== null || item.claims.length === 0) continue;
    if (!item.claims.every((c) => c.building === building && CHECKABLE[c.field].sight)) continue;
    settlePending(
      ctx.s,
      item,
      item.claims.every((c) => claimHolds(c, truth, false)),
      "sight",
    );
    emit(
      ctx,
      "pending.checked",
      { item: item.id, case: item.case, building, verdict: item.verdict, how: "sight" },
      cause,
    );
  }
}

/** Look around: call after anything that may move the hero or change what is in front of them. */
export function observe(ctx: Ctx, cause: Cause): void {
  const s: WorldState = ctx.s;
  const before = new Set(s.hero.near);
  const now = nearHero(ctx);
  for (const building of now) {
    const truth = trueFacts(s, building);
    const entry = memoryOf(s, building);
    if (!before.has(building)) {
      if (!entry) {
        // First time here: what the Oracle showed was the records.
        const shown = recordFacts(s, building);
        const changed = differences(shown, truth);
        if (!shown.exists || changed.length > 0) {
          emit(
            ctx,
            "memory.seen",
            { building, unknown: !shown.exists, ...factsData("was", shown), ...factsData("now", truth) },
            cause,
          );
        }
      } else {
        const remembered = memoryFacts(entry);
        if (differences(remembered, truth).length > 0) {
          emit(
            ctx,
            "memory.changed",
            {
              building,
              days: s.clock.day - entry.day,
              ...factsData("was", remembered),
              ...factsData("now", truth),
            },
            cause,
          );
        }
      }
    }
    remember(s, building, truth);
    checkBySight(ctx, building, truth, cause);
  }
  s.hero.near = now;
}
