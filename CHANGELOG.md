# Changelog

## P2 · The window and the street

The game changes direction: no more grid colony. You are the Interpreter at a border town's window, and the town is a 2.5D paper theatre you can walk through. The engineering foundations of P0 and P1 carry over unchanged in spirit: deterministic core, one command bus, saves and replays, packs that hold all content.

- **The paper theatre** (`src/render`): scenes drawn as cards standing at fixed depths, horizontal ground planes and solid passages (a footbridge, steps, an alley, doors), in real CSS perspective. Buildings are paper boxes, a facade and two side faces drawn from the same IR and state; an alley's walls are the side faces of the houses either side. The camera moves on the compositor. **Looking is not going**: the wheel, W/S/Esc or the phone's ⊕/⊖ move the camera to a further layer while the hero stays put; the corner always says where you are and where you are looking. Keyboard, touch and a Reduce motion setting (camera cuts, nothing animates). Firefox gets bitmaps instead of live SVG, because it redraws every vector shape on every frame of a 3D move.
- **The visual compiler**: style packs, recipes (row houses, works halls, self-built stacks, towers), parts and hand-drawn landmarks all come from the scenario pack; the compiler turns a building's IR, a state and a way of looking into SVG. The same inputs always give the same bytes; the Oracle's way of drawing tidies away clutter (washing lines, wiring, posters, cracks). `npm run gallery` draws every recipe and writes a manifest of hashes.
- **A world of places**: scenes, layers and passages instead of tiles. Walking and every passage take game time. Residents follow routines from scene to scene; buildings have occupants, power and condition; the district's power line has a capacity.
- **Truth, records and memory**: the institutions' records are kept apart from the truth and can be wrong, from the start or as the town lives (people move out and nobody tells the registry). What the player has seen at each building, and when, is game state: saved, hashed, and never updated by itself. Unseen buildings are drawn by the Oracle from the records; buildings in view are drawn as they are; remembered ones fade, and coming back redraws them and says what changed.
- **The window**: visitors queue in the daytime with three kinds of case (connection to the grid, registration, repair), bring papers that say where they came from and when, and are decided by stamp under a written procedure. Decisions go through the command bus; crews carry out orders at dusk, and each outcome traces back to the decision that ordered it.
- **The Oracle's suggestions**: an offline, template-driven summary and action for every case, computed from the records alone (an architecture test keeps every module that can read the truth out of its reach). Adopting a suggestion puts what it took for granted on the pending tray with how to check it; going to look, or reading the original at the window, settles it right or wrong. There is no penalty for adopting.
- **The Interpreter, v0.3**: the East Bank (street, riverbank, far bank, three interiors), 13 residents, three institutions, three case types, four style packs, four recipes, 17 landmarks; English and Chinese.
- **Tools**: a new scripted player; `determinism` (100 days twice plus a replay, every command type and refusal), `bench` (30 game days in about 60 ms), `smoke` (residents, powered buildings, open cases and pending checks) and `validate` (places, people, paperwork and visual content, unreachable scenes reported) all run on the new world. End-to-end tests cover the theatre, the window, the pending tray and frame times during transitions. Saves from P1 are refused as another version.
- Players get a controls guide in English and Chinese (`guide/controls.md`).

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
