// P1 acceptance A7: every event says why it happened, back to the command that started it.
import { describe, expect, it } from "vitest";
import { traceCauses } from "../../src/core/world/causes";
import { eventsOf, freeTile, nearestNode, newGame, startDay, wisp } from "../helpers/world";

describe("event causes", () => {
  it("trace a completed building back through its site to the command that placed it", () => {
    const g = newGame();
    startDay(g);
    g.submit({ type: "unit.gather", unit: wisp(g).id, at: nearestNode(g, "res.wood", wisp(g)) });
    g.advance(150); // the campfire costs a little more wood than the start provides
    const placed = g.submit({ type: "build.place", building: "bld.campfire", at: freeTile(g) });
    expect(placed).toMatchObject({ ok: true });
    const site = g.world.buildings.find((b) => !b.complete)!;
    expect(g.submit({ type: "unit.build", unit: wisp(g).id, site: site.id }).ok).toBe(true);
    g.advance(400);

    const completed = eventsOf(g, "building.completed").find((e) => e.data.building === site.id);
    expect(completed).toBeDefined();
    const chain = traceCauses(g.events, completed!.id);
    expect(chain.length).toBeGreaterThanOrEqual(2);
    const placedEvent = eventsOf(g, "site.placed").find((e) => e.data.building === site.id)!;
    expect(chain[0]).toEqual({ event: placedEvent.id });
    expect(chain.at(-1)).toEqual({ command: placed.seq });
  });

  it("points gathering outcomes at the gather command", () => {
    const g = newGame();
    startDay(g);
    const r = g.submit({ type: "unit.gather", unit: wisp(g).id, at: nearestNode(g, "res.wood", wisp(g)) });
    g.advance(720);
    const fromGathering = g.events.filter((e) => e.kind === "node.exhausted" || e.kind === "storage.full");
    expect(fromGathering.length).toBeGreaterThan(0);
    for (const e of fromGathering) expect(traceCauses(g.events, e.id).at(-1)).toEqual({ command: r.seq });
  });

  it("ends scenario events at the dawn routine", () => {
    const g = newGame();
    const weather = eventsOf(g, "weather.changed")[0] ?? eventsOf(g, "scenario")[0];
    if (!weather) return; // no event rolled on this seed's first dawn
    expect(traceCauses(g.events, weather.id).at(-1)).toEqual({ routine: "dawn" });
  });
});
