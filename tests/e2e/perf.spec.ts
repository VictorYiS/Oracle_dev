// P1 acceptance A13: at ×4 for 10 seconds the map keeps up. Prints the median frame time.
import { expect, test } from "@playwright/test";
import { newGame } from "./helpers";

test("median frame time at ×4 stays under 33 ms", async ({ page }) => {
  test.setTimeout(60_000);
  await newGame(page, 3);
  await page.getByTestId("advance").click();
  await page.getByTestId("advance").click();
  await page.getByRole("button", { name: "×4" }).click();
  const frames = await page.evaluate(
    () =>
      new Promise<number[]>((resolve) => {
        const times: number[] = [];
        let last = performance.now();
        const end = last + 10_000;
        const step = (now: number) => {
          times.push(now - last);
          last = now;
          if (now < end) requestAnimationFrame(step);
          else resolve(times);
        };
        requestAnimationFrame(step);
      }),
  );
  const sorted = [...frames].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)]!;
  const tick = await page.evaluate(() => (window.oracle!.world() as { clock: { tick: number } }).clock.tick);
  console.log(
    `frames ${frames.length} · median ${median.toFixed(1)} ms · p95 ${sorted[Math.floor(sorted.length * 0.95)]!.toFixed(1)} ms · ticks run ${tick}`,
  );
  expect(tick).toBeGreaterThan(80); // the day really advanced at ×4
  expect(median).toBeLessThanOrEqual(33);
});
