// P2 acceptance A11 (end-to-end part): adopting the Oracle's suggestion puts an item on the pending
// tray that says what was taken for granted and how to check it; going to look, or reading the
// original at the window, closes it with a verdict that matches how things really are.
import { expect, test, type Page } from "@playwright/test";
import { collectErrors, goToFarBank, newGame, walkTo, world } from "./helpers";

async function openWindowWithVisitor(page: Page, seed: number): Promise<void> {
  await newGame(page, seed);
  await page.getByTestId("advance").click();
  await page.getByTestId("advance").click();
  await page.getByTestId("speed-pause").click();
  await page.keyboard.press("e");
  await expect(page.getByTestId("desk")).toBeVisible();
  for (let i = 0; i < 60 && !(await page.getByTestId("case").isVisible()); i++) {
    await page.evaluate(() => window.oracle!.advance(5));
  }
  await expect(page.getByTestId("case")).toBeVisible();
}

test("adopt, then go and look: the Oracle said No. 7 had power; it does not", async ({ page }) => {
  test.setTimeout(90_000);
  const errors = collectErrors(page);
  await openWindowWithVisitor(page, 42);
  await expect(page.getByTestId("case")).toContainText("East Bank 7");
  const suggestion = page.getByTestId("suggestion");
  await expect(suggestion).toHaveAttribute("data-reason", "already_powered");
  await expect(suggestion).toContainText("already connected");
  await page.getByTestId("adopt").click();
  await page.getByTestId("desk-close").click();

  // The tray: one item, what was taken for granted, how to check it.
  const tray = page.getByTestId("pending");
  await expect(page.getByTestId("pending-count")).toHaveText("1");
  await page.getByTestId("pending-toggle").click();
  const item = tray.locator("[data-pending]");
  await expect(item).toHaveCount(1);
  await expect(item).toContainText("East Bank 7 has power");
  await expect(item).toContainText("Go and look at East Bank 7.");
  await expect(item).toContainText("Read the original papers at the window");
  await expect(item).not.toHaveAttribute("data-verdict");
  await page.getByTestId("pending-toggle").click();

  // Go and look.
  await goToFarBank(page);
  await walkTo(page, 1255);
  await page.getByTestId("pending-toggle").click();
  await expect(item).toHaveAttribute("data-verdict", "wrong");
  expect((await world(page)).buildings.find((b) => b.id === "bld.eb_07")!.power).toBe(false);
  await expect(page.getByTestId("pending-count")).toHaveText("0");
  await expect(page.getByTestId("events").locator('li[data-kind="pending.checked"]')).toContainText(
    "the Oracle was wrong about East Bank 7",
  );
  expect(errors).toEqual([]);
});

test("adopt, then read the original: the Oracle said No. 12 was sound; the roof is in", async ({ page }) => {
  test.setTimeout(90_000);
  await openWindowWithVisitor(page, 3);
  await expect(page.getByTestId("case")).toContainText("East Bank 12");
  await expect(page.getByTestId("suggestion")).toHaveAttribute("data-reason", "no_damage_on_file");
  await page.getByTestId("adopt").click();
  await page.getByTestId("desk-close").click();
  await page.getByTestId("pending-toggle").click();
  const item = page.getByTestId("pending").locator("[data-pending]");
  await expect(item).toContainText("East Bank 12 is sound");
  const t0 = (await world(page)).clock.minute;
  await item.getByRole("button", { name: "Read the original" }).click();
  await expect(item).toHaveAttribute("data-verdict", "wrong");
  expect((await world(page)).clock.minute - t0).toBe(40); // fetching the original takes its time
  expect((await world(page)).buildings.find((b) => b.id === "bld.eb_12")!.damaged).toBe(true);
});
