// What the institutions have on file: the registry, the power bureau, the works office. Records
// are the town's beliefs about itself and can be wrong. This module is the only part of the world
// the Oracle may read (tests/architecture/oracle-boundary.test.ts): nothing here can reach the
// true state, and nothing here imports a module that can.
import type { CaseKind } from "../content/schema";

export interface BuildingRecord {
  id: string;
  /** The address is on the registry's map at all. */
  known: boolean;
  power: boolean;
  damaged: boolean;
  /** The day this entry last changed. */
  updated: number;
}

export interface ResidentRecord {
  id: string;
  /** The building the registry has them at, if any. */
  registered: string | null;
  updated: number;
}

/** A work order the bureau will carry out at dusk. */
export interface OrderRecord {
  id: string;
  kind: "connect" | "repair";
  building: string;
  case: string;
  /** The decision event that ordered it, so the outcome can point back to it. */
  event: number;
}

export interface RecordsState {
  /** Sorted by id. */
  buildings: BuildingRecord[];
  /** Sorted by id. */
  residents: ResidentRecord[];
  /** In the order they were made. */
  orders: OrderRecord[];
}

type DeepReadonly<T> = T extends (infer U)[]
  ? readonly DeepReadonly<U>[]
  : T extends object
    ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
    : T;

export type RecordsView = DeepReadonly<RecordsState>;

/** What a visitor asks for, as written on the application form. */
export interface CaseRequest {
  kind: CaseKind;
  applicant: string;
  building: string;
}

/**
 * Public ratings that never change in play: each district line's capacity, each building's rated
 * load and district. The bureau prints them on every bill; they are not news about the town.
 */
export interface Ratings {
  capacity: Readonly<Record<string, number>>;
  load: Readonly<Record<string, number>>;
  district: Readonly<Record<string, string>>;
}

export type ClaimField = "exists" | "power" | "damaged" | "occupied" | "line_full";

/** One thing a suggestion takes for granted about a building, as the records have it. */
export interface Claim {
  building: string;
  field: ClaimField;
  value: boolean;
}

/** Can this claim be settled by looking? By reading the original papers? */
export const CHECKABLE: Record<ClaimField, { sight: boolean; original: boolean }> = {
  exists: { sight: true, original: true },
  power: { sight: true, original: true },
  damaged: { sight: true, original: true },
  // Who lives there is not written anywhere you can trust; you have to go and see.
  occupied: { sight: true, original: false },
  // The line's load is on the substation's meter cards, not on the street.
  line_full: { sight: false, original: true },
};

export function buildingRecord(r: RecordsView, id: string): RecordsView["buildings"][number] | undefined {
  return r.buildings.find((b) => b.id === id);
}

export function registeredAt(r: RecordsView, building: string): string[] {
  return r.residents.filter((p) => p.registered === building).map((p) => p.id);
}

export function registrationOf(r: RecordsView, person: string): string | null {
  return r.residents.find((p) => p.id === person)?.registered ?? null;
}

/** Load on a district's line as the bureau's books have it: connected buildings plus ordered connections. */
export function bookedLoad(r: RecordsView, ratings: Ratings, district: string): number {
  let total = 0;
  for (const b of r.buildings) {
    if (b.power && ratings.district[b.id] === district) total += ratings.load[b.id] ?? 0;
  }
  for (const o of r.orders) {
    if (o.kind === "connect" && ratings.district[o.building] === district)
      total += ratings.load[o.building] ?? 0;
  }
  return total;
}

/** Would connecting `building` overload its line, by the books? */
export function lineFullOnBooks(r: RecordsView, ratings: Ratings, building: string): boolean {
  const district = ratings.district[building] ?? "";
  return bookedLoad(r, ratings, district) + (ratings.load[building] ?? 0) > (ratings.capacity[district] ?? 0);
}
