// Reality debt ledger (design doc §6.6). Pure functions over an immutable state.
// Debt is stored as an integer in hundredths so interest and repayments are
// bit-for-bit identical on every platform.
import type { EconomyParams } from "../content/schema";

export const DEBT_SCALE = 100;
const BP = 10000;

export type PetitionTier = "glance" | "ponder" | "decree";

export interface LedgerState {
  /** Outstanding balance in hundredths of a debt unit. */
  readonly debt: number;
  /** Petition slots used today (glance 1, ponder 2, decree 3 by default). */
  readonly slotsToday: number;
  /** Overtime petitions made today. */
  readonly overtimeToday: number;
  readonly manualRepaidToday: number;
  readonly collections: number;
  /** Days left before reality can collect again. */
  readonly collectionCooldown: number;
}

export const toFixed = (amount: number): number => Math.round(amount * DEBT_SCALE);
export const fromFixed = (fixed: number): number => fixed / DEBT_SCALE;

export function newLedger(): LedgerState {
  return {
    debt: 0,
    slotsToday: 0,
    overtimeToday: 0,
    manualRepaidToday: 0,
    collections: 0,
    collectionCooldown: 0,
  };
}

export function startDay(s: LedgerState): LedgerState {
  return {
    ...s,
    slotsToday: 0,
    overtimeToday: 0,
    manualRepaidToday: 0,
    collectionCooldown: Math.max(0, s.collectionCooldown - 1),
  };
}

/** Debt charged for one petition: the k-th overtime petition of the day costs ×(k+1). */
export function petitionDebt(tier: PetitionTier, overtime: number, p: EconomyParams): number {
  const base = toFixed(p.petition_debt[tier]);
  return overtime === 0 ? base : base * (overtime + 1);
}

/** A petition that does not fit in the remaining daily slots is overtime. */
export function chargePetition(
  s: LedgerState,
  tier: PetitionTier,
  p: EconomyParams,
  quota: number = p.daily_petitions,
): { state: LedgerState; charged: number; overtime: number } {
  const cost = p.petition_slots[tier];
  const overtime = s.slotsToday + cost > quota ? s.overtimeToday + 1 : 0;
  const charged = petitionDebt(tier, overtime, p);
  return {
    state: {
      ...s,
      debt: s.debt + charged,
      slotsToday: s.slotsToday + cost,
      overtimeToday: s.overtimeToday + (overtime > 0 ? 1 : 0),
    },
    charged,
    overtime,
  };
}

export function borrow(s: LedgerState, fixed: number): LedgerState {
  return { ...s, debt: s.debt + Math.max(0, Math.round(fixed)) };
}

export function repay(s: LedgerState, fixed: number): LedgerState {
  return { ...s, debt: Math.max(0, s.debt - Math.max(0, Math.round(fixed))) };
}

/** Hands-on work pays a little back, up to a daily cap. */
export function repayManual(s: LedgerState, hours: number, p: EconomyParams): LedgerState {
  const cap = toFixed(p.repay.manual_daily_cap);
  const earned = toFixed(p.repay.manual_per_hour * Math.max(0, hours));
  const amount = Math.min(earned, Math.max(0, cap - s.manualRepaidToday));
  const repaid = Math.min(amount, s.debt);
  return { ...s, debt: s.debt - repaid, manualRepaidToday: s.manualRepaidToday + repaid };
}

/** Compound interest at dusk. */
export function accrueInterest(s: LedgerState, p: EconomyParams): LedgerState {
  const rateBp = Math.round(p.interest_rate * BP);
  return { ...s, debt: s.debt + Math.floor((s.debt * rateBp) / BP) };
}

/** Chance (in basis points) that any single Oracle claim is distorted at the current balance. */
export function distortionChanceBp(s: LedgerState, p: EconomyParams, extraBp = 0): number {
  const bp = Math.round(p.distortion.base * BP + p.distortion.per_debt * BP * fromFixed(s.debt)) + extraBp;
  return Math.max(0, Math.min(Math.round(p.distortion.max * BP), bp));
}

/** Collection level: how many thresholds the balance has reached (order does not matter), or 0. */
export function collectionLevel(s: LedgerState, p: EconomyParams): number {
  const debt = fromFixed(s.debt);
  let level = 0;
  for (const t of p.collection_thresholds) if (debt >= t) level++;
  return level;
}

/**
 * At dusk: if a threshold is reached and no collection happened recently, reality collects.
 * The truth comes out and part of the balance is cleared. During the cooldown the balance can
 * keep climbing, so the next collection may land at a higher level.
 */
export function collect(s: LedgerState, p: EconomyParams): { state: LedgerState; level: number } {
  const level = s.collectionCooldown > 0 ? 0 : collectionLevel(s, p);
  if (level === 0) return { state: s, level: 0 };
  const reliefBp = Math.round(p.collection_relief * BP);
  return {
    state: {
      ...s,
      debt: Math.floor((s.debt * reliefBp) / BP),
      collections: s.collections + 1,
      collectionCooldown: p.collection_cooldown_days,
    },
    level,
  };
}

/** Fasting resets the Oracle's memory and clears most of the balance. */
export function fast(s: LedgerState, p: EconomyParams): LedgerState {
  const keepBp = BP - Math.round(p.repay.fast_fraction * BP);
  return { ...s, debt: Math.floor((s.debt * keepBp) / BP) };
}
