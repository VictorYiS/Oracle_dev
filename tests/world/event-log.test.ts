// The in-memory event log stays bounded over a long session, keeps the newest events in order,
// and trimming it never changes the world (the log is not part of the state).
import { describe, expect, it } from "vitest";
import { EVENT_LOG_LIMIT, Game } from "../../src/core/game/game";
import { defaultPack } from "../helpers/game";

describe("event log", () => {
  it("is trimmed to the newest events once it grows past twice the limit", () => {
    const g = Game.create(defaultPack(), 42);
    // Exercise the real command/event path directly; simulating hundreds of days obscures
    // this boundary and makes the test depend on the machine's simulation throughput.
    const building = g.pack.buildings[0]!.id;
    while (g.events.length < 2 * EVENT_LOG_LIMIT - 1)
      expect(g.submit({ type: "debug.record", source: "debug", building, power: true }).ok).toBe(true);
    expect(g.events.length).toBe(2 * EVENT_LOG_LIMIT - 1);
    expect(g.submit({ type: "debug.record", source: "debug", building, power: false }).ok).toBe(true);
    expect(g.events.length).toBe(EVENT_LOG_LIMIT);
    for (let i = 0; i < 13; i++)
      expect(g.submit({ type: "debug.record", source: "debug", building, power: i % 2 === 0 }).ok).toBe(true);
    expect(g.world.nextEventId - 1).toBeGreaterThan(2 * EVENT_LOG_LIMIT);
    expect(g.events.length).toBeGreaterThanOrEqual(EVENT_LOG_LIMIT);
    expect(g.events.length).toBeLessThan(2 * EVENT_LOG_LIMIT);
    expect(g.events.at(-1)!.id).toBe(g.world.nextEventId - 1);
    const ids = g.events.map((e) => e.id);
    expect(ids).toEqual(ids.map((_, i) => ids[0]! + i));
  });
});
