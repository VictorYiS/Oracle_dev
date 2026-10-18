import { expect, test } from "@playwright/test";

test("the title screen loads the default pack without errors", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));

  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("译者");
  await expect(page.getByText("静态链接")).toBeVisible();
  await expect(page.getByText("离线（规则引擎）")).toBeVisible();
  expect(errors).toEqual([]);
});

test("the page never scrolls sideways", async ({ page }) => {
  await page.goto("/");
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});
