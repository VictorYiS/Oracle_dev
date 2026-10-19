// Shortcuts and focus: an open dialog keeps every key but Escape; a button reached with the
// keyboard keeps Space and Enter; after a mouse click, Space and Enter are game keys again.
import { expect, test } from "@playwright/test";
import { collectErrors, newGame } from "./helpers";

test("keys respect dialogs and focused buttons", async ({ page }) => {
  const errors = collectErrors(page);
  await newGame(page, 7);
  const phase = page.getByTestId("phase");
  const pressedSpeed = page.locator(".speed button[aria-pressed='true']");

  await page.getByTestId("advance").click(); // dawn → planning, with the mouse
  await expect(phase).toHaveText("Planning");

  // A button reached with the keyboard: Enter opens the save menu, not the next phase.
  await page.getByTestId("open-save").focus();
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("save-menu")).toBeVisible();
  await expect(phase).toHaveText("Planning");

  // With the dialog open, shortcuts wait; Escape closes it.
  await page.keyboard.press("Enter");
  await page.keyboard.press("b");
  await expect(phase).toHaveText("Planning");
  await expect(page.getByTestId("build-menu")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("save-menu")).toHaveCount(0);

  // Nothing focused (closing the dialog hands focus back to its button): Enter is the shortcut again.
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

  // Open the build menu: number keys leave the speed alone until it is closed.
  await page.getByTestId("open-build").click();
  await expect(page.getByTestId("build-menu")).toBeVisible();
  await page.keyboard.press("1");
  await expect(pressedSpeed).toHaveText("×2");
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("build-menu")).toHaveCount(0);
  await page.keyboard.press("1");
  await expect(pressedSpeed).toHaveText("×1");

  expect(errors).toEqual([]);
});
