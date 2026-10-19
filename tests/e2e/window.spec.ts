// P2 acceptance A9: the window, from a new game to the day's outcome. Daytime → the window opens →
// the first visitor → a paper in close-up → the procedure → a stamp → on to dusk → the building the
// decision was about has changed, and the event feed says it was because of that decision.
import { expect, test } from "@playwright/test";
import { collectErrors, newGame, world } from "./helpers";

test("the window: a visitor, their papers, the procedure, a stamp, and what came of it at dusk", async ({
  page,
}, info) => {
  test.setTimeout(90_000);
  const phone = info.project.name === "phone";
  const errors = collectErrors(page);
  await newGame(page, 1);

  // Into the daytime, with the buttons a player uses.
  await page.getByTestId("advance").click();
  await page.getByTestId("advance").click();
  await expect(page.getByTestId("phase")).toHaveText("Daytime");
  await page.getByTestId("speed-pause").click();

  // The day starts at the window: open it.
  if (phone) await page.getByTestId("pad-use").click();
  else await page.keyboard.press("e");
  const desk = page.getByTestId("desk");
  await expect(desk).toBeVisible();
  await expect(page.getByTestId("desk-empty")).toBeVisible();

  // The first visitor arrives.
  for (let i = 0; i < 60 && !(await page.getByTestId("case").isVisible()); i++) {
    await page.evaluate(() => window.oracle!.advance(5));
  }
  const kase = page.getByTestId("case");
  await expect(kase).toBeVisible();
  await expect(kase).toContainText("Lena");
  await expect(kase).toContainText("East Bank 5");

  // A paper in close-up: plain, selectable text, with where it came from and when.
  await page.getByTestId("paper-0").click();
  const paper = page.getByTestId("paper");
  await expect(paper).toBeVisible();
  await expect(page.getByTestId("paper-source")).toContainText("Source: Lena");
  await expect(page.getByTestId("paper-day")).toHaveText("Day 1");
  await page.getByTestId("paper-close").click();
  await expect(paper).toBeHidden();
  await page.getByTestId("paper-1").click();
  await expect(page.getByTestId("paper-source")).toContainText("Source: the Registry");
  await page.getByTestId("paper-close").click();

  // The procedure.
  await page.getByTestId("open-sop").click();
  await expect(page.getByTestId("sop")).toBeVisible();
  await expect(page.getByTestId("sop").locator("li")).toHaveCount(4);
  await page.getByTestId("sop-close").click();

  // The stamp.
  await page.getByTestId("stamp-approve").click();
  await expect(page.getByTestId("stamped")).toHaveText("Stamped: Connect");
  const decided = (await world(page)).cases.find((c) => c.building === "bld.eb_05")!;
  expect(decided.status).toBe("decided");
  expect((await world(page)).buildings.find((b) => b.id === "bld.eb_05")!.power).toBe(false); // not yet
  await page.getByTestId("desk-close").click();

  // On to dusk, an hour at a time.
  for (let i = 0; i < 14 && (await world(page)).clock.phase === "day"; i++) {
    await page.getByTestId("wait").click();
  }
  await expect(page.getByTestId("phase")).toHaveText("Dusk");

  // The world changed as decided, and the feed says why.
  expect((await world(page)).buildings.find((b) => b.id === "bld.eb_05")!.power).toBe(true);
  const outcome = page.getByTestId("events").locator('li[data-kind="order.done"]');
  await expect(outcome).toContainText("East Bank 5 has power now");
  await expect(outcome).toContainText("your decision on Lena's request");
  expect(errors).toEqual([]);
});
