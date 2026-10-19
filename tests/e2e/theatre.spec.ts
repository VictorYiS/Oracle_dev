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

/** A point on screen where an element matching `selector` is what the pointer would hit. */
async function pointAt(page: Page, selector: string): Promise<{ x: number; y: number }> {
  const p = await page.evaluate((sel) => {
    for (const el of document.querySelectorAll(sel)) {
      const r = el.getBoundingClientRect();
      for (const fy of [0.15, 0.35, 0.6, 0.85]) {
        for (const fx of [0.5, 0.3, 0.7]) {
          const x = r.left + r.width * fx;
          const y = r.top + r.height * fy;
          if (x < 0 || y < 60 || x > innerWidth || y > innerHeight - 60) continue;
          if (el.contains(document.elementFromPoint(x, y))) return { x, y };
        }
      }
    }
    return null;
  }, selector);
  if (!p) throw new Error(`nothing matching ${selector} is in view`);
  return p;
}

async function wheelAt(page: Page, selector: string, dy: number): Promise<void> {
  const p = await pointAt(page, selector);
  await page.mouse.move(p.x, p.y);
  await page.mouse.wheel(0, dy);
  await settled(page);
  await page.waitForTimeout(420); // the wheel rests between steps
}

/** What the records show for a building, as the visual state the Oracle draws. */
function recordState(w: WorldShape, building: string, registered: number): string {
  const r = w.records.buildings.find((b) => b.id === building)!;
  if (!r.known) return "vacant";
  if (r.damaged) return "damaged";
  if (r.power) return registered > 0 ? "powered" : "empty";
  return registered > 0 ? "candle" : "dark";
}

test.describe("the paper theatre", () => {
  test("walking, the bridge, looking is not going, keys and buttons, the alley", async ({ page }, info) => {
    test.setTimeout(120_000);
    const phone = info.project.name === "phone";
    const errors = collectErrors(page);
    await newGame(page, 42);
    await startDay(page);

    // ① Walking moves the hero (held key on a computer, held ▶ on a phone).
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
    await page.waitForTimeout(400);
    await pause(page);
    const x1 = (await world(page)).hero.x;
    expect(x1).toBeGreaterThan(x0);
    expect(await page.getByTestId("hero").evaluate((el) => el.style.transform)).toContain("translateX");

    // ② The bridge: halfway through, the hero is between the two layers in depth; then on the far side.
    await walkTo(page, 2900);
    await cross(page, "passage.stairs");
    await walkTo(page, 1500);
    await expect(viewport(page)).toHaveAttribute("data-at", "layer.riverbank");
    await settled(page);
    if (phone) await page.getByTestId("pad-use").click();
    else await page.keyboard.press("e");
    const depths: number[] = [];
    for (let i = 0; i < 14; i++) {
      depths.push(await heroZ(page));
      await page.waitForTimeout(90);
    }
    expect(
      depths.some((z) => z < -220 && z > -600),
      `hero depths during the crossing: ${depths.join(", ")}`,
    ).toBe(true);
    await settled(page);
    await expect(viewport(page)).toHaveAttribute("data-at", "layer.far_bank");
    expect((await world(page)).hero.layer).toBe("layer.far_bank");

    // ⑤ The alley: look into it from its mouth; its walls are the side faces of the houses either side.
    await walkTo(page, 2600);
    await cameraOnHero(page);
    // At the alley's mouth, "look closer" looks down it (W, or ⊕ on a phone).
    if (phone) await page.getByTestId("pad-in").click();
    else await page.keyboard.press("w");
    await settled(page);
    await expect(viewport(page)).toHaveAttribute("data-focus", "passage.alley");
    await expect(viewport(page)).toHaveAttribute("data-at", "layer.far_bank");
    const leftWall = page.locator('[data-face="right"][data-building="bld.eb_11"]');
    const rightWall = page.locator('[data-face="left"][data-building="bld.works_1"]');
    await expect(leftWall).toBeVisible();
    await expect(rightWall).toBeVisible();
    const [lb, rb] = [(await leftWall.boundingBox())!, (await rightWall.boundingBox())!];
    expect(lb.x + lb.width / 2).toBeLessThan(rb.x + rb.width / 2);
    if (phone) await page.getByTestId("pad-out").click();
    else await page.keyboard.press("Escape");
    await settled(page);
    await expect(viewport(page)).toHaveAttribute("data-focus", "layer.far_bank");

    // Back to the street for ③ and ④.
    await walkTo(page, 1500);
    await cross(page, "passage.bridge");
    await walkTo(page, 2900);
    await cross(page, "passage.stairs");
    await walkTo(page, 2220);
    await cameraOnHero(page);
    await expect(viewport(page)).toHaveAttribute("data-at", "layer.street");

    // ③ Looking is not going: the camera goes to the far bank, the hero stays on the street; a door
    // over there does nothing to the world; looking back brings the camera home.
    if (phone) {
      for (let i = 0; i < 3 && (await viewport(page).getAttribute("data-focus")) !== "layer.far_bank"; i++) {
        await page.getByTestId("pad-in").click();
        await settled(page);
      }
    } else {
      await wheelAt(page, '[data-building="bld.eb_17b"]:not([data-face])', -120);
    }
    await expect(viewport(page)).toHaveAttribute("data-focus", "layer.far_bank");
    await expect(viewport(page)).toHaveAttribute("data-at", "layer.street");
    const before = await hash(page);
    const door = page.locator('.pt-door[data-passage="passage.door_17b"]');
    await expect(door).toBeVisible();
    if (phone)
      await door.dispatchEvent("click"); // a tap; the phone's buttons may cover it on screen
    else {
      const at = await pointAt(page, '.pt-door[data-passage="passage.door_17b"]');
      await page.mouse.click(at.x, at.y);
    }
    await page.waitForTimeout(300);
    expect(await hash(page)).toBe(before);
    expect((await world(page)).hero.layer).toBe("layer.street");
    for (let i = 0; i < 3 && (await viewport(page).getAttribute("data-focus")) !== "layer.street"; i++) {
      if (phone) await page.getByTestId("pad-out").click();
      else await page.mouse.wheel(0, 120);
      await settled(page);
      await page.waitForTimeout(420);
    }
    await expect(viewport(page)).toHaveAttribute("data-focus", "layer.street");

    // ④ The same with keys (W, S, Esc) or the phone's buttons (⊕, ⊖).
    const lookIn = () => (phone ? page.getByTestId("pad-in").click() : page.keyboard.press("w"));
    const lookOut = (key: "s" | "Escape") =>
      phone ? page.getByTestId("pad-out").click() : page.keyboard.press(key);
    await lookIn();
    await settled(page);
    await expect(viewport(page)).toHaveAttribute("data-focus", "layer.riverbank");
    await lookIn();
    await settled(page);
    await expect(viewport(page)).toHaveAttribute("data-focus", "layer.far_bank");
    await expect(viewport(page)).toHaveAttribute("data-at", "layer.street");
    await lookOut("s");
    await settled(page);
    await expect(viewport(page)).toHaveAttribute("data-focus", "layer.riverbank");
    await lookOut("Escape");
    await settled(page);
    await expect(viewport(page)).toHaveAttribute("data-focus", "layer.street");
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
