// Quick determinism guard for every run of npm test (the full 100-day check is npm run determinism).
import { describe, expect, it } from "vitest";
import { Game } from "../../src/core/game/game";
import { findPath } from "../../src/core/world/path";
import { playBot } from "../../tools/lib/bot";
import { FIXTURE_SCENARIOS_DIR, loadPackFrom, SCENARIOS_DIR } from "../../tools/lib/read-pack";
import { defaultPack } from "../helpers/world";

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

describe("pathfinding", () => {
  const grid = (rows: string[]) => ({
    width: rows[0]!.length,
    height: rows.length,
    cost: (t: number) => (rows[Math.floor(t / rows[0]!.length)]![t % rows[0]!.length] === "#" ? 0 : 1),
  });

  it("walks around walls and returns null when there is no way", () => {
    const g = grid(["....", ".##.", "...."]);
    expect(findPath(g, 0, 3)).toEqual([1, 2, 3]);
    expect(findPath(g, 4, 7)?.length).toBe(5);
    expect(findPath(grid(["..#..", "..#.."]), 0, 4)).toBeNull();
    expect(findPath(g, 5, 5)).toEqual([]);
  });

  it("breaks ties the same way every time", () => {
    const g = grid(["....", "....", "...."]);
    const first = findPath(g, 0, 11);
    for (let i = 0; i < 5; i++) expect(findPath(g, 0, 11)).toEqual(first);
  });
});

describe("a pack that replaces the map", () => {
  it("loads and plays 10 days with no engine change", () => {
    const r = loadPackFrom("accept-mini", [FIXTURE_SCENARIOS_DIR, SCENARIOS_DIR]);
    if (!r.ok) throw new Error(JSON.stringify(r.issues));
    expect(r.pack.lineage).toEqual(["interpreter", "accept-mini"]);
    expect([r.pack.map.width, r.pack.map.height]).toEqual([24, 24]);
    expect(r.pack.resources.find((x) => x.id === "res.fish")?.tags).toContain("fresh");
    const g = Game.create(r.pack, 1);
    playBot(g, 10);
    expect(g.dailyHashes).toHaveLength(10);
    expect(g.world.width).toBe(24);
  });
});
