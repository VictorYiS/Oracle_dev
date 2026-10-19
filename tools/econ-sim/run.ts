// npm run econ — tune the trade-off economy (plan P0.6).
// 1. Evaluate the designer defaults from the default pack.
// 2. Random-search nearby parameter sets for ones that satisfy every design check.
// 3. Re-verify the closest feasible set with more seeds, test robustness, write the report.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { EconomyParams } from "../../src/core/content/schema";
import { Rng } from "../../src/core/random/prng";
import { loadPack } from "../lib/read-pack";
import { TARGETS, type Verdict, landscape, verdict } from "./evaluate";
import { DEFAULT_SANDBOX, type SandboxParams } from "./model";

const arg = (name: string, fallback: number) => {
  const i = process.argv.indexOf(`--${name}`);
  if (i < 0) return fallback;
  const value = Number(process.argv[i + 1]);
  if (!Number.isInteger(value) || value < 1) {
    console.error(`--${name} needs a positive integer, got "${process.argv[i + 1] ?? ""}"`);
    process.exit(2);
  }
  return value;
};
const SAMPLES = arg("samples", 1500);
const SEARCH_SEEDS = arg("seeds", 60);
const FINAL_SEEDS = arg("final-seeds", 400);
const outIndex = process.argv.indexOf("--out");
const OUT =
  outIndex >= 0
    ? (process.argv[outIndex + 1] as string)
    : join(import.meta.dirname, "..", "..", "docs", "reports", "econ-sim-latest.md");

const result = loadPack("interpreter");
if (!result.ok) throw new Error(`default pack invalid: ${JSON.stringify(result.issues)}`);
const defaults = result.pack.economy;

// ---- search space -------------------------------------------------------------------------
interface Knobs {
  interest: number;
  ponderDebt: number;
  understanding: number;
  verify: number;
  verifyCatch: number;
  distBase: number;
  distPerDebt: number;
  t1: number;
  relief: number;
  cooldown: number;
  lossPerFalse: number;
  collectionScale: number;
  reckoning: number;
  upgrade: number;
  feeScale: number;
}

const RANGES: Record<keyof Knobs, [number, number]> = {
  interest: [0.02, 0.12],
  ponderDebt: [0.8, 3],
  understanding: [0.1, 0.8],
  verify: [0.5, 2],
  verifyCatch: [2, 8],
  distBase: [0, 0.04],
  distPerDebt: [0.002, 0.01],
  t1: [20, 60],
  relief: [0.3, 0.7],
  cooldown: [2, 5],
  lossPerFalse: [0.04, 0.12],
  collectionScale: [0.3, 1.2],
  reckoning: [0.3, 2],
  upgrade: [0.8, 1.6],
  feeScale: [0.5, 1.5],
};

const DEFAULT_KNOBS: Knobs = {
  interest: defaults.interest_rate,
  ponderDebt: defaults.petition_debt.ponder,
  understanding: defaults.understanding_debt_per_rule,
  verify: defaults.repay.verify,
  verifyCatch: defaults.repay.verify_catch,
  distBase: defaults.distortion.base,
  distPerDebt: defaults.distortion.per_debt,
  t1: defaults.collection_thresholds[0] ?? 30,
  relief: defaults.collection_relief,
  cooldown: defaults.collection_cooldown_days,
  lossPerFalse: DEFAULT_SANDBOX.lossPerFalseClaim,
  // toParams rebuilds collection losses as [1, 2, 3.5] × scale; centre the search on the current level.
  collectionScale: DEFAULT_SANDBOX.collectionLossDays[0],
  reckoning: DEFAULT_SANDBOX.reckoning,
  upgrade: DEFAULT_SANDBOX.petitionUpgrade,
  feeScale: DEFAULT_SANDBOX.feeScale,
};

const round = (x: number, step: number) => Number((Math.round(x / step) * step).toFixed(6));

