// Proves the two hard rules (CLAUDE.md, "两条硬规则") actually catch violations.
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ESLint } from "eslint";
import * as ts from "typescript";
import { describe, expect, it } from "vitest";
import { findViolations } from "../../tools/lib/neutral";

const eslint = new ESLint();
const lintCore = async (code: string) => {
  const [result] = await eslint.lintText(code, { filePath: "src/core/sim/__fixture__.ts" });
  return result!.messages.map((m) => m.ruleId);
};

/**
 * Type-check a snippet with the compiler options of tsconfig.core.json. The snippet lives inside
 * the repo so module resolution sees node_modules exactly as src/core does: that is how Preact's
 * JSX types once leaked the DOM lib into the core config.
 */
function coreTypeErrors(code: string): string[] {
  const root = join(import.meta.dirname, "..", "..");
  const configPath = join(root, "tsconfig.core.json");
  const config = ts.readConfigFile(configPath, (p) => ts.sys.readFile(p));
  const { options } = ts.parseJsonConfigFileContent(config.config, ts.sys, root);
  const dir = mkdtempSync(join(root, "tests", ".tmp-core-"));
  try {
    const file = join(dir, "snippet.ts");
    writeFileSync(file, code);
    const program = ts.createProgram([file], options);
    return ts.getPreEmitDiagnostics(program).map((d) => ts.flattenDiagnosticMessageText(d.messageText, "\n"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe("hard rule 1: src/core stays headless", () => {
  it("type-checks core without DOM or Node types", () => {
    expect(coreTypeErrors(`export const t = document.title;\n`).join("\n")).toContain("document");
    expect(coreTypeErrors(`export const k = localStorage.length;\n`).join("\n")).toContain("localStorage");
    expect(coreTypeErrors(`export const p = process.env;\n`).join("\n")).toContain("process");
    expect(coreTypeErrors(`export const add = (a: number, b: number): number => a + b;\n`)).toEqual([]);
  });

  it("blocks Node modules, but not local modules that share a name", async () => {
    expect(await lintCore(`import { join } from "path";\nexport const j = join;\n`)).toContain(
      "no-restricted-imports",
    );
    expect(await lintCore(`import { readFileSync } from "fs";\nexport const r = readFileSync;\n`)).toContain(
      "no-restricted-imports",
    );
    expect(await lintCore(`import { join } from "node:path";\nexport const j = join;\n`)).toContain(
      "no-restricted-imports",
    );
    expect(await lintCore(`import { readFile } from "fs/promises";\nexport const r = readFile;\n`)).toContain(
      "no-restricted-imports",
    );
    expect(await lintCore(`import { join } from "path/posix";\nexport const j = join;\n`)).toContain(
      "no-restricted-imports",
    );
    expect(await lintCore(`import { findPath } from "../world/path";\nexport const f = findPath;\n`)).toEqual(
      [],
    );
  });

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
