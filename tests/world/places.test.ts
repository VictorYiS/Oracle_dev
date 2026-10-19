// P2 acceptance A2 ① and ⑤: the place graph. Every scene can be reached through passages (and the
// validator refuses a pack where one cannot); walking and taking a passage both cost game time,
// a passage as much as its length (from the pack) says.
import { describe, expect, it } from "vitest";
import { assemblePack } from "../../src/core/content/pack";
import { crossingMinutes, ends, route } from "../../src/core/world/places";
import { readRawPack } from "../../tools/lib/read-pack";
import { defaultPack, newGame, packWith, startDay, walk } from "../helpers/game";

const parent = readRawPack("interpreter")!;
const child = (files: { path: string; data: unknown }[]) =>
  assemblePack(
    {
      origin: "scenarios/test-places",
      manifest: {
        id: "test-places",
        version: "0.1.0",
        engine: "0",
        extends: "interpreter",
        title: "@scenario.title",
      },
      files,
      locales: { en: { "x.name": "Cellar" }, "zh-CN": { "x.name": "地窖" } },
    },
    (id) => (id === "interpreter" ? parent : undefined),
  );

describe("the place graph", () => {
  it("reaches every scene and every walkable layer from the start", () => {
    const pack = defaultPack();
    const ix = newGame().ix;
    const start = pack.start.hero;
    for (const layer of pack.layers.filter((l) => l.kind === "walk")) {
      const to = { layer: layer.id, x: layer.walk![0] };
      expect(route(ix, { layer: start.layer, x: start.x }, to), layer.id).not.toBeNull();
    }
    expect(new Set(pack.layers.filter((l) => l.kind === "walk").map((l) => l.scene))).toEqual(
      new Set(pack.scenes.map((s) => s.id)),
    );
  });

  it("is refused by the validator when a scene cannot be reached", () => {
    const r = child([
      {
        path: "world/cellar.yaml",
        data: {
          scenes: [
            {
              id: "scene.cellar",
              name: "@x.name",
              district: "district.east_bank",
              kind: "interior",
              extent: [-400, 400],
            },
          ],
          layers: [
            {
              id: "layer.cellar",
              name: "@x.name",
              scene: "scene.cellar",
              depth: -1200,
              kind: "walk",
              walk: [-300, 300],
            },
          ],
        },
      },
    ]);
    expect(r.ok).toBe(false);
    expect(r.issues.some((i) => i.message.includes("no passage leads to scene.cellar"))).toBe(true);
    // The same scene with a door to it is fine.
    const fixed = child([
      {
        path: "world/cellar.yaml",
        data: {
          scenes: [
            {
              id: "scene.cellar",
              name: "@x.name",
              district: "district.east_bank",
              kind: "interior",
              extent: [-400, 400],
            },
          ],
          layers: [
            {
              id: "layer.cellar",
              name: "@x.name",
              scene: "scene.cellar",
              depth: -1200,
              kind: "walk",
              walk: [-300, 300],
            },
          ],
          passages: [
            {
              id: "passage.cellar",
              name: "@x.name",
              kind: "door",
              from: { layer: "layer.street", x: 2300 },
              to: { layer: "layer.cellar", x: 0 },
              length: 30,
            },
          ],
        },
      },
    ]);
    expect(fixed.issues).toEqual([]);
  });

  it("finds the same shortest route every time, through passages in order", () => {
    const ix = newGame().ix;
    const from = { layer: "layer.street", x: 700 };
    const to = { layer: "layer.far_bank", x: 2000 };
    const first = route(ix, from, to);
    expect(first).toEqual([
      { walk: 2900 },
      { cross: "passage.stairs" },
      { walk: 1500 },
      { cross: "passage.bridge" },
      { walk: 2000 },
    ]);
    for (let i = 0; i < 5; i++) expect(route(ix, from, to)).toEqual(first);
    expect(route(ix, from, { layer: "layer.street", x: 700 })).toEqual([]);
  });
});

describe("going places takes time", () => {
  it("walking along a layer costs a minute per hero_speed units", () => {
    const g = newGame();
    startDay(g);
    const t0 = g.world.clock.tick;
    walk(g, 700 + 8 * g.ix.params.hero_speed);
    expect(g.world.clock.tick - t0).toBe(8);
  });

  it("a passage costs its length, as the pack gives it", () => {
    const g = newGame();
    startDay(g);
    walk(g, 2900);
    const stairs = g.ix.passages.get("passage.stairs")!;
    const t0 = g.world.clock.tick;
    expect(g.submit({ type: "hero.cross", passage: stairs.id }).ok).toBe(true);
    expect(g.world.clock.tick - t0).toBe(crossingMinutes(stairs, g.ix.params.hero_speed));
    expect(g.world.hero.layer).toBe(ends(stairs, "layer.street")!.there.layer);

    // A longer bridge in another pack takes longer to cross.
    const long = packWith([
      {
        path: "world/bridge.yaml",
        data: { passages: [{ ...g.ix.passages.get("passage.bridge")!, length: 1600 }] },
      },
    ]);
    const timeToCross = (pack = defaultPack()) => {
      const h = newGame(1, pack);
      startDay(h);
      walk(h, 2900);
      h.submit({ type: "hero.cross", passage: "passage.stairs" });
      walk(h, 1500);
      const t = h.world.clock.tick;
      expect(h.submit({ type: "hero.cross", passage: "passage.bridge" }).ok).toBe(true);
      return h.world.clock.tick - t;
    };
    expect(timeToCross(long)).toBe(Math.ceil(1600 / g.ix.params.hero_speed));
    expect(timeToCross(long)).toBeGreaterThan(timeToCross());
  });

  it("only from the end of a passage, and only while the day runs", () => {
    const g = newGame();
    expect(g.submit({ type: "hero.walk", to: 900 })).toMatchObject({
      ok: false,
      code: "PRECONDITION_FAILED",
    });
    startDay(g);
    expect(g.submit({ type: "hero.cross", passage: "passage.bridge" })).toMatchObject({
      ok: false,
      code: "PRECONDITION_FAILED",
    });
    expect(g.submit({ type: "hero.walk", to: 99_999 })).toMatchObject({ ok: false, code: "INVALID_TARGET" });
  });
});
