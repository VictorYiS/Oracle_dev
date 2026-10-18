// P1 acceptance A11: the fog. Only what someone has seen is revealed.
import { describe, expect, it } from "vitest";
import { avatar, newGame, packWith, startDay } from "../helpers/world";

const explored = (g: ReturnType<typeof newGame>) => g.world.explored.reduce((a, b) => a + b, 0);

describe("fog", () => {
  it("reveals only what the starting units and buildings can see", () => {
    const g = newGame();
    const a = avatar(g);
    const sight = g.ix.units.get(a.type)!.sight;
    const w = g.world;
    expect(w.explored[a.y * w.width + a.x]).toBe(1);
    expect(w.explored[a.y * w.width + (a.x + sight)]).toBe(1);
    expect(w.explored[0]).toBe(0); // a far corner
    expect(explored(g)).toBeLessThan((w.width * w.height) / 10);
  });

  it("opens up as the avatar walks", () => {
    const g = newGame();
    startDay(g);
    const before = explored(g);
    const a = avatar(g);
    const target: [number, number] = [a.x + 10, a.y];
    expect(g.world.explored[target[1] * g.world.width + target[0] + 4]).toBe(0);
    expect(g.submit({ type: "unit.move", unit: a.id, to: target }).ok).toBe(true);
    g.advance(200);
    expect(avatar(g)).toMatchObject({ x: target[0], y: target[1] });
    expect(explored(g)).toBeGreaterThan(before);
    expect(g.world.explored[target[1] * g.world.width + target[0] + 4]).toBe(1);
  });

  it("refuses to gather or build where no one has looked", () => {
    const g = newGame();
    startDay(g);
    const w = g.world;
    const hidden = w.nodes.find((n) => w.explored[n.tile] === 0)!;
    const at: [number, number] = [hidden.tile % w.width, Math.floor(hidden.tile / w.width)];
    expect(g.submit({ type: "unit.gather", unit: avatar(g).id, at })).toMatchObject({
      ok: false,
      code: "PRECONDITION_FAILED",
    });
  });

  it("sees less in thick fog", () => {
    const fogEveryDay = packWith([
      {
        path: "story/fog.yaml",
        data: {
          events: [
            {
              id: "event.fog_thickens",
              message: "@event.fog_thickens.message",
              trigger: { chance_per_day: 1 },
              effects: [{ type: "set_weather", weather: "weather.thick_fog" }],
            },
          ],
        },
      },
    ]);
    const clear = newGame(3);
    const foggy = newGame(3, fogEveryDay);
    expect(foggy.world.weather).toBe("weather.thick_fog");
    for (const g of [clear, foggy]) {
      startDay(g);
      const a = avatar(g);
      g.submit({ type: "unit.move", unit: a.id, to: [a.x + 10, a.y] });
      g.advance(200);
    }
    expect(explored(foggy)).toBeLessThan(explored(clear));
  });
});
