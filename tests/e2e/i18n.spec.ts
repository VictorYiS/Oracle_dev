// P1 acceptance A20: in Chinese, every screen of the manual loop is fully Chinese (no English UI
// copy, no unresolved @keys), and switching language updates open screens at once.
import { expect, test, type Page } from "@playwright/test";
import { en } from "../../src/ui/i18n/en";
import { zhCN } from "../../src/ui/i18n/zh-CN";
import { newGame } from "./helpers";

test.use({ locale: "zh-CN" });

type Tree = { [k: string]: string | Tree };
const leaves = (t: Tree, out: string[] = []): string[] => {
  for (const v of Object.values(t)) {
    if (typeof v === "string") out.push(v);
    else leaves(v, out);
  }
  return out;
};

/** English UI fragments that must never show up on a Chinese screen. */
const englishFragments = (() => {
  const zh = new Set(leaves(zhCN as unknown as Tree));
  return [
    ...new Set(
      leaves(en as unknown as Tree)
        .filter((s) => !zh.has(s))
        .flatMap((s) => s.split(/\{\w+\}/))
        .map((s) => s.trim())
        .filter((s) => /[A-Za-z]{3}/.test(s) && s.length >= 4),
    ),
  ];
})();

async function expectChineseOnly(page: Page, where: string) {
  const text = await page.locator("body").innerText();
  const leaked = englishFragments.filter((f) => text.includes(f));
  expect(leaked, `English copy on ${where}`).toEqual([]);
  expect(text, `unresolved text key on ${where}`).not.toMatch(/@[a-z]+\.[a-z_.]+/);
}

test("the manual loop's screens are all in Chinese, and switching language updates them", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("译者");
  await expectChineseOnly(page, "the title screen");

  await newGame(page, 42);
  await expectChineseOnly(page, "the game at dawn");
  await page.getByTestId("advance").click();
  await page.getByTestId("advance").click();
  await expect(page.getByTestId("phase")).toHaveText("白天");

  const you = await page.evaluate(
    () =>
      (window.oracle!.world() as { units: { id: string; role: string }[] }).units.find(
        (u) => u.role === "avatar",
      )!.id,
  );
  await page.getByTestId(`unit-${you}`).click();
  await expectChineseOnly(page, "the selection panel");

  await page.getByTestId("act-gather").click();
  await expect(page.getByTestId("hint")).toHaveText(/选择要采集的东西/);
  await expectChineseOnly(page, "the targeting hint");
  await page.keyboard.press("Escape");

  await page.getByTestId("open-build").click();
  await expect(page.getByTestId("build-menu")).toBeVisible();
  await expectChineseOnly(page, "the build menu");
  await page.keyboard.press("Escape");

  await page.getByTestId("open-save").click();
  await expect(page.getByTestId("save-menu")).toBeVisible();
  await expectChineseOnly(page, "the save menu");
  await page.keyboard.press("Escape");

  await page.keyboard.press("?");
  await expect(page.getByTestId("help")).toBeVisible();
  await expectChineseOnly(page, "the key help");
  await page.keyboard.press("Escape");

  await page.evaluate(() => window.oracle!.advance(2000));
  await expect(page.getByTestId("phase")).toHaveText("黄昏");
  await expectChineseOnly(page, "the event feed at dusk");

  // Switch to English: the open screen changes at once.
  await page.getByRole("button", { name: "English" }).click();
  await expect(page.getByTestId("phase")).toHaveText("Dusk");
  await expect(page.getByTestId("clock")).toContainText("Day 1");
  await expect(page.getByTestId("advance")).toHaveText("Call it a night");
});
