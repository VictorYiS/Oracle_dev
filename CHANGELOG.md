# Changelog

## P0 · Foundations

- Project skeleton: Vite, TypeScript and Preact; Vitest, Playwright, ESLint and Prettier. GitHub Actions runs every check before deploying to GitHub Pages.
- Two hard rules, enforced by lint, type checking and tests: the simulation core runs headless, and engine code never names scenario content. Tests prove both catch violations.
- Scenario pack schema v0, loader and validator: `extends` inheritance, override and removal by id, partial nested fields, text-reference checks, folder name must match the pack id.
- Default scenario pack "The Interpreter" v0.2: resources, trade-off numbers and text in English and Simplified Chinese, plus a glossary of agreed translations.
- Seeded PRNG (xoshiro128\*\*) and the reality-debt ledger, all in integer fixed point: petition slots, overtime priced ×(k+1), compound interest, verification and hands-on repayment, distortion chance, collections with a cooldown, fasting.
- Economy sandbox: an abstract settlement, three strategy bots and a parameter search. The recommended numbers ship in the default pack (`docs/reports/econ-sim-v0.md`).
- Multiple languages: the UI follows the browser language with a manual switch (English by default, Simplified Chinese available). Packs declare their languages and the validator requires complete text in each.
- Spikes: the claude.ai Artifact channel works for the owner (multi-file build, data files, workers, storage, Claude calls with tools); browsers can call the Anthropic API directly.
- Fix: the core's type-check config used to inherit Preact's JSX settings, which pulled in DOM types; it is now standalone, with a regression test.
