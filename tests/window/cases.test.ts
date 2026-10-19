// P2 acceptance A10: three kinds of case (connection, registration, repair). Each grows out of the
// world, changes the world through the command bus when decided, is refused with a structured
// reason when the decision is not allowed, and comes with papers that say where they came from and when.
import { describe, expect, it } from "vitest";
import type { Game } from "../../src/core/game/game";
import { registrationOf } from "../../src/core/world/records";
import { en } from "../../src/ui/i18n/en";
import { papersFor } from "../../src/ui/game/papers";
import { newGame, nextDay, packWith, startDay, toWindow, visit } from "../helpers/game";

/** Every candidate becomes a visitor, so the tests can see exactly what the world asks for. */
const everyone = () => packWith([{ path: "all.yaml", data: { params: { cases_per_day: [20, 20] } } }]);

const kindOf = (g: Game, type: string) => g.ix.cases.get(type)!.kind;
const filed = (g: Game, kind: string) =>
  g.world.cases.filter((c) => c.day === g.world.clock.day && kindOf(g, c.type) === kind);

/** Run the clock until this case's visitor is at the window. */
function waitFor(g: Game, id: string): void {
  for (let i = 0; i < 900 && g.world.cases.find((c) => c.id === id)?.status !== "waiting"; i++) g.advance(1);
  expect(g.world.cases.find((c) => c.id === id)?.status).toBe("waiting");
}

describe("connection to the grid", () => {
  it("is asked for by people living without power, and stops when they have it", () => {
    const g = newGame(1, everyone());
    expect(
      filed(g, "connect")
        .map((c) => c.building)
        .sort(),
    ).toEqual(["bld.eb_05", "bld.eb_07", "bld.eb_17b"]);
    startDay(g);
    g.submit({ type: "debug.truth", building: "bld.eb_05", power: true, source: "debug" });
    nextDay(g);
    expect(filed(g, "connect").map((c) => c.building)).not.toContain("bld.eb_05");
  });

  it("approved, connects the building at dusk", () => {
    const g = newGame(1, everyone());
    startDay(g);
    const c = filed(g, "connect").find((k) => k.building === "bld.eb_05")!;
    waitFor(g, c.id);
    const r = g.submit({ type: "case.decide", case: c.id, action: "approve" });
    expect(r).toMatchObject({ ok: true });
    expect(g.world.records.orders.map((o) => o.building)).toContain("bld.eb_05");
    expect(g.world.buildings.find((b) => b.id === "bld.eb_05")!.power).toBe(false); // not until the crews go out
    g.advance(10_000);
    expect(g.world.buildings.find((b) => b.id === "bld.eb_05")!.power).toBe(true);
    expect(g.world.records.buildings.find((b) => b.id === "bld.eb_05")!.power).toBe(true);
  });

  it("is refused when the books say the line is full, or away from the window", () => {
    const g = newGame(1, everyone());
    startDay(g);
    const c = filed(g, "connect").find((k) => k.building === "bld.eb_05")!;
    waitFor(g, c.id);
    // Fill the line on the books: the bureau thinks two empty houses draw power.
    for (const b of ["bld.eb_04", "bld.counting_house"])
      g.submit({ type: "debug.record", building: b, power: true, source: "debug" });
    expect(g.submit({ type: "case.decide", case: c.id, action: "approve" })).toMatchObject({
      ok: false,
      code: "INSUFFICIENT_RESOURCE",
    });
    // Refusing is always allowed.
    expect(g.submit({ type: "case.decide", case: c.id, action: "deny" })).toMatchObject({ ok: true });
    expect(g.submit({ type: "case.decide", case: c.id, action: "deny" })).toMatchObject({
      ok: false,
      code: "PRECONDITION_FAILED",
    });
    const other = g.world.cases.find((k) => k.status === "waiting" || k.status === "scheduled")!;
    g.submit({ type: "hero.walk", to: 1600 });
    g.advance(20);
    waitFor(g, other.id);
    expect(g.submit({ type: "case.decide", case: other.id, action: "deny" })).toMatchObject({
      ok: false,
      code: "PRECONDITION_FAILED",
      reason: "you are not at the window",
    });
  });
});

