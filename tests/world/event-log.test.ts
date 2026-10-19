// The in-memory event log stays bounded over a long session, keeps the newest events in order,
// and trimming it never changes the world (the log is not part of the state).
import { describe, expect, it } from "vitest";
import { EVENT_LOG_LIMIT, Game } from "../../src/core/game/game";
import { playBot } from "../../tools/lib/bot";
import { defaultPack } from "../helpers/game";

describe("event log", () => {
  it("is trimmed to the newest events once it grows past twice the limit", () => {
    const g = Game.create(defaultPack(), 42);
    playBot(g, 700); // several events a day, for long enough to pass 2 × the limit
    expect(g.world.nextEventId - 1).toBeGreaterThan(2 * EVENT_LOG_LIMIT);
    expect(g.events.length).toBeGreaterThanOrEqual(EVENT_LOG_LIMIT);
    expect(g.events.length).toBeLessThan(2 * EVENT_LOG_LIMIT);
    expect(g.events.at(-1)!.id).toBe(g.world.nextEventId - 1);
    const ids = g.events.map((e) => e.id);
    expect(ids).toEqual(ids.map((_, i) => ids[0]! + i));
  });
});
