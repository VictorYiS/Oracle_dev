// P1 acceptance A8: the five phases of a day. (P2: the window is open only in the daytime.)
import { describe, expect, it } from "vitest";
import { eventsOf, newGame, packWith, startDay } from "../helpers/game";

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

  it("does not move time at dawn or in the morning", () => {
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

  it("settles once even when a command that takes time runs into dusk", () => {
    const g = newGame();
    startDay(g);
    g.advance(g.pack.calendar.dusk_minute - g.pack.calendar.day_start_minute - 5);
    expect(g.submit({ type: "hero.wait", minutes: 60 }).ok).toBe(true);
    expect(g.world.clock.phase).toBe("dusk");
    expect(eventsOf(g, "day.settled")).toHaveLength(1);
    expect(g.dailyHashes.map((h) => h.day)).toEqual([1]);
  });

  it("goes from dusk through night to the next dawn", () => {
    const g = newGame();
    for (let day = 1; day <= 3; day++) {
      g.submit({ type: "phase.advance" }); // morning
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

  it("opens the window only in the daytime", () => {
    const g = newGame(1, packWith([{ path: "all.yaml", data: { params: { cases_per_day: [20, 20] } } }]));
    const c = g.world.cases[0]!;
    // Dawn and morning: nobody can be helped yet.
    expect(g.submit({ type: "case.decide", case: c.id, action: "deny" })).toMatchObject({
      ok: false,
      code: "PRECONDITION_FAILED",
      reason: "the window opens only in the daytime",
    });
    startDay(g);
    for (let i = 0; i < 900 && g.world.cases.find((k) => k.id === c.id)!.status !== "waiting"; i++)
      g.advance(1);
    expect(g.submit({ type: "case.decide", case: c.id, action: "deny" }).ok).toBe(true);
    // At dusk the window shuts and whoever is still waiting goes home.
    g.advance(100_000);
    expect(g.world.cases.filter((k) => k.status === "waiting")).toEqual([]);
    const other = g.world.cases.find((k) => k.status === "expired")!;
    expect(g.submit({ type: "case.decide", case: other.id, action: "deny" })).toMatchObject({
      ok: false,
      code: "PRECONDITION_FAILED",
    });
  });
});
