// npm run gallery — every recipe of every pack, 5 seeds × 3 states × 2 ways of looking, rendered by
// the visual compiler to dist-gallery/<pack>/<recipe>/<seed>-<state>-<look>.svg, with
// dist-gallery/manifest.json (path → SHA-256). Run it twice: the manifests must match.
import { createHash } from "node:crypto";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Pack } from "../src/core/content/pack";
import type { Grammar, StylePack } from "../src/core/content/schema";
import { drawFacade, resolve, type VisualContent } from "../src/render/compiler";
import { FIXTURE_SCENARIOS_DIR, listPackIds, loadPack, loadPackFrom, SCENARIOS_DIR } from "./lib/read-pack";

const OUT = join(import.meta.dirname, "..", "dist-gallery");
const SEEDS = [101, 202, 303, 404, 505];
const STATES = ["powered", "dark", "damaged"] as const;
const LOOKS = ["ink", "oracle"] as const;
const LOT: Record<Grammar, number> = { terrace: 230, hall: 320, stack: 200, tower: 220 };

export function visualContent(pack: Pack): VisualContent {
  const byId = <T extends { id: string }>(list: T[]) => new Map(list.map((e) => [e.id, e]));
  return {
    styles: byId(pack.styles),
    recipes: byId(pack.recipes),
    parts: byId(pack.parts),
    landmarks: byId(pack.landmarks),
  };
}

/** The style pack that uses a recipe most (ties: the first listed). */
function styleFor(pack: Pack, recipe: string): StylePack {
  let best = pack.styles[0]!;
  let weight = -1;
  for (const s of pack.styles) {
    const w = s.recipes.find((r) => r.recipe === recipe)?.weight ?? 0;
    if (w > weight) [best, weight] = [s, w];
  }
  return best;
}

rmSync(OUT, { recursive: true, force: true });
const manifest: Record<string, string> = {};
const packs: [string, Pack][] = [];
for (const id of listPackIds()) {
  const r = loadPack(id);
  if (!r.ok) throw new Error(`${id} does not validate (npm run validate)`);
  packs.push([id, r.pack]);
}
for (const id of listPackIds(FIXTURE_SCENARIOS_DIR)) {
  const r = loadPackFrom(id, [FIXTURE_SCENARIOS_DIR, SCENARIOS_DIR]);
  if (!r.ok) throw new Error(`fixture ${id} does not validate`);
  packs.push([id, r.pack]);
}

for (const [id, pack] of packs) {
  const content = visualContent(pack);
  for (const recipe of pack.recipes) {
    const style = styleFor(pack, recipe.id);
    const dir = join(OUT, id, recipe.id);
    mkdirSync(dir, { recursive: true });
    for (const seed of SEEDS) {
      const form = resolve(content, {
        kind: "recipe",
        recipe: recipe.id,
        style: style.id,
        seed,
        lot: LOT[recipe.grammar],
        door: null,
        parts: [],
      });
      for (const state of STATES) {
        for (const look of LOOKS) {
          const { svg } = drawFacade(form, state, look, { standalone: true, id: `g${seed}` });
          const name = `${seed}-${state}-${look}.svg`;
          writeFileSync(join(dir, name), svg);
          manifest[`${id}/${recipe.id}/${name}`] = createHash("sha256").update(svg).digest("hex");
        }
      }
    }
  }
}
const sorted = Object.fromEntries(Object.entries(manifest).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
writeFileSync(join(OUT, "manifest.json"), JSON.stringify(sorted, null, 2) + "\n");
console.log(
  `✓ gallery: ${Object.keys(sorted).length} drawings from ${packs.length} pack(s) in dist-gallery/`,
);
