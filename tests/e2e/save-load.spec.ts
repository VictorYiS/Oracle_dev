// P1 acceptance A9 (end-to-end part): save, reload the page, load; download and open a file;
// a save from another version is refused with a clear message. P2: what the player remembers and
// the pending tray come back unchanged.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { advance, collectErrors, goToFarBank, hash, newGame, walkTo, world } from "./helpers";

async function playABit(page: import("@playwright/test").Page) {
  await page.getByTestId("advance").click();
  await page.getByTestId("advance").click();
  // Pause the real-time clock, so the world does not move on between the hash and the save.
  await page.getByTestId("speed-pause").click();
  await page.evaluate(() => window.oracle!.submit({ type: "hero.walk", to: 1700 }));
  await advance(page, 137);
}

test("save in the browser, reload the page, continue where you were", async ({ page }) => {
  const errors = collectErrors(page);
  await newGame(page, 7);
  await playABit(page);
  const before = await hash(page);

  await page.getByTestId("open-save").click();
  await page.getByTestId("save-here").click();
  await expect(page.getByTestId("save-status")).toHaveText("Saved in this browser.");

  await page.reload();
  await page.getByTestId("continue").click();
  await expect(page.locator("#viewport")).toBeVisible();
  expect(await hash(page)).toBe(before);
  expect(errors).toEqual([]);
});

test("what you remember and what you have to check survive a save and a reload", async ({ page }) => {
  test.setTimeout(90_000);
  await newGame(page, 42);
  await page.getByTestId("advance").click();
  await page.getByTestId("advance").click();
  await page.getByTestId("speed-pause").click();
  // Adopt the first visitor's suggestion (it lands on the tray)...
  await page.keyboard.press("e");
  for (let i = 0; i < 60 && !(await page.getByTestId("case").isVisible()); i++) await advance(page, 5);
  await page.getByTestId("adopt").click();
  await page.keyboard.press("Escape");
  // ...and go and see some of the far bank, but not No. 7.
  await goToFarBank(page);
  await walkTo(page, 2000);
  const before = await world(page);
  expect(before.memory.length).toBeGreaterThan(0);
  expect(before.pending.items).toHaveLength(1);
  expect(before.pending.items[0]!.verdict).toBeNull();
  const h = await hash(page);

  await page.getByTestId("open-save").click();
  await page.getByTestId("save-here").click();
  await expect(page.getByTestId("save-status")).toHaveText("Saved in this browser.");
  await page.reload();
  await page.getByTestId("continue").click();
  await expect(page.locator("#viewport")).toBeVisible();
  const after = await world(page);
  expect(after.memory).toEqual(before.memory);
  expect(after.pending).toEqual(before.pending);
  expect(await hash(page)).toBe(h);
  await expect(page.getByTestId("pending-count")).toHaveText("1");
  for (const m of before.memory) {
    await expect(page.locator(`[data-building="${m.building}"]:not([data-face])`)).toHaveAttribute(
      "data-seen-day",
      String(m.day),
    );
  }
});

test("download a save file and open it again", async ({ page }, info) => {
  await newGame(page, 8);
  await playABit(page);
  const before = await hash(page);

  await page.getByTestId("open-save").click();
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByTestId("download-save").click(),
  ]);
  const file = info.outputPath("save.json");
  await download.saveAs(file);
  const save = JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>;
  expect(save).toMatchObject({ format: "oracle-save", engine: "0", pack: { id: "interpreter" }, seed: 8 });

  await page.goto("/");
  await page.getByTestId("title-open-save").setInputFiles(file);
  await expect(page.locator("#viewport")).toBeVisible();
  expect(await hash(page)).toBe(before);
});

test("a save from another version is refused with a clear message", async ({ page }, info) => {
  await newGame(page, 9);
  await page.getByTestId("open-save").click();
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByTestId("download-save").click(),
  ]);
  const file = info.outputPath("old.json");
  await download.saveAs(file);
  const save = JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>;
  const old = join(info.outputDir, "from-the-future.json");
  writeFileSync(old, JSON.stringify({ ...save, version: 99 }));

  await page.goto("/");
  await page.getByTestId("title-open-save").setInputFiles(old);
  await expect(page.getByRole("alert")).toHaveText("That save is from another version of the game.");
  await expect(page.getByTestId("new-game")).toBeVisible(); // still on the title screen, nothing broke
});
