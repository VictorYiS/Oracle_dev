// P1 acceptance A9 (unit part): snapshot + command log reproduce the world exactly.
import { describe, expect, it } from "vitest";
import { Game, SaveError } from "../../src/core/game/game";
import { playBot } from "../../tools/lib/bot";
import { defaultPack, newGame, packWith } from "../helpers/world";

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
    expect(save).toMatchObject({ format: "oracle-save", version: 1, engine: "0", seed: 13 });
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
    edited.buildings[0]!.build_ticks += 1;
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
});
