// The write interface of the true world state. It may be imported by src/core/world/** (the
// simulation's own systems) and src/core/commands/** (the command bus); nothing else.
// Enforced by eslint.config.js and tests/architecture/write-boundary.test.ts.
import { Rng } from "../random/prng";
import type { Ctx } from "./ctx";
import type { Facts } from "./facts";
import type { BuildingRecord, ResidentRecord } from "./records";
import type {
  BuildingState,
  CaseState,
  Cause,
  MemoryEntry,
  PendingItem,
  ResidentState,
  WorldEvent,
  WorldState,
} from "./types";

export type { Ctx };

export function emit(ctx: Ctx, kind: string, data: WorldEvent["data"], cause: Cause): WorldEvent {
  const event: WorldEvent = {
    id: ctx.s.nextEventId++,
    day: ctx.s.clock.day,
    tick: ctx.s.clock.tick,
    kind,
    data,
    cause,
  };
  ctx.log.push(event);
  return event;
}

export function withRng<T>(s: WorldState, fn: (rng: Rng) => T): T {
  const rng = Rng.fromState(s.rng);
  const result = fn(rng);
  s.rng = rng.state();
  return result;
}

export function bumpVersion(s: WorldState): void {
  s.version++;
}

export function newId(s: WorldState, prefix: string): string {
  return `${prefix}${s.nextId++}`;
}

// ---- finding things to change ------------------------------------------------------------------
// Read-only code uses the matching functions in ./query instead.

export function findBuilding(s: WorldState, id: string): BuildingState | undefined {
  return s.buildings.find((b) => b.id === id);
}

export function findResident(s: WorldState, id: string): ResidentState | undefined {
  return s.residents.find((r) => r.id === id);
}

export function findCase(s: WorldState, id: string): CaseState | undefined {
  return s.cases.find((c) => c.id === id);
}

export function findPending(s: WorldState, id: number): PendingItem | undefined {
  return s.pending.items.find((p) => p.id === id);
}

export function findRecord(s: WorldState, id: string): BuildingRecord | undefined {
  return s.records.buildings.find((b) => b.id === id);
}

export function findResidentRecord(s: WorldState, id: string): ResidentRecord | undefined {
  return s.records.residents.find((r) => r.id === id);
}

// ---- records -----------------------------------------------------------------------------------

/** Change a building's entry on file; stamps the day if anything changed. */
export function setRecord(
  s: WorldState,
  id: string,
  patch: Partial<Pick<BuildingRecord, "known" | "power" | "damaged">>,
): void {
  const r = findRecord(s, id);
  if (!r) return;
  let changed = false;
  for (const key of ["known", "power", "damaged"] as const) {
    const value = patch[key];
    if (value !== undefined && r[key] !== value) {
      r[key] = value;
      changed = true;
    }
  }
  if (changed) r.updated = s.clock.day;
}

export function setRegistration(s: WorldState, person: string, building: string | null): void {
  const r = findResidentRecord(s, person);
  if (!r || r.registered === building) return;
  r.registered = building;
  r.updated = s.clock.day;
}

// ---- memory -------------------------------------------------------------------------------------

/** Record what the player sees at a building today. Kept sorted by building. */
export function remember(s: WorldState, building: string, facts: Facts): void {
  const entry: MemoryEntry = {
    building,
    day: s.clock.day,
    power: facts.power,
    damaged: facts.damaged,
    occupied: facts.occupied,
  };
  const i = s.memory.findIndex((m) => m.building >= building);
  if (i >= 0 && s.memory[i]!.building === building) s.memory[i] = entry;
  else if (i >= 0) s.memory.splice(i, 0, entry);
  else s.memory.push(entry);
}

// ---- the pending tray ----------------------------------------------------------------------------

export function addPending(s: WorldState, item: Omit<PendingItem, "id">): PendingItem {
  const added: PendingItem = { id: s.pending.next++, ...item };
  s.pending.items.push(added);
  return added;
}

export function settlePending(
  s: WorldState,
  item: PendingItem,
  right: boolean,
  how: "sight" | "original",
): void {
  item.verdict = right ? "right" : "wrong";
  item.how = how;
  item.checked = s.clock.day;
}

export function markFired(s: WorldState, eventId: string): void {
  s.fired[eventId] = s.clock.day;
}
