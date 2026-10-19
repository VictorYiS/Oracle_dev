// One running game in the browser: steps the world in real time, forwards the player's orders
// as commands, and saves. The UI subscribes to it and re-renders on `revision`.
import type { Pack } from "../core/content/pack";
import type { CommandResult } from "../core/commands/schema";
import { Game } from "../core/game/game";
import type { WorldView } from "../core/world/types";
import { type Speed, ticksForFrame } from "./clock";
import { readSave, writeSave } from "./storage";

export class Session {
  speed: Speed = 1;
  /** Bumped on every change the UI might show. */
  revision = 0;
  lastResult: CommandResult | null = null;
  private listeners = new Set<() => void>();
  private frame = 0;
  private last = 0;
  private carry = 0;
  private running = false;
  private autosavedDay = 0;

  constructor(
    readonly pack: Pack,
    public game: Game,
  ) {
    this.autosavedDay =
      game.world.clock.phase === "dusk" || game.world.clock.phase === "night" ? game.world.clock.day : 0;
  }

  static newGame(pack: Pack, seed: number): Session {
    return new Session(pack, Game.create(pack, seed));
  }

  get world(): WorldView {
    return this.game.world;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private changed(): void {
    this.revision++;
    const clock = this.world.clock;
    if (clock.phase === "dusk" && clock.day > this.autosavedDay) {
      this.autosavedDay = clock.day;
      void this.saveToBrowser();
    }
    for (const listener of this.listeners) listener();
  }

  submit(command: Record<string, unknown>): CommandResult {
    const result = this.game.submit({ ...command, source: "manual" });
    this.lastResult = result;
    this.changed();
    return result;
  }

  setSpeed(speed: Speed): void {
    this.speed = speed;
    this.carry = 0;
    this.changed();
  }

  /** Step the world directly (tests and the debug hook); real play goes through the frame loop. */
  advance(ticks: number): number {
    const done = this.game.advance(ticks);
    if (done > 0) this.changed();
    return done;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    this.frame = requestAnimationFrame(this.loop);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.frame);
  }

  private loop = (now: number): void => {
    if (!this.running) return;
    const elapsed = now - this.last;
    this.last = now;
    if (this.world.clock.phase === "day") {
      const { ticks, carry } = ticksForFrame(this.speed, elapsed, this.carry);
      this.carry = carry;
      if (ticks > 0) {
        this.game.advance(ticks);
        this.changed();
      }
    }
    this.frame = requestAnimationFrame(this.loop);
  };

  get slot(): string {
    return this.pack.manifest.id;
  }

  saveToBrowser(): Promise<boolean> {
    return writeSave(this.slot, this.game.toSave());
  }

  saveText(): string {
    return JSON.stringify(this.game.toSave());
  }

  /** Throws SaveError when the save does not fit this pack or this version. */
  static fromSave(pack: Pack, save: unknown): Session {
    return new Session(pack, Game.fromSave(pack, save));
  }

  static async fromBrowser(pack: Pack): Promise<Session | null> {
    const save = await readSave(pack.manifest.id);
    return save ? Session.fromSave(pack, save) : null;
  }
}
