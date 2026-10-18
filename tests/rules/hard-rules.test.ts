// Proves the two hard rules (docs/plan/Oracle_Dev_Plan.md §1.4) actually catch violations.
import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";
import { findViolations } from "../../tools/lib/neutral";

const eslint = new ESLint();
const lintCore = async (code: string) => {
  const [result] = await eslint.lintText(code, { filePath: "src/core/sim/__fixture__.ts" });
  return result!.messages.map((m) => m.ruleId);
};

describe("hard rule 1: src/core stays headless", () => {
  it("blocks UI imports", async () => {
    expect(await lintCore(`import { h } from "preact";\nexport const x = h;\n`)).toContain(
      "no-restricted-imports",
    );
    expect(await lintCore(`import { App } from "../../ui/App";\nexport const x = App;\n`)).toContain(
      "no-restricted-imports",
    );
  });

  it("blocks browser globals", async () => {
    expect(await lintCore(`export const t = document.title;\n`)).toContain("no-restricted-globals");
    expect(await lintCore(`export const s = localStorage.getItem("k");\n`)).toContain(
      "no-restricted-globals",
    );
  });

  it("blocks unseeded randomness and wall-clock time", async () => {
    expect(await lintCore(`export const r = Math.random();\n`)).toContain("no-restricted-properties");
    expect(await lintCore(`export const n = Date.now();\n`)).toContain("no-restricted-properties");
  });

  it("allows pure code", async () => {
    expect(await lintCore(`export const add = (a: number, b: number): number => a + b;\n`)).toEqual([]);
  });

  it("does not restrict UI code", async () => {
    const [result] = await eslint.lintText(`export const t = document.title;\n`, {
      filePath: "src/ui/__fixture__.ts",
    });
    expect(result!.messages).toEqual([]);
  });
});

describe("hard rule 2: engine code never names scenario content", () => {
  const terms = ["res.wood", "译者"];

  it("catches content ids and proper nouns", () => {
    const found = findViolations(
      [
        { path: "src/core/a.ts", content: `if (id === "res.wood") {}` },
        { path: "src/ui/b.tsx", content: `const label = "译者";` },
      ],
      terms,
    );
    expect(found.map((v) => [v.file, v.term])).toEqual([
      ["src/core/a.ts", "res.wood"],
      ["src/ui/b.tsx", "译者"],
    ]);
  });

  it("matches ids as whole tokens", () => {
    expect(findViolations([{ path: "x.ts", content: `"res.woodland"; "pres.wood"` }], terms)).toEqual([]);
  });
});
