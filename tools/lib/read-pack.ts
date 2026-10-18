// Node-side pack reader: turns a scenarios/<id>/ folder into a RawPack for src/core/content.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { parse } from "yaml";
import { assemblePack, type PackResult, type RawPack } from "../../src/core/content/pack";

const REPO_ROOT = join(import.meta.dirname, "..", "..");
export const SCENARIOS_DIR = join(REPO_ROOT, "scenarios");
/** Packs that exist only for tests (not shipped, not bundled into the game). */
export const FIXTURE_SCENARIOS_DIR = join(REPO_ROOT, "tests", "fixtures", "scenarios");

/** Code-point order: locale-aware comparison can differ between machines. */
export const byCodePoint = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

function walk(dir: string): string[] {
  return readdirSync(dir)
    .sort(byCodePoint)
    .flatMap((name) => {
      const full = join(dir, name);
      return statSync(full).isDirectory() ? walk(full) : [full];
    });
}

function readYaml(file: string): unknown {
  return parse(readFileSync(file, "utf8"));
}

export function listPackIds(root = SCENARIOS_DIR): string[] {
  if (!existsSync(root)) return [];
  return readdirSync(root)
    .filter((name) => existsSync(join(root, name, "scenario.yaml")))
    .sort(byCodePoint);
}

export function readRawPack(id: string, root = SCENARIOS_DIR): RawPack | undefined {
  const dir = join(root, id);
  if (!existsSync(join(dir, "scenario.yaml"))) return undefined;
  const raw: RawPack = {
    origin: relative(REPO_ROOT, dir).split(sep).join("/"),
    folderId: id,
    manifest: readYaml(join(dir, "scenario.yaml")),
    files: [],
    locales: {},
  };
  for (const file of walk(dir)) {
    if (!file.endsWith(".yaml")) continue;
    const rel = relative(dir, file).split(sep).join("/");
    if (rel === "scenario.yaml") continue;
    if (rel.startsWith("locale/")) raw.locales[rel.slice("locale/".length, -".yaml".length)] = readYaml(file);
    else raw.files.push({ path: rel, data: readYaml(file) });
  }
  raw.files.sort((a, b) => byCodePoint(a.path, b.path));
  return raw;
}

/** Load a pack, looking for it and its ancestors in each root in turn. */
export function loadPackFrom(id: string, roots: string[]): PackResult {
  const find = (packId: string) => {
    for (const root of roots) {
      const raw = readRawPack(packId, root);
      if (raw) return raw;
    }
    return undefined;
  };
  const raw = find(id);
  if (!raw) return { ok: false, issues: [{ file: id, path: "", message: "no scenario.yaml" }] };
  return assemblePack(raw, find);
}

export function loadPack(id: string, root = SCENARIOS_DIR): PackResult {
  return loadPackFrom(id, [root]);
}
