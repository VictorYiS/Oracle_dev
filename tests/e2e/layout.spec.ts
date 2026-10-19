// P1 acceptance A18: at 400 px the game itself (not only the title screen) never scrolls
// sideways, with a unit selected and with each dialog open; the HUD shows day, phase and stock.
import { expect, test, type Page } from "@playwright/test";
import { newGame, world } from "./helpers";

test.use({ viewport: { width: 400, height: 800 } });

const sideways = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

test("the game fits 400 px: top bar, selection, event feed and dialogs", async ({ page }) => {
  await newGame(page, 42);
  await expect(page.getByTestId("clock")).toContainText("Day 1");
  await expect(page.getByTestId("phase")).toHaveText("Dawn");
  await expect(page.getByTestId("stock")).toContainText("Store");
  await expect(page.getByTestId("events")).toBeVisible();
  expect(await sideways(page)).toBeLessThanOrEqual(0);

  const you = (await world(page)).units.find((u) => u.role === "avatar")!;
  await page.getByTestId(`unit-${you.id}`).click();
  await expect(page.getByTestId("act-gather")).toBeVisible();
  expect(await sideways(page)).toBeLessThanOrEqual(0);

  for (const [open, dialog] of [
    ["open-build", "build-menu"],
    ["open-save", "save-menu"],
  ] as const) {
    await page.getByTestId(open).click();
    await expect(page.getByTestId(dialog)).toBeVisible();
    expect(await sideways(page), dialog).toBeLessThanOrEqual(0);
    await page.keyboard.press("Escape");
  }
  await page.getByRole("button", { name: "Keys" }).click();
  await expect(page.getByTestId("help")).toBeVisible();
  expect(await sideways(page), "help").toBeLessThanOrEqual(0);
});
