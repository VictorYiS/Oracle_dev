// Things the hero can use where they stand: the window, a passage, a notice. Read-only.
import type { PackIndex } from "../../core/world/pack-index";
import { ends } from "../../core/world/places";
import type { WorldView } from "../../core/world/types";

export interface Usable {
  kind: "window" | "passage" | "prop";
  id: string;
  x: number;
  /** How close you must be to use it. */
  reach: number;
}

const PROP_REACH = 70;

export function usablesOn(w: WorldView, ix: PackIndex, layer: string): Usable[] {
  const out: Usable[] = [];
  if (ix.window.layer === layer)
    out.push({ kind: "window", id: "window", x: ix.window.x, reach: ix.window.reach });
  for (const p of ix.passagesAt.get(layer) ?? []) {
    out.push({ kind: "passage", id: p.id, x: ends(p, layer)!.here.x, reach: ix.params.passage_reach });
  }
  for (const prop of ix.pack.props) {
    if (prop.layer === layer && prop.text)
      out.push({ kind: "prop", id: prop.id, x: prop.x, reach: PROP_REACH });
  }
  return out;
}

/** The nearest usable thing within `slack` of being in reach (0: only what is in reach now). */
export function nearestUsable(w: WorldView, ix: PackIndex, slack = 0): (Usable & { dist: number }) | null {
  let best: (Usable & { dist: number }) | null = null;
  for (const u of usablesOn(w, ix, w.hero.layer)) {
    const dist = Math.abs(u.x - w.hero.x);
    if (dist > u.reach + slack) continue;
    if (!best || dist - u.reach < best.dist - best.reach) best = { ...u, dist };
  }
  return best;
}
