import js from "@eslint/js";
import prettier from "eslint-config-prettier";
import globals from "globals";
import tseslint from "typescript-eslint";

// Hard rule 1: src/core must run headless.
// It may not import UI, app shell, providers or Preact, and may not touch browser globals.
export const corePurityRules = {
  "no-restricted-imports": [
    "error",
    {
      paths: [
        { name: "preact", message: "src/core must not depend on the UI layer." },
        { name: "yaml", message: "Parsing belongs in the content loader outside src/core." },
        // Exact names, not patterns: a pattern would also match local modules such as ./path.
        { name: "fs", message: "src/core must not depend on Node APIs." },
        { name: "path", message: "src/core must not depend on Node APIs." },
      ],
      patterns: [
        { group: ["preact/*", "@preact/*"], message: "src/core must not depend on the UI layer." },
        {
          group: ["**/ui/**", "**/app/**", "**/oracle-providers/**"],
          message: "src/core must not import from ui/, app/ or oracle-providers/.",
        },
        // fs/promises, path/posix and the like (anchored: no slash in front, so ./path is not matched).
        { group: ["node:*", "fs/*", "path/*"], message: "src/core must not depend on Node APIs." },
      ],
    },
  ],
  "no-restricted-globals": [
    "error",
    ...[
      "window",
      "document",
      "localStorage",
      "sessionStorage",
      "indexedDB",
      "navigator",
      "fetch",
      "console",
      "performance",
      "setTimeout",
      "setInterval",
      "requestAnimationFrame",
    ].map((name) => ({ name, message: `src/core must stay headless and deterministic: no ${name}.` })),
  ],
  "no-restricted-properties": [
    "error",
    { object: "Math", property: "random", message: "Use the seeded PRNG in src/core/random." },
    { object: "Date", property: "now", message: "Simulation time comes from ticks, not the clock." },
  ],
};

export default tseslint.config(
  {
    ignores: [
      "dist/**",
      "dist-*/**",
      "node_modules/**",
      "playwright-report/**",
      "test-results/**",
      "docs/**",
      "spikes/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    },
  },
  {
    files: ["src/core/**/*.ts"],
    languageOptions: { globals: {} },
    rules: corePurityRules,
  },
  {
    // Write boundary: outside the simulation core, the world changes only through commands.
    // (Inside src/core the same boundary is held by tests/architecture/write-boundary.test.ts.)
    files: [
      "src/ui/**/*.{ts,tsx}",
      "src/app/**/*.ts",
      "src/render/**/*.ts",
      "src/oracle-providers/**/*.ts",
      "tools/**/*.ts",
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "mutate",
                "time",
                "routines",
                "units",
                "create",
                "residents",
                "hero",
                "observe",
                "cases",
              ].flatMap((name) => [`**/world/${name}`, `**/world/${name}.ts`]),
              message:
                "Only the world's own systems, the command bus and the game facade change state. Submit a command.",
            },
          ],
        },
      ],
    },
  },
  prettier,
);
