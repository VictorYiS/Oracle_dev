// P1 acceptance A9 (unit part): snapshot + command log reproduce the world exactly. P2: the save
// carries the player's memory (what they saw, and when) and the pending tray.
import { describe, expect, it } from "vitest";
import { Game, SaveError } from "../../src/core/game/game";
import { playBot } from "../../tools/lib/bot";
import { defaultPack, newGame, packWith, startDay, visit } from "../helpers/game";

const roundTrip = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

describe("saves", () => {
  it("restore mid-day to the same world, and both continue identically", () => {
    const pack = defaultPack();
    const g = newGame(5, pack);
    playBot(g, 3);
    g.submit({ type: "phase.advance" }); // night -> dawn of day 4
    g.submit({ type: "phase.advance" });
    g.submit({ type: "phase.advance" }); // day
    g.advance(250);
    const save = roundTrip(g.toSave());
    expect(save.commands.length).toBeGreaterThan(0); // commands after the last dusk
    const loaded = Game.fromSave(pack, save);
    expect(loaded.hash()).toBe(g.hash());
    expect(loaded.world.clock).toEqual(g.world.clock);

    playBot(g, 6);
    playBot(loaded, 6);
    expect(loaded.hash()).toBe(g.hash());
    expect(loaded.dailyHashes).toEqual(g.dailyHashes);
  });

  it("restore a game that has not reached its first dusk", () => {
    const pack = defaultPack();
    const g = newGame(9, pack);
    g.submit({ type: "phase.advance" });
    const loaded = Game.fromSave(pack, roundTrip(g.toSave()));
    expect(loaded.hash()).toBe(g.hash());
  });

  it("match a full replay from the start", () => {
    const pack = defaultPack();
    const g = newGame(11, pack);
    playBot(g, 5);
    const replay = Game.create(pack, 11);
    replay.replay(g.commands);
    replay.advanceTo(g.world.clock.tick);
    expect(replay.hash()).toBe(Game.fromSave(pack, roundTrip(g.toSave())).hash());
  });

  it("record the engine, the pack and the seed", () => {
    const g = newGame(13);
    const save = g.toSave();
    expect(save).toMatchObject({ format: "oracle-save", version: 2, engine: "0", seed: 13 });
    expect(save.pack).toEqual({
      id: "interpreter",
      version: g.pack.manifest.version,
      fingerprint: expect.stringMatching(/^[0-9a-f]{16}$/),
    });
  });

  it("refuse files that are not saves, are from another version, or are for another pack", () => {
    const pack = defaultPack();
    const save = roundTrip(newGame().toSave());
    const code = (raw: unknown) => {
      try {
        Game.fromSave(pack, raw);
        return "loaded";
      } catch (e) {
        return e instanceof SaveError ? e.code : "crashed";
      }
    };
    expect(code({ hello: "world" })).toBe("NOT_A_SAVE");
    expect(code(null)).toBe("NOT_A_SAVE");
    expect(code({ ...save, version: 99 })).toBe("INCOMPATIBLE_VERSION");
    expect(code({ ...save, engine: "9" })).toBe("INCOMPATIBLE_VERSION");
    expect(code({ ...save, pack: { id: "other", version: "1.0.0" } })).toBe("WRONG_PACK");
    expect(code(save)).toBe("loaded");
    // The same save, opened with a different pack, is refused.
    expect(() => Game.fromSave(packWith([]), save)).toThrow(SaveError);
  });

  it("refuses a pack with the same id and version but different content", () => {
    const pack = defaultPack();
    const save = roundTrip(newGame(3, pack).toSave());
    const edited = roundTrip(pack);
    edited.buildings[0]!.load += 1;
    let error: unknown;
    try {
      Game.fromSave(edited, save);
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(SaveError);
    expect((error as SaveError).code).toBe("WRONG_PACK");
    expect(() => Game.fromSave(pack, { ...save, pack: { ...save.pack, fingerprint: "0" } })).toThrow(
      SaveError,
    );
  });

  it("does not let text alone change the fingerprint", () => {
    const pack = defaultPack();
    const save = roundTrip(newGame(3, pack).toSave());
    const retold = roundTrip(pack);
    for (const table of Object.values(retold.locale)) {
      for (const key of Object.keys(table)) table[key] = `${table[key]}!`;
    }
    retold.languages = [...retold.languages].reverse();
    expect(() => Game.fromSave(retold, save)).not.toThrow();
  });

  it("keep the player's memory and the pending tray, and load them back unchanged", () => {
    const pack = packWith([{ path: "all.yaml", data: { params: { cases_per_day: [20, 20] } } }]);
    const g = newGame(4, pack);
    startDay(g);
    const c = g.world.cases.find((k) => k.building === "bld.eb_07")!;
    for (let i = 0; i < 900 && g.world.cases.find((k) => k.id === c.id)!.status !== "waiting"; i++)
      g.advance(1);
    expect(g.submit({ type: "case.adopt", case: c.id }).ok).toBe(true);
    visit(g, "bld.eb_08"); // seen today, from the bridge's landing; No. 7's check is still open
    const save = roundTrip(g.toSave());
    expect(save.snapshot.state.memory.length + save.commands.length).toBeGreaterThan(0);
    const loaded = Game.fromSave(pack, save);
    expect(loaded.world.memory).toEqual(g.world.memory);
    expect(loaded.world.memory.find((m) => m.building === "bld.eb_08")).toMatchObject({
      day: 1,
      power: true,
      occupied: false,
    });
    expect(loaded.world.pending).toEqual(g.world.pending);
    expect(loaded.world.pending.items[0]).toMatchObject({ building: "bld.eb_07", verdict: null });
    expect(loaded.hash()).toBe(g.hash());
  });
});