function toParams(k: Knobs): { econ: EconomyParams; sb: SandboxParams } {
  const t1 = round(k.t1, 5);
  const ponder = round(k.ponderDebt, 0.25);
  const econ: EconomyParams = {
    ...defaults,
    interest_rate: round(k.interest, 0.01),
    petition_debt: { glance: round(ponder / 2, 0.25), ponder, decree: ponder * 2 },
    understanding_debt_per_rule: round(k.understanding, 0.05),
    repay: { ...defaults.repay, verify: round(k.verify, 0.25), verify_catch: round(k.verifyCatch, 0.5) },
    distortion: {
      ...defaults.distortion,
      base: round(k.distBase, 0.005),
      per_debt: round(k.distPerDebt, 0.0005),
    },
    collection_thresholds: [t1, t1 * 2, round(t1 * 3.3, 5)],
    collection_relief: round(k.relief, 0.05),
    collection_cooldown_days: Math.round(k.cooldown),
  };
  const s = k.collectionScale;
  const sb: SandboxParams = {
    ...DEFAULT_SANDBOX,
    lossPerFalseClaim: round(k.lossPerFalse, 0.005),
    collectionLossDays: [1 * s, 2 * s, 3.5 * s].map((x) => round(x, 0.05)) as [number, number, number],
    reckoning: round(k.reckoning, 0.05),
    petitionUpgrade: round(k.upgrade, 0.05),
    feeScale: round(k.feeScale, 0.05),
  };
  return { econ, sb };
}

function distance(k: Knobs): number {
  let d = 0;
  for (const key of Object.keys(RANGES) as (keyof Knobs)[]) {
    const [lo, hi] = RANGES[key];
    d += ((k[key] - DEFAULT_KNOBS[key]) / (hi - lo)) ** 2;
  }
  return Math.sqrt(d);
}

// The search asks for more than acceptance does, so the chosen set has headroom
// instead of sitting on the edge of a check.
const SEARCH_TARGETS = { margin: 1.25, temptation: 1.3, allInCollections: 1.5, moderateCollections: 0.15 };

/** 0 when every buffered check passes; otherwise the summed relative shortfall. */
function shortfall(v: Verdict): number {
  const t = SEARCH_TARGETS;
  return (
    Math.max(0, (t.margin - v.margin) / t.margin) +
    Math.max(0, (t.temptation - v.temptation) / t.temptation) +
    Math.max(0, t.allInCollections - v.allIn.collections) +
    Math.max(0, v.moderate.collections - t.moderateCollections)
  );
}

// ---- 1. defaults ---------------------------------------------------------------------------
const started = Date.now();
// The baseline is exactly what ships (pack + sandbox), not a reconstruction from search knobs.
const defaultVerdict = verdict(defaults, DEFAULT_SANDBOX, FINAL_SEEDS);

// ---- 2. search -----------------------------------------------------------------------------
const rng = Rng.fromSeed("econ-search-v0");
const candidates: { knobs: Knobs; short: number; dist: number; margin: number }[] = [];
for (let i = 0; i < SAMPLES; i++) {
  // Half of the samples stay near the defaults, half explore the whole range.
  const near = i % 2 === 0;
  const knobs = {} as Knobs;
  for (const key of Object.keys(RANGES) as (keyof Knobs)[]) {
    const [lo, hi] = RANGES[key];
    const value = near
      ? DEFAULT_KNOBS[key] + (rng.float() - 0.5) * 0.5 * (hi - lo)
      : lo + rng.float() * (hi - lo);
    knobs[key] = Math.min(hi, Math.max(lo, value));
  }
  const p = toParams(knobs);
  const v = verdict(p.econ, p.sb, SEARCH_SEEDS);
  candidates.push({ knobs, short: shortfall(v), dist: distance(knobs), margin: v.margin });
}
const feasible = candidates.filter((c) => c.short === 0).sort((a, b) => a.dist - b.dist);
const best = feasible[0] ?? [...candidates].sort((a, b) => a.short - b.short)[0]!;

