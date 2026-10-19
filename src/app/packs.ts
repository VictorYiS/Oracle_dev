// Scenario packs at runtime. Bundled packs are separate files (public/scenarios/<id>.json, made by
// tools/bundle-packs.ts) fetched on demand with their ancestors; imported packs come from a folder
// or a .zip the player picks. YAML and zip support load only when a pack is imported.
import { assemblePack, type PackResult, type RawPack } from "../core/content/pack";

export interface PackListing {
  id: string;
  extends: string | null;
  languages: string[];
  title: Record<string, string>;
}

const packUrl = (file: string) => new URL(`scenarios/${file}`, document.baseURI).toString();

export async function listBundledPacks(): Promise<PackListing[]> {
  try {
    const res = await fetch(packUrl("index.json"));
    return res.ok ? ((await res.json()) as PackListing[]) : [];
  } catch {
    return [];
  }
}

async function fetchRaw(id: string): Promise<RawPack | undefined> {
  if (!/^[a-z][a-z0-9_-]*$/.test(id)) return undefined;
  try {
    const res = await fetch(packUrl(`${id}.json`));
    return res.ok ? ((await res.json()) as RawPack) : undefined;
  } catch {
    return undefined;
  }
}

const parentOf = (raw: RawPack): string | undefined => {
  const manifest = raw.manifest as { extends?: unknown } | null;
  return typeof manifest?.extends === "string" ? manifest.extends : undefined;
};

/** Assemble `root`, fetching any ancestors it needs from the bundled packs. */
export async function assembleWithBundledParents(root: RawPack): Promise<PackResult> {
  const known = new Map<string, RawPack>();
  let next = parentOf(root);
  while (next && !known.has(next)) {
    const raw = await fetchRaw(next);
    if (!raw) break;
    known.set(next, raw);
    next = parentOf(raw);
  }
  return assemblePack(root, (id) => known.get(id));
}

export async function loadBundledPack(id: string): Promise<PackResult> {
  const raw = await fetchRaw(id);
  if (!raw) return { ok: false, issues: [{ file: `scenarios/${id}`, path: "", message: "pack not found" }] };
  return assembleWithBundledParents(raw);
}

interface PackFileEntry {
  path: string;
  text: string;
}

async function entriesFromFiles(files: File[]): Promise<PackFileEntry[]> {
  const zip = files.length === 1 && files[0]!.name.toLowerCase().endsWith(".zip") ? files[0]! : undefined;
  if (zip) {
    const { unzipSync, strFromU8 } = await import("fflate");
    const unzipped = unzipSync(new Uint8Array(await zip.arrayBuffer()));
    return Object.entries(unzipped)
      .filter(([path]) => !path.endsWith("/"))
      .map(([path, bytes]) => ({ path, text: strFromU8(bytes) }));
  }
  return Promise.all(
    files.map(async (f) => ({
      path: (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name,
      text: await f.text(),
    })),
  );
}

/** Turn a picked folder or .zip into a raw pack. The folder holding scenario.yaml is the pack. */
export async function rawPackFromFiles(files: File[]): Promise<RawPack> {
  const entries = (await entriesFromFiles(files)).map((e) => ({ ...e, path: e.path.replace(/\\/g, "/") }));
  const manifestEntry = entries
    .filter((e) => e.path === "scenario.yaml" || e.path.endsWith("/scenario.yaml"))
    .sort((a, b) => a.path.length - b.path.length)[0];
  if (!manifestEntry) throw new Error("scenario.yaml");
  const prefix = manifestEntry.path.slice(0, -"scenario.yaml".length);
  const folderId = prefix ? prefix.replace(/\/$/, "").split("/").pop() : undefined;
  const { parse } = await import("yaml");
  const origin = files.length === 1 ? files[0]!.name : (folderId ?? "pack");
  const raw: RawPack = { origin, manifest: parse(manifestEntry.text), files: [], locales: {} };
  if (folderId) raw.folderId = folderId;
  for (const e of entries) {
    if (!e.path.startsWith(prefix) || !e.path.endsWith(".yaml") || e === manifestEntry) continue;
    const rel = e.path.slice(prefix.length);
    const data: unknown = parse(e.text);
    if (rel.startsWith("locale/")) raw.locales[rel.slice("locale/".length, -".yaml".length)] = data;
    else raw.files.push({ path: rel, data });
  }
  raw.files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return raw;
}
