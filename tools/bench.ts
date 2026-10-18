// npm run bench — wall-clock time to simulate 30 game days of the default pack with the bot.
// Budget (P1 acceptance A12): ≤ 3000 ms.
import { Game } from "../src/core/game/game";
import { playBot } from "./lib/bot";
import { loadPack } from "./lib/read-pack";

const BUDGET_MS = 3000;
const DAYS = 30;

const result = loadPack("interpreter");
if (!result.ok) throw new Error("default pack failed to load");
const { pack } = result;

const times: number[] = [];
let ticks = 0;
for (let run = 0; run < 3; run++) {
  const start = performance.now();
  const game = Game.create(pack, 7 + run);
  playBot(game, DAYS);
  times.push(performance.now() - start);
  ticks = game.world.clock.tick;
}
times.sort((a, b) => a - b);
const median = times[1]!;
console.log(
  `${DAYS} game days (${ticks} ticks): median ${median.toFixed(0)} ms over 3 runs [${times.map((t) => t.toFixed(0)).join(", ")}]`,
);
console.log(`throughput: ${Math.round(ticks / (median / 1000)).toLocaleString("en")} ticks/s`);
if (median > BUDGET_MS) {
  console.error(`✗ over budget (${BUDGET_MS} ms)`);
  process.exit(1);
}
console.log(`✓ within ${BUDGET_MS} ms`);
