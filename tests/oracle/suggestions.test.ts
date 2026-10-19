// P2 acceptance A11: the Oracle's suggestion comes from the records alone, so where the records are
// wrong the suggestion is wrong. Adopting it puts what it took for granted on the pending tray, with
// how to check it; seeing for yourself or reading the original settles it, right or wrong as the
// truth has it. And there is no penalty: adopting a wrong suggestion leaves the world exactly as
// making the same decision by hand would, apart from the tray.
import { describe, expect, it } from "vitest";
import type { Game } from "../../src/core/game/game";
import { suggest } from "../../src/core/oracle/suggest";
import { trueFacts } from "../../src/core/world/query";
import { CHECKABLE } from "../../src/core/world/records";
import { newGame, packWith, startDay, visit, withoutTray } from "../helpers/game";

const everyone = () => packWith([{ path: "all.yaml", data: { params: { cases_per_day: [20, 20] } } }]);

function caseFor(g: Game, kind: string, building: string): string {
  const c = g.world.cases.find(
    (k) => k.day === g.world.clock.day && k.building === building && g.ix.cases.get(k.type)!.kind === kind,
  );
  if (!c) throw new Error(`no ${kind} case for ${building}`);
  for (let i = 0; i < 900 && g.world.cases.find((k) => k.id === c.id)!.status !== "waiting"; i++)
    g.advance(1);
  expect(g.world.cases.find((k) => k.id === c.id)!.status).toBe("waiting");
  return c.id;
}

describe("the Oracle's suggestion", () => {
  it("is computed from the records: where they are wrong, it contradicts the truth", () => {
    const g = newGame(1, everyone());
    startDay(g);
    // No. 7 is on file as connected; in fact it is dark.
    const seven = g.suggestion(caseFor(g, "connect", "bld.eb_07"))!;
    expect(seven).toMatchObject({ action: "deny", reason: "already_powered" });
    expect(seven.claims).toEqual([{ building: "bld.eb_07", field: "power", value: true }]);
    expect(trueFacts(g.world, "bld.eb_07").power).toBe(false);
    // 17B is not on the map; two people live there.
    const shack = g.suggestion(caseFor(g, "connect", "bld.eb_17b"))!;
    expect(shack).toMatchObject({ action: "deny", reason: "unknown_address" });
    expect(trueFacts(g.world, "bld.eb_17b").exists).toBe(true);
    // Where the records are right, so is the Oracle.
    expect(g.suggestion(caseFor(g, "connect", "bld.eb_05"))).toMatchObject({
      action: "approve",
      reason: "ok",
    });
  });

  it("does not change when only the truth does, and does when the records do", () => {
    const g = newGame(1, everyone());
    startDay(g);
    const id = caseFor(g, "connect", "bld.eb_07");
    const before = g.suggestion(id);
    g.submit({ type: "debug.truth", building: "bld.eb_07", power: true, damaged: true, source: "debug" });
    expect(g.suggestion(id)).toEqual(before);
    g.submit({ type: "debug.record", building: "bld.eb_07", power: false, source: "debug" });
    expect(g.suggestion(id)).toMatchObject({ action: "approve", reason: "ok" });
  });

  it("takes only records, ratings and the request: the function has nothing else to read", () => {
    const g = newGame(1, everyone());
    const type = g.ix.caseOfKind.connect!;
    const request = { kind: "connect" as const, applicant: "person.osei", building: "bld.eb_07" };
    const a = suggest(g.world.records, g.ix.ratings, request, type);
    const b = suggest(JSON.parse(JSON.stringify(g.world.records)), g.ix.ratings, request, type);
    expect(a).toEqual(b);
    expect(suggest.length).toBe(4);
  });
});

