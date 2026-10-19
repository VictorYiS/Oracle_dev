// The rules of the window, read-only: when a decision or a reading is allowed. The command bus
// refuses with these, and the desk greys out its buttons with the same answers, so the two never
// disagree.
import { suggest, type Suggestion } from "../oracle/suggest";
import type { CaseAction } from "./types";
import type { PackIndex } from "./pack-index";
import { atWindow, caseById, memoryOf } from "./query";
import { buildingRecord, CHECKABLE, lineFullOnBooks, registrationOf } from "./records";
import type { WorldView } from "./types";

type World = { s: WorldView; ix: PackIndex };

/**
 * The Oracle's suggestion for a case. This is where the Oracle's inputs are gathered: the records,
 * the public ratings and the request as filed. Nothing else is handed over.
 */
export function suggestionFor(w: World, id: string): Suggestion | null {
  const c = caseById(w.s, id);
  const type = c ? w.ix.cases.get(c.type) : undefined;
  if (!c || !type) return null;
  return suggest(
    w.s.records,
    w.ix.ratings,
    { kind: type.kind, applicant: c.applicant, building: c.building },
    type,
  );
}

export interface Problem {
  code: "INVALID_TARGET" | "PRECONDITION_FAILED" | "INSUFFICIENT_RESOURCE";
  reason: string;
}

/** Why the hero cannot work the window right now, or null. */
export function windowProblem(w: World): Problem | null {
  if (w.s.clock.phase !== "day")
    return { code: "PRECONDITION_FAILED", reason: "the window opens only in the daytime" };
  if (!atWindow(w)) return { code: "PRECONDITION_FAILED", reason: "you are not at the window" };
  return null;
}

/** Why `action` cannot be taken on case `id` right now, or null. */
export function decisionProblem(w: World, id: string, action: CaseAction): Problem | null {
  const c = caseById(w.s, id);
  if (!c) return { code: "INVALID_TARGET", reason: `no case ${id}` };
  const closed = windowProblem(w);
  if (closed) return closed;
  if (c.status !== "waiting")
    return { code: "PRECONDITION_FAILED", reason: `case ${id} is not waiting at the window` };
  if (action === "deny") return null;
  const type = w.ix.cases.get(c.type);
  const known = buildingRecord(w.s.records, c.building)?.known ?? false;
  if (!known && !memoryOf(w.s, c.building)) {
    return {
      code: "PRECONDITION_FAILED",
      reason: "the address is on no record, and you have not seen it yourself",
    };
  }
  switch (type?.kind) {
    case "connect":
      if (lineFullOnBooks(w.s.records, w.ix.ratings, c.building))
        return { code: "INSUFFICIENT_RESOURCE", reason: "the line is full on the bureau's books" };
      return null;
    case "repair": {
      const district = w.ix.districtOf.get(c.building) ?? "";
      if ((w.s.crews[district] ?? 0) >= (w.ix.districts.get(district)?.repair_crews ?? 0))
        return { code: "INSUFFICIENT_RESOURCE", reason: "no repair crew left today" };
      return null;
    }
    case "register":
      if (registrationOf(w.s.records, c.applicant) === c.building)
        return { code: "PRECONDITION_FAILED", reason: "already registered there" };
      return null;
    default:
      return { code: "INVALID_TARGET", reason: `unknown case type ${c.type}` };
  }
}

/** Why the original papers behind pending item `id` cannot be read now, or null. */
export function readProblem(w: World, id: number): Problem | null {
  const item = w.s.pending.items.find((p) => p.id === id);
  if (!item) return { code: "INVALID_TARGET", reason: `no pending item ${id}` };
  const closed = windowProblem(w);
  if (closed) return closed;
  if (item.verdict !== null) return { code: "PRECONDITION_FAILED", reason: "already checked" };
  if (!item.claims.every((c) => CHECKABLE[c.field].original)) {
    return { code: "PRECONDITION_FAILED", reason: "no paper says this; you have to go and look" };
  }
  return null;
}
