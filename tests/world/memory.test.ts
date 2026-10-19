// P2 acceptance A7 (unit part): unseen, present, remembered. What the player is shown at a building
// is the records until they have seen it; while they stand there it is the truth; after they leave
// it is their memory, which fades with age and never updates by itself; coming back redraws it and
// says what changed.
import { describe, expect, it } from "vitest";
import { memoryAge, memoryOf, shownState } from "../../src/core/world/query";
import { eventsOf, newGame, nextDay, startDay, visit, walk } from "../helpers/game";

const SEVEN = "bld.eb_07"; // on file: lit; in fact: dark, two people inside by candlelight

describe("the player's memory", () => {
  it("unseen: the records are what is shown, and change with them", () => {
    const g = newGame();
    expect(shownState(g.world, SEVEN)).toEqual({ style: "oracle", state: "powered" });
    expect(memoryOf(g.world, SEVEN)).toBeUndefined();
    expect(memoryAge(g.world, SEVEN)).toBeNull();
    g.submit({ type: "debug.record", building: SEVEN, power: false, source: "debug" });
    expect(shownState(g.world, SEVEN)).toEqual({ style: "oracle", state: "candle" });
  });

  it("present: the truth, as it is now", () => {
    const g = newGame();
    startDay(g);
    visit(g, SEVEN);
    expect(shownState(g.world, SEVEN)).toEqual({ style: "ink", state: "candle" });
    expect(memoryAge(g.world, SEVEN)).toBe(0);
    expect(memoryOf(g.world, SEVEN)).toMatchObject({ day: 1, power: false, occupied: true });
    // The first look says how it differs from what the Oracle showed.
    expect(eventsOf(g, "memory.seen").find((e) => e.data.building === SEVEN)?.data).toMatchObject({
      was_power: true,
      now_power: false,
    });
  });

  it("remembered: does not follow the world, and grows older by the day", () => {
    const g = newGame();
    startDay(g);
    visit(g, SEVEN);
    walk(g, 3400); // away down the far bank
    expect(memoryAge(g.world, SEVEN)).toBe(1);
    g.submit({ type: "debug.truth", building: SEVEN, power: true, source: "debug" });
    expect(shownState(g.world, SEVEN)).toEqual({ style: "ink", state: "candle" });
    expect(memoryOf(g.world, SEVEN)!.day).toBe(1);
    nextDay(g);
    expect(memoryAge(g.world, SEVEN)).toBe(2);
    nextDay(g);
    expect(memoryAge(g.world, SEVEN)).toBe(3);
    nextDay(g);
    expect(memoryAge(g.world, SEVEN)).toBe(3); // three steps: today, a day or two, older
    expect(memoryOf(g.world, SEVEN)!.day).toBe(1);
  });

  it("revisited: redrawn from the truth, dated today, and the difference is news", () => {
    const g = newGame();
    startDay(g);
    visit(g, SEVEN);
    walk(g, 3400);
    g.submit({ type: "debug.truth", building: SEVEN, power: true, source: "debug" });
    nextDay(g);
    nextDay(g);
    expect(eventsOf(g, "memory.changed")).toEqual([]);
    visit(g, SEVEN);
    expect(shownState(g.world, SEVEN)).toEqual({ style: "ink", state: "powered" });
    expect(memoryOf(g.world, SEVEN)!.day).toBe(3);
    const changed = eventsOf(g, "memory.changed").find((e) => e.data.building === SEVEN)!;
    expect(changed.data).toMatchObject({ days: 2, was_power: false, now_power: true });
  });

  it("is part of the state: it changes the world's hash", () => {
    const a = newGame();
    const b = newGame();
    startDay(a);
    startDay(b);
    visit(a, SEVEN);
    visit(b, SEVEN);
    expect(a.hash()).toBe(b.hash());
    // Same place, same time, but one of them has seen another house on the way.
    const c = newGame();
    startDay(c);
    visit(c, "bld.eb_12");
    visit(c, SEVEN);
    expect(c.world.memory.length).toBeGreaterThan(a.world.memory.length);
  });
});
