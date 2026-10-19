// P2 acceptance A8: the paper theatre's transitions stay smooth. For each kind (crossing the
// bridge, looking across, pulling back, looking into the distance, going through a door) the test
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
  const sorted = [...frames].sort((a, b) => a - b);
  const at = (q: number) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))]!;
  return { n: frames.length, median: at(0.5), p95: at(0.95), max: sorted[sorted.length - 1]!, raw: frames };
}

/** A point on screen where one of `selector`'s elements is the thing under the pointer. */
async function uncovered(page: Page, selector: string): Promise<{ x: number; y: number }> {
  const point = await page.evaluate((sel) => {
    for (const el of document.querySelectorAll(sel)) {
      const r = el.getBoundingClientRect();
      for (const fy of [0.08, 0.2, 0.4]) {
        const x = r.left + r.width / 2;
        const y = r.top + r.height * fy;
        if (x < 0 || y < 60 || x > innerWidth || y > innerHeight) continue;
        if (el.contains(document.elementFromPoint(x, y))) return { x, y };
      }
    }
    return null;
  }, selector);
  if (!point) throw new Error(`nothing matching ${selector} is in view`);
  return point;
}

/** Look at a layer the way this device does it: the wheel over something there, or ⊕ on a phone. */
async function lookAt(page: Page, isMobile: boolean, selector: string, focus: string): Promise<void> {
  const viewport = page.locator("#viewport");
  if (isMobile) {
    for (let i = 0; i < 4 && (await viewport.getAttribute("data-focus")) !== focus; i++) {
      await page.getByTestId("pad-in").click();
      await settled(page);
    }
  } else {
    const at = await uncovered(page, selector);
    await page.mouse.move(at.x, at.y);
    await page.mouse.wheel(0, -120);
  }
  await expect(viewport).toHaveAttribute("data-focus", focus);
}

async function pullBack(page: Page, isMobile: boolean, focus: string): Promise<void> {
  const viewport = page.locator("#viewport");
  for (let i = 0; i < 4 && (await viewport.getAttribute("data-focus")) !== focus; i++) {
    if (isMobile) await page.getByTestId("pad-out").click();
    else await page.mouse.wheel(0, 120);
    await settled(page);
    await page.waitForTimeout(400); // the wheel is locked briefly after each step
  }
  await expect(viewport).toHaveAttribute("data-focus", focus);
}

test("transitions keep the frame time down @perf", async ({ page, browserName }, info) => {
  test.setTimeout(120_000);
  const isMobile = info.project.name === "phone";
  await newGame(page, 42);
  await startDay(page);
  await pause(page);
  const results: Record<string, ReturnType<typeof stats>> = {};

  results["look across"] = stats(
    await recordFrames(page, () =>
      lookAt(page, isMobile, '[data-building="bld.eb_06"]:not([data-face])', "layer.far_bank"),
    ),
  );
  results["pull back"] = stats(await recordFrames(page, () => pullBack(page, isMobile, "layer.street")));
  results["look far"] = stats(
    await recordFrames(page, () => lookAt(page, isMobile, ".pt-tower", "layer.sky")),
  );
  await pullBack(page, isMobile, "layer.street");

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
