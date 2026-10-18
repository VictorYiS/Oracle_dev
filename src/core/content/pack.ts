// Assembles a scenario pack from already-parsed files: validates every file,
// resolves `extends`, merges sections by id and checks cross-references and text.
// Parsing (YAML, zip, fetch) happens outside src/core.
import type { z } from "zod";
import { pickLanguage } from "./language";
import {
  type Building,
  Calendar,
  EconomyParams,
  ENTITY_SECTION_NAMES,
  type EntitySection,
  type GameEvent,
  LocaleTable,
  type MapDef,
  PackFile,
  type Resource,
  type ResourceNode,
  ScenarioManifest,
  type Start,
  type Terrain,
  type UnitType,
  type Weather,
} from "./schema";

export interface RawPack {
  /** Human-readable origin, used in error messages (folder path, zip name, URL). */
  origin: string;
  /** The id the loader found this pack under (its folder name). Must equal the manifest id. */
  folderId?: string;
  manifest: unknown;
  files: { path: string; data: unknown }[];
  locales: Record<string, unknown>;
}

export interface Pack {
  manifest: ScenarioManifest;
  /** Pack ids from the root ancestor down to this pack. */
  lineage: string[];
  /** Languages with complete text; the first is the fallback. */
  languages: string[];
  resources: Resource[];
  terrain: Terrain[];
  nodes: ResourceNode[];
  buildings: Building[];
  units: UnitType[];
  weathers: Weather[];
  events: GameEvent[];
  calendar: Calendar;
  map: MapDef;
  start: Start;
  economy: EconomyParams;
  locale: Record<string, LocaleTable>;
}

export interface PackIssue {
  file: string;
  path: string;
  message: string;
}

export type PackResult = { ok: true; pack: Pack; issues: [] } | { ok: false; issues: PackIssue[] };

const TEXT_REF = /^@[a-z0-9_.-]+$/;

function zodIssues(file: string, error: z.ZodError): PackIssue[] {
  return error.issues.map((issue) => ({
    file,
    path: issue.path.map(String).join(".") || "(root)",
    message: issue.message,
  }));
}

/** Every `@key` string anywhere inside a value. */
function textRefs(value: unknown, path: string, out: { path: string; key: string }[]): void {
  if (typeof value === "string") {
    if (TEXT_REF.test(value)) out.push({ path, key: value });
  } else if (Array.isArray(value)) {
    value.forEach((v, i) => textRefs(v, `${path}.${i}`, out));
  } else if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) textRefs(v, path ? `${path}.${k}` : k, out);
  }
}

type Entity = { id: string };

