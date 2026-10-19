// P1 acceptance A20, extended in P2 to the paper theatre's hints, the window, papers in close-up and
// the pending tray: in Chinese every screen is fully Chinese (no English UI copy, no unresolved
// @keys), and switching language updates open screens at once.
import { writeFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { en } from "../../src/ui/i18n/en";
import { zhCN } from "../../src/ui/i18n/zh-CN";
import { newGame, walkTo } from "./helpers";

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

test("every screen is in Chinese: the street, the window, a paper, the procedure, the tray; switching updates them", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("译者");
  await expectChineseOnly(page, "the title screen");

  await newGame(page, 42);
  await expectChineseOnly(page, "the street at dawn");
  await page.getByTestId("advance").click();
  await page.getByTestId("advance").click();
  await expect(page.getByTestId("phase")).toHaveText("白天");
  await page.getByTestId("speed-pause").click();
  await expect(page.getByTestId("hint")).toHaveText("E：窗口");
  await expect(page.getByTestId("where")).toHaveText("街道");
  await expectChineseOnly(page, "the street by day, with its hint");

  // The window, a visitor, their papers and the procedure, the Oracle's suggestion.
  await page.keyboard.press("e");
  await expect(page.getByTestId("desk")).toBeVisible();
  for (let i = 0; i < 60 && !(await page.getByTestId("case").isVisible()); i++) {
    await page.evaluate(() => window.oracle!.advance(5));
  }
  await expect(page.getByTestId("case")).toContainText("东堤 7 号");
  await expect(page.getByTestId("suggestion")).toContainText("神谕建议");
  await expectChineseOnly(page, "the window");
  await page.getByTestId("paper-1").click();
  await expect(page.getByTestId("paper-source")).toContainText("来源：登记处");
  await expectChineseOnly(page, "a paper in close-up");
  await page.getByTestId("paper-close").click();
  await page.getByTestId("open-sop").click();
  await expectChineseOnly(page, "the procedure");
  await page.getByTestId("sop-close").click();
  await page.getByTestId("adopt").click();
  await page.keyboard.press("Escape");

  // The pending tray, settings, key help.
  await page.getByTestId("pending-toggle").click();
  await expect(page.getByTestId("pending").locator("[data-pending]")).toContainText("东堤 7 号 有电");
  await expectChineseOnly(page, "the pending tray");
  await page.getByTestId("pending-toggle").click();
  await page.getByTestId("open-settings").click();
  await expectChineseOnly(page, "settings");
  await page.keyboard.press("Escape");
  await page.keyboard.press("?");
  await expect(page.getByTestId("help")).toBeVisible();
  await expectChineseOnly(page, "the key help");
  await page.keyboard.press("Escape");

  // The directional passage hint is localized too.
  await walkTo(page, 2900);
  await expect(page.getByTestId("hint")).toContainText("\u2191 / W");
  await expectChineseOnly(page, "the passage hint");

  await page.evaluate(() => window.oracle!.advance(2000));
  await expect(page.getByTestId("phase")).toHaveText("黄昏");
  await expectChineseOnly(page, "the event feed at dusk");

  // Switch to English: the open screen changes at once.
  await page.getByRole("button", { name: "English" }).click();
  await expect(page.getByTestId("phase")).toHaveText("Dusk");
  await expect(page.getByTestId("clock")).toContainText("Day 1");
  await expect(page.getByTestId("advance")).toHaveText("Call it a night");
  await expect(page.getByTestId("where")).toHaveText("Street");
});

/** Nothing Chinese left on screen, apart from the language switch's own "中文" button. */
async function expectNoChinese(page: Page, where: string) {
  const text = (await page.locator("body").innerText()).replaceAll(zhName, "");
  const cjk = [...text].filter((ch) => {
    const c = ch.codePointAt(0) ?? 0;
    return (c >= 0x3400 && c <= 0x9fff) || (c >= 0x3000 && c <= 0x303f) || (c >= 0xff00 && c <= 0xffef);
  });
  expect(cjk.join(""), `Chinese left on ${where}`).toBe("");
}
const zhName = "中文";

/** Switch language with the keyboard, the way a player can while a dialog covers the page. */
async function switchTo(page: Page, name: string) {
  await page.getByRole("button", { name, exact: true }).first().focus();
  await page.keyboard.press("Enter");
}

test("messages already on screen change language with everything else", async ({ page }, info) => {
  // Title screen: the message after a failed import.
  await page.goto("/");
  const notAZip = info.outputPath("notes.zip");
  writeFileSync(notAZip, "not a zip");
  await page.getByTestId("import-zip").setInputFiles(notAZip);
  const alert = page.getByRole("alert");
  await expect(alert).toHaveText(zhCN.title.noManifest);
  await switchTo(page, "English");
  await expect(alert).toHaveText(en.title.noManifest);
  await expectNoChinese(page, "the title screen");
  await switchTo(page, zhName);
  await expect(alert).toHaveText(zhCN.title.noManifest);

  // In the game: a refusal toast.
  await newGame(page, 7);
  await page.getByTestId("advance").click();
  await page.getByTestId("advance").click();
  await expect(page.getByTestId("phase")).toHaveText(zhCN.phases.day);
  await page.keyboard.press("Enter"); // the day runs until dusk: refused
  const toast = page.getByTestId("toast");
  await expect(toast).toHaveText(zhCN.rejections.PRECONDITION_FAILED);
  await switchTo(page, "English");
  await expect(toast).toHaveText(en.rejections.PRECONDITION_FAILED);
  await expect(toast).toBeHidden({ timeout: 5000 });
  await switchTo(page, zhName); // an old refusal does not come back
  await expect(page.getByTestId("phase")).toHaveText(zhCN.phases.day);
  await page.waitForTimeout(500); // give a wrongly revived toast time to render
  expect(await toast.isVisible(), "an old refusal came back").toBe(false); // no retrying here

  // The save menu, left open while the language changes.
  await page.getByTestId("open-save").click();
  await page.getByTestId("save-here").click();
  const status = page.getByTestId("save-status");
  await expect(status).toHaveText(zhCN.saveMenu.saved);
  await switchTo(page, "English");
  await expect(page.getByTestId("save-menu").getByRole("heading")).toHaveText(en.saveMenu.title);
  await expect(status).toHaveText(en.saveMenu.saved);
  await expectNoChinese(page, "the open save menu");
});
