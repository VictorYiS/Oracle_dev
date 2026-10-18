// Node-side pack reader: turns a scenarios/<id>/ folder into a RawPack for src/core/content.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { parse } from "yaml";
import { assemblePack, type PackResult, type RawPack } from "../../src/core/content/pack";

export const SCENARIOS_DIR = join(import.meta.dirname, "..", "..", "scenarios");

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

function readYaml(file: string): unknown {
  return parse(readFileSync(file, "utf8"));
}

export function listPackIds(root = SCENARIOS_DIR): string[] {
  return readdirSync(root).filter((name) => existsSync(join(root, name, "scenario.yaml")));
}

export function readRawPack(id: string, root = SCENARIOS_DIR): RawPack | undefined {
  const dir = join(root, id);
  if (!existsSync(join(dir, "scenario.yaml"))) return undefined;
  const raw: RawPack = {
    origin: `scenarios/${id}`,
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
  raw.files.sort((a, b) => a.path.localeCompare(b.path));
  return raw;
}

export function loadPack(id: string, root = SCENARIOS_DIR): PackResult {
  const raw = readRawPack(id, root);
  if (!raw)
    return { ok: false, issues: [{ file: `scenarios/${id}`, path: "", message: "no scenario.yaml" }] };
  return assemblePack(raw, (parentId) => readRawPack(parentId, root));
}
