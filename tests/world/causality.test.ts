// P1 acceptance A7 (and P2's addition): every event says why it happened, back to the command that
// started it. A window decision's consequence at dusk traces back through the decision to the
// command that made it.
import { describe, expect, it } from "vitest";
import { traceCauses } from "../../src/core/world/causes";
import { eventsOf, newGame, packWith, startDay, walk } from "../helpers/game";

const everyone = () => packWith([{ path: "all.yaml", data: { params: { cases_per_day: [20, 20] } } }]);

describe("event causes", () => {
  it("trace a window decision's consequence at dusk back to the command that decided it", () => {
    const g = newGame(1, everyone());
    startDay(g);
    const c = g.world.cases.find(
      (k) => k.building === "bld.eb_05" && g.ix.cases.get(k.type)!.kind === "connect",
    )!;
    for (let i = 0; i < 900 && g.world.cases.find((k) => k.id === c.id)!.status !== "waiting"; i++)
      g.advance(1);
    const decided = g.submit({ type: "case.decide", case: c.id, action: "approve" });
    expect(decided.ok).toBe(true);
    g.advance(10_000); // to dusk: the crews go out
    const done = eventsOf(g, "order.done").find((e) => e.data.building === "bld.eb_05");
    expect(done).toBeDefined();
    const chain = traceCauses(g.events, done!.id);
    expect(chain.length).toBeGreaterThanOrEqual(2);
    const decision = eventsOf(g, "case.decided").find((e) => e.data.case === c.id)!;
    expect(chain[0]).toEqual({ event: decision.id });
    expect(chain.at(-1)).toEqual({ command: decided.seq });
  });

  it("point what you see on arrival at the crossing that brought you there", () => {
    const g = newGame();
    startDay(g);
    walk(g, 2900);
    g.submit({ type: "hero.cross", passage: "passage.stairs" });
    walk(g, 1500);
    const crossed = g.submit({ type: "hero.cross", passage: "passage.bridge" });
    expect(crossed.ok).toBe(true);
    walk(g, 1255); // No. 7, which the records have as lit
    const seen = eventsOf(g, "memory.seen").find((e) => e.data.building === "bld.eb_07");
    expect(seen).toBeDefined();
    expect(traceCauses(g.events, seen!.id).at(-1)).toEqual({ routine: "day" });
    // Arriving through the passage itself is the crossing's doing.
    const atLanding = eventsOf(g, "memory.seen").find((e) => e.data.building === "bld.eb_08");
    if (atLanding) expect(traceCauses(g.events, atLanding.id).at(-1)).toEqual({ command: crossed.seq });
  });

  it("end scenario events at the dawn routine", () => {
    const pack = packWith(
      [
        {
          path: "story/test.yaml",
          data: {
            events: [
              {
                id: "event.test_storm",
                message: "@t.msg",
                trigger: { day: 2 },
                effects: [{ type: "damage", building: "bld.eb_02", damaged: true }],
              },
            ],
          },
        },
      ],
      { en: { "t.msg": "Storm." }, "zh-CN": { "t.msg": "风暴。" } },
    );
    const g = newGame(1, pack);
    startDay(g);
    g.advance(10_000);
    g.submit({ type: "phase.advance" });
    g.submit({ type: "phase.advance" });
    const damage = eventsOf(g, "truth.damage").find((e) => e.data.building === "bld.eb_02")!;
    const chain = traceCauses(g.events, damage.id);
    expect(chain.length).toBe(2);
    expect(chain.at(-1)).toEqual({ routine: "dawn" });
  });
});
