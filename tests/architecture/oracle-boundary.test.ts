// P2 acceptance A3: the Oracle cannot see the truth. Code under src/core/oracle may import only
// the records (src/core/world/records), the pack's content types and itself; any module that can
// read the true state (world/query, world/types, world/mutate, the game facade, the pack index
// with its starting truth...) is out of bounds, and this test names the file that reaches for one.
import { describe, expect, it } from "vitest";
import { findOracleViolations, scanOracle } from "../../tools/lib/boundary";

describe("the Oracle's boundary", () => {
  it("holds across the repository", () => {
    expect(scanOracle()).toEqual([]);
  });

  it("refuses every module that can read the truth", () => {
    for (const spec of [
      "../world/query",
      "../world/types",
      "../world/mutate",
      "../world/pack-index",
      "../world/observe",
      "../world/window",
      "../game/game",
      "../world/query.ts",
    ]) {
      expect(
        findOracleViolations("src/core/oracle/suggest.ts", `import { x } from "${spec}";`),
        spec,
      ).toEqual([{ file: "src/core/oracle/suggest.ts", line: 1, specifier: spec }]);
    }
  });

  it("names the file and line, even for a split or dynamic import", () => {
    const source = [
      `// looks harmless`,
      `import {`,
      `  trueFacts,`,
      `} from "../world/query";`,
      `const g = await import("../game/game");`,
    ].join("\n");
    expect(findOracleViolations("src/core/oracle/__sneaky.ts", source)).toEqual([
      { file: "src/core/oracle/__sneaky.ts", line: 4, specifier: "../world/query" },
      { file: "src/core/oracle/__sneaky.ts", line: 5, specifier: "../game/game" },
    ]);
  });

  it("lets the Oracle read the records, the content types and its own modules", () => {
    expect(
      findOracleViolations(
        "src/core/oracle/suggest.ts",
        [
          `import { suggest } from "./suggest";`,
          `import type { CaseType } from "../content/schema";`,
          `import { buildingRecord } from "../world/records";`,
        ].join("\n"),
      ),
    ).toEqual([]);
  });

  it("only applies inside src/core/oracle", () => {
    expect(findOracleViolations("src/core/world/window.ts", `import { x } from "./query";`)).toEqual([]);
  });
});
