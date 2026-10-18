import type { EconomyParams } from "../../src/core/content/schema";
import { allIn, measured, moderate, zeroOracle } from "./bots";
import { type Bot, type RunResult, type SandboxParams, runGame } from "./model";

export interface Summary {
  bot: string;
  score: number;
  scoreSd: number;
  scoreDay10: number;
  collections: number;
  slotsPerDay: number;
  overtimePerDay: number;
  peakDebt: number;
  finalDebt: number;
  boons: number;
  caughtShare: number;
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const sd = (xs: number[]) => {
  const m = mean(xs);
  return Math.sqrt(mean(xs.map((x) => (x - m) ** 2)));
};

export function summarize(bot: Bot, econ: EconomyParams, sb: SandboxParams, seeds: number): Summary {
  const runs: RunResult[] = [];
  for (let s = 1; s <= seeds; s++) runs.push(runGame(econ, sb, bot, s * 7919));
  const pick = (f: (r: RunResult) => number) => runs.map(f);
  const falseClaims = mean(pick((r) => r.falseClaims));
  return {
    bot: bot.name,
    score: mean(pick((r) => r.score)),
    scoreSd: sd(pick((r) => r.score)),
    scoreDay10: mean(pick((r) => r.scoreDay10)),
    collections: mean(pick((r) => r.collections)),
    slotsPerDay: mean(pick((r) => r.slotsPerDay)),
    overtimePerDay: mean(pick((r) => r.overtimePerDay)),
    peakDebt: mean(pick((r) => r.peakDebt)),
    finalDebt: mean(pick((r) => r.finalDebt)),
    boons: mean(pick((r) => r.boons)),
    caughtShare: falseClaims > 0 ? mean(pick((r) => r.caught)) / falseClaims : 0,
  };
}

export interface Verdict {
  zero: Summary;
  moderate: Summary;
  allIn: Summary;
  /** moderate / best extreme */
  margin: number;
  /** all-in vs zero over the first ten days: is delegating tempting? */
  temptation: number;
  checks: { name: string; pass: boolean; detail: string }[];
}

export const TARGETS = { margin: 1.15, temptation: 1.2, allInCollections: 1, moderateCollections: 0.3 };

export function verdict(econ: EconomyParams, sb: SandboxParams, seeds: number): Verdict {
  const zero = summarize(zeroOracle, econ, sb, seeds);
  const mod = summarize(moderate, econ, sb, seeds);
  const all = summarize(allIn, econ, sb, seeds);
  const margin = mod.score / Math.max(zero.score, all.score, 1);
  const temptation = all.scoreDay10 / Math.max(zero.scoreDay10, 1);
  return {
    zero,
    moderate: mod,
    allIn: all,
    margin,
    temptation,
    checks: [
      {
        name: "适度领先两个极端",
        pass: margin >= TARGETS.margin,
        detail: `${margin.toFixed(2)}× (目标 ≥ ${TARGETS.margin}×)`,
      },
      {
        name: "前 10 天全托管更诱人",
        pass: temptation >= TARGETS.temptation,
        detail: `${temptation.toFixed(2)}× 零神谕 (目标 ≥ ${TARGETS.temptation}×)`,
      },
      {
        name: "全托管会被催收",
        pass: all.collections >= TARGETS.allInCollections,
        detail: `${all.collections.toFixed(1)} 次/局 (目标 ≥ ${TARGETS.allInCollections})`,
      },
      {
        name: "适度很少被催收",
        pass: mod.collections <= TARGETS.moderateCollections,
        detail: `${mod.collections.toFixed(2)} 次/局 (目标 ≤ ${TARGETS.moderateCollections})`,
      },
    ],
  };
}

/** Score landscape over the measured family: is the best play in the interior? */
export function landscape(econ: EconomyParams, sb: SandboxParams, seeds: number) {
  const rows: { ponders: number; verify: string; score: number; collections: number }[] = [];
  for (const ponders of [0, 1, 2, 3, 4]) {
    for (const [label, verifyAt] of [
      ["不核验", Infinity],
      ["债务过 40% 线核验", 0.4],
    ] as const) {
      const bot = measured({ ponders, verifyAt, verifyHours: 3, readFinePrint: true });
      const s = summarize(bot, econ, sb, seeds);
      rows.push({ ponders, verify: label, score: s.score, collections: s.collections });
    }
  }
  return rows;
}
