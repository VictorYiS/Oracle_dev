# Oracle

**English** · [中文](README.zh-CN.md)

A narrative management game about a town that can hand everything to an AI. You are the Interpreter at the town's window. The Oracle is wonderfully helpful, so helpful that you slowly stop going to see for yourself.

- Play in your browser: https://victoryis.github.io/Oracle_dev/
- Status: P2, the window and the street. You can walk the town, hear cases at the window and decide them, and take the Oracle's suggestions on trust or check them. The Oracle's deeper machinery arrives in later phases.

## How to play (P2)

1. **New game**, then **Read the morning** and **Open the window**. Time runs only in the daytime.
2. You start at the window. Press **E** to open it. Visitors queue up: read their papers (each says where it came from and when), check the procedure, and stamp a decision, or **Adopt** what the Oracle suggests.
3. Whatever you adopt without checking goes on your **pending checks** tray, with how to check it: go and look, or read the original papers at the window.
4. Leave the window and walk: **A / D** or click the ground. **E** takes the steps down to the river, the footbridge, the alley or a door. Every passage takes time, and while you are out, the queue grows.
5. **Looking is not going.** Wheel up (or **W**) over something further away and the camera goes there; you stay where you are. Wheel down, **S** or **Esc** bring it back. To get there, walk.
6. Buildings you have never seen are drawn by the Oracle, from the records. The ones you have seen are drawn as you remember them, and memories fade. They do not update themselves: go back to find out what changed.

All the keys and the phone's buttons are in [guide/controls.md](guide/controls.md). **Settings** has a **Reduce motion** switch.

## Languages

The game follows your browser's language and you can switch on the title screen or in the top bar. It ships in English and Simplified Chinese for now. English is used when your language is not available.

## Development

Requires Node 22 or later.

```bash
npm ci
npm run dev          # local development server
npm run check        # types, lint, unit tests, engine neutrality, UI copy, scenario validation
npm run build        # production build, with the initial-payload budget
npm run e2e          # end-to-end tests in Chromium, Firefox and a phone profile (run build first)
npm run smoke        # every pack plays 30 days headless
npm run determinism  # two 100-day runs and a replay must agree day by day
npm run bench        # 30 game days, timed
npm run gallery      # every building recipe, drawn: dist-gallery/ and a manifest of hashes
```

## Scenario packs

All game content lives in `scenarios/`; the engine does not know a single scenario noun. `scenarios/interpreter/` is the default scenario, "The Interpreter". A new scenario can extend it and write only what differs:

```yaml
# scenarios/my-story/scenario.yaml
id: my-story
version: 0.1.0
engine: "0"
extends: interpreter
title: "@scenario.title"
```

A pack describes the places (scenes, the layers they are made of, and the passages between them), the buildings and the people who live in them, the institutions and their records, the kinds of case heard at the window, and how everything is drawn: style packs, building recipes, parts and hand-drawn landmarks. The visual compiler turns these into pictures; the same seed always gives the same building. `tests/fixtures/scenarios/accept-mini/` is a small example that takes three houses off the far bank and repaints a style. Packs can also be imported in the game from a folder or a `.zip`.

Every pack lists the languages it ships (`languages: [en, zh-CN]`, the first one is the fallback) and keeps its text in `locale/<language>.yaml`. `npm run validate` checks every pack and reports problems with the file and field, including places that cannot be reached and any text missing in one of the listed languages.

## License

MIT
