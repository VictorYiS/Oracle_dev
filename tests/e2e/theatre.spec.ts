// P2 acceptance A6 and A7: the paper theatre. Walking moves the hero; crossing the bridge carries
// them through depth; looking is not going; keys and the phone's buttons do the same; looking into
// the alley shows its walls, which are the side faces of the buildings either side. And one house
// goes through unseen → seen → remembered → revisited → saved and loaded.
import { expect, test, type Page } from "@playwright/test";
import {
  advance,
  cameraOnHero,
  collectErrors,
  cross,
  face,
  facade,
  goToFarBank,
  hash,
  newGame,
  pause,
  settled,
  startDay,
  walkTo,
  world,
  type WorldShape,
} from "./helpers";

const viewport = (page: Page) => page.locator("#viewport");

/** The z of the hero's computed transform (matrix3d m43), or 0 for a flat one. */
const heroZ = (page: Page) =>
  page.evaluate(() => {
    const t = getComputedStyle(document.querySelector('[data-testid="hero"]')!).transform;
    const m = /matrix3d\(([^)]+)\)/.exec(t);
    return m ? Number(m[1]!.split(",")[14]) : 0;
  });

/** What the records show for a building, as the visual state the Oracle draws. */
function recordState(w: WorldShape, building: string, registered: number): string {
  const r = w.records.buildings.find((b) => b.id === building)!;
  if (!r.known) return "vacant";
  if (r.damaged) return "damaged";
  if (r.power) return registered > 0 ? "powered" : "empty";
  return registered > 0 ? "candle" : "dark";
}

