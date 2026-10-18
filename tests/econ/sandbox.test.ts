// Regression guard for design pillar §1.1: with the default pack's economy, calibrated use of the
// Oracle must beat both extremes. If a change to oracle/economy.yaml breaks this, rerun `npm run econ`.
import { describe, expect, it } from "vitest";
import { moderate } from "../../tools/econ-sim/bots";
import { verdict } from "../../tools/econ-sim/evaluate";
import { DEFAULT_SANDBOX, runGame } from "../../tools/econ-sim/model";
import { loadPack } from "../../tools/lib/read-pack";

const result = loadPack("interpreter");
if (!result.ok) throw new Error("default pack failed to load");
const economy = result.pack.economy;

describe("economy sandbox", () => {
  it("is deterministic", () => {
    expect(runGame(economy, DEFAULT_SANDBOX, moderate, 99)).toEqual(
      runGame(economy, DEFAULT_SANDBOX, moderate, 99),
    );
  });

  it("keeps every design check passing for the default pack", () => {
    const v = verdict(economy, DEFAULT_SANDBOX, 120);
    for (const check of v.checks) expect(check.pass, `${check.name}: ${check.detail}`).toBe(true);
  });
});