export function assemblePack(
  raw: RawPack,
  resolveParent: (id: string) => RawPack | undefined,
  seen: readonly string[] = [],
): PackResult {
  const issues: PackIssue[] = [];
  const manifestFile = `${raw.origin}/scenario.yaml`;
  const manifest = ScenarioManifest.safeParse(raw.manifest);
  if (!manifest.success) return { ok: false, issues: zodIssues(manifestFile, manifest.error) };
  const m = manifest.data;

  // Parents are looked up by folder name, so the two must agree.
  if (raw.folderId !== undefined && raw.folderId !== m.id) {
    return {
      ok: false,
      issues: [
        {
          file: manifestFile,
          path: "id",
          message: `id "${m.id}" must match the folder name "${raw.folderId}"`,
        },
      ],
    };
  }

  if (seen.includes(m.id)) {
    return {
      ok: false,
      issues: [
        { file: manifestFile, path: "extends", message: `extends cycle: ${[...seen, m.id].join(" -> ")}` },
      ],
    };
  }

  let parent: Pack | undefined;
  if (m.extends) {
    const parentRaw = resolveParent(m.extends);
    if (!parentRaw) {
      return {
        ok: false,
        issues: [{ file: manifestFile, path: "extends", message: `unknown parent pack "${m.extends}"` }],
      };
    }
    const parentResult = assemblePack(parentRaw, resolveParent, [...seen, m.id]);
    if (!parentResult.ok) return parentResult;
    parent = parentResult.pack;
  }

  // Entity sections start from the parent and merge by id.
  const sections = new Map<EntitySection, Map<string, Entity>>(
    ENTITY_SECTION_NAMES.map((name) => [
      name,
      new Map((parent?.[name] ?? []).map((e: Entity) => [e.id, e] as [string, Entity])),
    ]),
  );
  const definedHere = new Map<string, string>(); // "section:id" -> file
  let calendar: Partial<Calendar> | undefined = parent?.calendar;
  let map: MapDef | undefined = parent?.map;
  let start: Start | undefined = parent?.start;
  let economy: Partial<EconomyParams> = { ...(parent?.economy ?? {}) };

  for (const file of raw.files) {
    const fileName = `${raw.origin}/${file.path}`;
    const parsed = PackFile.safeParse(file.data ?? {});
    if (!parsed.success) {
      issues.push(...zodIssues(fileName, parsed.error));
      continue;
    }
    const data = parsed.data;
    for (const name of ENTITY_SECTION_NAMES) {
      const entities = sections.get(name)!;
      for (const id of data.remove?.[name] ?? []) {
        if (!parent) {
          issues.push({
            file: fileName,
            path: "remove",
            message: "remove is only allowed in a pack that extends another",
          });
        } else if (!entities.delete(id)) {
          issues.push({ file: fileName, path: `remove.${name}`, message: `parent has no "${id}"` });
        }
      }
      for (const entity of (data[name] ?? []) as Entity[]) {
        const key = `${name}:${entity.id}`;
        const previous = definedHere.get(key);
        if (previous) {
          issues.push({
            file: fileName,
            path: name,
            message: `"${entity.id}" is also defined in ${previous}`,
          });
        }
        definedHere.set(key, fileName);
        entities.set(entity.id, entity);
      }
    }
    if (data.calendar) calendar = { ...calendar, ...data.calendar };
    if (data.map) map = data.map;
    if (data.start) start = data.start;
    if (data.economy) {
      economy = {
        ...economy,
        ...data.economy,
        repay: { ...economy.repay, ...data.economy.repay } as EconomyParams["repay"],
        distortion: { ...economy.distortion, ...data.economy.distortion } as EconomyParams["distortion"],
        petition_debt: {
          ...economy.petition_debt,
          ...data.economy.petition_debt,
        } as EconomyParams["petition_debt"],
        petition_slots: {
          ...economy.petition_slots,
          ...data.economy.petition_slots,
        } as EconomyParams["petition_slots"],
      };
    }
  }

  const list = <T>(name: EntitySection) => [...sections.get(name)!.values()] as T[];
  const fileOf = (name: EntitySection, id: string) => definedHere.get(`${name}:${id}`) ?? "(parent)";
  const need = (file: string, path: string, name: EntitySection, id: string) => {
    if (!sections.get(name)!.has(id)) issues.push({ file, path, message: `unknown ${name} "${id}"` });
  };

  const fullEconomy = EconomyParams.safeParse(economy);
  if (!fullEconomy.success) issues.push(...zodIssues(`${raw.origin} (merged economy)`, fullEconomy.error));
  const fullCalendar = Calendar.safeParse(calendar ?? {});
  if (!fullCalendar.success) issues.push(...zodIssues(`${raw.origin} (merged calendar)`, fullCalendar.error));
  if (!map) issues.push({ file: raw.origin, path: "map", message: "the pack has no map" });
  if (!start) issues.push({ file: raw.origin, path: "start", message: "the pack has no start" });

  // Cross-references between entities.
  for (const n of list<ResourceNode>("nodes")) {
    need(fileOf("nodes", n.id), `${n.id}.yields`, "resources", n.yields);
  }
  for (const b of list<Building>("buildings")) {
    for (const field of ["cost", "produces", "consumes"] as const) {
      for (const res of Object.keys(b[field] ?? {})) {
        need(fileOf("buildings", b.id), `${b.id}.${field}`, "resources", res);
      }
    }
  }
  for (const w of list<Weather>("weathers")) {
    for (const res of Object.keys(w.produce_bonus)) {
      need(fileOf("weathers", w.id), `${w.id}.produce_bonus`, "resources", res);
    }
  }
  for (const e of list<GameEvent>("events")) {
    for (const w of e.trigger.weather_in ?? [])
      need(fileOf("events", e.id), `${e.id}.trigger.weather_in`, "weathers", w);
    e.effects.forEach((fx, i) => {
      const file = fileOf("events", e.id);
      const path = `${e.id}.effects.${i}`;
      if (fx.type === "add_resource") need(file, path, "resources", fx.resource);
      if (fx.type === "set_weather") need(file, path, "weathers", fx.weather);
      if (fx.type === "spawn_unit") need(file, path, "units", fx.unit);
      if (fx.type === "node_bonus") need(file, path, "nodes", fx.node);
    });
  }

  // The map and the start position.
  const terrainById = new Map(list<Terrain>("terrain").map((t) => [t.id, t]));
  const terrainAt = (x: number, y: number): Terrain | undefined => {
    const ch = map?.rows[y]?.[x];
    const entry = ch === undefined ? undefined : map?.legend[ch];
    return entry ? terrainById.get(entry.terrain) : undefined;
  };
  if (map) {
    const mapFile = `${raw.origin} (map)`;
    if (map.rows.length !== map.height) {
      issues.push({
        file: mapFile,
        path: "rows",
        message: `${map.rows.length} rows for height ${map.height}`,
      });
    }
    map.rows.forEach((row, y) => {
      const tiles = [...row];
      if (tiles.length !== map.width) {
        issues.push({
          file: mapFile,
          path: `rows.${y}`,
          message: `${tiles.length} tiles for width ${map.width}`,
        });
      }
      tiles.forEach((ch, x) => {
        if (!map.legend[ch]) {
          issues.push({
            file: mapFile,
            path: `rows.${y}`,
            message: `"${ch}" at x=${x} is not in the legend`,
          });
        }
      });
    });
    for (const [ch, entry] of Object.entries(map.legend)) {
      need(mapFile, `legend.${ch}.terrain`, "terrain", entry.terrain);
      if (entry.node) need(mapFile, `legend.${ch}.node`, "nodes", entry.node);
    }
  }
  if (start && map) {
    const startFile = `${raw.origin} (start)`;
    const inMap = (x: number, y: number) => x < map.width && y < map.height;
    const unitTypes = new Map(list<UnitType>("units").map((u) => [u.id, u]));
    let avatars = 0;
    start.units.forEach((u, i) => {
      need(startFile, `units.${i}.unit`, "units", u.unit);
      if (unitTypes.get(u.unit)?.role === "avatar") avatars++;
      const [x, y] = u.at;
      if (!inMap(x, y) || !terrainAt(x, y)?.walkable) {
        issues.push({
          file: startFile,
          path: `units.${i}.at`,
          message: `(${x},${y}) is not a walkable tile`,
        });
      }
    });
    if (avatars !== 1) {
      issues.push({
        file: startFile,
        path: "units",
        message: `needs exactly one avatar unit, found ${avatars}`,
      });
    }
    start.buildings.forEach((b, i) => {
      need(startFile, `buildings.${i}.building`, "buildings", b.building);
      const [x, y] = b.at;
      if (!inMap(x, y) || !terrainAt(x, y)?.buildable) {
        issues.push({ file: startFile, path: `buildings.${i}.at`, message: `(${x},${y}) is not buildable` });
      }
    });
    for (const res of Object.keys(start.stock)) need(startFile, "stock", "resources", res);
    need(startFile, "weather", "weathers", start.weather);
  }

  // Languages and text.
  const languages = m.languages ?? parent?.languages;
  if (!languages) {
    issues.push({ file: manifestFile, path: "languages", message: "declare the languages this pack ships" });
  }
  for (const lang of Object.keys(raw.locales)) {
    if (languages && !languages.includes(lang)) {
      issues.push({
        file: `${raw.origin}/locale/${lang}.yaml`,
        path: "(file)",
        message: `"${lang}" is not listed in languages [${languages.join(", ")}]`,
      });
    }
  }
  const locale: Record<string, LocaleTable> = {};
  for (const [lang, table] of Object.entries(parent?.locale ?? {})) locale[lang] = { ...table };
  for (const [lang, data] of Object.entries(raw.locales)) {
    const parsed = LocaleTable.safeParse(data ?? {});
    if (!parsed.success) issues.push(...zodIssues(`${raw.origin}/locale/${lang}.yaml`, parsed.error));
    else locale[lang] = { ...locale[lang], ...parsed.data };
  }

  // Every text reference must resolve in every language the pack ships.
  const refs: { file: string; path: string; key: string }[] = [];
  const manifestRefs: { path: string; key: string }[] = [];
  textRefs({ title: m.title, tagline: m.tagline }, "", manifestRefs);
  refs.push(...manifestRefs.map((r) => ({ ...r, file: manifestFile })));
  for (const name of ENTITY_SECTION_NAMES) {
    for (const entity of sections.get(name)!.values()) {
      const found: { path: string; key: string }[] = [];
      textRefs(entity, entity.id, found);
      refs.push(...found.map((r) => ({ ...r, file: fileOf(name, entity.id) })));
    }
  }
  for (const lang of languages ?? []) {
    const table = locale[lang] ?? {};
    for (const ref of refs) {
      if (!Object.hasOwn(table, ref.key.slice(1))) {
        issues.push({ file: ref.file, path: ref.path, message: `missing ${lang} text for ${ref.key}` });
      }
    }
  }

  if (issues.length > 0 || !fullEconomy.success || !fullCalendar.success || !languages || !map || !start) {
    return { ok: false, issues };
  }
  return {
    ok: true,
    issues: [],
    pack: {
      manifest: m,
      lineage: [...(parent?.lineage ?? []), m.id],
      languages,
      resources: list("resources"),
      terrain: list("terrain"),
      nodes: list("nodes"),
      buildings: list("buildings"),
      units: list("units"),
      weathers: list("weathers"),
      events: list("events"),
      calendar: fullCalendar.data,
      map,
      start,
      economy: fullEconomy.data,
      locale,
    },
  };
}

/** Every content id in a pack, for checks that need them all. */
export function contentIds(pack: Pack): string[] {
  return ENTITY_SECTION_NAMES.flatMap((name) => pack[name].map((e) => e.id));
}

/**
 * Resolve a `@key` text reference in the requested language. Unsupported languages fall back
 * the way pickLanguage does; a missing key shows the key itself so the gap is visible.
 */
export function text(pack: Pack, ref: string, lang?: string): string {
  const key = ref.startsWith("@") ? ref.slice(1) : ref;
  const chosen = pickLanguage(pack.languages, lang ? [lang] : []);
  for (const table of [pack.locale[chosen], pack.locale[pack.languages[0] as string]]) {
    if (table && Object.hasOwn(table, key)) return table[key] as string;
  }
  return ref;
}
