// P2 acceptance A2 ② and ③: residents follow their routines from scene to scene; who lives where
// decides who is in a building; the district's line has a capacity that connections are held to.
import { describe, expect, it } from "vitest";
import { occupants, trueLoad } from "../../src/core/world/query";
import { bookedLoad } from "../../src/core/world/records";
import { newGame, startDay } from "../helpers/game";

describe("residents", () => {
  it("move between scenes by their routine: home at dawn, work by day, home again in the evening", () => {
    const g = newGame();
    const where = (id: string) => g.world.residents.find((r) => r.id === id)!;
    // Ruth lives on the far bank and works inside the Registry, on the street.
    expect(where("person.ruth")).toMatchObject({ scene: "scene.east_bank", layer: "layer.far_bank" });
    startDay(g);
    const layers: string[] = [];
    const scenes: string[] = [];
    for (let t = 0; t < 720 && g.world.clock.phase === "day"; t++) {
      g.advance(1);
      const r = where("person.ruth");
      if (layers.at(-1) !== r.layer) layers.push(r.layer);
      if (scenes.at(-1) !== r.scene) scenes.push(r.scene);
    }
    // Over the bridge, up the steps, through the Registry's door; and back again after work.
    expect(layers.slice(0, 4)).toEqual([
      "layer.far_bank",
      "layer.riverbank",
      "layer.street",
      "layer.registry_hall",
    ]);
    expect(scenes.slice(0, 3)).toEqual(["scene.east_bank", "scene.registry", "scene.east_bank"]);
    // Sofia's work is down the alley, in the substation.
    expect(g.ix.residents.get("person.sofia")!.work).toBe("spot.switch_room");
  });

  it("go to the window when they have business there", () => {
    const g = newGame(3);
    startDay(g);
    let visitor: string | null = null;
    for (let t = 0; t < 600 && !visitor; t++) {
      g.advance(1);
      visitor = g.world.cases.find((c) => c.status === "waiting")?.applicant ?? null;
    }
    expect(visitor).not.toBeNull();
    const r = g.world.residents.find((p) => p.id === visitor)!;
    expect(r.layer).toBe(g.ix.window.layer);
    expect(Math.abs(r.x - g.ix.window.queue.x)).toBeLessThan(g.ix.window.queue.gap * 6);
  });

  it("are who lives in a building: occupants come from where people really live", () => {
    const g = newGame();
    expect(occupants(g.world, "bld.eb_02")).toEqual(["person.ivo", "person.mara"]);
    expect(occupants(g.world, "bld.eb_17b")).toEqual(["person.mei", "person.yusuf"]);
    expect(occupants(g.world, "bld.eb_04")).toEqual([]); // Pavel is registered here, but lives at No. 11
  });
});

describe("power", () => {
  it("has a line capacity per district; the books and the real load can differ", () => {
    const g = newGame();
    const district = "district.east_bank";
    const capacity = g.ix.districts.get(district)!.capacity;
    const real = trueLoad({ s: g.world, ix: g.ix }, district);
    const books = bookedLoad(g.world.records, g.ix.ratings, district);
    expect(real).toBeLessThanOrEqual(capacity);
    // The Counting House draws power the books do not know of; No. 7 is on the books but cut off.
    expect(real - books).toBe(
      g.ix.buildings.get("bld.counting_house")!.load - g.ix.buildings.get("bld.eb_07")!.load,
    );
  });

  it("refuses a connection the books say the line cannot carry", () => {
    const g = newGame();
    const district = "district.east_bank";
    const room = g.ix.districts.get(district)!.capacity - bookedLoad(g.world.records, g.ix.ratings, district);
    expect(room).toBeGreaterThan(0);
    expect(room).toBeLessThan(10);
  });

  it("leaves people in the dark until they give up and go (without telling the registry)", () => {
    const g = newGame();
    const limit = g.ix.params.leave_after_dark_days;
    for (let d = 0; d < limit; d++) {
      startDay(g);
      g.advance(10_000);
      g.submit({ type: "phase.advance" });
      g.submit({ type: "phase.advance" });
    }
    const lena = g.world.residents.find((r) => r.id === "person.lena")!;
    expect(lena.here).toBe(false);
    expect(lena.home).toBeNull();
    expect(g.world.records.residents.find((r) => r.id === "person.lena")!.registered).toBe("bld.eb_05");
  });
});
