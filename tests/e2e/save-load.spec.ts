// P1 acceptance A9 (end-to-end part): save, reload the page, load; download and open a file;
// a save from another version is refused with a clear message.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { advance, collectErrors, hash, newGame, world } from "./helpers";

async function playABit(page: import("@playwright/test").Page) {
  await page.getByTestId("advance").click();
  await page.getByTestId("advance").click();
  // Pause the real-time clock, so the world does not move on between the hash and the save.
  await page.getByTestId("speed-pause").click();
  const w = await world(page);
  const you = w.units.find((u) => u.role === "avatar")!;
  await page.evaluate((id) => window.oracle!.submit({ type: "unit.gather", unit: id, at: [21, 21] }), you.id);
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
  await expect(page.getByTestId("map")).toBeVisible();
  expect(await hash(page)).toBe(before);
  expect(errors).toEqual([]);
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
  await expect(page.getByTestId("map")).toBeVisible();
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
