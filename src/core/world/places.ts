// The place graph: layers joined by passages. Read-only and pure: routes are computed from the
// pack alone, the same way on every platform (Dijkstra with fixed tie-breaks).
import type { Passage } from "../content/schema";
import type { PackIndex } from "./pack-index";

export interface Spot {
  layer: string;
  x: number;
}

export type Step = { walk: number } | { cross: string };

/** The end of `p` on `layer`, and the end on the other side. */
export function ends(p: Passage, layer: string): { here: Spot; there: Spot } | null {
  if (p.from.layer === layer) return { here: p.from, there: p.to };
  if (p.to.layer === layer) return { here: p.to, there: p.from };
  return null;
}

/** Game minutes it takes someone walking `speed` units a minute to get through a passage. */
export function crossingMinutes(p: Passage, speed: number): number {
  return Math.max(1, Math.ceil(p.length / speed));
}

export function sceneOf(ix: PackIndex, layer: string): string {
  return ix.layers.get(layer)?.scene ?? "";
}

/** The passage end on `at.layer` within `reach` of `at.x`, nearest first (ties by passage order). */
export function passageNear(ix: PackIndex, at: Spot, reach: number): Passage | undefined {
  let best: Passage | undefined;
  let bestD = Infinity;
  for (const p of ix.passagesAt.get(at.layer) ?? []) {
    const e = ends(p, at.layer)!;
    const d = Math.abs(e.here.x - at.x);
    if (d <= reach && d < bestD) [best, bestD] = [p, d];
  }
  return best;
}

interface Node {
  key: string;
  layer: string;
  x: number;
  passage: Passage;
  /** The node at the other end of the passage. */
  other: string;
}

/** The steps from `from` to `to`, shortest by distance walked (passage lengths included); null if there is no way. */
export function route(ix: PackIndex, from: Spot, to: Spot): Step[] | null {
  const nodes: Node[] = [];
  for (const p of ix.passages.values()) {
    nodes.push({ key: `${p.id}>`, layer: p.from.layer, x: p.from.x, passage: p, other: `${p.id}<` });
    nodes.push({ key: `${p.id}<`, layer: p.to.layer, x: p.to.x, passage: p, other: `${p.id}>` });
  }
  const index = new Map(nodes.map((n, i) => [n.key, i]));
  const dist = new Array<number>(nodes.length).fill(Infinity);
  // How each node was reached: walking from the start or from another node, or through its passage.
  const prev = new Array<{ from: number; cross: boolean } | null>(nodes.length).fill(null);
  const done = new Array<boolean>(nodes.length).fill(false);
  let goal = from.layer === to.layer ? Math.abs(from.x - to.x) : Infinity;
  let goalFrom = -1; // -1: straight from the start

  nodes.forEach((n, i) => {
    if (n.layer === from.layer) {
      dist[i] = Math.abs(n.x - from.x);
      prev[i] = { from: -1, cross: false };
    }
  });
  for (;;) {
    let cur = -1;
    for (let i = 0; i < nodes.length; i++) {
      if (!done[i] && dist[i]! < Infinity && (cur < 0 || dist[i]! < dist[cur]!)) cur = i;
    }
    if (cur < 0 || dist[cur]! >= goal) break;
    done[cur] = true;
    const n = nodes[cur]!;
    const d = dist[cur]!;
    if (n.layer === to.layer && d + Math.abs(n.x - to.x) < goal) {
      goal = d + Math.abs(n.x - to.x);
      goalFrom = cur;
    }
    const relax = (j: number, cost: number, cross: boolean) => {
      if (!done[j] && cost < dist[j]!) {
        dist[j] = cost;
        prev[j] = { from: cur, cross };
      }
    };
    relax(index.get(n.other)!, d + n.passage.length, true);
    nodes.forEach((m, j) => {
      if (j !== cur && m.layer === n.layer) relax(j, d + Math.abs(m.x - n.x), false);
    });
  }
  if (goal === Infinity) return null;

  // Back from the goal: a node reached through its passage is a crossing; one reached on foot, a walk.
  const steps: Step[] = [{ walk: to.x }];
  for (let i = goalFrom; i >= 0; i = prev[i]!.from) {
    steps.push(prev[i]!.cross ? { cross: nodes[i]!.passage.id } : { walk: nodes[i]!.x });
  }
  steps.reverse();
  // Drop walks that go nowhere.
  const out: Step[] = [];
  let at: Spot = from;
  for (const s of steps) {
    if ("walk" in s) {
      if (s.walk === at.x) continue;
      at = { layer: at.layer, x: s.walk };
    } else {
      at = ends(ix.passages.get(s.cross)!, at.layer)!.there;
    }
    out.push(s);
  }
  return out;
}
