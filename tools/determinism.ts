// npm run determinism — the default pack, seed 42, played by the scripted bot for 100 days, twice;
// then a third game rebuilt purely by replaying the first game's command log. All three must
// agree on every daily hash. (Browsers are compared by tests/e2e/determinism.spec.ts.)
import { Game } from "../src/core/game/game";
import { botStats, playBot } from "./lib/bot";
import { COMMAND_TYPES, REJECTIONS } from "../src/core/commands/schema";
import { DETERMINISM } from "./lib/determinism-config";
import { loadPack } from "./lib/read-pack";

const result = loadPack(DETERMINISM.pack);
if (!result.ok) throw new Error("default pack failed to load (run npm run validate)");
const { pack } = result;

const play = () => {
  const g = Game.create(pack, DETERMINISM.seed);
  playBot(g, DETERMINISM.days);
  return g;
};
const first = play();
const second = play();
const replayed = Game.create(pack, DETERMINISM.seed);
replayed.replay(first.commands);
replayed.advanceTo(first.world.clock.tick);

let mismatches = 0;
for (let i = 0; i < first.dailyHashes.length; i++) {
  const a = first.dailyHashes[i]!;
  const b = second.dailyHashes[i];
  const c = replayed.dailyHashes[i];
  const same = a.hash === b?.hash && a.hash === c?.hash;
  if (!same) mismatches++;
  console.log(
    `day ${String(a.day).padStart(3)}  ${a.hash}  ${b?.hash ?? "-"}  ${c?.hash ?? "-"}  ${same ? "=" : "≠"}`,
  );
}

const stats = botStats(first);
const missingTypes = COMMAND_TYPES.filter((t) => !stats.byType[t]);
const missingRejections = REJECTIONS.filter((r) => !stats.rejections[r]);
console.log(`\ndays: ${first.dailyHashes.length}  final hash: ${first.hash()}`);
console.log(`commands: ${stats.submitted} submitted, ${stats.accepted} accepted`);
console.log(`by type: ${JSON.stringify(stats.byType)}`);
console.log(`rejections: ${JSON.stringify(stats.rejections)}`);

const problems: string[] = [];
if (first.dailyHashes.length !== DETERMINISM.days) problems.push(`expected ${DETERMINISM.days} days`);
if (mismatches > 0) problems.push(`${mismatches} day(s) differ`);
if (first.hash() !== second.hash() || first.hash() !== replayed.hash()) problems.push("final hashes differ");
if (stats.submitted < 200) problems.push(`only ${stats.submitted} commands (need ≥ 200)`);
if (missingTypes.length) problems.push(`command types never used: ${missingTypes.join(", ")}`);
if (missingRejections.length) problems.push(`rejections never exercised: ${missingRejections.join(", ")}`);

if (problems.length > 0) {
  console.error(`\n✗ not deterministic or not covered: ${problems.join("; ")}`);
  process.exit(1);
}
console.log("\n✓ two runs and a replay agree on all 100 days");
