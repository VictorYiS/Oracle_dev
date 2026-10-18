// P1 acceptance A6: every refusal comes back as a structured code and changes nothing.
import { describe, expect, it } from "vitest";
import type { Game } from "../../src/core/game/game";
import { avatar, freeTile, nearestNode, newGame, startDay } from "../helpers/world";

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
    expectRefused(g, { type: "unit.move", unit: avatar(g).id, to: "north" }, "SCHEMA_INVALID");
    expectRefused(g, { type: "unit.teleport" }, "SCHEMA_INVALID");
    expectRefused(g, null, "SCHEMA_INVALID");
  });

  it("NO_PERMISSION: a source that may not issue this command", () => {
    const g = newGame();
    startDay(g);
    expectRefused(
      g,
      { type: "build.place", building: "bld.farm", at: freeTile(g), source: "script" },
      "NO_PERMISSION",
    );
    expectRefused(g, { type: "unit.stop", unit: avatar(g).id, source: "oracle" }, "NO_PERMISSION");
  });

  it("STALE_VERSION: a command based on an older world", () => {
    const g = newGame();
    const v = g.world.version;
    expect(g.submit({ type: "phase.advance", basedOnVersion: v }).ok).toBe(true);
    expectRefused(g, { type: "phase.advance", basedOnVersion: v }, "STALE_VERSION");
  });

  it("INVALID_TARGET: a unit, building or tile that is not there", () => {
    const g = newGame();
    startDay(g);
    expectRefused(g, { type: "unit.move", unit: "u999", to: [1, 1] }, "INVALID_TARGET");
    expectRefused(g, { type: "unit.move", unit: avatar(g).id, to: [500, 1] }, "INVALID_TARGET");
    expectRefused(
      g,
      { type: "unit.gather", unit: avatar(g).id, at: [avatar(g).x, avatar(g).y] },
      "INVALID_TARGET",
    );
    expectRefused(g, { type: "unit.build", unit: avatar(g).id, site: "b999" }, "INVALID_TARGET");
    expectRefused(g, { type: "build.place", building: "bld.castle", at: freeTile(g) }, "INVALID_TARGET");
  });

  it("INSUFFICIENT_RESOURCE: not enough materials", () => {
    const g = newGame();
    startDay(g);
    expectRefused(
      g,
      { type: "build.place", building: "bld.windmill", at: freeTile(g) },
      "INSUFFICIENT_RESOURCE",
    );
  });

  it("PRECONDITION_FAILED: the world does not allow it right now", () => {
    const g = newGame();
    startDay(g);
    const lake: [number, number] = [5, 22];
    expectRefused(g, { type: "build.place", building: "bld.campfire", at: lake }, "PRECONDITION_FAILED"); // unseen
    const fire = g.world.buildings[0]!;
    expectRefused(
      g,
      { type: "build.place", building: "bld.campfire", at: [fire.x, fire.y] },
      "PRECONDITION_FAILED",
    ); // occupied
    expectRefused(g, { type: "phase.advance" }, "PRECONDITION_FAILED"); // the day runs until dusk
    const resident = g.world.units.find((u) => u.role === "resident")!;
    expectRefused(
      g,
      { type: "unit.gather", unit: resident.id, at: nearestNode(g, "res.wood") },
      "PRECONDITION_FAILED",
    );
  });

  it("accepts a valid command and bumps the version", () => {
    const g = newGame();
    startDay(g);
    const v = g.world.version;
    expect(
      g.submit({ type: "unit.gather", unit: avatar(g).id, at: nearestNode(g, "res.wood") }),
    ).toMatchObject({
      ok: true,
    });
    expect(g.world.version).toBe(v + 1);
  });
});
