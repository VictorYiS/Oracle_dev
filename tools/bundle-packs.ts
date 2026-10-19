// Runs before `vite` and `vite build` (npm predev/prebuild): every pack under scenarios/ becomes
// public/scenarios/<id>.json, already parsed, so the game fetches only the pack it plays and its
// ancestors, and scenario text never sits in the JavaScript bundle (P1 acceptance A14).
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { listPackIds, loadPack, readRawPack } from "./lib/read-pack";

const OUT = join(import.meta.dirname, "..", "public", "scenarios");
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

const index: { id: string; extends: string | null; languages: string[]; title: Record<string, string> }[] =
  [];
for (const id of listPackIds()) {
  const result = loadPack(id);
  if (!result.ok) {
    console.error(`✗ ${id} does not validate; run npm run validate`);
    process.exit(1);
  }
  const raw = readRawPack(id)!;
  writeFileSync(join(OUT, `${id}.json`), JSON.stringify(raw));
  const { pack } = result;
  const key = pack.manifest.title.slice(1);
  index.push({
    id,
    extends: pack.manifest.extends ?? null,
    languages: pack.languages,
    title: Object.fromEntries(pack.languages.map((l) => [l, pack.locale[l]?.[key] ?? id])),
  });
}
writeFileSync(join(OUT, "index.json"), JSON.stringify(index, null, 2));
console.log(`✓ bundled ${index.length} pack(s) into public/scenarios/`);
