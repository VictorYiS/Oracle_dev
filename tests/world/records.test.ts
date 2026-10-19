// P2 acceptance A2 ④: the institutions' records are kept apart from the truth, and the two can
// disagree: some disagreements come with the pack, others happen as the town lives (people move
// out without telling the registry).
import { describe, expect, it } from "vitest";
import { recordFacts, trueFacts } from "../../src/core/world/query";
import { registeredAt, registrationOf } from "../../src/core/world/records";
import { newGame, nextDay, packWith, startDay } from "../helpers/game";

describe("records and truth", () => {
  it("are stored apart: changing one leaves the other alone", () => {
    const g = newGame();
    startDay(g);
    const truthBefore = JSON.stringify(g.world.buildings);
    expect(g.submit({ type: "debug.record", building: "bld.eb_02", power: false, source: "debug" }).ok).toBe(
      true,
    );
    expect(JSON.stringify(g.world.buildings)).toBe(truthBefore);
    expect(recordFacts(g.world, "bld.eb_02").power).toBe(false);
    expect(trueFacts(g.world, "bld.eb_02").power).toBe(true);

    const recordsBefore = JSON.stringify(g.world.records);
    expect(g.submit({ type: "debug.truth", building: "bld.eb_05", power: true, source: "debug" }).ok).toBe(
      true,
    );
    expect(JSON.stringify(g.world.records)).toBe(recordsBefore);
  });

  it("disagree where the pack says they do", () => {
    const g = newGame();
    // On file: connected. In fact: cut off.
    expect(recordFacts(g.world, "bld.eb_07").power).toBe(true);
    expect(trueFacts(g.world, "bld.eb_07").power).toBe(false);
    // Not on the registry's map at all; two people live there.
    expect(recordFacts(g.world, "bld.eb_17b").exists).toBe(false);
    expect(trueFacts(g.world, "bld.eb_17b")).toMatchObject({ exists: true, occupied: true });
    // Damage nobody reported.
    expect(recordFacts(g.world, "bld.eb_12").damaged).toBe(false);
    expect(trueFacts(g.world, "bld.eb_12").damaged).toBe(true);
    // Someone registered where they no longer live.
    expect(registrationOf(g.world.records, "person.pavel")).toBe("bld.eb_04");
    expect(g.world.residents.find((r) => r.id === "person.pavel")!.home).toBe("bld.eb_11");
  });

  it("come apart as the town lives: a family moves out and the registry never hears", () => {
    const g = newGame();
    const dima = () => g.world.residents.find((r) => r.id === "person.dima")!;
    expect(dima().here).toBe(true);
    startDay(g);
    for (let day = 1; day < 5; day++) nextDay(g);
    expect(g.world.clock.day).toBe(5);
    expect(dima().here).toBe(false);
    expect(trueFacts(g.world, "bld.eb_09").occupied).toBe(false);
    expect(registeredAt(g.world.records, "bld.eb_09")).toEqual(["person.dima"]);
    expect(recordFacts(g.world, "bld.eb_09").occupied).toBe(true);
    const left = g.events.find((e) => e.kind === "person.left" && e.data.person === "person.dima");
    expect(left?.cause).toEqual({ routine: "dawn" });
  });

  it("change by decision at the window (registration), never by themselves", () => {
    const pack = packWith([{ path: "x.yaml", data: { params: { cases_per_day: [4, 4] } } }]);
    const g = newGame(2, pack);
    startDay(g);
    const before = JSON.stringify(g.world.records);
    g.advance(30);
    // Time passing, people walking: the records stay as they were.
    expect(JSON.stringify(g.world.records)).toBe(before);
  });
});
