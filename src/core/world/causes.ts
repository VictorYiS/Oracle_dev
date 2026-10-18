// Follow an event's causes back to where it started: a command or a scheduled routine.
import type { Cause, EventView } from "./types";

/** The chain of causes behind `eventId`, nearest first, ending at a command or routine. */
export function traceCauses(events: readonly EventView[], eventId: number): Cause[] {
  const byId = new Map(events.map((e) => [e.id, e]));
  const chain: Cause[] = [];
  let current = byId.get(eventId);
  const seen = new Set<number>();
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    const cause = current.cause as Cause;
    chain.push(cause);
    if (!("event" in cause)) break;
    current = byId.get(cause.event);
  }
  return chain;
}
