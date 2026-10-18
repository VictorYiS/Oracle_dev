// Economy sandbox (plan P0.6). An abstract settlement stands in for the real world model
// (production, automation, losses), while every trade-off rule comes from src/core/economy,
// so what is tuned here is what the game will run. P3 swaps the abstract world for the real sim.
import type { EconomyParams } from "../../src/core/content/schema";
import * as L from "../../src/core/economy/ledger";
import { Rng } from "../../src/core/random/prng";

export interface SandboxParams {
  days: number;
  /** Avatar hours per day. */
  hours: number;
  /** Oracle claims the player acts on each day (reports, forecasts, plan assumptions). */
  claimsPerDay: number;
  baseProduction: number;
  manualPerHour: number;
  ruleYield: number;
  ruleWriteHours: number;
  maxRules: number;
  /** Permanent production gained from one planning petition, before diminishing returns. */
  petitionUpgrade: number;
  upgradeSoftCap: number;
  glanceBonus: number;
  /** Chance that an overtime petition's result is made up. */
  overtimeWasteBp: number;
  /** Share of the day's production lost to each distortion nobody caught. */
  lossPerFalseClaim: number;
  /** Production-days lost per collection level. */
  collectionLossDays: [number, number, number];
  verifyHours: number;
  /** How much likelier a verification lands on a false claim than a random pick (telegraphed hints). */
  verifyHint: number;
  translateHours: number;
  /** End-of-run reckoning: score lost per unit of debt still outstanding. */
  reckoning: number;
  /** Scales every boon's daily fee (boon fees will live in the pack's boon files). */
  feeScale: number;
}

// Consequence sizes recommended by docs/reports/econ-sim-v0.md. P3's real simulation
// must land in this range for the pack's economy values to hold.
export const DEFAULT_SANDBOX: SandboxParams = {
  days: 30,
  hours: 8,
  claimsPerDay: 6,
  baseProduction: 10,
  manualPerHour: 1,
  ruleYield: 1,
  ruleWriteHours: 6,
  maxRules: 12,
  petitionUpgrade: 1.4,
  upgradeSoftCap: 15,
  glanceBonus: 1.5,
  overtimeWasteBp: 3000,
  lossPerFalseClaim: 0.09,
  collectionLossDays: [0.85, 1.75, 3.05],
  verifyHours: 1,
  verifyHint: 2,
  translateHours: 2,
  reckoning: 0.9,
  feeScale: 0.75,
};

export interface Effects {
  prodMult: number;
  extraSlots: number;
  extraSlotDebtMult: number;
  petitionDebtMult: number;
  manualHours: number;
  distortionBp: number;
  lossChanceBp: number;
  lossFrac: number;
  autoDebt: number;
  collectionMult: number;
  hideDebt: boolean;
  planWasteBp: number;
  verifyHintMult: number;
}

const NO_EFFECT: Effects = {
  prodMult: 0,
  extraSlots: 0,
  extraSlotDebtMult: 1,
  petitionDebtMult: 1,
  manualHours: 0,
  distortionBp: 0,
  lossChanceBp: 0,
  lossFrac: 0,
  autoDebt: 0,
  collectionMult: 1,
  hideDebt: false,
  planWasteBp: 0,
  verifyHintMult: 1,
};

export interface SimBoon {
  id: string;
  /** What the headline promises, as a production-multiplier equivalent. */
  headline: number;
  fee: number;
  effect: Partial<Effects>;
  /** The fine print. Applies whether or not it was read. */
  fine: Partial<Effects>;
}

// Abstract versions of the ten boons in design doc §6.6.
export const BOON_POOL: SimBoon[] = [
  { id: "omniscient_report", headline: 0.1, fee: 1, effect: { prodMult: 0.1 }, fine: { distortionBp: 300 } },
  { id: "one_click_approval", headline: 0.12, fee: 1, effect: { prodMult: 0.12 }, fine: { autoDebt: 1.5 } },
  {
    id: "efficiency_protocol",
    headline: 0.2,
    fee: 1.5,
    effect: { prodMult: 0.2 },
    fine: { lossChanceBp: 2000, lossFrac: 0.15 },
  },
  { id: "mood_guard", headline: 0.08, fee: 0.5, effect: { prodMult: 0.08 }, fine: { distortionBp: 400 } },
  {
    id: "memory_palace",
    headline: 0.1,
    fee: 1,
    effect: { petitionDebtMult: 0.75 },
    fine: { planWasteBp: 1000 },
  },
  { id: "reply_for_you", headline: 0.1, fee: 1, effect: { manualHours: 2 }, fine: { verifyHintMult: 0.6 } },
  {
    id: "prophecy_broadcast",
    headline: 0.15,
    fee: 1,
    effect: { prodMult: 0.15 },
    fine: { collectionMult: 1.5 },
  },
  { id: "paperclip_protocol", headline: 0.3, fee: 1, effect: { prodMult: 0.1 }, fine: {} },
  { id: "never_closed", headline: 0.15, fee: 2, effect: { extraSlots: 2 }, fine: { extraSlotDebtMult: 2 } },
  {
    id: "do_not_disturb",
    headline: 0.05,
    fee: 0.5,
    effect: { prodMult: 0.05 },
    fine: { hideDebt: true, distortionBp: 200 },
  },
];

