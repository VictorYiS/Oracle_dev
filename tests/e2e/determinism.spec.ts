// P1 acceptance A3: the browser (Chromium and Firefox) replays the same command log to the same
// hashes as Node does.
import { expect, test } from "@playwright/test";
import { Game } from "../../src/core/game/game";
import { DETERMINISM } from "../../tools/lib/determinism-config";
import { playBot } from "../../tools/lib/bot";
import { loadPack } from "../../tools/lib/read-pack";

test("replaying the 100-day run in the browser gives Node's hashes", async ({ page }) => {
  test.setTimeout(120_000);
  const result = loadPack(DETERMINISM.pack);
  if (!result.ok) throw new Error("pack failed");
  const node = Game.create(result.pack, DETERMINISM.seed);
  playBot(node, DETERMINISM.days);

  await page.goto("/");
  await page.waitForFunction(() => Boolean(window.oracle));
  const browser = await page.evaluate(
    ([packId, seed, commands, tick]) =>
      window.oracle!.replay(packId as string, seed as number, commands as never, tick as number),
    [DETERMINISM.pack, DETERMINISM.seed, node.commands, node.world.clock.tick] as const,
  );
  console.log(
    `node ${node.hash()} · browser ${browser.hash} · ${browser.dailyHashes.length} days · ${node.commands.length} commands`,
  );
  expect(browser.dailyHashes).toEqual(node.dailyHashes);
  expect(browser.hash).toBe(node.hash());
});
