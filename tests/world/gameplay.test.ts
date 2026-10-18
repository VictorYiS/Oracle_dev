// The manual loop's rules: gathering, storage, building, production, food, scenario events.
import { describe, expect, it } from "vitest";
import { HUNGER_DAYS_BEFORE_LEAVING } from "../../src/core/world/routines";
import {
  avatar,
  eventsOf,
  freeTile,
  nearestNode,
  newGame,
  nextDay,
  packWith,
  startDay,
  wisp,
} from "../helpers/world";

describe("gathering", () => {
  it("brings what it gathers back to a depot", () => {
    const g = newGame();
    startDay(g);
    const wood = g.world.stock["res.wood"] ?? 0;
    g.submit({ type: "unit.gather", unit: avatar(g).id, at: nearestNode(g, "res.wood") });
    g.advance(300);
    expect(g.world.stock["res.wood"] ?? 0).toBeGreaterThan(wood);
  });

  it("drops what does not fit, frees the unit, and says so once a day", () => {
    const g = newGame();
    startDay(g);
    for (const u of [avatar(g), wisp(g)])
      g.submit({ type: "unit.gather", unit: u.id, at: nearestNode(g, "res.wood", u) });
    g.advance(720);
    const capacity = g.pack.start.base_storage + 0;
    const total = Object.values(g.world.stock).reduce((a, b) => a + b, 0);
    expect(total).toBeLessThanOrEqual(capacity);
    expect(eventsOf(g, "storage.full").length).toBeLessThanOrEqual(1);
  });
});

describe("building and production", () => {
  it("raises a farm whose residents grow food at dusk", () => {
    const g = newGame();
    startDay(g);
    g.submit({ type: "unit.gather", unit: avatar(g).id, at: nearestNode(g, "res.wood") });
    g.advance(400);
    const placed = g.submit({ type: "build.place", building: "bld.farm", at: freeTile(g) });
    expect(placed.ok).toBe(true);
    const farm = g.world.buildings.find((b) => b.type === "bld.farm")!;
    g.submit({ type: "unit.build", unit: wisp(g).id, site: farm.id });
    nextDay(g); // dusk, night, dawn assigns residents, planning, day
    expect(g.world.buildings.find((b) => b.id === farm.id)?.complete).toBe(true);
    expect(g.world.units.filter((u) => u.workplace === farm.id)).toHaveLength(2);
    g.advance(10_000);
    const produced = eventsOf(g, "production").filter((e) => e.data.building === farm.id);
    expect(produced).toHaveLength(2);
    expect(produced.every((e) => Number(e.data.amount) >= 4)).toBe(true);
  });

  it("does not produce without the inputs a building consumes", () => {
    const pack = packWith([
      {
        path: "world/start.yaml",
        data: { start: { ...packWith([]).start, buildings: [{ building: "bld.workshop", at: [24, 22] }] } },
      },
    ]);
    const g = newGame(1, pack);
    startDay(g);
    g.advance(10_000);
    expect(eventsOf(g, "production.short").length).toBeGreaterThan(0);
    expect(g.world.stock["res.parts"] ?? 0).toBe(0);
  });
});

describe("food", () => {
  it("leaves residents hungry, then sends them away", () => {
    const pack = packWith([
      { path: "world/start.yaml", data: { start: { ...packWith([]).start, stock: {} } } },
    ]);
    const g = newGame(1, pack);
    const residents = () => g.world.units.filter((u) => u.role === "resident").length;
    const before = residents();
    startDay(g);
    for (let d = 0; d < HUNGER_DAYS_BEFORE_LEAVING; d++) nextDay(g);
    expect(eventsOf(g, "unit.hungry").length).toBeGreaterThan(0);
    expect(eventsOf(g, "unit.left").length).toBe(before);
    expect(residents()).toBe(0);
  });
});

describe("scenario events", () => {
  const always = (id: string, effects: unknown[], extra: Record<string, unknown> = {}) =>
    packWith([
      {
        path: "story/x.yaml",
        data: {
          events: [
            { id, message: "@event.wanderer.message", trigger: { chance_per_day: 1, ...extra }, effects },
          ],
        },
      },
    ]);

  it("fire a once-only event a single time", () => {
    const g = newGame(
      1,
      always("event.odd_find", [{ type: "add_resource", resource: "res.paperclip", amount: 3 }], {
        once: true,
      }),
    );
    startDay(g);
    for (let d = 0; d < 3; d++) nextDay(g);
    expect(eventsOf(g, "scenario").filter((e) => e.data.event === "event.odd_find")).toHaveLength(1);
    expect(g.world.stock["res.paperclip"]).toBe(3);
  });

  it("only bring wanderers when there is room", () => {
    const g = newGame(
      1,
      always("event.wanderer", [{ type: "spawn_unit", unit: "unit.resident", count: 1 }], {
        needs_free_housing: true,
      }),
    );
    startDay(g);
    nextDay(g);
    expect(eventsOf(g, "unit.arrived")).toHaveLength(0);
  });

  it("put a worker out of action for some days", () => {
    const g = newGame(1, always("event.wisp_fault", [{ type: "disable_worker", days: 2 }], { once: true }));
    expect(wisp(g).disabledDays).toBe(2);
    startDay(g);
    expect(g.submit({ type: "unit.move", unit: wisp(g).id, to: [24, 20] })).toMatchObject({
      code: "PRECONDITION_FAILED",
    });
  });
});
