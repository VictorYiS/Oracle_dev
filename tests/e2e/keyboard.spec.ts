// P2 acceptance A12 (keyboard part): the whole window flow of A9 with the keyboard alone. And the
// P1 rules still hold: an open dialog keeps every key but Escape; a button reached with the keyboard
// keeps Space and Enter; after a mouse click, Space and Enter are game keys again.
import { expect, test, type Page } from "@playwright/test";
import { collectErrors, newGame, world } from "./helpers";

/** Press Tab until the element with this test id has the focus. */
async function tabTo(page: Page, testid: string): Promise<void> {
  for (let i = 0; i < 40; i++) {
    if (await page.evaluate((id) => document.activeElement?.getAttribute("data-testid") === id, testid))
      return;
    await page.keyboard.press("Tab");
  }
  throw new Error(`could not tab to ${testid}`);
}

test("the window, with the keyboard alone", async ({ page }) => {
  test.setTimeout(90_000);
  const errors = collectErrors(page);
  await newGame(page, 1);
  await page.locator("body").focus();
  const phase = page.getByTestId("phase");

  await page.keyboard.press("Enter"); // dawn → morning
  await page.keyboard.press("Enter"); // → daytime
  await expect(phase).toHaveText("Daytime");
  await page.keyboard.press(" "); // pause
  await expect(page.getByTestId("speed-pause")).toHaveAttribute("aria-pressed", "true");

  // Let an hour pass until someone is at the window.
  for (let i = 0; i < 6 && !(await world(page)).cases.some((c) => c.status === "waiting"); i++) {
    await page.keyboard.press("t");
  }
  await page.keyboard.press("e"); // the window
  await expect(page.getByTestId("desk")).toBeVisible();
  await expect(page.getByTestId("case")).toContainText("Lena");

  // The first paper has the focus; open it, close it.
  await expect(page.getByTestId("paper-0")).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("paper")).toBeVisible();
  await expect(page.getByTestId("paper-close")).toBeFocused();
  await page.keyboard.press("Enter"); // the sheet's "Back"
  await expect(page.getByTestId("paper")).toBeHidden();
  await expect(page.getByTestId("paper-0")).toBeFocused();

  // The procedure.
  await tabTo(page, "open-sop");
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("sop")).toBeVisible();
  await expect(page.getByTestId("sop-close")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("sop")).toBeHidden();
  await expect(page.getByTestId("desk")).toBeVisible();

  // The stamp.
  await tabTo(page, "stamp-approve");
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("stamped")).toHaveText("Stamped: Connect");
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("desk")).toBeHidden();

  // On to dusk, an hour at a time.
  for (let i = 0; i < 14 && (await world(page)).clock.phase === "day"; i++) await page.keyboard.press("t");
  await expect(phase).toHaveText("Dusk");
  expect((await world(page)).buildings.find((b) => b.id === "bld.eb_05")!.power).toBe(true);
  await expect(page.getByTestId("events").locator('li[data-kind="order.done"]')).toContainText(
    "your decision on Lena's request",
  );
  expect(errors).toEqual([]);
});

test("keys respect dialogs and focused buttons", async ({ page }) => {
  const errors = collectErrors(page);
  await newGame(page, 7);
  const phase = page.getByTestId("phase");
  const pressedSpeed = page.locator(".speed button[aria-pressed='true']");

  await page.getByTestId("advance").click(); // dawn → morning, with the mouse
  await expect(phase).toHaveText("Morning");

  // A button reached with the keyboard: Enter opens the save menu, not the next phase.
  await page.getByTestId("open-save").focus();
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("save-menu")).toBeVisible();
  await expect(phase).toHaveText("Morning");

  // With the dialog open, shortcuts wait; Escape closes it.
  await page.keyboard.press("Enter");
  await page.keyboard.press("?");
  await expect(phase).toHaveText("Morning");
  await expect(page.getByTestId("help")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("save-menu")).toHaveCount(0);

  // Nothing focused: Enter is the shortcut again.
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press("Enter");
  await expect(phase).toHaveText("Daytime");

  // After a mouse click on a speed button, Space pauses and resumes.
  await page.locator(".speed button").nth(2).click(); // ×2
  await expect(pressedSpeed).toHaveText("×2");
  await page.keyboard.press(" ");
  await expect(pressedSpeed).toHaveText(/Pause/);
  await page.keyboard.press(" ");
  await expect(pressedSpeed).toHaveText("×2");

  // Open the key help: number keys leave the speed alone until it is closed.
  await page.keyboard.press("?");
  await expect(page.getByTestId("help")).toBeVisible();
  await page.keyboard.press("1");
  await expect(pressedSpeed).toHaveText("×2");
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("help")).toHaveCount(0);
  await page.keyboard.press("1");
  await expect(pressedSpeed).toHaveText("×1");

  expect(errors).toEqual([]);
});
