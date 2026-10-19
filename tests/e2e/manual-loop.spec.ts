// P1 acceptance A10: the manual loop, played through the interface.
import { expect, test } from "@playwright/test";
import { advance, clickTile, collectErrors, newGame, world } from "./helpers";

test("manual loop: gather wood, build a warehouse and a farm, and get through the night fed", async ({
  page,
}) => {
  const errors = collectErrors(page);
  await newGame(page, 42);

  // Dawn → planning → day, with the button the player uses.
  await page.getByTestId("advance").click();
  await page.getByTestId("advance").click();
  await expect(page.getByTestId("phase")).toHaveText("Daytime");

  const w0 = await world(page);
  const you = w0.units.find((u) => u.role === "avatar")!;
  const wisp = w0.units.find((u) => u.role === "worker")!;
  const wood0 = w0.stock["res.wood"] ?? 0;

  // The avatar and the wisp each gather a tree near the campfire.
  for (const [unit, tree] of [
    [you.id, [21, 21]],
    [wisp.id, [27, 20]],
  ] as const) {
    await page.getByTestId(`unit-${unit}`).click();
    await page.getByTestId("act-gather").click();
    await expect(page.getByTestId("hint")).toBeVisible();
    await clickTile(page, tree[0], tree[1]);
    await expect(page.getByTestId("hint")).toBeHidden();
  }
  await advance(page, 200);
  const wood1 = (await world(page)).stock["res.wood"] ?? 0;
  expect(wood1 - wood0).toBeGreaterThanOrEqual(10);

  // Warehouse: build menu → place → the wisp builds it.
  for (const [building, at] of [
    ["bld.warehouse", [26, 23]],
    ["bld.farm", [22, 23]],
  ] as const) {
    await page.getByTestId("open-build").click();
    await page.getByTestId(`build-${building}`).click();
    await clickTile(page, at[0], at[1]);
    const site = (await world(page)).buildings.find((b) => b.type === building)!;
    expect(site.complete).toBe(false);
    await page.getByTestId(`unit-${wisp.id}`).click();
    await page.getByTestId("act-build").click();
    await clickTile(page, at[0], at[1]);
    await advance(page, 150);
    expect((await world(page)).buildings.find((b) => b.id === site.id)?.complete).toBe(true);
  }

  // Run to dusk, then night, then the next day.
  await advance(page, 1000);
  await expect(page.getByTestId("phase")).toHaveText("Dusk");
  await page.getByTestId("advance").click(); // night
  await page.getByTestId("advance").click(); // next dawn
  await expect(page.getByTestId("clock")).toContainText("Day 2");

  const events = await page.evaluate(() => window.oracle!.events());
  const settled = events.find((e) => e.kind === "day.settled" && e.day === 1);
  expect(settled?.data).toMatchObject({ hungry: 0 });
  expect(events.filter((e) => e.kind === "unit.hungry")).toEqual([]);
  expect(errors).toEqual([]);
});
