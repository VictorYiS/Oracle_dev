# Changelog

## P1 · The world, by hand

- A deterministic world core: plain-JSON state in integers, a five-phase day (time runs only by day), dusk settlement (production, food, departures, regrowth) and dawn scenario events. Two runs and a replay of 100 days agree, and Chromium, Firefox and Node give the same hashes.
- One way in: every change is a command through the command bus, refused with a structured reason (`SCHEMA_INVALID`, `NO_PERMISSION`, `STALE_VERSION`, `INVALID_TARGET`, `INSUFFICIENT_RESOURCE`, `PRECONDITION_FAILED`). Only the world's own systems and the bus may write state; a lint rule and an architecture test hold that line.
- Every event records its cause, back to the command or routine that started it.
- Units walk (deterministic A*), gather and deliver, and build. Fog hides what no one has seen. A full store drops what does not fit instead of trapping the unit.
- Saves: a dusk snapshot plus the commands since, in the browser or as a file, with clear errors for files from another version, another scenario, or an edited copy of the same scenario (saves record a fingerprint of the pack's content, not its text). Autosave at dusk; an imported copy of a pack gets its own save slot.
- The Interpreter gets a 48×48 map, 7 kinds of ground, 6 kinds of resource node, 8 buildings, 3 unit types, 3 weathers and 7 events, in English and Chinese.
- Packs load on demand as separate files (no scenario text in the JavaScript), and can be imported from a folder or a `.zip`. A test pack swaps in a 24×24 map with no engine change.
- The browser game: title screen, canvas map with pan and zoom, top bar with speed and phase, selection panel with orders, build menu, event feed, save menu and key help, with a live English/Chinese switch. Keyboard shortcuts wait while a dialog is open, and a button reached with the keyboard keeps Space and Enter.
- Tools: a scripted bot player; `npm run determinism`, `npm run bench` (30 game days in about 0.1 s), and a smoke run on the real simulation.

## P0 · Foundations

- Project skeleton: Vite, TypeScript and Preact; Vitest, Playwright, ESLint and Prettier. GitHub Actions runs every check before deploying to GitHub Pages.
- Two hard rules, enforced by lint, type checking and tests: the simulation core runs headless, and engine code never names scenario content. Tests prove both catch violations.
- Scenario pack schema v0, loader and validator: `extends` inheritance, override and removal by id, partial nested fields, text-reference checks, folder name must match the pack id.
- Default scenario pack "The Interpreter" v0.2: resources, trade-off numbers and text in English and Simplified Chinese, plus a glossary of agreed translations.
- Seeded PRNG (xoshiro128\*\*) and the reality-debt ledger, all in integer fixed point: petition slots, overtime priced ×(k+1), compound interest, verification and hands-on repayment, distortion chance, collections with a cooldown, fasting.
- Economy sandbox: an abstract settlement, three strategy bots and a parameter search. The recommended numbers ship in the default pack (`npm run econ` reruns the search).
- Multiple languages: the UI follows the browser language with a manual switch (English by default, Simplified Chinese available). Packs declare their languages and the validator requires complete text in each.
- Spikes: the claude.ai Artifact channel works for the owner (multi-file build, data files, workers, storage, Claude calls with tools); browsers can call the Anthropic API directly.
- Fix: the core's type-check config used to inherit Preact's JSX settings, which pulled in DOM types; it is now standalone, with a regression test.
