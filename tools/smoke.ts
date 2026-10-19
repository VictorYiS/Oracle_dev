// npm run smoke — every pack (and the test fixture packs) runs 30 game days of the real world
// simulation under the scripted bot without crashing, and prints the final hash with residents,
// powered buildings, open cases and pending checks; its economy sandbox (P0) runs 30 days for every
// strategy without NaN or negative debt.
import { Game } from "../src/core/game/game";
import { openCases } from "../src/core/world/query";
import type { Pack } from "../src/core/content/pack";
import { allIn, moderate, zeroOracle } from "./econ-sim/bots";
import { DEFAULT_SANDBOX, runGame } from "./econ-sim/model";
import { playBot } from "./lib/bot";
import { FIXTURE_SCENARIOS_DIR, listPackIds, loadPack, loadPackFrom, SCENARIOS_DIR } from "./lib/read-pack";

let failures = 0;

function world(id: string, pack: Pack): void {
  try {
    const game = Game.create(pack, 1);
    playBot(game, 30);
    const w = game.world;
    const residents = w.residents.filter((r) => r.here).length;
    const powered = w.buildings.filter((b) => b.power).length;
    const open = openCases(w).length;
    const pending = w.pending.items.filter((p) => p.verdict === null).length;
    console.log(
      `✓ ${id}: world 30 days · hash ${game.hash()} · residents ${residents} · powered buildings ${powered} · open cases ${open} · pending checks ${pending}`,
    );
  } catch (e) {
    failures++;
    console.error(`✗ ${id}: world simulation crashed: ${e instanceof Error ? e.stack : String(e)}`);
  }
}

function economy(id: string, pack: Pack): void {
  if (!pack.manifest.systems.includes("debt")) return;
  for (const bot of [zeroOracle, moderate, allIn]) {
    for (const seed of [1, 2, 3]) {
      const r = runGame(pack.economy, { ...DEFAULT_SANDBOX, days: 30 }, bot, seed);
      if ([r.score, r.finalDebt, r.peakDebt].some((x) => !Number.isFinite(x)) || r.finalDebt < 0) {
        failures++;
        console.error(`✗ ${id} · economy · ${bot.name} · seed ${seed}: ${JSON.stringify(r)}`);
      }
    }
  }
  // The P0 line, unchanged (P0 acceptance A6 looks for it).
  console.log(`✓ ${id}: 30 days × 3 strategies × 3 seeds`);
}

const packs: [string, ReturnType<typeof loadPack>][] = [
  ...listPackIds().map((id) => [id, loadPack(id)] as [string, ReturnType<typeof loadPack>]),
  ...listPackIds(FIXTURE_SCENARIOS_DIR).map(
    (id) =>
      [`fixture:${id}`, loadPackFrom(id, [FIXTURE_SCENARIOS_DIR, SCENARIOS_DIR])] as [
        string,
        ReturnType<typeof loadPack>,
      ],
  ),
];
for (const [id, result] of packs) {
  if (!result.ok) {
    failures++;
    console.error(`✗ ${id}: pack does not load (run npm run validate)`);
    continue;
  }
  world(id, result.pack);
  economy(id, result.pack);
}
if (failures > 0) process.exit(1);
