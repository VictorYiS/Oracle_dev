import { describe, expect, it } from "vitest";
import type { EconomyParams } from "../../src/core/content/schema";
import * as L from "../../src/core/economy/ledger";

const p: EconomyParams = {
  daily_petitions: 5,
  petition_slots: { glance: 1, ponder: 2, decree: 3 },
  petition_debt: { glance: 1, ponder: 2, decree: 4 },
  interest_rate: 0.1,
  understanding_debt_per_rule: 0.5,
  repay: {
    verify: 1,
    verify_catch: 4,
    manual_per_hour: 0.5,
    manual_daily_cap: 2,
    translate: 3,
    fast_fraction: 0.8,
  },
  distortion: { base: 0.02, per_debt: 0.004, max: 0.6 },
  collection_thresholds: [30, 60, 100],
  collection_relief: 0.5,
  collection_cooldown_days: 3,
  boon_offer_every_days: 3,
  boon_offer_size: 3,
};

const debt = (s: L.LedgerState) => L.fromFixed(s.debt);

describe("petitions", () => {
  it("charge the tier's debt while slots remain", () => {
    let s = L.newLedger();
    s = L.chargePetition(s, "ponder", p).state;
    s = L.chargePetition(s, "ponder", p).state;
    const last = L.chargePetition(s, "glance", p);
    expect(last.overtime).toBe(0);
    expect(debt(last.state)).toBe(5);
    expect(last.state.slotsToday).toBe(5);
  });

  it("price the k-th overtime petition at ×(k+1)", () => {
    let s = L.newLedger();
    for (let i = 0; i < 5; i++) s = L.chargePetition(s, "glance", p).state;
    const first = L.chargePetition(s, "ponder", p);
    expect(first.overtime).toBe(1);
    expect(L.fromFixed(first.charged)).toBe(4);
    const second = L.chargePetition(first.state, "ponder", p);
    expect(second.overtime).toBe(2);
    expect(L.fromFixed(second.charged)).toBe(6);
  });

  it("treat a petition that does not fit the remaining slots as overtime", () => {
    let s = L.newLedger();
    s = L.chargePetition(s, "ponder", p).state;
    s = L.chargePetition(s, "ponder", p).state;
    expect(L.chargePetition(s, "ponder", p).overtime).toBe(1);
  });

  it("reset the daily counters at dawn", () => {
    let s = L.chargePetition(L.newLedger(), "decree", p).state;
    s = L.startDay(s);
    expect(s.slotsToday).toBe(0);
    expect(debt(s)).toBe(4);
  });
});

describe("interest and repayment", () => {
  it("compounds in integer hundredths", () => {
    let s = L.borrow(L.newLedger(), L.toFixed(10));
    s = L.accrueInterest(s, p);
    expect(s.debt).toBe(1100);
    s = L.accrueInterest(s, p);
    expect(s.debt).toBe(1210);
  });

  it("never goes below zero", () => {
    const s = L.repay(L.borrow(L.newLedger(), L.toFixed(2)), L.toFixed(5));
    expect(s.debt).toBe(0);
  });

  it("caps hands-on repayment per day", () => {
    let s = L.borrow(L.newLedger(), L.toFixed(20));
    s = L.repayManual(s, 8, p);
    expect(debt(s)).toBe(18);
    s = L.repayManual(s, 8, p);
    expect(debt(s)).toBe(18);
    s = L.repayManual(L.startDay(s), 2, p);
    expect(debt(s)).toBe(17);
  });

  it("ignores negative hours instead of adding debt", () => {
    const s = L.repayManual(L.borrow(L.newLedger(), L.toFixed(5)), -4, p);
    expect(debt(s)).toBe(5);
    expect(s.manualRepaidToday).toBe(0);
  });

  it("fasting clears most of the balance", () => {
    expect(debt(L.fast(L.borrow(L.newLedger(), L.toFixed(50)), p))).toBe(10);
  });
});

describe("distortion and collection", () => {
  it("raises distortion with debt and clamps at the maximum", () => {
    expect(L.distortionChanceBp(L.newLedger(), p)).toBe(200);
    expect(L.distortionChanceBp(L.borrow(L.newLedger(), L.toFixed(10)), p)).toBe(600);
    expect(L.distortionChanceBp(L.borrow(L.newLedger(), L.toFixed(1000)), p)).toBe(6000);
  });

  it("collects at the highest threshold reached, then cools down", () => {
    let s = L.borrow(L.newLedger(), L.toFixed(65));
    const first = L.collect(s, p);
    expect(first.level).toBe(2);
    expect(debt(first.state)).toBe(32.5);
    s = first.state;
    // Still above 30, but within the cooldown: no collection.
    for (let day = 0; day < 2; day++) {
      s = L.startDay(s);
      expect(L.collect(s, p).level).toBe(0);
    }
    s = L.startDay(s);
    expect(L.collect(s, p).level).toBe(1);
  });

  it("does nothing below the first threshold", () => {
    const s = L.borrow(L.newLedger(), L.toFixed(29.99));
    expect(L.collect(s, p)).toEqual({ state: s, level: 0 });
  });
});