// ---- 3. verify, robustness, landscape --------------------------------------------------------
const chosen = toParams(best.knobs);
const chosenVerdict = verdict(chosen.econ, chosen.sb, FINAL_SEEDS);
let robustPass = 0;
const ROBUST_TRIALS = 40;
for (let i = 0; i < ROBUST_TRIALS; i++) {
  const k = { ...best.knobs };
  for (const key of Object.keys(RANGES) as (keyof Knobs)[]) k[key] *= 1 + (rng.float() - 0.5) * 0.3; // ±15%
  const p = toParams(k);
  const v = verdict(p.econ, p.sb, SEARCH_SEEDS);
  if (v.margin >= TARGETS.margin) robustPass++;
}
const land = landscape(chosen.econ, chosen.sb, 150);
const seconds = ((Date.now() - started) / 1000).toFixed(0);

// ---- report ----------------------------------------------------------------------------------
const fmt = (x: number, d = 0) => x.toFixed(d);
const strategyTable = (v: Verdict) =>
  [
    "| 策略 | 30 天总分 | 标准差 | 前 10 天 | 催收次数 | 祈问槽/天 | 加班/天 | 债务峰值 | 期末债务 | 恩赐数 | 揭穿率 |",
    "|---|---|---|---|---|---|---|---|---|---|---|",
    ...[v.zero, v.moderate, v.allIn].map(
      (s) =>
        `| ${s.bot} | ${fmt(s.score)} | ${fmt(s.scoreSd)} | ${fmt(s.scoreDay10)} | ${fmt(s.collections, 2)} | ${fmt(s.slotsPerDay, 1)} | ${fmt(s.overtimePerDay, 1)} | ${fmt(s.peakDebt)} | ${fmt(s.finalDebt)} | ${fmt(s.boons, 1)} | ${fmt(s.caughtShare * 100)}% |`,
    ),
  ].join("\n");
const checkList = (v: Verdict) =>
  v.checks.map((c) => `- ${c.pass ? "✅" : "❌"} ${c.name}：${c.detail}`).join("\n");

const e = chosen.econ;
const d = defaults;
const row = (name: string, before: unknown, after: unknown) =>
  `| ${name} | ${String(before)} | ${String(after)} |${String(before) === String(after) ? "" : " ← 调整"}`;

