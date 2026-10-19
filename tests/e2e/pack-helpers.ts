import { expect, type Page } from "@playwright/test";
export { world } from "./helpers";

/** Start a new game with whatever pack the title screen shows (random seed). */
export async function newGameFromTitle(page: Page): Promise<void> {
  await page.getByTestId("new-game").click();
  await expect(page.getByTestId("map")).toBeVisible();
}
