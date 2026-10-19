# Oracle

**English** · [中文](README.zh-CN.md)

A settlement and automation game where you can hand the whole settlement to an AI. It works so well that you slowly stop seeing the world.

- Play in your browser: https://victoryis.github.io/Oracle_dev/
- Status: P1, the world by hand. You can gather, build and get your people through the days. The Oracle arrives in a later phase.

## How to play (P1)

1. **New game**, then press **Start planning** and **Start the day**. Time only runs during the day.
2. Select yourself or a wisp (click it on the map, or in the list on the right), then **Gather** and click a tree or a berry bush. Right-click does the obvious thing for the selected unit.
3. **Build** opens the build menu. Place a site, then send a wisp to **Build** it.
4. At dusk the day settles: residents eat, workers produce. Go through the night to the next day.
5. Everything outside your sight is fog. Walk into it to see what is there.

Keys: Space pauses, 1/2/3 set the speed, Enter moves to the next phase, B builds, ? lists all keys.

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

A pack can replace the map, the start, the buildings, the events and every piece of text. `tests/fixtures/scenarios/accept-mini/` is a small example that swaps in a 24×24 map. Packs can also be imported in the game from a folder or a `.zip`.

Every pack lists the languages it ships (`languages: [en, zh-CN]`, the first one is the fallback) and keeps its text in `locale/<language>.yaml`. `npm run validate` checks every pack and reports problems with the file and field, including any text missing in one of the listed languages.

## License

MIT
