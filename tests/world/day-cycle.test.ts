// P1 acceptance A8: the five phases of a day.
import { describe, expect, it } from "vitest";
import { eventsOf, newGame } from "../helpers/world";

describe("day cycle", () => {
  it("starts at dawn of day 1, at the pack's day start, at tick 0", () => {
    const g = newGame();
    expect(g.world.clock).toEqual({
      day: 1,
      phase: "dawn",
      minute: g.pack.calendar.day_start_minute,
      tick: 0,
    });
  });

  it("does not move time at dawn or while planning", () => {
    const g = newGame();
    expect(g.advance(100)).toBe(0);
    g.submit({ type: "phase.advance" });
    expect(g.world.clock.phase).toBe("planning");
    expect(g.advance(100)).toBe(0);
    expect(g.world.clock.tick).toBe(0);
  });

  it("moves time during the day, one tick per game minute", () => {
    const g = newGame();
    g.submit({ type: "phase.advance" });
    g.submit({ type: "phase.advance" });
    expect(g.world.clock.phase).toBe("day");
    expect(g.advance(60)).toBe(60);
    expect(g.world.clock.tick).toBe(60);
    expect(g.world.clock.minute).toBe(g.pack.calendar.day_start_minute + 60);
  });

  it("stops at dusk and settles exactly once", () => {
    const g = newGame();
    g.submit({ type: "phase.advance" });
    g.submit({ type: "phase.advance" });
    const dayLength = g.pack.calendar.dusk_minute - g.pack.calendar.day_start_minute;
    expect(g.advance(100_000)).toBe(dayLength);
    expect(g.world.clock.phase).toBe("dusk");
    expect(g.world.clock.minute).toBe(g.pack.calendar.dusk_minute);
    expect(g.advance(100)).toBe(0);
    expect(eventsOf(g, "day.settled")).toHaveLength(1);
  });

  it("refuses to end the day early", () => {
    const g = newGame();
    g.submit({ type: "phase.advance" });
    g.submit({ type: "phase.advance" });
    const r = g.submit({ type: "phase.advance" });
    expect(r).toMatchObject({ ok: false, code: "PRECONDITION_FAILED" });
  });

  it("goes from dusk through night to the next dawn", () => {
    const g = newGame();
    for (let day = 1; day <= 3; day++) {
      g.submit({ type: "phase.advance" }); // planning
      g.submit({ type: "phase.advance" }); // day
      g.advance(100_000); // dusk
      g.submit({ type: "phase.advance" }); // night
      expect(g.world.clock.phase).toBe("night");
      expect(g.advance(50)).toBe(0);
      g.submit({ type: "phase.advance" }); // next dawn
      expect(g.world.clock).toMatchObject({
        day: day + 1,
        phase: "dawn",
        minute: g.pack.calendar.day_start_minute,
      });
    }
    expect(eventsOf(g, "day.settled")).toHaveLength(3);
    expect(g.dailyHashes.map((h) => h.day)).toEqual([1, 2, 3]);
  });
});
