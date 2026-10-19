// P1 acceptance A15 (end-to-end part): import a scenario pack from a .zip; a broken pack shows
// which file and which field are wrong. (P2: accept-mini takes three houses off the far bank.)
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { expect, test } from "@playwright/test";
import { strToU8, zipSync } from "fflate";
import { newGameFromTitle, world } from "./pack-helpers";

const FIXTURE = join(import.meta.dirname, "..", "fixtures", "scenarios", "accept-mini");

function zipFolder(dir: string, top: string, extra: Record<string, string> = {}): Uint8Array {
  const files: Record<string, Uint8Array> = {};
  const walk = (d: string) => {
    for (const name of readdirSync(d)) {
      const full = join(d, name);
      if (statSync(full).isDirectory()) walk(full);
      else files[`${top}/${relative(dir, full).split(sep).join("/")}`] = readFileSync(full);
    }
  };
  walk(dir);
  for (const [path, content] of Object.entries(extra)) files[`${top}/${path}`] = strToU8(content);
  return zipSync(files);
}

test("import a pack from a .zip and play it", async ({ page }, info) => {
  const zip = info.outputPath("accept-mini.zip");
  writeFileSync(zip, zipFolder(FIXTURE, "accept-mini"));
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("The Interpreter");
  await page.getByTestId("import-zip").setInputFiles(zip);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Mini Hush");
  await newGameFromTitle(page);
  expect((await world(page)).buildings).toHaveLength(16);
  await expect(page.locator("[data-building]:not([data-face])")).toHaveCount(16);
  await expect(page.locator('[data-building="bld.eb_06"]')).toHaveCount(0);
});

test("a broken pack shows the file and the field", async ({ page }, info) => {
  const zip = info.outputPath("broken.zip");
  writeFileSync(
    zip,
    zipFolder(FIXTURE, "accept-mini", {
      "world/bad.yaml": 'resources: [{ id: Wood, name: "@mini.title" }]\n',
    }),
  );
  await page.goto("/");
  await page.getByTestId("import-zip").setInputFiles(zip);
  const problems = page.getByTestId("pack-problems");
  await expect(problems).toBeVisible();
  await expect(problems).toContainText("world/bad.yaml");
  await expect(problems).toContainText("resources.0.id");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("The Interpreter"); // unchanged
});
