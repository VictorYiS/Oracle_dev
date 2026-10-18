import { expect, test, type Page } from "@playwright/test";

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  return errors;
}

test.describe("English browser", () => {
  test.use({ locale: "en-US" });

  test("the title screen loads the default pack in English without errors", async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("The Interpreter");
    await expect(page.getByText("Static link")).toBeVisible();
    await expect(page.getByText("Offline (rules engine)")).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    expect(errors).toEqual([]);
  });

  test("switching to Chinese sticks across reloads", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "中文" }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("译者");
    await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
    await page.reload();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("译者");
    await page.getByRole("button", { name: "English" }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("The Interpreter");
  });

  test("the page never scrolls sideways", async ({ page }) => {
    await page.goto("/");
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });
});

test.describe("Chinese browser", () => {
  test.use({ locale: "zh-CN" });

  test("follows the browser language", async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("译者");
    await expect(page.getByText("静态链接")).toBeVisible();
    await expect(page.getByText("离线（规则引擎）")).toBeVisible();
    expect(errors).toEqual([]);
  });
});

test.describe("unsupported browser language", () => {
  test.use({ locale: "fr-FR" });

  test("falls back to English", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("The Interpreter");
  });
});