describe("adopting a suggestion", () => {
  it("decides the case as suggested and puts what it took for granted on the tray, with how to check it", () => {
    const g = newGame(1, everyone());
    startDay(g);
    const id = caseFor(g, "connect", "bld.eb_07");
    expect(g.world.pending.items).toEqual([]);
    expect(g.submit({ type: "case.adopt", case: id })).toMatchObject({ ok: true });
    expect(g.world.cases.find((c) => c.id === id)).toMatchObject({ status: "decided", action: "deny" });
    expect(g.world.pending.items).toHaveLength(1);
    const item = g.world.pending.items[0]!;
    expect(item).toMatchObject({ case: id, building: "bld.eb_07", reason: "already_powered", verdict: null });
    expect(item.claims).toEqual([{ building: "bld.eb_07", field: "power", value: true }]);
    // How to check: power can be seen, and it is in the original papers too.
    expect(CHECKABLE.power).toEqual({ sight: true, original: true });
  });

  it("is settled by going to look: the verdict is the truth's", () => {
    const g = newGame(1, everyone());
    startDay(g);
    g.submit({ type: "case.adopt", case: caseFor(g, "connect", "bld.eb_07") }); // wrong: it is dark
    g.submit({ type: "case.adopt", case: caseFor(g, "connect", "bld.eb_05") }); // right
    visit(g, "bld.eb_07");
    visit(g, "bld.eb_05");
    const [wrong, right] = g.world.pending.items;
    expect(wrong).toMatchObject({ building: "bld.eb_07", verdict: "wrong", how: "sight", checked: 1 });
    expect(right).toMatchObject({ building: "bld.eb_05", verdict: "right", how: "sight" });
    const checked = g.events.filter((e) => e.kind === "pending.checked");
    expect(checked.map((e) => e.data.verdict)).toEqual(["wrong", "right"]);
  });

  it("is settled by reading the original at the window, which takes time", () => {
    const g = newGame(1, everyone());
    startDay(g);
    const id = caseFor(g, "repair", "bld.eb_12"); // on file as sound; the roof is in
    expect(g.suggestion(id)).toMatchObject({ action: "deny", reason: "no_damage_on_file" });
    g.submit({ type: "case.adopt", case: id });
    const item = g.world.pending.items[0]!;
    const t = g.world.clock.tick;
    expect(g.submit({ type: "pending.read", item: item.id })).toMatchObject({ ok: true });
    expect(g.world.clock.tick - t).toBe(g.ix.params.original_minutes);
    expect(g.world.pending.items[0]).toMatchObject({ verdict: "wrong", how: "original" });
    // Who lives somewhere is not on any paper you can trust: that one needs eyes.
    const reg = caseFor(g, "register", "bld.eb_11");
    g.submit({ type: "case.adopt", case: reg });
    const occupied = g.world.pending.items.find((p) => p.case === reg)!;
    expect(g.submit({ type: "pending.read", item: occupied.id })).toMatchObject({
      ok: false,
      code: "PRECONDITION_FAILED",
    });
  });

  it("carries no penalty: the world is as if you had decided the same yourself, apart from the tray", () => {
    const by = (adopt: boolean) => {
      const g = newGame(1, everyone());
      startDay(g);
      const id = caseFor(g, "connect", "bld.eb_07");
      const r = adopt
        ? g.submit({ type: "case.adopt", case: id })
        : g.submit({ type: "case.decide", case: id, action: "deny" });
      expect(r.ok).toBe(true);
      return g;
    };
    const adopted = by(true);
    const manual = by(false);
    expect(adopted.world.pending.items).toHaveLength(1);
    expect(manual.world.pending.items).toHaveLength(0);
    expect(withoutTray(adopted)).toEqual(withoutTray(manual));
    // ...and stays so through the day's outcome at dusk and into the next morning.
    for (const g of [adopted, manual]) {
      g.advance(10_000);
      g.submit({ type: "phase.advance" });
      g.submit({ type: "phase.advance" });
    }
    expect(withoutTray(adopted)).toEqual(withoutTray(manual));
  });
});