export function aggregate(boons: readonly SimBoon[]): Effects {
  const fx: Effects = { ...NO_EFFECT };
  for (const b of boons) {
    for (const part of [b.effect, b.fine]) {
      fx.prodMult += part.prodMult ?? 0;
      fx.extraSlots += part.extraSlots ?? 0;
      fx.extraSlotDebtMult *= part.extraSlotDebtMult ?? 1;
      fx.petitionDebtMult *= part.petitionDebtMult ?? 1;
      fx.manualHours += part.manualHours ?? 0;
      fx.distortionBp += part.distortionBp ?? 0;
      fx.lossChanceBp += part.lossChanceBp ?? 0;
      fx.lossFrac = Math.max(fx.lossFrac, part.lossFrac ?? 0);
      fx.autoDebt += part.autoDebt ?? 0;
      fx.collectionMult *= part.collectionMult ?? 1;
      fx.hideDebt ||= part.hideDebt ?? false;
      fx.planWasteBp += part.planWasteBp ?? 0;
      fx.verifyHintMult *= part.verifyHintMult ?? 1;
    }
  }
  return fx;
}

export interface DayView {
  day: number;
  /** Debt as the Oracle reports it (understated under do_not_disturb). */
  debtSeen: number;
  thresholds: readonly number[];
  insight: number;
  rules: number;
  oracleRules: number;
  maxRules: number;
  hours: number;
  quota: number;
  slots: EconomyParams["petition_slots"];
}

export interface DayPlan {
  petitions: { tier: L.PetitionTier; purpose: "plan" | "rule" | "glance" }[];
  hours: { manual: number; writeRule: number; verify: number; translate: number };
}

export interface Bot {
  name: string;
  /** readFinePrint costs one insight and returns the fine print, or undefined if there is no insight left. */
  chooseBoon(
    offer: SimBoon[],
    view: DayView,
    readFinePrint: (b: SimBoon) => Partial<Effects> | undefined,
  ): SimBoon | null;
  planDay(view: DayView): DayPlan;
}

export interface RunResult {
  score: number;
  scoreDay10: number;
  collections: number;
  slotsPerDay: number;
  overtimePerDay: number;
  finalDebt: number;
  peakDebt: number;
  boons: number;
  falseClaims: number;
  caught: number;
}

