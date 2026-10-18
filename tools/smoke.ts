// npm run smoke — every pack loads, and its economy runs 30 headless days for every strategy
// without NaN, negative debt or crashes. P1 adds the real world simulation to this run.
import { allIn, moderate, zeroOracle } from "./econ-sim/bots";
import { DEFAULT_SANDBOX, runGame } from "./econ-sim/model";
import { listPackIds, loadPack } from "./lib/read-pack";

let failures = 0;
for (const id of listPackIds()) {
  const result = loadPack(id);
  if (!result.ok) {
    failures++;
    console.error(`✗ ${id}: pack does not load (run npm run validate)`);
    continue;
  }
  const { pack } = result;
  if (!pack.manifest.systems.includes("debt")) {
    console.log(`- ${id}: debt system disabled, economy skipped`);
    continue;
  }
  for (const bot of [zeroOracle, moderate, allIn]) {
    for (const seed of [1, 2, 3]) {
      const r = runGame(pack.economy, { ...DEFAULT_SANDBOX, days: 30 }, bot, seed);
      const bad = [r.score, r.finalDebt, r.peakDebt].some((x) => !Number.isFinite(x)) || r.finalDebt < 0;
      if (bad) {
        failures++;
        console.error(`✗ ${id} · ${bot.name} · seed ${seed}: ${JSON.stringify(r)}`);
      }
    }
  }
  console.log(`✓ ${id}: 30 days × 3 strategies × 3 seeds`);
}
if (failures > 0) process.exit(1);
