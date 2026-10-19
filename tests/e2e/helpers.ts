import { expect, type Page } from "@playwright/test";

/** Open the game and start a new game with a fixed seed (through the debug hook). */
export async function newGame(page: Page, seed: number): Promise<void> {
  await page.goto("/");
  await expect(page.getByTestId("new-game")).toBeVisible();
  await page.waitForFunction(() => Boolean(window.oracle));
  await page.waitForFunction((s) => window.oracle!.newGame(s), seed);
  await expect(page.getByTestId("map")).toBeVisible();
}

export function world(page: Page): Promise<{
  clock: { day: number; phase: string; tick: number };
  stock: Record<string, number>;
  width: number;
  units: { id: string; role: string; x: number; y: number; job: unknown }[];
  buildings: { id: string; type: string; x: number; y: number; complete: boolean }[];
}> {
  return page.evaluate(() => window.oracle!.world() as never);
}

/** Click a map tile the way a player would. */
export async function clickTile(page: Page, x: number, y: number): Promise<void> {
  const map = page.getByTestId("map");
  const pos = await page.evaluate(([tx, ty]) => window.oracle!.tileToCanvas(tx!, ty!), [x, y]);
  if (!pos) throw new Error("map not ready");
  await map.click({ position: pos });
}

export const advance = (page: Page, ticks: number) => page.evaluate((t) => window.oracle!.advance(t), ticks);

export const hash = (page: Page) => page.evaluate(() => window.oracle!.hash());

export function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  return errors;
}
