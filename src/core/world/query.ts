// Read-only questions about a world: the truth, the records and the player's memory. Safe to use
// from anywhere outside the Oracle (which may only read ./records): everything here takes and
// returns read-only views. Code that needs to change what it finds uses the find* helpers in ./mutate.
import { type Facts, visualState, type VisualState } from "./facts";
import type { PackIndex } from "./pack-index";
import { sceneOf, type Spot } from "./places";
import { buildingRecord, registeredAt } from "./records";
import type { WorldView } from "./types";

type World = { s: WorldView; ix: PackIndex };
export type BuildingView = WorldView["buildings"][number];
export type ResidentView = WorldView["residents"][number];
export type CaseView = WorldView["cases"][number];
export type MemoryView = WorldView["memory"][number];
export type PendingView = WorldView["pending"]["items"][number];

export function buildingById(s: WorldView, id: string): BuildingView | undefined {
  return s.buildings.find((b) => b.id === id);
}

export function residentById(s: WorldView, id: string): ResidentView | undefined {
  return s.residents.find((r) => r.id === id);
}

export function caseById(s: WorldView, id: string): CaseView | undefined {
  return s.cases.find((c) => c.id === id);
}

/** Who really lives in a building: residents in town whose home it is, by id. */
export function occupants(s: WorldView, building: string): string[] {
  return s.residents.filter((r) => r.here && r.home === building).map((r) => r.id);
}

export function trueFacts(s: WorldView, building: string): Facts {
  const b = buildingById(s, building);
  return {
    exists: Boolean(b),
    power: b?.power ?? false,
    damaged: b?.damaged ?? false,
    occupied: occupants(s, building).length > 0,
  };
}

/** The building as the institutions have it on file: what the Oracle draws. */
export function recordFacts(s: WorldView, building: string): Facts {
  const r = buildingRecord(s.records, building);
  return {
    exists: r?.known ?? false,
    power: r?.power ?? false,
    damaged: r?.damaged ?? false,
    occupied: registeredAt(s.records, building).length > 0,
  };
}

export function memoryOf(s: WorldView, building: string): MemoryView | undefined {
  return s.memory.find((m) => m.building === building);
}

export function memoryFacts(m: MemoryView): Facts {
  return { exists: true, power: m.power, damaged: m.damaged, occupied: m.occupied };
}

/** Is someone standing at `at` close enough to see `building`? */
export function isNear(ix: PackIndex, at: Spot, building: string): boolean {
  const b = ix.buildings.get(building);
  if (!b || b.layer !== at.layer) return false;
  return Math.abs(at.x - (b.x + b.width / 2)) <= b.width / 2 + ix.params.presence_reach;
}

/** Buildings the hero can see from where they stand, by id. */
export function nearHero(w: World): string[] {
  const row = w.ix.rows.get(w.s.hero.layer) ?? [];
  return row
    .filter((b) => isNear(w.ix, w.s.hero, b.id))
    .map((b) => b.id)
    .sort();
}

/**
 * How old the player's picture of a building is: 0 while they are there, 1 for earlier today,
 * 2 for a day or two ago, 3 for older. Null if they have never seen it.
 */
export function memoryAge(s: WorldView, building: string): number | null {
  const m = memoryOf(s, building);
  if (!m) return null;
  if (s.hero.near.includes(building)) return 0;
  return Math.min(3, 1 + s.clock.day - m.day);
}

/** What the player is shown at a building: their memory if they have one, else the records. */
export function shownState(s: WorldView, building: string): { style: "ink" | "oracle"; state: VisualState } {
  const m = memoryOf(s, building);
  return m
    ? { style: "ink", state: visualState(memoryFacts(m)) }
    : { style: "oracle", state: visualState(recordFacts(s, building)) };
}

export const windowOpen = (s: WorldView): boolean => s.clock.phase === "day";

/** Is the hero standing at the window? */
export function atWindow(w: World): boolean {
  const win = w.ix.window;
  return w.s.hero.layer === win.layer && Math.abs(w.s.hero.x - win.x) <= win.reach;
}

/** Cases at the window now, in the order the visitors arrived. */
export function waitingCases(s: WorldView): CaseView[] {
  return s.cases.filter((c) => c.status === "waiting");
}

/** Cases not yet settled: on their way, waiting, or approved and waiting for the crews at dusk. */
export function openCases(s: WorldView): CaseView[] {
  return s.cases.filter(
    (c) =>
      c.status === "scheduled" || c.status === "waiting" || s.records.orders.some((o) => o.case === c.id),
  );
}

/** Real load on a district's line. */
export function trueLoad(w: World, district: string): number {
  let total = 0;
  for (const b of w.s.buildings) {
    if (b.power && w.ix.districtOf.get(b.id) === district) total += w.ix.buildings.get(b.id)?.load ?? 0;
  }
  return total;
}

/** Where a place is: a building's front, a spot, or the window. */
export function spotOf(ix: PackIndex, place: string): Spot | undefined {
  const b = ix.buildings.get(place);
  if (b) return { layer: b.layer, x: b.x + Math.floor(b.width / 2) };
  const spot = ix.spots.get(place);
  if (spot) return { layer: spot.layer, x: spot.x };
  return undefined;
}

/** Where a visitor stands in the queue: their place among those at or heading for the window. */
export function queueSpot(w: World, caseId: string): Spot {
  const win = w.ix.window;
  const line = w.s.cases.filter(
    (c) =>
      c.status === "waiting" || (c.status === "scheduled" && w.s.residents.some((r) => r.visiting === c.id)),
  );
  const i = Math.max(
    0,
    line.findIndex((c) => c.id === caseId),
  );
  return { layer: win.layer, x: win.queue.x + i * win.queue.gap };
}

export const heroScene = (w: World): string => sceneOf(w.ix, w.s.hero.layer);
