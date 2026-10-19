// The one object the app, tools and tests drive: create a world, submit commands, advance time,
// read a read-only view, save and replay. It never writes state itself; the command bus and the
// world's own systems do.
import type { Pack } from "../content/pack";
import { ENGINE_SCHEMA_VERSION } from "../content/schema";
import { submit as busSubmit } from "../commands/bus";
import type { CommandRecord, CommandResult } from "../commands/schema";
import { createWorld } from "../world/create";
import { hashState } from "../world/hash";
import type { Ctx } from "../world/ctx";
import { indexPack, type PackIndex } from "../world/pack-index";
import { advanceTicks, ticksUntilDusk } from "../world/time";
import type { EventView, WorldEvent, WorldState, WorldView } from "../world/types";

export const SAVE_FORMAT = "oracle-save";
export const SAVE_VERSION = 1;
/** Events kept in a save; older ones can be rebuilt by replaying from the start if ever needed. */
const SAVED_EVENTS = 500;
/** Events kept in memory. The log is trimmed back to this once it reaches twice as many. */
export const EVENT_LOG_LIMIT = 2000;

export interface SaveFile {
  format: typeof SAVE_FORMAT;
  version: typeof SAVE_VERSION;
  engine: string;
  /** `fingerprint` is the pack's content hash without its text (packFingerprint). */
  pack: { id: string; version: string; fingerprint: string };
  seed: number;
  /** World and event log at the last dusk (or at the start). */
  snapshot: { state: WorldState; events: WorldEvent[]; nextSeq: number };
  /** Commands submitted after the snapshot, in order. */
  commands: CommandRecord[];
  /** The clock tick when the save was made. */
  tick: number;
  dailyHashes: { day: number; hash: string }[];
}

export type SaveErrorCode = "NOT_A_SAVE" | "INCOMPATIBLE_VERSION" | "WRONG_PACK";

export class SaveError extends Error {
  constructor(
    readonly code: SaveErrorCode,
    message: string,
  ) {
    super(message);
  }
}

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

export class Game {
  readonly ix: PackIndex;
  private ctx: Ctx;
  private records: CommandRecord[] = [];
  private nextSeq = 1;
  private hashes: { day: number; hash: string }[] = [];
  private snap: SaveFile["snapshot"];
  private recordsAtSnap = 0;

  private constructor(ix: PackIndex, state: WorldState, events: WorldEvent[], nextSeq: number) {
    this.ix = ix;
    this.ctx = { s: state, ix, log: events };
    this.nextSeq = nextSeq;
    this.snap = { state: clone(state), events: clone(events.slice(-SAVED_EVENTS)), nextSeq };
  }

  static create(pack: Pack, seed: number): Game {
    const ix = indexPack(pack);
    const { s, log } = createWorld(ix, seed);
    return new Game(ix, s, log, 1);
  }

  /** Keep the in-memory log bounded over a long session. The log is not part of the state. */
  private trimLog(): void {
    const log = this.ctx.log;
    if (log.length >= 2 * EVENT_LOG_LIMIT) log.splice(0, log.length - EVENT_LOG_LIMIT);
  }

  get pack(): Pack {
    return this.ix.pack;
  }

  /** Read-only: the type forbids writes, and the only writers are the bus and the world systems. */
  get world(): WorldView {
    return this.ctx.s;
  }

  get events(): readonly EventView[] {
    return this.ctx.log;
  }

  get commands(): readonly CommandRecord[] {
    return this.records;
  }

  get dailyHashes(): readonly { day: number; hash: string }[] {
    return this.hashes;
  }

  hash(): string {
    return hashState(this.ctx.s);
  }

  ticksUntilDusk(): number {
    return ticksUntilDusk(this.ctx);
  }

  submit(command: unknown): CommandResult {
    const seq = this.nextSeq++;
    const tick = this.ctx.s.clock.tick;
    const result = busSubmit(this.ctx, command, seq);
    this.records.push({ seq, tick, command, result: result.ok ? "ok" : result.code });
    this.trimLog();
    return result;
  }

  /** Run up to `ticks` day ticks; stops at dusk, where the day's hash and a snapshot are taken. */
  advance(ticks: number): number {
    const before = this.ctx.s.clock.phase;
    const done = advanceTicks(this.ctx, ticks);
    if (before === "day" && this.ctx.s.clock.phase === "dusk") {
      this.hashes.push({ day: this.ctx.s.clock.day, hash: this.hash() });
      this.snap = {
        state: clone(this.ctx.s),
        events: clone(this.ctx.log.slice(-SAVED_EVENTS)),
        nextSeq: this.nextSeq,
      };
      this.recordsAtSnap = this.records.length;
    }
    this.trimLog();
    return done;
  }

  /** Advance until the clock reaches `tick` (or the day ends first). */
  advanceTo(tick: number): void {
    while (this.ctx.s.clock.tick < tick && this.ctx.s.clock.phase === "day") {
      this.advance(tick - this.ctx.s.clock.tick);
    }
  }

  toSave(): SaveFile {
    return {
      format: SAVE_FORMAT,
      version: SAVE_VERSION,
      engine: ENGINE_SCHEMA_VERSION,
      pack: { ...this.ctx.s.pack, fingerprint: this.ix.fingerprint },
      seed: this.ctx.s.seed,
      snapshot: clone(this.snap),
      commands: clone(this.records.slice(this.recordsAtSnap)),
      tick: this.ctx.s.clock.tick,
      dailyHashes: [...this.hashes],
    };
  }

  /** Rebuild a game from a save: restore the snapshot, replay the commands after it. */
  static fromSave(pack: Pack, raw: unknown): Game {
    const save = raw as Partial<SaveFile> | null;
    if (
      !save ||
      typeof save !== "object" ||
      save.format !== SAVE_FORMAT ||
      !save.snapshot ||
      !save.commands
    ) {
      throw new SaveError("NOT_A_SAVE", "this file is not an Oracle save");
    }
    if (save.version !== SAVE_VERSION || save.engine !== ENGINE_SCHEMA_VERSION) {
      throw new SaveError(
        "INCOMPATIBLE_VERSION",
        `save format ${String(save.version)} / engine ${String(save.engine)} cannot be read by format ${SAVE_VERSION} / engine ${ENGINE_SCHEMA_VERSION}`,
      );
    }
    if (save.pack?.id !== pack.manifest.id || save.pack.version !== pack.manifest.version) {
      throw new SaveError(
        "WRONG_PACK",
        `save is for ${save.pack?.id ?? "?"} ${save.pack?.version ?? "?"}, loaded pack is ${pack.manifest.id} ${pack.manifest.version}`,
      );
    }
    const ix = indexPack(pack);
    if (save.pack.fingerprint !== ix.fingerprint) {
      // Same id and version, different content (an edited or imported copy): replay would diverge.
      throw new SaveError(
        "WRONG_PACK",
        `save is for a different build of ${pack.manifest.id} ${pack.manifest.version} (content ${String(save.pack.fingerprint)}, loaded ${ix.fingerprint})`,
      );
    }
    const game = new Game(ix, clone(save.snapshot.state), clone(save.snapshot.events), save.snapshot.nextSeq);
    game.hashes = [...(save.dailyHashes ?? [])];
    game.replay(save.commands);
    game.advanceTo(save.tick ?? game.ctx.s.clock.tick);
    return game;
  }

  /** Re-apply recorded commands at the ticks they were first submitted. */
  replay(records: readonly CommandRecord[]): void {
    for (const record of records) {
      this.advanceTo(record.tick);
      this.submit(record.command);
    }
  }
}