describe("registration", () => {
  it("is asked for by people living where the registry does not have them", () => {
    const g = newGame(1, everyone());
    // (Mei is already at the window for 17B's power: one errand at a time.)
    expect(
      filed(g, "register")
        .map((c) => [c.applicant, c.building])
        .sort(),
    ).toEqual([
      ["person.pavel", "bld.eb_11"],
      ["person.yusuf", "bld.eb_17b"],
    ]);
    // Register Pavel where he lives: no case for him tomorrow.
    startDay(g);
    const pavel = filed(g, "register").find((c) => c.applicant === "person.pavel")!;
    waitFor(g, pavel.id);
    expect(g.submit({ type: "case.decide", case: pavel.id, action: "approve" }).ok).toBe(true);
    expect(registrationOf(g.world.records, "person.pavel")).toBe("bld.eb_11");
    nextDay(g);
    expect(filed(g, "register").some((c) => c.applicant === "person.pavel")).toBe(false);
  });

  it("at an address the registry does not know: refused until you have seen it yourself", () => {
    const g = newGame(1, everyone());
    startDay(g);
    const c = filed(g, "register").find((k) => k.building === "bld.eb_17b")!;
    waitFor(g, c.id);
    expect(g.submit({ type: "case.decide", case: c.id, action: "approve" })).toMatchObject({
      ok: false,
      code: "PRECONDITION_FAILED",
    });
    // Go and look; it is still daytime, the visitor is still waiting.
    visit(g, "bld.eb_17b");
    toWindow(g);
    expect(g.world.cases.find((k) => k.id === c.id)!.status).toBe("waiting");
    expect(g.submit({ type: "case.decide", case: c.id, action: "approve" })).toMatchObject({ ok: true });
    expect(g.world.records.buildings.find((b) => b.id === "bld.eb_17b")!.known).toBe(true);
    expect(registrationOf(g.world.records, c.applicant)).toBe("bld.eb_17b");
  });
});

describe("repair", () => {
  it("is asked for where a lived-in building is damaged, and fixed by a crew at dusk", () => {
    const g = newGame(1, everyone());
    expect(filed(g, "repair").map((c) => c.building)).toEqual(["bld.eb_12"]);
    startDay(g);
    g.submit({ type: "debug.truth", building: "bld.eb_02", damaged: true, source: "debug" });
    nextDay(g);
    expect(
      filed(g, "repair")
        .map((c) => c.building)
        .sort(),
    ).toEqual(["bld.eb_02", "bld.eb_12"]);
    const [first, second] = filed(g, "repair");
    waitFor(g, first!.id);
    waitFor(g, second!.id);
    expect(g.submit({ type: "case.decide", case: first!.id, action: "approve" })).toMatchObject({ ok: true });
    // One crew a day: the second has to wait.
    expect(g.submit({ type: "case.decide", case: second!.id, action: "approve" })).toMatchObject({
      ok: false,
      code: "INSUFFICIENT_RESOURCE",
    });
    g.advance(10_000);
    expect(g.world.buildings.find((b) => b.id === first!.building)!.damaged).toBe(false);
  });
});

describe("papers", () => {
  it("every paper on the desk says where it came from and when", () => {
    const g = newGame(1, everyone());
    startDay(g);
    const kinds = new Set<string>();
    const checked = new Set<string>();
    while (g.world.clock.phase === "day") {
      g.advance(10);
      for (const c of g.world.cases.filter((k) => k.status === "waiting" && !checked.has(k.id))) {
        checked.add(c.id);
        kinds.add(kindOf(g, c.type));
        const papers = papersFor(g.world, g.ix, en, "en", c);
        expect(papers.length).toBeGreaterThanOrEqual(2);
        for (const p of papers) {
          expect(p.source, `${c.id} ${p.id}`).toMatch(/^Source: \S/);
          expect(p.day, `${c.id} ${p.id}`).toMatch(/^(Day \d+|Before your first day)$/);
        }
        expect(papers[0]!.day).toBe(`Day ${c.day}`);
      }
    }
    expect(kinds).toEqual(new Set(["connect", "register", "repair"]));
  });
});
