# Oracle

**English** · [中文](README.zh-CN.md)

A settlement and automation game where you can hand the whole settlement to an AI. It works so well that you slowly stop seeing the world.

- Play in your browser: https://victoryis.github.io/Oracle_dev/
- Status: P0, foundations. Nothing is playable yet; this is the skeleton the game will grow on.

## Languages

The game follows your browser's language and you can switch on the title screen. It ships in English and Simplified Chinese for now. English is used when your language is not available.

## Development

Requires Node 22 or later.

```bash
npm ci
npm run dev      # local development server
npm run check    # types, lint, unit tests, engine-neutrality, scenario validation
npm run build    # production build, with the initial-payload budget
npm run e2e      # end-to-end tests (run build first)
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

Every pack lists the languages it ships (`languages: [en, zh-CN]`, the first one is the fallback) and keeps its text in `locale/<language>.yaml`. `npm run validate` checks every pack and reports problems with the file and field, including any text missing in one of the listed languages.

## License

MIT
