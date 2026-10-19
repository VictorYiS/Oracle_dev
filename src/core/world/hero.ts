// The player's own feet: walking along a layer takes game minutes, a passage takes its length.
import type { Ctx } from "./mutate";
import { lookup } from "./pack-index";
import { crossingMinutes, ends, sceneOf } from "./places";

/** One game minute of walking toward the hero's target. */
export function tickHero(ctx: Ctx): void {
  const h = ctx.s.hero;
  if (h.target === null) return;
  const dx = h.target - h.x;
  h.x += Math.sign(dx) * Math.min(Math.abs(dx), ctx.ix.params.hero_speed);
  if (h.x === h.target) h.target = null;
}

/** Morning: the Interpreter starts the day at the window. */
export function heroToStart(ctx: Ctx): void {
  const start = ctx.ix.pack.start.hero;
  ctx.s.hero.scene = sceneOf(ctx.ix, start.layer);
  ctx.s.hero.layer = start.layer;
  ctx.s.hero.x = start.x;
  ctx.s.hero.target = null;
}

/** Step through a passage to its other end. Returns the game minutes it took. */
export function heroThrough(ctx: Ctx, passage: string): number {
  const p = lookup(ctx.ix.passages, passage, "passage");
  const there = ends(p, ctx.s.hero.layer)!.there;
  ctx.s.hero.layer = there.layer;
  ctx.s.hero.scene = sceneOf(ctx.ix, there.layer);
  ctx.s.hero.x = there.x;
  ctx.s.hero.target = null;
  return crossingMinutes(p, ctx.ix.params.hero_speed);
}