const report = `# 经济模拟报告（P0.6）

> 生成命令：\`npm run econ\`（${SAMPLES} 组候选参数 × 每组 ${SEARCH_SEEDS} 局 × 3 种策略；终选参数用 ${FINAL_SEEDS} 局复核）。耗时约 ${seconds} 秒。
> 模型：\`tools/econ-sim/\`。交易规则直接调用 \`src/core/economy/ledger.ts\`，世界部分是抽象沙盘。

## 结论

${feasible.length > 0 ? `在 ${SAMPLES} 组候选里，有 **${feasible.length} 组** 在留出余量的目标下（适度领先 ≥ ${SEARCH_TARGETS.margin}×、前 10 天诱惑 ≥ ${SEARCH_TARGETS.temptation}×、全托管催收 ≥ ${SEARCH_TARGETS.allInCollections}、适度催收 ≤ ${SEARCH_TARGETS.moderateCollections}）同时满足四项检查。下面选的是离设计初值最近的一组。` : "**没有找到同时满足四项检查的参数组。** 下面是最接近的一组，需要调整模型或目标。"}

- 设计初值：${defaultVerdict.checks.filter((c) => c.pass).length}/4 项通过。
- 推荐参数：${chosenVerdict.checks.filter((c) => c.pass).length}/4 项通过（${FINAL_SEEDS} 局复核）。
- 稳健性：推荐参数每项随机扰动 ±15%，${ROBUST_TRIALS} 次里有 ${robustPass} 次仍然保持"适度领先 ≥ ${TARGETS.margin}×"。

## 设计检查

对应设计支柱"零神谕和全托管都不是最强打法"（设计文档 §1.1），以及"每个恩赐都要真香"（§6.6）。

**推荐参数**

${checkList(chosenVerdict)}

**设计初值**

${checkList(defaultVerdict)}

## 三种策略

- 零神谕：从不祈问、不签恩赐，规则全靠亲手写。
- 适度：每天 2 次深问 + 1 次轻问，不加班；签约前用洞察读细则；报告的债务超过第一条催收线的 40% 就去核验、译读。
- 全托管：用满每日次数再加班 1 次；永远签标题最诱人的恩赐；从不核验。

**推荐参数**

${strategyTable(chosenVerdict)}

**设计初值**

${strategyTable(defaultVerdict)}

## 收益地形（推荐参数，每格 150 局）

每天深问次数 × 是否核验。最优点应当落在中间，而不是两端。

| 每天深问 | 不核验 | 债务过 40% 线核验 |
|---|---|---|
${[0, 1, 2, 3, 4]
  .map((n) => {
    const cells = land.filter((r) => r.ponders === n);
    return `| ${n}${n > 2 ? `（含 ${n - 2} 次加班）` : ""} | ${cells.map((c) => `${fmt(c.score)}（催收 ${fmt(c.collections, 1)}）`).join(" | ")} |`;
  })
  .join("\n")}

## 推荐参数（剧本包 \`oracle/economy.yaml\`）

| 参数 | 设计初值 | 推荐 |
|---|---|---|
${[
  row("interest_rate", d.interest_rate, e.interest_rate),
  row("petition_debt", JSON.stringify(d.petition_debt), JSON.stringify(e.petition_debt)),
  row("understanding_debt_per_rule", d.understanding_debt_per_rule, e.understanding_debt_per_rule),
  row("repay.verify", d.repay.verify, e.repay.verify),
  row("repay.verify_catch", d.repay.verify_catch, e.repay.verify_catch),
  row("distortion.base", d.distortion.base, e.distortion.base),
  row("distortion.per_debt", d.distortion.per_debt, e.distortion.per_debt),
  row(
    "collection_thresholds",
    JSON.stringify(d.collection_thresholds),
    JSON.stringify(e.collection_thresholds),
  ),
  row("collection_relief", d.collection_relief, e.collection_relief),
  row("collection_cooldown_days", d.collection_cooldown_days, e.collection_cooldown_days),
].join("\n")}

## 给 P3 真实模拟的要求

下面这些不是剧本包参数，而是沙盘对"真实世界后果有多重"的假设。P3 做真实模拟时，失真和催收造成的损失要落在这个量级，上面的参数才成立。

| 假设 | 沙盘初值 | 推荐 |
|---|---|---|
| 每条没被揭穿的失真，损失当天产出的比例 | ${DEFAULT_SANDBOX.lossPerFalseClaim} | ${chosen.sb.lossPerFalseClaim} |
| 催收损失（1/2/3 级，单位：天产出） | ${DEFAULT_SANDBOX.collectionLossDays.join(" / ")} | ${chosen.sb.collectionLossDays.join(" / ")} |
| 终局清算：每单位未还债务扣分 | ${DEFAULT_SANDBOX.reckoning} | ${chosen.sb.reckoning} |
| 一次规划型深问带来的长期产出 | ${DEFAULT_SANDBOX.petitionUpgrade} | ${chosen.sb.petitionUpgrade} |
| 恩赐订阅费整体缩放 | ${DEFAULT_SANDBOX.feeScale} | ${chosen.sb.feeScale} |

## 局限

- 世界是抽象的：没有地图、居民、具体的失真类型，催收也只是一笔损失。它只能说明交易规则的**形状**对不对，不能替代 P3 的平衡机器人。
- 三个机器人是手写的启发式，"适度"并不是最优解，只是一种合理的打法。真实玩家可能找到更好的打法，这正是 P3 要用真实模拟回归的原因。
- 恩赐只有抽象效果，细则的"荒诞"部分没有建模。
`;

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, report);
console.log(report.split("\n## 设计检查")[0]);
console.log(`\nReport written to ${OUT}`);
