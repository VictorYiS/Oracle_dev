// P2 acceptance A12 (with P1 A18): reduce motion makes the bridge instant with nothing animating;
// at 400 px wide the theatre, the window, a paper in close-up and the pending tray never scroll sideways.
import { expect, test, type Page } from "@playwright/test";
import { newGame, startDay, walkTo, cross, world, settled } from "./helpers";

const sideways = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

test("reduce motion: the bridge is crossed at once, and nothing animates", async ({ page }, info) => {
  const phone = info.project.name === "phone";
  await newGame(page, 42);
  await page.getByTestId("open-settings").click();
  await page.getByTestId("reduce-motion").check();
  await page.getByTestId("settings-close").click();
  await startDay(page);
  await page.getByTestId("speed-pause").click();
  await walkTo(page, 2900);
  await cross(page, "passage.stairs");
  await walkTo(page, 1500);
  await settled(page);
  if (phone) await page.getByTestId("pad-use").click();
  else await page.keyboard.press("e");
  await expect(page.locator("#viewport")).toHaveAttribute("data-at", "layer.far_bank", { timeout: 300 });
  expect((await world(page)).hero.layer).toBe("layer.far_bank");
  expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);
  // Looking cuts too.
  if (phone) await page.getByTestId("pad-in").click();
  else await page.keyboard.press("w");
  await expect(page.locator("#viewport")).toHaveAttribute("data-focus", "layer.sky", { timeout: 300 });
  expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);
  // The choice is remembered in this browser.
  await page.reload();
  await page.waitForFunction(() => Boolean(window.oracle));
  await page.waitForFunction(() => window.oracle!.newGame(1));
  await page.getByTestId("open-settings").click();
  await expect(page.getByTestId("reduce-motion")).toBeChecked();
});

test.describe("400 px wide", () => {
  test.use({ viewport: { width: 400, height: 800 } });

  test("the theatre, the window, a paper and the pending tray fit without sideways scrolling", async ({
    page,
  }) => {
    await newGame(page, 42);
    await expect(page.getByTestId("clock")).toContainText("Day 1");
    await expect(page.getByTestId("phase")).toHaveText("Dawn");
    await expect(page.getByTestId("theatre")).toBeVisible();
    await expect(page.getByTestId("where")).toBeVisible();
    expect(await sideways(page)).toBeLessThanOrEqual(0);

    await startDay(page);
    await page.getByTestId("speed-pause").click();
    await page.getByTestId("pad-use").click(); // the window
    await expect(page.getByTestId("desk")).toBeVisible();
    for (let i = 0; i < 60 && !(await page.getByTestId("case").isVisible()); i++) {
      await page.evaluate(() => window.oracle!.advance(5));
    }
    await expect(page.getByTestId("case")).toBeVisible();
    expect(await sideways(page), "the window").toBeLessThanOrEqual(0);
    await page.getByTestId("paper-1").click();
    await expect(page.getByTestId("paper")).toBeVisible();
    expect(await sideways(page), "a paper").toBeLessThanOrEqual(0);
    await page.getByTestId("paper-close").click();
    await page.getByTestId("open-sop").click();
    expect(await sideways(page), "the procedure").toBeLessThanOrEqual(0);
    await page.getByTestId("sop-close").click();
    await page.getByTestId("adopt").click();
    await page.getByTestId("desk-close").click();

    await page.getByTestId("pending-toggle").click();
    await expect(page.getByTestId("pending").locator("[data-pending]")).toHaveCount(1);
    await expect(page.getByTestId("pending").locator("[data-pending]")).toBeVisible();
    expect(await sideways(page), "the pending tray").toBeLessThanOrEqual(0);
    await page.getByTestId("pending-toggle").click();

    for (const [open, dialog] of [
      ["open-save", "save-menu"],
      ["open-settings", "settings"],
      ["open-help", "help"],
    ] as const) {
      await page.getByTestId(open).click();
      await expect(page.getByTestId(dialog)).toBeVisible();
      expect(await sideways(page), dialog).toBeLessThanOrEqual(0);
      await page.keyboard.press("Escape");
      await expect(page.getByTestId(dialog)).toBeHidden();
    }
  });
});
