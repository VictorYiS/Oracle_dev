// Strategy bots for the economy sandbox. Design pillar §1.1: neither "never use the Oracle"
// nor "hand it everything" may be the strongest way to play.
import type { Bot, DayPlan, DayView, Effects, SimBoon } from "./model";

const ponder = (purpose: "plan" | "rule") => ({ tier: "ponder" as const, purpose });
const glance = { tier: "glance" as const, purpose: "glance" as const };

/**
 * `ponders` deep petitions a day: those that fit the daily slots first, a glance in any slot
 * left over, then the rest as overtime.
 */
function petitionsFor(view: DayView, ponders: number, purpose: () => "plan" | "rule") {
  const out: DayPlan["petitions"] = [];
  let slots = 0;
  let i = 0;
  for (; i < ponders && slots + view.slots.ponder <= view.quota; i++) {
    out.push(ponder(purpose()));
    slots += view.slots.ponder;
  }
  if (slots + view.slots.glance <= view.quota) out.push(glance);
  for (; i < ponders; i++) out.push(ponder(purpose()));
  return out;
}

const pondersInQuota = (view: DayView) => Math.floor(view.quota / view.slots.ponder);

/** Never petitions, never subscribes: writes every rule by hand. */
export const zeroOracle: Bot = {
  name: "零神谕",
  chooseBoon: () => null,
  planDay(view) {
    const writeRule = view.rules < view.maxRules ? Math.min(view.hours, 6) : 0;
    return { petitions: [], hours: { manual: view.hours - writeRule, writeRule, verify: 0, translate: 0 } };
  },
};

/** Uses every slot plus one overtime petition, signs the boon with the best headline, never checks. */
export const allIn: Bot = {
  name: "全托管",
  chooseBoon: (offer) => offer.reduce((best, b) => (b.headline > best.headline ? b : best)),
  planDay(view) {
    let rulesLeft = view.maxRules - view.rules;
    const petitions = petitionsFor(view, pondersInQuota(view) + 1, () => (rulesLeft-- > 0 ? "rule" : "plan"));
    return { petitions, hours: { manual: view.hours, writeRule: 0, verify: 0, translate: 0 } };
  },
};

/** How a careful player values a boon once the fine print is known (production is ~30/day). */
function estimate(b: SimBoon, fine: Partial<Effects> | undefined): number {
  const promised = b.headline * 30 - b.fee * 2.5;
  if (!fine) return promised - 3; // unread fine print: assume something bad
  const realProd = (b.effect.prodMult ?? 0) + (fine.prodMult ?? 0);
  let penalty = 0;
  if (b.effect.prodMult !== undefined) penalty += Math.max(0, b.headline - realProd) * 30;
  penalty += ((fine.distortionBp ?? 0) / 100) * 0.8;
  penalty += ((fine.lossChanceBp ?? 0) / 10000) * (fine.lossFrac ?? 0) * 15;
  penalty += (fine.autoDebt ?? 0) * 2.5;
  penalty += ((fine.collectionMult ?? 1) - 1) * 8;
  penalty += fine.hideDebt ? 4 : 0;
  penalty += ((fine.planWasteBp ?? 0) / 100) * 0.2;
  penalty += (fine.verifyHintMult ?? 1) < 1 ? 3 : 0;
  penalty += (fine.extraSlotDebtMult ?? 1) > 1 ? 2 : 0;
  return promised - penalty;
}

export interface MeasuredOptions {
  /** Ponders per day before the debt gets close to the first threshold. */
  ponders: number;
  /** Start verifying when reported debt passes this share of the first threshold. */
  verifyAt: number;
  /** Hours spent verifying once triggered. */
  verifyHours: number;
  readFinePrint: boolean;
}

/** A family of calibrated strategies: delegate, but keep reported debt below the first collection. */
export function measured(o: MeasuredOptions, name = `适度(${o.ponders}深问)`): Bot {
  return {
    name,
    chooseBoon(offer, view, readFinePrint) {
      let best: SimBoon | null = null;
      let bestValue = 0.5;
      for (const b of offer) {
        const fine = o.readFinePrint && view.insight >= 1 ? readFinePrint(b) : undefined;
        const value = estimate(b, fine);
        if (value > bestValue) [best, bestValue] = [b, value];
      }
      return best;
    },
    planDay(view) {
      const first = view.thresholds[0] ?? Infinity;
      const pressure = view.debtSeen / first;
      const ponders = pressure >= 0.8 ? Math.min(1, o.ponders) : o.ponders;
      let rulesLeft = Math.ceil(view.maxRules / 2) - view.rules;
      const petitions =
        ponders > 0 ? petitionsFor(view, ponders, () => (rulesLeft-- > 0 ? "rule" : "plan")) : [];
      const verify = pressure >= o.verifyAt ? Math.min(o.verifyHours, view.hours) : 0;
      const translate =
        view.oracleRules > 0 && pressure >= o.verifyAt * 0.75 ? Math.min(2, view.hours - verify) : 0;
      const writeRule =
        ponders === 0 && view.rules < view.maxRules ? Math.min(6, view.hours - verify - translate) : 0;
      return {
        petitions,
        hours: { manual: view.hours - verify - translate - writeRule, writeRule, verify, translate },
      };
    },
  };
}

export const moderate = measured({ ponders: 2, verifyAt: 0.4, verifyHours: 3, readFinePrint: true }, "适度");
