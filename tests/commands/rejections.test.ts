// P1 acceptance A6: every refusal comes back as a structured code and changes nothing.
import { describe, expect, it } from "vitest";
import type { Game } from "../../src/core/game/game";
import { newGame, packWith, startDay, walk } from "../helpers/game";

function expectRefused(g: Game, command: unknown, code: string): void {
  const before = g.hash();
  const version = g.world.version;
  const r = g.submit(command);
  expect(r).toMatchObject({ ok: false, code });
  expect(g.world.version).toBe(version);
  expect(g.hash()).toBe(before);
  expect(g.commands.at(-1)?.result).toBe(code);
}

describe("command rejections", () => {
  it("SCHEMA_INVALID: a command of the wrong shape", () => {
    const g = newGame();
    expectRefused(g, { type: "hero.walk", to: "north" }, "SCHEMA_INVALID");
    expectRefused(g, { type: "hero.teleport" }, "SCHEMA_INVALID");
    expectRefused(g, { type: "case.decide", case: "c1", action: "shrug" }, "SCHEMA_INVALID");
    expectRefused(g, null, "SCHEMA_INVALID");
  });

  it("NO_PERMISSION: a source that may not issue this command", () => {
    const g = newGame();
    startDay(g);
    expectRefused(g, { type: "hero.walk", to: 800, source: "script" }, "NO_PERMISSION");
    expectRefused(g, { type: "case.adopt", case: "c1", source: "oracle" }, "NO_PERMISSION");
    // The world can be changed behind everyone's back only from the debug hook.
    expectRefused(g, { type: "debug.truth", building: "bld.eb_02", power: false }, "NO_PERMISSION");
  });

  it("STALE_VERSION: a command based on an older world", () => {
    const g = newGame();
    const v = g.world.version;
    expect(g.submit({ type: "phase.advance", basedOnVersion: v }).ok).toBe(true);
    expectRefused(g, { type: "phase.advance", basedOnVersion: v }, "STALE_VERSION");
  });

  it("INVALID_TARGET: a passage, case, item or place that is not there", () => {
    const g = newGame();
    startDay(g);
    expectRefused(g, { type: "hero.cross", passage: "passage.nowhere" }, "INVALID_TARGET");
    expectRefused(g, { type: "hero.walk", to: 99_999 }, "INVALID_TARGET");
    expectRefused(g, { type: "case.decide", case: "c999", action: "approve" }, "INVALID_TARGET");
    expectRefused(g, { type: "case.adopt", case: "c999" }, "INVALID_TARGET");
    expectRefused(g, { type: "pending.read", item: 99 }, "INVALID_TARGET");
    expectRefused(
      g,
      { type: "debug.truth", building: "bld.nothing", power: true, source: "debug" },
      "INVALID_TARGET",
    );
  });

  it("INSUFFICIENT_RESOURCE: not enough left today (one crew a day)", () => {
    const g = newGame(1, packWith([{ path: "all.yaml", data: { params: { cases_per_day: [20, 20] } } }]));
    startDay(g);
    g.submit({ type: "debug.truth", building: "bld.eb_02", damaged: true, source: "debug" });
    g.advance(10_000);
    g.submit({ type: "phase.advance" });
    g.submit({ type: "phase.advance" });
    g.submit({ type: "phase.advance" });
    g.submit({ type: "phase.advance" });
    const repairs = () =>
      g.world.cases.filter((c) => c.day === 2 && g.ix.cases.get(c.type)!.kind === "repair");
    for (let i = 0; i < 900 && repairs().some((c) => c.status !== "waiting"); i++) g.advance(1);
    const [first, second] = repairs();
    expect(g.submit({ type: "case.decide", case: first!.id, action: "approve" }).ok).toBe(true);
    expectRefused(g, { type: "case.decide", case: second!.id, action: "approve" }, "INSUFFICIENT_RESOURCE");
  });

  it("PRECONDITION_FAILED: the world does not allow it right now", () => {
    const g = newGame();
    expectRefused(g, { type: "hero.walk", to: 800 }, "PRECONDITION_FAILED"); // time is not running yet
    startDay(g);
    expectRefused(g, { type: "phase.advance" }, "PRECONDITION_FAILED"); // the day runs until dusk
    expectRefused(g, { type: "hero.cross", passage: "passage.bridge" }, "PRECONDITION_FAILED"); // not at it
    walk(g, 1500);
    expectRefused(g, { type: "hero.cross", passage: "passage.bridge" }, "PRECONDITION_FAILED"); // still the wrong layer
  });

  it("accepts a valid command and bumps the version", () => {
    const g = newGame();
    startDay(g);
    const v = g.world.version;
    expect(g.submit({ type: "hero.walk", to: 900 })).toMatchObject({ ok: true });
    expect(g.world.version).toBe(v + 1);
  });
});
