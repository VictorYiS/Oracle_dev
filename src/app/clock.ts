// Real time → game ticks. Speed lives in the app, not in the simulation: it changes how fast the
// world is stepped, never what happens, so it is not saved or logged.

export const SPEEDS = [0, 1, 2, 4] as const;
export type Speed = (typeof SPEEDS)[number];

/** Game minutes per real second at each speed: a 12-hour day takes 4 minutes at ×1, 1 at ×4. */
export const TICKS_PER_SECOND: Record<Speed, number> = { 0: 0, 1: 3, 2: 6, 4: 12 };

/** Longest real gap a single frame may cover, so a backgrounded tab does not jump hours ahead. */
export const MAX_FRAME_MS = 250;

/** Whole ticks to run for a frame that took `elapsedMs`, carrying the fraction to the next frame. */
export function ticksForFrame(
  speed: Speed,
  elapsedMs: number,
  carry: number,
): { ticks: number; carry: number } {
  if (speed === 0) return { ticks: 0, carry: 0 };
  const exact = carry + (TICKS_PER_SECOND[speed] * Math.min(Math.max(elapsedMs, 0), MAX_FRAME_MS)) / 1000;
  const ticks = Math.floor(exact);
  return { ticks, carry: exact - ticks };
}
