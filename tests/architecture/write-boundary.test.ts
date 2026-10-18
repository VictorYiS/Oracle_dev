// P1 acceptance A5: the command bus is the only way in. Outside src/core/world and
// src/core/commands, nothing may import the world's write interface (src/core/world/mutate).
import { describe, expect, it } from "vitest";
import { findBoundaryViolations, scanBoundary } from "../../tools/lib/boundary";

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
  });

  it("lets the world's own systems and the command bus use it", () => {
    expect(findBoundaryViolations("src/core/world/units.ts", `import { emit } from "./mutate";`)).toEqual([]);
    expect(
      findBoundaryViolations("src/core/commands/bus.ts", `import { emit } from "../world/mutate";`),
    ).toEqual([]);
  });

  it("does not confuse other modules with the writer", () => {
    expect(findBoundaryViolations("src/ui/Map.tsx", `import { nodeAt } from "../core/world/query";`)).toEqual(
      [],
    );
  });
});