export function runGame(econ: EconomyParams, sb: SandboxParams, bot: Bot, seed: number): RunResult {
  const rng = Rng.fromSeed(seed);
  const world = rng.fork("world");
  const offers = rng.fork("offers");
  let ledger = L.newLedger();
  const st = { rules: 0, ruleProgress: 0, oracleRules: 0, upgrades: 0, insight: 0, boons: [] as SimBoon[] };
  const totals = { score: 0, day10: 0, slots: 0, overtime: 0, falseClaims: 0, caught: 0, peakDebt: 0 };
  const sortedThresholds = [...econ.collection_thresholds].sort((a, b) => a - b);

  const view = (day: number): DayView => {
    const fx = aggregate(st.boons);
    const debt = L.fromFixed(ledger.debt);
    return {
      day,
      debtSeen: fx.hideDebt ? Math.floor(debt / 2) : debt,
      thresholds: sortedThresholds,
      insight: st.insight,
      rules: st.rules,
      oracleRules: st.oracleRules,
      maxRules: sb.maxRules,
      hours: sb.hours + fx.manualHours,
      quota: econ.daily_petitions + fx.extraSlots,
      slots: econ.petition_slots,
    };
  };

  for (let day = 1; day <= sb.days; day++) {
    ledger = L.startDay(ledger);

    if (day % econ.boon_offer_every_days === 0) {
      const available = BOON_POOL.filter((b) => !st.boons.includes(b));
      const offer = offers.shuffle(available).slice(0, econ.boon_offer_size);
      if (offer.length > 0) {
        const pick = bot.chooseBoon(offer, view(day), (b) => {
          if (st.insight < 1) return undefined;
          st.insight -= 1;
          return b.fine;
        });
        if (pick) st.boons.push(pick);
      }
    }

    const fx = aggregate(st.boons);
    const quota = econ.daily_petitions + fx.extraSlots;
    const plan = bot.planDay(view(day));

    let glanceBonus = 0;
    for (const petition of plan.petitions) {
      const before = ledger.slotsToday;
      const { state, charged, overtime } = L.chargePetition(ledger, petition.tier, econ, quota);
      ledger = state;
      const discounted = charged * fx.petitionDebtMult;
      if (fx.petitionDebtMult < 1) ledger = L.repay(ledger, charged - discounted);
      // Slots a boon grants beyond the base quota carry a surcharge, on the share of this
      // petition that actually uses them.
      if (overtime === 0 && fx.extraSlotDebtMult > 1) {
        const cost = econ.petition_slots[petition.tier];
        const extraUsed = Math.max(0, ledger.slotsToday - Math.max(before, econ.daily_petitions));
        if (extraUsed > 0)
          ledger = L.borrow(ledger, discounted * (extraUsed / cost) * (fx.extraSlotDebtMult - 1));
      }
      totals.slots += econ.petition_slots[petition.tier];
      if (overtime > 0) totals.overtime += 1;
      const madeUp = (overtime > 0 && world.chanceBp(sb.overtimeWasteBp)) || world.chanceBp(fx.planWasteBp);
      if (madeUp) continue;
      if (petition.purpose === "glance") glanceBonus += sb.glanceBonus;
      else if (petition.purpose === "rule" && st.rules < sb.maxRules) {
        st.rules += 1;
        st.oracleRules += 1;
      } else st.upgrades += sb.petitionUpgrade / (1 + st.upgrades / sb.upgradeSoftCap);
    }

    const h = plan.hours;
    st.ruleProgress += h.writeRule / sb.ruleWriteHours;
    while (st.ruleProgress >= 1 && st.rules < sb.maxRules) {
      st.ruleProgress -= 1;
      st.rules += 1;
    }
    const translations = Math.min(st.oracleRules, Math.floor(h.translate / sb.translateHours));
    st.oracleRules -= translations;
    ledger = L.repay(ledger, L.toFixed(translations * econ.repay.translate));

    const production =
      (sb.baseProduction + sb.ruleYield * st.rules + st.upgrades + glanceBonus) * (1 + fx.prodMult) +
      h.manual * sb.manualPerHour;

    // Claims the player acts on today; distorted ones cost production unless a verification catches them.
    const chance = L.distortionChanceBp(ledger, econ, fx.distortionBp);
    let falseClaims = 0;
    for (let i = 0; i < sb.claimsPerDay; i++) if (world.chanceBp(chance)) falseClaims++;
    totals.falseClaims += falseClaims;
    const verifications = Math.floor(h.verify / sb.verifyHours);
    for (let v = 0; v < verifications; v++) {
      const hit = Math.min(1, (falseClaims / sb.claimsPerDay) * sb.verifyHint * fx.verifyHintMult);
      if (falseClaims > 0 && world.float() < hit) {
        falseClaims -= 1;
        totals.caught += 1;
        st.insight += 1;
        ledger = L.repay(ledger, L.toFixed(econ.repay.verify_catch));
      } else ledger = L.repay(ledger, L.toFixed(econ.repay.verify));
    }
    let loss = Math.min(0.6, falseClaims * sb.lossPerFalseClaim) * production;
    if (fx.lossChanceBp > 0 && world.chanceBp(fx.lossChanceBp)) loss += fx.lossFrac * production;

    // Dusk: fees, understanding debt, hands-on repayment, interest, collection.
    const fees = st.boons.reduce((sum, b) => sum + b.fee, 0) * sb.feeScale;
    ledger = L.borrow(
      ledger,
      L.toFixed(fees + st.oracleRules * econ.understanding_debt_per_rule + fx.autoDebt),
    );
    ledger = L.repayManual(ledger, h.manual + h.writeRule, econ);
    ledger = L.accrueInterest(ledger, econ);
    totals.peakDebt = Math.max(totals.peakDebt, L.fromFixed(ledger.debt));
    const { state, level } = L.collect(ledger, econ);
    ledger = state;
    if (level > 0) loss += (sb.collectionLossDays[level - 1] ?? 0) * production * fx.collectionMult;

    totals.score += production - loss;
    if (day === 10) totals.day10 = totals.score;
  }

  const finalDebt = L.fromFixed(ledger.debt);
  return {
    score: totals.score - sb.reckoning * finalDebt,
    scoreDay10: totals.day10,
    collections: ledger.collections,
    slotsPerDay: totals.slots / sb.days,
    overtimePerDay: totals.overtime / sb.days,
    finalDebt,
    peakDebt: totals.peakDebt,
    boons: st.boons.length,
    falseClaims: totals.falseClaims,
    caught: totals.caught,
  };
}
