import { expect, type Page } from "@playwright/test";

/** Open the game and start a new game with a fixed seed (through the debug hook). */
export async function newGame(page: Page, seed: number): Promise<void> {
  await page.goto("/");
  await expect(page.getByTestId("new-game")).toBeVisible();
  await page.waitForFunction(() => Boolean(window.oracle));
  await page.waitForFunction((s) => window.oracle!.newGame(s), seed);
  await expect(page.locator("#viewport")).toBeVisible();
}

export interface WorldShape {
  clock: { day: number; phase: string; tick: number; minute: number };
  hero: { scene: string; layer: string; x: number; target: number | null; near: string[] };
  buildings: { id: string; power: boolean; damaged: boolean }[];
  residents: { id: string; here: boolean; layer: string; x: number; visiting: string | null }[];
  records: { buildings: { id: string; known: boolean; power: boolean; damaged: boolean }[] };
  memory: { building: string; day: number; power: boolean; damaged: boolean; occupied: boolean }[];
  cases: { id: string; type: string; applicant: string; building: string; status: string }[];
  pending: { next: number; items: { id: number; case: string; verdict: string | null }[] };
}

export function world(page: Page): Promise<WorldShape> {
  return page.evaluate(() => window.oracle!.world() as never);
}

export const advance = (page: Page, ticks: number) => page.evaluate((t) => window.oracle!.advance(t), ticks);

export const hash = (page: Page) => page.evaluate(() => window.oracle!.hash());

export const submit = (page: Page, command: Record<string, unknown>) =>
  page.evaluate((c) => window.oracle!.submit(c), command);

export function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  return errors;
}

/** Dawn → morning → day, the way the player does it. */
export async function startDay(page: Page): Promise<void> {
  const phase = page.getByTestId("phase");
  for (let i = 0; i < 3; i++) {
    if ((await world(page)).clock.phase === "day") break;
    await page.getByTestId("advance").click();
  }
  await expect(phase).toHaveAttribute("data-testid", "phase");
  expect((await world(page)).clock.phase).toBe("day");
}

/** Pause the real-time clock so nothing moves between reading and acting. */
export async function pause(page: Page): Promise<void> {
  await page.getByTestId("speed-pause").click();
}

/** Wait until the theatre has finished any camera move or passage. */
export async function settled(page: Page): Promise<void> {
  await expect(page.locator("#viewport")).not.toHaveAttribute("data-busy", "1");
}

/**
 * Walk the hero to x on their layer by command and let the clock run until they get there.
 * (The same command the A/D keys and clicks submit.)
 */
export async function walkTo(page: Page, x: number): Promise<void> {
  const r = await submit(page, { type: "hero.walk", to: x });
  expect(r).toMatchObject({ ok: true });
  for (let i = 0; i < 200; i++) {
    const w = await world(page);
    if (w.hero.target === null) break;
    await advance(page, 5);
  }
  expect((await world(page)).hero.x).toBe(x);
}

/** Take a passage by command (the same command the up/down keys submit), and wait for the theatre. */
export async function cross(page: Page, passage: string): Promise<void> {
  expect(await submit(page, { type: "hero.cross", passage })).toMatchObject({ ok: true });
  // The theatre starts the move on its next frame: wait for it to show the new layer, then to finish.
  await expect(page.locator("#viewport")).toHaveAttribute("data-at", (await world(page)).hero.layer);
  await settled(page);
}

/** From the window to the far bank: along the street, down the steps, over the bridge. */
export async function goToFarBank(page: Page): Promise<void> {
  await walkTo(page, 2900);
  await cross(page, "passage.stairs");
  await walkTo(page, 1500);
  await cross(page, "passage.bridge");
  await expect(page.locator("#viewport")).toHaveAttribute("data-at", "layer.far_bank");
}

/** The facade card of a building (its side faces carry data-face). */
export const facade = (page: Page, id: string) => page.locator(`[data-building="${id}"]:not([data-face])`);

/** The face currently drawn on a building's facade. */
export const face = (page: Page, id: string) => facade(page, id).locator(".pt-face[data-style]");

/** Wait until the camera has caught up with the hero (it eases after them as they walk). */
export async function cameraOnHero(page: Page): Promise<void> {
  // First the theatre must draw the hero where the world has them (it catches up on its next frames).
  const x = (await world(page)).hero.x;
  await page.waitForFunction(
    (at) => (document.querySelector('[data-testid="hero"]') as HTMLElement).dataset.x === String(at),
    x,
  );
  await page.waitForFunction(() => {
    const hero = document.querySelector('[data-testid="hero"]')!.getBoundingClientRect();
    const view = document.querySelector("#viewport")!.getBoundingClientRect();
    const mid = view.left + view.width / 2;
    return Math.abs(hero.left + hero.width / 2 - mid) < view.width * 0.12;
  });
  await page.waitForTimeout(150);
}
