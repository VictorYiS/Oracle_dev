// P1 acceptance A5: the command bus is the only way in. Outside src/core/world and
// src/core/commands, nothing may import the world's write interface (src/core/world/mutate); the
// systems that change state as time passes (time, routines, units, create) are also open to the
// game facade in src/core/game, and to nothing else.
import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";
import { findBoundaryViolations, scanBoundary } from "../../tools/lib/boundary";

describe("write boundary: lint rule for ui, app, providers and tools", () => {
  const eslint = new ESLint();
  const lint = async (filePath: string, code: string) =>
    (await eslint.lintText(code, { filePath }))[0]!.messages.map((m) => m.ruleId);

  it("blocks the writer and the state-changing systems", async () => {
    for (const name of ["mutate", "time", "routines", "units", "create"]) {
      expect(
        await lint(
          "src/ui/__fixture__.ts",
          `import { x } from "../core/world/${name}";\nexport const y = x;\n`,
        ),
        name,
      ).toContain("no-restricted-imports");
    }
    expect(
      await lint(
        "tools/__fixture__.ts",
        `import { x } from "../src/core/world/mutate";\nexport const y = x;\n`,
      ),
    ).toContain("no-restricted-imports");
  });

  it("blocks the P2 state systems and covers src/render too", async () => {
    for (const name of ["residents", "hero", "observe", "cases"]) {
      expect(
        await lint(
          "src/ui/__fixture__.ts",
          `import { x } from "../core/world/${name}";
export const y = x;
`,
        ),
        name,
      ).toContain("no-restricted-imports");
    }
    expect(
      await lint(
        "src/render/__fixture__.ts",
        `import { emit } from "../core/world/mutate";
export const y = emit;
`,
      ),
    ).toContain("no-restricted-imports");
  });

  it("allows read-only views", async () => {
    expect(
      await lint(
        "src/ui/__fixture__.ts",
        `import { nodeAt } from "../core/world/query";\nexport const y = nodeAt;\n`,
      ),
    ).toEqual([]);
  });
});

describe("write boundary", () => {
  it("holds across the whole repository", () => {
    expect(scanBoundary()).toEqual([]);
  });

  it("catches UI, app and game code that imports the writer", () => {
    expect(
      findBoundaryViolations("src/ui/Map.tsx", `import { addStock } from "../core/world/mutate";`),
    ).toHaveLength(1);
    expect(
      findBoundaryViolations("src/app/game.ts", `import * as m from "../core/world/mutate.ts";`),
    ).toHaveLength(1);
    expect(
      findBoundaryViolations("src/core/game/game.ts", `import { emit } from "../world/mutate";`),
    ).toHaveLength(1);
    expect(
      findBoundaryViolations("tools/x.ts", `const m = await import("../src/core/world/mutate");`),
    ).toHaveLength(1);
    expect(
      findBoundaryViolations("src/ui/x.ts", `export { addStock } from "../core/world/mutate";`),
    ).toHaveLength(1);
  });

  it("catches an import split over several lines, and reports where it is", () => {
    const source = [
      `// A file that looks harmless at the top.`,
      `import { nodeAt } from "../core/world/query";`,
      `import {`,
      `  addStock,`,
      `  takeStock,`,
      `} from "../core/world/mutate";`,
    ].join("\n");
    expect(findBoundaryViolations("src/ui/Map.tsx", source)).toEqual([
      { file: "src/ui/Map.tsx", line: 6, specifier: "../core/world/mutate" },
    ]);
    expect(findBoundaryViolations("src/ui/Map.tsx", source.replace(/\n/g, "\r\n"))).toHaveLength(1);
  });

  it("guards the systems that move time and change state, too", () => {
    for (const name of ["time", "routines", "units", "create"]) {
      expect(
        findBoundaryViolations("src/ui/Map.tsx", `import { x } from "../core/world/${name}";`),
        name,
      ).toHaveLength(1);
      expect(
        findBoundaryViolations("tools/bot.ts", `import { x } from "../src/core/world/${name}";`),
        name,
      ).toHaveLength(1);
      expect(
        findBoundaryViolations("src/core/game/game.ts", `import { x } from "../world/${name}";`),
        name,
      ).toEqual([]);
    }
  });

  it("guards the P2 state systems, and keeps src/render out", () => {
    for (const name of ["residents", "hero", "observe", "cases"]) {
      expect(
        findBoundaryViolations("src/ui/Desk.tsx", `import { x } from "../core/world/${name}";`),
        name,
      ).toHaveLength(1);
      expect(
        findBoundaryViolations("src/core/game/game.ts", `import { x } from "../world/${name}";`),
        name,
      ).toEqual([]);
    }
    expect(
      findBoundaryViolations("src/render/theatre.ts", `import { remember } from "../core/world/mutate";`),
    ).toEqual([{ file: "src/render/theatre.ts", line: 1, specifier: "../core/world/mutate" }]);
    expect(
      findBoundaryViolations("src/render/theatre.ts", `import { shownState } from "../core/world/query";`),
    ).toEqual([]);
  });

  it("lets the world's own systems and the command bus use it", () => {
    expect(findBoundaryViolations("src/core/world/units.ts", `import { emit } from "./mutate";`)).toEqual([]);
    expect(
      findBoundaryViolations("src/core/commands/bus.ts", `import { emit } from "../world/mutate";`),
    ).toEqual([]);
  });

  it("does not confuse other modules, or comments, with the writer", () => {
    expect(findBoundaryViolations("src/ui/Map.tsx", `import { nodeAt } from "../core/world/query";`)).toEqual(
      [],
    );
    expect(
      findBoundaryViolations("src/ui/Map.tsx", `// import { addStock } from "../core/world/mutate";`),
    ).toEqual([]);
  });
});
