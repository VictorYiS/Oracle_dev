// window.oracle: a small hook for end-to-end tests and curious players. It reads the world and
// steps time; it cannot change state except by submitting the same commands the UI does.
import type { CommandRecord, CommandResult } from "../core/commands/schema";
import { Game } from "../core/game/game";
import { loadBundledPack } from "./packs";
import type { Session } from "./session";

export interface OracleDebug {
  hash(): string | null;
  world(): unknown;
  advance(ticks: number): number;
  submit(command: Record<string, unknown>): CommandResult | null;
  /** Submit a debug command (debug.truth, debug.record): changes the world behind everyone's back. */
  debug(command: Record<string, unknown>): CommandResult | null;
  /** The Oracle's suggestion for a case at the window. */
  suggestion(caseId: string): unknown;
  /** Rebuild a game from a bundled pack and a command log; returns its daily and final hashes. */
  replay(
    packId: string,
    seed: number,
    commands: CommandRecord[],
    finalTick: number,
  ): Promise<{ dailyHashes: { day: number; hash: string }[]; hash: string }>;
  /** Start a new game with the default pack and this seed (returns false before the pack loads). */
  newGame(seed: number): boolean;
  /** Event kinds and data so far, oldest first. */
  events(): { id: number; day: number; kind: string; data: Record<string, unknown> }[];
}

declare global {
  interface Window {
    oracle?: OracleDebug;
  }
}

export function installDebug(current: () => Session | null, newGame: (seed: number) => boolean): void {
  window.oracle = {
    hash: () => current()?.game.hash() ?? null,
    world: () => JSON.parse(JSON.stringify(current()?.world ?? null)) as unknown,
    advance: (ticks) => current()?.advance(ticks) ?? 0,
    submit: (command) => current()?.submit(command) ?? null,
    debug: (command) => current()?.submitDebug(command) ?? null,
    suggestion: (caseId) => JSON.parse(JSON.stringify(current()?.game.suggestion(caseId) ?? null)) as unknown,
    async replay(packId, seed, commands, finalTick) {
      const result = await loadBundledPack(packId);
      if (!result.ok) throw new Error(`pack ${packId} did not load`);
      const game = Game.create(result.pack, seed);
      game.replay(commands);
      game.advanceTo(finalTick);
      return { dailyHashes: [...game.dailyHashes], hash: game.hash() };
    },
    newGame,
    events: () =>
      (current()?.game.events ?? []).map((e) => ({
        id: e.id,
        day: e.day,
        kind: e.kind,
        data: { ...e.data },
      })),
  };
}
