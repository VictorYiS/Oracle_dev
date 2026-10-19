// Residents live by their routine: home at night, work by day, the market at noon, and the window
// when they have business there. They walk at their own pace and take passages like anyone else.
import type { Ctx } from "./mutate";
import { lookup } from "./pack-index";
import { crossingMinutes, ends, route, sceneOf, type Spot } from "./places";
import { queueSpot, spotOf } from "./query";
import type { ResidentState } from "./types";

/** Put a resident at their front door (dawn: everyone slept at home). */
export function placeAtHome(ctx: Ctx, r: ResidentState): void {
  const home = r.home ? spotOf(ctx.ix, r.home) : undefined;
  r.legs = [];
  r.going = null;
  if (!home) return;
  r.scene = sceneOf(ctx.ix, home.layer);
  r.layer = home.layer;
  r.x = home.x;
  r.going = "home";
}

/** Where a resident wants to be right now, and a key that changes when that does. */
function destination(ctx: Ctx, r: ResidentState): { key: string; spot: Spot } | null {
  if (r.visiting) return { key: `window:${r.visiting}`, spot: queueSpot(ctx, r.visiting) };
  const def = lookup(ctx.ix.residents, r.id, "resident");
  const steps = lookup(ctx.ix.routines, def.routine, "routine").steps;
  let go = steps[0]!.go;
  for (const step of steps) if (step.at <= ctx.s.clock.minute) go = step.go;
  const place = go === "home" ? r.home : go === "work" ? def.work : go;
  const spot = place ? spotOf(ctx.ix, place) : undefined;
  return spot ? { key: go, spot } : null;
}

function planTo(ctx: Ctx, r: ResidentState, to: Spot): void {
  const steps = route(ctx.ix, { layer: r.layer, x: r.x }, to);
  if (!steps) {
    // Nowhere to walk: they find their own way.
    r.scene = sceneOf(ctx.ix, to.layer);
    r.layer = to.layer;
    r.x = to.x;
    r.legs = [];
    return;
  }
  const speed = ctx.ix.params.resident_speed;
  r.legs = steps.map((s) =>
    "walk" in s
      ? { walk: s.walk }
      : { cross: s.cross, left: crossingMinutes(lookup(ctx.ix.passages, s.cross, "passage"), speed) },
  );
}

/** One game minute of everyone's day. */
export function tickResidents(ctx: Ctx): void {
  const speed = ctx.ix.params.resident_speed;
  for (const r of ctx.s.residents) {
    if (!r.here) continue;
    const want = destination(ctx, r);
    if (!want) continue;
    if (want.key !== r.going) {
      r.going = want.key;
      planTo(ctx, r, want.spot);
    } else if (r.legs.length === 0 && (r.layer !== want.spot.layer || r.x !== want.spot.x)) {
      planTo(ctx, r, want.spot); // the queue moved up
    }
    const leg = r.legs[0];
    if (!leg) continue;
    if ("walk" in leg) {
      const dx = leg.walk - r.x;
      r.x += Math.sign(dx) * Math.min(Math.abs(dx), speed);
      if (r.x === leg.walk) r.legs.shift();
    } else {
      leg.left--;
      if (leg.left <= 0) {
        const there = ends(lookup(ctx.ix.passages, leg.cross, "passage"), r.layer)?.there;
        if (there) {
          r.layer = there.layer;
          r.scene = sceneOf(ctx.ix, there.layer);
          r.x = there.x;
        }
        r.legs.shift();
      }
    }
  }
}
