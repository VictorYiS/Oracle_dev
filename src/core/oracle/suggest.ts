// The Oracle's suggestion for a case at the window: a one-line summary and an action. Offline and
// deterministic: templates from the scenario pack, reasoning over the records only. It can read
// nothing else: its inputs are the records, the public ratings and the request as filed, and
// tests/architecture/oracle-boundary.test.ts keeps every other part of the world out of reach.
// So when the records are wrong, the suggestion is wrong.
import type { CaseType, OracleReason } from "../content/schema";
import {
  buildingRecord,
  type CaseRequest,
  type Claim,
  lineFullOnBooks,
  type Ratings,
  type RecordsView,
  registeredAt,
  registrationOf,
} from "../world/records";

export interface Suggestion {
  action: "approve" | "deny";
  reason: OracleReason;
  /** The summary template (a pack text key), filled in by the interface. */
  text: string;
  /** What the suggestion takes for granted. Adopting it puts these on the pending tray. */
  claims: Claim[];
}

export function suggest(
  records: RecordsView,
  ratings: Ratings,
  request: CaseRequest,
  type: CaseType,
): Suggestion {
  const building = request.building;
  const rec = buildingRecord(records, building);
  const claim = (field: Claim["field"], value: boolean): Claim => ({ building, field, value });
  const say = (action: Suggestion["action"], reason: OracleReason, claims: Claim[]): Suggestion => ({
    action,
    reason,
    text: (type.oracle as Record<string, string>)[reason] ?? "",
    claims,
  });

  if (!rec?.known) return say("deny", "unknown_address", [claim("exists", false)]);
  switch (type.kind) {
    case "connect":
      if (rec.power) return say("deny", "already_powered", [claim("power", true)]);
      if (rec.damaged) return say("deny", "damaged", [claim("damaged", true)]);
      if (registeredAt(records, building).length === 0)
        return say("deny", "empty", [claim("occupied", false)]);
      if (lineFullOnBooks(records, ratings, building))
        return say("deny", "no_capacity", [claim("line_full", true)]);
      return say("approve", "ok", [claim("power", false), claim("damaged", false), claim("occupied", true)]);
    case "register":
      if (registrationOf(records, request.applicant) === building)
        return say("deny", "already_registered", [claim("occupied", true)]);
      return say("approve", "ok", [claim("exists", true), claim("occupied", true)]);
    case "repair":
      if (!rec.damaged) return say("deny", "no_damage_on_file", [claim("damaged", false)]);
      return say("approve", "ok", [claim("damaged", true)]);
  }
}
