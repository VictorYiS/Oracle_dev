// Quick determinism guard for every run of npm test (the full 100-day check is npm run determinism).
import { describe, expect, it } from "vitest";
import { Game } from "../../src/core/game/game";
import { route } from "../../src/core/world/places";
import { playBot } from "../../tools/lib/bot";
import { FIXTURE_SCENARIOS_DIR, loadPackFrom, SCENARIOS_DIR } from "../../tools/lib/read-pack";
import { defaultPack } from "../helpers/game";

describe("determinism", () => {
  it("gives the same days for the same seed, and a replay matches", () => {
    const pack = defaultPack();
    const a = Game.create(pack, 77);
    const b = Game.create(pack, 77);
    playBot(a, 10);
    playBot(b, 10);
    expect(a.dailyHashes).toEqual(b.dailyHashes);
    const c = Game.create(pack, 77);
    c.replay(a.commands);
    c.advanceTo(a.world.clock.tick);
    expect(c.hash()).toBe(a.hash());
  });

  it("gives different worlds for different seeds", () => {
    const pack = defaultPack();
    const a = Game.create(pack, 1);
    const b = Game.create(pack, 2);
    playBot(a, 5);
    playBot(b, 5);
    expect(a.hash()).not.toBe(b.hash());
  });
});

describe("routes through the place graph", () => {
  const ix = Game.create(defaultPack(), 1).ix;

  it("walks round by the passages, and returns null when there is no way", () => {
    expect(route(ix, { layer: "layer.street", x: 100 }, { layer: "layer.street", x: 400 })).toEqual([
      { walk: 400 },
    ]);
    expect(route(ix, { layer: "layer.far_bank", x: 2220 }, { layer: "layer.room_17b", x: 300 })).toEqual([
      { cross: "passage.door_17b" },
      { walk: 300 },
    ]);
    expect(route(ix, { layer: "layer.street", x: 0 }, { layer: "layer.nowhere", x: 0 })).toBeNull();
  });

  it("breaks ties the same way every time", () => {
    const from = { layer: "layer.room_17b", x: -400 };
    const to = { layer: "layer.substation", x: 400 };
    const first = route(ix, from, to);
    expect(first).toEqual([
      { walk: 0 },
      { cross: "passage.door_17b" },
      { walk: 2615 },
      { cross: "passage.alley" },
      { walk: 400 },
    ]);
    for (let i = 0; i < 5; i++) expect(route(ix, from, to)).toEqual(first);
  });
});

describe("a pack that changes the far bank and repaints a style", () => {
  it("loads and plays 10 days with no engine change", () => {
    const r = loadPackFrom("accept-mini", [FIXTURE_SCENARIOS_DIR, SCENARIOS_DIR]);
    if (!r.ok) throw new Error(JSON.stringify(r.issues));
    expect(r.pack.lineage).toEqual(["interpreter", "accept-mini"]);
    expect(r.pack.buildings).toHaveLength(defaultPack().buildings.length - 3);
    expect(r.pack.buildings.filter((b) => b.layer === "layer.far_bank")).toHaveLength(13);
    expect(r.pack.styles.find((s) => s.id === "style.quay")!.palettes).toEqual([
      { body: "#6a8caf", roof: "#2f4a66", door: "#1f2f40", trim: "#e8eef5" },
    ]);
    expect(r.pack.resources.find((x) => x.id === "res.fish")?.tags).toContain("fresh");
    const g = Game.create(r.pack, 1);
    playBot(g, 10);
    expect(g.dailyHashes).toHaveLength(10);
    expect(g.world.buildings).toHaveLength(16);
  });
});
