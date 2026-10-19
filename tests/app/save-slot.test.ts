// Browser saves get one slot per pack content: an imported copy of a pack with the same id and
// version never overwrites the original's autosave, and a text-only change keeps the slot.
import { describe, expect, it } from "vitest";
import { Session } from "../../src/app/session";
import { Game } from "../../src/core/game/game";
import { defaultPack } from "../helpers/world";

const copy = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

describe("browser save slot", () => {
  it("is the same for a session and for its pack", () => {
    const pack = defaultPack();
    expect(new Session(pack, Game.create(pack, 1)).slot).toBe(Session.slotFor(pack));
    expect(Session.slotFor(pack)).toMatch(new RegExp(`^${pack.manifest.id}#[0-9a-f]{16}$`));
  });

  it("differs for an edited copy with the same id and version", () => {
    const pack = defaultPack();
    const edited = copy(pack);
    edited.start.base_storage += 1;
    expect(Session.slotFor(edited)).not.toBe(Session.slotFor(pack));
  });

  it("does not change with the text", () => {
    const pack = defaultPack();
    const retold = copy(pack);
    const [lang] = Object.keys(retold.locale);
    retold.locale[lang!] = {};
    expect(Session.slotFor(retold)).toBe(Session.slotFor(pack));
  });
});
