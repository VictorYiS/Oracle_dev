// P1 acceptance A8 (speed part): real time becomes game ticks at ×1 / ×2 / ×4, and pause stops it.
import { describe, expect, it } from "vitest";
import { MAX_FRAME_MS, ticksForFrame, TICKS_PER_SECOND, type Speed } from "../../src/app/clock";

function runFor(speed: Speed, seconds: number, frameMs = 16): number {
  let carry = 0;
  let total = 0;
  for (let t = 0; t < seconds * 1000; t += frameMs) {
    const r = ticksForFrame(speed, frameMs, carry);
    carry = r.carry;
    total += r.ticks;
  }
  return total;
}

describe("game speed", () => {
  it("runs 3, 6 and 12 game minutes per real second at ×1, ×2 and ×4", () => {
    expect(TICKS_PER_SECOND).toEqual({ 0: 0, 1: 3, 2: 6, 4: 12 });
    expect(runFor(1, 10)).toBeCloseTo(30, -1);
    expect(runFor(2, 10)).toBeCloseTo(60, -1);
    expect(runFor(4, 10)).toBeCloseTo(120, -1);
  });

  it("stops completely when paused", () => {
    expect(runFor(0, 10)).toBe(0);
    expect(ticksForFrame(0, 1000, 0.9)).toEqual({ ticks: 0, carry: 0 });
  });

  it("carries fractions between frames instead of losing them", () => {
    // 60 frames of 16.7 ms at ×1 is one second: exactly 3 ticks, not 0.
    expect(runFor(1, 1, 1000 / 60)).toBe(3);
  });

  it("does not jump ahead after a long pause in the browser tab", () => {
    expect(ticksForFrame(4, 60_000, 0).ticks).toBe(Math.floor((12 * MAX_FRAME_MS) / 1000));
  });
});