test.describe("the paper theatre", () => {
  test("directional passages, contextual inspection, perspective and the alley walls", async ({
    page,
  }, info) => {
    test.setTimeout(120_000);
    const phone = info.project.name === "phone";
    const errors = collectErrors(page);
    await newGame(page, 42);
    await startDay(page);
    const x0 = (await world(page)).hero.x;
    await page.getByTestId("speed-x4").click();
    if (phone) {
      const b = (await page.getByTestId("pad-right").boundingBox())!;
      await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
      await page.mouse.down();
      await page.waitForTimeout(900);
      await page.mouse.up();
    } else {
      await page.keyboard.down("d");
      await page.waitForTimeout(900);
      await page.keyboard.up("d");
    }
    await pause(page);
    expect((await world(page)).hero.x).toBeGreaterThan(x0);
    await cameraOnHero(page);
    const before = await hash(page);
    await page.mouse.move(200, 200);
    await page.mouse.wheel(0, -120);
    await page.keyboard.press("f");
    await page.locator('.pt-door[data-passage="passage.door_17b"]').dispatchEvent("click");
    await page.waitForTimeout(500);
    expect(await hash(page)).toBe(before);
    await expect(viewport(page)).toHaveAttribute("data-focus", "layer.street");
    await expect(viewport(page)).toHaveAttribute("data-inspecting", "");
    if (phone) await expect(page.getByTestId("pad-in")).toBeDisabled();

    // A real click on the floor walks toward that screen point under the current perspective.
    // Pick an uncovered point: the feed, hero and phone controls can overlap the ground.
    const floorPoint = await page.evaluate(() => {
      const h = document.querySelector('[data-testid="hero"]')!.getBoundingClientRect();
      const v = document.querySelector("#viewport")!.getBoundingClientRect();
      for (const dx of [60, 90, 120, -60, -90]) {
        const x = h.left + h.width / 2 + dx;
        const y = h.bottom + 5;
        const target = document.elementFromPoint(x, y);
        if (x < v.right && y < v.bottom && target?.closest('[data-ground="layer.street"]'))
          return { x, y, direction: Math.sign(dx) };
      }
      return null;
    });
    expect(floorPoint).not.toBeNull();
    const clickedFrom = (await world(page)).hero.x;
    await page.mouse.click(floorPoint!.x, floorPoint!.y);
    const target = (await world(page)).hero.target!;
    expect(Math.sign(target - clickedFrom)).toBe(floorPoint!.direction);
    expect(Math.abs(target - clickedFrom)).toBeLessThan(250);
    await walkTo(page, target);

    const distantHeight = await facade(page, "bld.eb_17b").evaluate(
      (el) => el.getBoundingClientRect().height,
    );
    await walkTo(page, 2900);
    await cross(page, "passage.stairs");
    await walkTo(page, 1500);
    await cameraOnHero(page);
    // E is reserved for objects; it cannot accidentally take the bridge.
    await page.keyboard.press("e");
    expect((await world(page)).hero.layer).toBe("layer.riverbank");
    const go = async (inward: boolean) => {
      if (phone) await page.getByTestId(inward ? "pad-up" : "pad-down").click();
      else await page.keyboard.press(inward ? "ArrowUp" : "ArrowDown");
    };
    await go(true);
    const depths: number[] = [];
    await expect(viewport(page)).toHaveAttribute("data-busy", "1");
    for (let i = 0; i < 80 && (await viewport(page).getAttribute("data-busy")) === "1"; i++) {
      depths.push(await heroZ(page));
      await page.waitForTimeout(40);
    }
    expect(
      depths.some((z) => z < -220 && z > -600),
      `hero depths: ${depths}`,
    ).toBe(true);
    await expect(viewport(page)).toHaveAttribute("data-at", "layer.far_bank");
    expect((await world(page)).hero.layer).toBe("layer.far_bank");
    expect(
      await facade(page, "bld.eb_17b").evaluate((el) => el.getBoundingClientRect().height),
    ).toBeGreaterThan(distantHeight * 1.5);
    // A return direction never chooses the inward passage.
    await go(false);
    await expect(viewport(page)).toHaveAttribute("data-at", "layer.riverbank");
    await settled(page);
    await go(true);
    await expect(viewport(page)).toHaveAttribute("data-at", "layer.far_bank");
    await settled(page);
    await walkTo(page, 2600);
    await cameraOnHero(page);
    const leftWall = page.locator('[data-face="right"][data-building="bld.eb_11"]');
    const rightWall = page.locator('[data-face="left"][data-building="bld.works_1"]');
    await expect(leftWall).toBeVisible();
    await expect(rightWall).toBeVisible();
    expect((await leftWall.boundingBox())!.x).toBeLessThan((await rightWall.boundingBox())!.x);
    await go(true);
    await expect(viewport(page)).toHaveAttribute("data-at", "layer.substation");
    await settled(page);
    await go(false);
    await expect(viewport(page)).toHaveAttribute("data-at", "layer.far_bank");
    await settled(page);
    await walkTo(page, 2220);
    await cameraOnHero(page);
    await go(true);
    await expect(viewport(page)).toHaveAttribute("data-at", "layer.room_17b");
    await settled(page);
    const hero = (await page.getByTestId("hero").boundingBox())!;
    const view = (await viewport(page).boundingBox())!;
    expect(hero.height / view.height).toBeGreaterThan(0.3);
    await walkTo(page, -360);
    await cameraOnHero(page);
    await expect(page.getByTestId("pad-in")).toBeEnabled();
    const shelf = page.locator('[data-prop="prop.shelf_17b"]');
    const h = (await shelf.boundingBox())!.height;
    const inspectionHash = await hash(page);
    if (phone) await page.getByTestId("pad-in").click();
    else {
      await page.mouse.move(view.x + view.width / 2, view.y + view.height / 2);
      await page.mouse.wheel(0, -120);
    }
    await expect(viewport(page)).toHaveAttribute("data-inspecting", "prop.shelf_17b");
    await settled(page);
    expect((await shelf.boundingBox())!.height).toBeGreaterThan(h * 1.2);
    expect(await hash(page)).toBe(inspectionHash);
    await expect(viewport(page)).toHaveAttribute("data-at", "layer.room_17b");
    if (phone) await page.getByTestId("pad-out").click();
    else await page.keyboard.press("Escape");
    await settled(page);
    await expect(viewport(page)).toHaveAttribute("data-inspecting", "");
    await page.keyboard.press("f");
    await expect(viewport(page)).toHaveAttribute("data-inspecting", "prop.shelf_17b");
    await settled(page);
    await page.keyboard.press("Escape");
    await settled(page);
    expect(await hash(page)).toBe(inspectionHash);
    await walkTo(page, 0);
    await cameraOnHero(page);
    await go(false);
    await expect(viewport(page)).toHaveAttribute("data-at", "layer.far_bank");
    await settled(page);
    expect(errors).toEqual([]);
  });

  test("unseen, present, remembered, revisited: No. 7 on the far bank", async ({ page }) => {
    test.setTimeout(120_000);
    const errors = collectErrors(page);
    const SEVEN = "bld.eb_07";
    await newGame(page, 42);
    await startDay(page);
    await pause(page);
    const registered = async () =>
      (
        await page.evaluate(
          () => window.oracle!.world() as { records: { residents: { registered: string | null }[] } },
        )
      ).records.residents.filter((r) => r.registered === "bld.eb_07").length;

    // ① Unseen: drawn by the Oracle, from the records ("lit"), and it follows them.
    await expect(facade(page, SEVEN)).toHaveAttribute("data-seen", "false");
    await expect(face(page, SEVEN)).toHaveAttribute("data-style", "oracle");
    await expect(face(page, SEVEN)).toHaveAttribute(
      "data-state",
      recordState(await world(page), SEVEN, await registered()),
    );
    await expect(face(page, SEVEN)).toHaveAttribute("data-state", "powered");
    await page.evaluate(() =>
      window.oracle!.debug({ type: "debug.record", building: "bld.eb_07", power: false }),
    );
    await expect(face(page, SEVEN)).toHaveAttribute(
      "data-state",
      recordState(await world(page), SEVEN, await registered()),
    );
    await expect(face(page, SEVEN)).toHaveAttribute("data-state", "candle");
    await page.evaluate(() =>
      window.oracle!.debug({ type: "debug.record", building: "bld.eb_07", power: true }),
    );
    await expect(face(page, SEVEN)).toHaveAttribute("data-state", "powered");

    // ② Present: in ink, as it really is (dark, a candle inside).
    await goToFarBank(page);
    await walkTo(page, 1255);
    await expect(facade(page, SEVEN)).toHaveAttribute("data-seen", "true");
    await expect(facade(page, SEVEN)).toHaveAttribute("data-age", "0");
    await expect(face(page, SEVEN)).toHaveAttribute("data-style", "ink");
    await expect(face(page, SEVEN)).toHaveAttribute("data-state", "candle");
    await expect(facade(page, SEVEN)).toHaveAttribute("data-seen-day", "1");

    // ③ Remembered: walk away; the house changes behind your back; your picture does not.
    await walkTo(page, 3400);
    await expect(facade(page, SEVEN)).toHaveAttribute("data-age", "1");
    await page.evaluate(() =>
      window.oracle!.debug({ type: "debug.truth", building: "bld.eb_07", power: true }),
    );
    await page.waitForTimeout(200);
    await expect(face(page, SEVEN)).toHaveAttribute("data-state", "candle");
    await expect(facade(page, SEVEN)).toHaveAttribute("data-seen-day", "1");
    // A day later the memory is older.
    await advance(page, 10_000);
    for (const step of ["night", "dawn", "planning", "day"]) {
      await page.getByTestId("advance").click();
      void step;
      if ((await world(page)).clock.phase === "day") break;
    }
    await pause(page);
    expect((await world(page)).clock.day).toBe(2);
    await expect(facade(page, SEVEN)).toHaveAttribute("data-age", "2");
    await expect(face(page, SEVEN)).toHaveAttribute("data-state", "candle");

    // ④ Revisited: redrawn from the truth, dated today, and the feed says what changed.
    await goToFarBank(page);
    await walkTo(page, 1255);
    await expect(face(page, SEVEN)).toHaveAttribute("data-state", "powered");
    await expect(facade(page, SEVEN)).toHaveAttribute("data-seen-day", "2");
    await expect(facade(page, SEVEN)).toHaveAttribute("data-age", "0");
    const news = page.getByTestId("events").locator('li[data-kind="memory.changed"]');
    await expect(news).toHaveCount(1);
    await expect(news).toContainText("East Bank 7");
    await expect(news).toContainText("dark → lit");

    // ⑤ Saved and loaded: the memory (picture and date) is unchanged.
    await walkTo(page, 3400);
    const memory = (await world(page)).memory;
    await page.getByTestId("open-save").click();
    await page.getByTestId("save-here").click();
    await expect(page.getByTestId("save-status")).toHaveText("Saved in this browser.");
    await page.reload();
    await page.getByTestId("continue").click();
    await expect(viewport(page)).toBeVisible();
    expect((await world(page)).memory).toEqual(memory);
    await expect(facade(page, SEVEN)).toHaveAttribute("data-seen-day", "2");
    await expect(face(page, SEVEN)).toHaveAttribute("data-state", "powered");
    await expect(face(page, SEVEN)).toHaveAttribute("data-style", "ink");
    expect(errors).toEqual([]);
  });
});
