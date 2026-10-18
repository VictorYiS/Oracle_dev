// Browser-side pack loading for packs bundled with the build. P6 adds drag-in and URL packs.
import { parse } from "yaml";
import { assemblePack, type PackResult, type RawPack } from "../core/content/pack";

const sources = import.meta.glob("/scenarios/*/**/*.yaml", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

function rawPacks(): Map<string, RawPack> {
  const packs = new Map<string, RawPack>();
  for (const [path, source] of Object.entries(sources)) {
    const match = /^\/scenarios\/([^/]+)\/(.+)$/.exec(path);
    if (!match) continue;
    const [, id, rel] = match as unknown as [string, string, string];
    const pack = packs.get(id) ?? {
      origin: `scenarios/${id}`,
      folderId: id,
      manifest: undefined,
      files: [],
      locales: {},
    };
    const data: unknown = parse(source);
    if (rel === "scenario.yaml") pack.manifest = data;
    else if (rel.startsWith("locale/")) pack.locales[rel.slice("locale/".length, -".yaml".length)] = data;
    else pack.files.push({ path: rel, data });
    packs.set(id, pack);
  }
  for (const pack of packs.values())
    pack.files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return packs;
}

export function loadBundledPack(id: string): PackResult {
  const packs = rawPacks();
  const raw = packs.get(id);
  if (!raw)
    return { ok: false, issues: [{ file: `scenarios/${id}`, path: "", message: "pack is not bundled" }] };
  return assemblePack(raw, (parentId) => packs.get(parentId));
}
