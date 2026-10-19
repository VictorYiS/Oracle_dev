// P2 acceptance A8: the paper theatre's transitions stay smooth. For each kind (crossing the
// bridge, going through a door, inspecting a bookcase, returning to the hero) the test
// records the time between animation frames from just before the move until just after it ends,
// and prints the median, p95 and maximum. Budget: median ≤ 34 ms and maximum ≤ 100 ms.
import { cpus, platform, totalmem } from "node:os";
import { expect, test, type Page } from "@playwright/test";
import { cross, newGame, pause, settled, startDay, walkTo } from "./helpers";

const MEDIAN_MS = 34;
const MAX_MS = 100;

async function recordFrames(page: Page, act: () => Promise<void>): Promise<number[]> {
  await page.evaluate(() => {
    const w = window as unknown as { __frames: number[]; __recording: boolean; __run: number };
    w.__frames = [];
    w.__recording = true;
    // A new number for each recording, so a loop left from the last one stops at its next frame.
    const run = (w.__run = (w.__run ?? 0) + 1);
    let last = performance.now();
    const step = (now: number) => {
      if (!w.__recording || w.__run !== run) return;
      w.__frames.push(now - last);
      last = now;
      requestAnimationFrame(step);
    };
    requestAnimationFrame((now) => {
      last = now;
      requestAnimationFrame(step);
    });
  });
  await page.waitForTimeout(100);
  await act();
  await settled(page);
  await page.waitForTimeout(250); // the frames right after a move ends count too
  return page.evaluate(() => {
    const w = window as unknown as { __frames: number[]; __recording: boolean };
    w.__recording = false;
    return w.__frames;
  });
}

function stats(frames: number[]) {
  expect(frames.length, "enough animation frames to measure").toBeGreaterThan(5);
  const sorted = [...frames].sort((a, b) => a - b);
  const at = (q: number) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))]!;
  return { n: frames.length, median: at(0.5), p95: at(0.95), max: sorted[sorted.length - 1]!, raw: frames };
}

test("transitions keep the frame time down @perf", async ({ page, browserName }, info) => {
  test.setTimeout(120_000);
  const isMobile = info.project.name === "phone";
  await newGame(page, 42);
  await startDay(page);
  await pause(page);
  const results: Record<string, ReturnType<typeof stats>> = {};

  await walkTo(page, 2900);
  await cross(page, "passage.stairs");
  await walkTo(page, 1500);
  results["bridge"] = stats(
    await recordFrames(page, async () => {
      await page.evaluate(() => window.oracle!.submit({ type: "hero.cross", passage: "passage.bridge" }));
      await expect(page.locator("#viewport")).toHaveAttribute("data-at", "layer.far_bank");
    }),
  );
  await walkTo(page, 2220);
  results["door"] = stats(
    await recordFrames(page, async () => {
      await page.evaluate(() => window.oracle!.submit({ type: "hero.cross", passage: "passage.door_17b" }));
      await expect(page.locator("#viewport")).toHaveAttribute("data-at", "layer.room_17b");
    }),
  );

  await walkTo(page, -360);
  await expect(page.getByTestId("pad-in")).toBeEnabled();
  results["inspect"] = stats(
    await recordFrames(page, async () => {
      if (isMobile) await page.getByTestId("pad-in").click();
      else await page.keyboard.press("f");
      await expect(page.locator("#viewport")).toHaveAttribute("data-inspecting", "prop.shelf_17b");
    }),
  );
  results["pull back"] = stats(
    await recordFrames(page, async () => {
      if (isMobile) await page.getByTestId("pad-out").click();
      else await page.keyboard.press("Escape");
      await expect(page.locator("#viewport")).toHaveAttribute("data-inspecting", "");
    }),
  );
  await info.attach("frame-times", { body: JSON.stringify(results), contentType: "application/json" });

  const machine = `${platform()} · ${cpus()[0]?.model ?? "?"} ×${cpus().length} · ${Math.round(totalmem() / 2 ** 30)} GB · ${browserName} ${page.context().browser()?.version() ?? ""} · ${info.project.name}`;
  console.log(`machine: ${machine}`);
  for (const [name, s] of Object.entries(results)) {
    if (process.env.E2E_FRAMES)
      console.log(name, (s as unknown as { raw: number[] }).raw.map((f) => f.toFixed(0)).join(" "));
    console.log(
      `${name.padEnd(12)} frames ${String(s.n).padStart(3)} · median ${s.median.toFixed(1)} ms · p95 ${s.p95.toFixed(1)} ms · max ${s.max.toFixed(1)} ms`,
    );
  }
  for (const [name, s] of Object.entries(results)) {
    expect(s.median, `${name}: median frame time`).toBeLessThanOrEqual(MEDIAN_MS);
    expect(s.max, `${name}: longest frame`).toBeLessThanOrEqual(MAX_MS);
  }
});
