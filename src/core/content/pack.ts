// Assembles a scenario pack from already-parsed files: validates every file,
// resolves `extends`, merges sections by id and checks cross-references, the place graph and text.
// Parsing (YAML, zip, fetch) happens outside src/core.
import type { z } from "zod";
import { pickLanguage } from "./language";
import {
  type Building,
  Calendar,
  type CaseType,
  type District,
  EconomyParams,
  ENTITY_SECTION_NAMES,
  type EntitySection,
  type GameEvent,
  type Institution,
  type Landmark,
  type Layer,
  LocaleTable,
  PackFile,
  Params,
  type Part,
  type Passage,
  type Prop,
  RecordField,
  type Recipe,
  type Resident,
  type Resource,
  type Routine,
  ScenarioManifest,
  type Scene,
  type Spot,
  Start,
  type StylePack,
  WindowPlace,
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
  districts: District[];
  scenes: Scene[];
  layers: Layer[];
  passages: Passage[];
  spots: Spot[];
  buildings: Building[];
  props: Prop[];
  routines: Routine[];
  residents: Resident[];
  institutions: Institution[];
  cases: CaseType[];
  events: GameEvent[];
  styles: StylePack[];
  recipes: Recipe[];
  parts: Part[];
  landmarks: Landmark[];
  calendar: Calendar;
  start: Start;
  window: WindowPlace;
  params: Params;
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
      new Map(((parent?.[name] ?? []) as Entity[]).map((e) => [e.id, e] as [string, Entity])),
    ]),
  );
  const definedHere = new Map<string, string>(); // "section:id" -> file
  let calendar: Partial<Calendar> | undefined = parent?.calendar;
  let start: Start | undefined = parent?.start;
  let windowPlace: WindowPlace | undefined = parent?.window;
  let params: Partial<Params> = { ...(parent?.params ?? {}) };
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
    if (data.start) start = data.start;
    if (data.window) windowPlace = data.window;
    if (data.params) params = { ...params, ...data.params };
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
  const has = (name: EntitySection, id: string) => sections.get(name)!.has(id);
  const need = (file: string, path: string, name: EntitySection, id: string) => {
    if (!has(name, id)) issues.push({ file, path, message: `unknown ${name} "${id}"` });
  };

  const fullEconomy = EconomyParams.safeParse(economy);
  if (!fullEconomy.success) issues.push(...zodIssues(`${raw.origin} (merged economy)`, fullEconomy.error));
  const fullCalendar = Calendar.safeParse(calendar ?? {});
  if (!fullCalendar.success) issues.push(...zodIssues(`${raw.origin} (merged calendar)`, fullCalendar.error));
  const fullParams = Params.safeParse(params);
  if (!fullParams.success) issues.push(...zodIssues(`${raw.origin} (merged params)`, fullParams.error));
  if (!start) issues.push({ file: raw.origin, path: "start", message: "the pack has no start" });
  if (!windowPlace) issues.push({ file: raw.origin, path: "window", message: "the pack has no window" });

  // ---- cross-references ------------------------------------------------------------------------
  const layers = new Map(list<Layer>("layers").map((l) => [l.id, l]));
  const walkLayer = (file: string, path: string, id: string, x?: number) => {
    const layer = layers.get(id);
    if (!layer) return issues.push({ file, path, message: `unknown layers "${id}"` });
    if (layer.kind !== "walk" || !layer.walk) {
      return issues.push({ file, path, message: `"${id}" is not a layer anyone can walk on` });
    }
    if (x !== undefined && (x < layer.walk[0] || x > layer.walk[1])) {
      issues.push({
        file,
        path,
        message: `x=${x} is outside ${id}'s walkable stretch [${layer.walk.join(", ")}]`,
      });
    }
  };

  for (const d of list<District>("districts"))
    need(fileOf("districts", d.id), `${d.id}.style`, "styles", d.style);
  for (const s of list<Scene>("scenes")) {
    const file = fileOf("scenes", s.id);
    need(file, `${s.id}.district`, "districts", s.district);
    if (s.backdrop) need(file, `${s.id}.backdrop`, "landmarks", s.backdrop);
    s.grounds.forEach((g, i) => {
      if (layers.get(g.layer)?.scene !== s.id)
        issues.push({
          file,
          path: `${s.id}.grounds.${i}.layer`,
          message: `"${g.layer}" is not a layer of ${s.id}`,
        });
      if (g.far >= g.near)
        issues.push({
          file,
          path: `${s.id}.grounds.${i}`,
          message: "a ground strip runs from near to a smaller far",
        });
    });
    const walkable = list<Layer>("layers").filter((l) => l.scene === s.id && l.kind === "walk");
    if (walkable.length === 0) issues.push({ file, path: s.id, message: "a scene needs a layer to walk on" });
    if (s.kind === "interior" && walkable.length !== 1)
      issues.push({ file, path: s.id, message: "an interior has exactly one layer to walk on" });
  }
  for (const l of layers.values()) {
    const file = fileOf("layers", l.id);
    need(file, `${l.id}.scene`, "scenes", l.scene);
    if (l.kind === "walk" && !l.walk)
      issues.push({ file, path: `${l.id}.walk`, message: "a walk layer needs walk: [min, max]" });
    if (l.skyline) {
      need(file, `${l.id}.skyline.recipe`, "recipes", l.skyline.recipe);
      need(file, `${l.id}.skyline.style`, "styles", l.skyline.style);
    }
  }
  for (const p of list<Passage>("passages")) {
    const file = fileOf("passages", p.id);
    walkLayer(file, `${p.id}.from`, p.from.layer, p.from.x);
    walkLayer(file, `${p.id}.to`, p.to.layer, p.to.x);
    if (p.from.layer === p.to.layer)
      issues.push({ file, path: p.id, message: "a passage joins two different layers" });
  }
  for (const s of list<Spot>("spots")) walkLayer(fileOf("spots", s.id), `${s.id}.layer`, s.layer, s.x);

  const buildings = list<Building>("buildings");
  for (const b of buildings) {
    const file = fileOf("buildings", b.id);
    walkLayer(file, `${b.id}.layer`, b.layer, b.x + Math.floor(b.width / 2));
    if ("recipe" in b.look) {
      need(file, `${b.id}.look.recipe`, "recipes", b.look.recipe);
      if (b.look.style) need(file, `${b.id}.look.style`, "styles", b.look.style);
      b.look.parts.forEach((p, i) => need(file, `${b.id}.look.parts.${i}`, "parts", p));
    } else need(file, `${b.id}.look.landmark`, "landmarks", b.look.landmark);
  }
  // Lots on one layer never overlap, and an alley runs through a gap between two of them.
  const byLayer = new Map<string, Building[]>();
  for (const b of buildings) byLayer.set(b.layer, [...(byLayer.get(b.layer) ?? []), b]);
  for (const row of byLayer.values()) {
    row.sort((a, b) => a.x - b.x);
    for (let i = 1; i < row.length; i++) {
      const prev = row[i - 1]!;
      const cur = row[i]!;
      if (cur.x < prev.x + prev.width)
        issues.push({
          file: fileOf("buildings", cur.id),
          path: `${cur.id}.x`,
          message: `its lot overlaps ${prev.id}`,
        });
    }
  }
  for (const p of list<Passage>("passages")) {
    if (p.kind !== "alley") continue;
    const inLot = (byLayer.get(p.from.layer) ?? []).find((b) => p.from.x >= b.x && p.from.x <= b.x + b.width);
    if (inLot)
      issues.push({
        file: fileOf("passages", p.id),
        path: `${p.id}.from.x`,
        message: `an alley runs between buildings, not through ${inLot.id}`,
      });
  }
  for (const p of list<Prop>("props")) {
    const file = fileOf("props", p.id);
    need(file, `${p.id}.layer`, "layers", p.layer);
    need(file, `${p.id}.landmark`, "landmarks", p.landmark);
  }
  const placeIds = (go: string) => go === "home" || go === "work" || has("buildings", go) || has("spots", go);
  for (const r of list<Routine>("routines")) {
    const file = fileOf("routines", r.id);
    r.steps.forEach((step, i) => {
      if (!placeIds(step.go))
        issues.push({
          file,
          path: `${r.id}.steps.${i}.go`,
          message: `"${step.go}" is not home, work, a building or a spot`,
        });
      if (i > 0 && step.at <= r.steps[i - 1]!.at)
        issues.push({
          file,
          path: `${r.id}.steps.${i}.at`,
          message: "steps come in order of the time they start",
        });
    });
  }
  for (const r of list<Resident>("residents")) {
    const file = fileOf("residents", r.id);
    if (r.home) need(file, `${r.id}.home`, "buildings", r.home);
    if (r.registered) need(file, `${r.id}.registered`, "buildings", r.registered);
    if (!has("buildings", r.work) && !has("spots", r.work))
      issues.push({ file, path: `${r.id}.work`, message: `"${r.work}" is not a building or a spot` });
    need(file, `${r.id}.routine`, "routines", r.routine);
  }
  const institutions = list<Institution>("institutions");
  for (const field of RecordField.options) {
    const keepers = institutions.filter((i) => i.keeps.includes(field));
    if (keepers.length !== 1) {
      issues.push({
        file: raw.origin,
        path: "institutions",
        message: `exactly one institution keeps "${field}" records (found ${keepers.length})`,
      });
    }
  }
  const kinds = new Map<string, string>();
  for (const c of list<CaseType>("cases")) {
    const other = kinds.get(c.kind);
    if (other)
      issues.push({
        file: fileOf("cases", c.id),
        path: `${c.id}.kind`,
        message: `${other} already handles "${c.kind}"`,
      });
    kinds.set(c.kind, c.id);
  }
  for (const e of list<GameEvent>("events")) {
    const file = fileOf("events", e.id);
    e.effects.forEach((fx, i) => {
      const path = `${e.id}.effects.${i}`;
      if ("building" in fx) need(file, `${path}.building`, "buildings", fx.building);
      if ("person" in fx) need(file, `${path}.person`, "residents", fx.person);
    });
  }
  for (const s of list<StylePack>("styles")) {
    const file = fileOf("styles", s.id);
    s.recipes.forEach((r, i) => need(file, `${s.id}.recipes.${i}.recipe`, "recipes", r.recipe));
    for (const part of Object.keys(s.parts)) need(file, `${s.id}.parts`, "parts", part);
  }
  if (start) {
    walkLayer(`${raw.origin} (start)`, "hero.layer", start.hero.layer, start.hero.x);
  }
  if (windowPlace) {
    walkLayer(`${raw.origin} (window)`, "layer", windowPlace.layer, windowPlace.x);
  }

  // ---- the place graph: every scene can be reached from the start, through passages -------------
  if (start && layers.has(start.hero.layer)) {
    const reached = new Set([start.hero.layer]);
    const passages = list<Passage>("passages");
    for (let grew = true; grew;) {
      grew = false;
      for (const p of passages) {
        for (const [a, b] of [
          [p.from.layer, p.to.layer],
          [p.to.layer, p.from.layer],
        ] as const) {
          if (reached.has(a) && !reached.has(b)) {
            reached.add(b);
            grew = true;
          }
        }
      }
    }
    for (const s of list<Scene>("scenes")) {
      const walkable = [...layers.values()].filter((l) => l.scene === s.id && l.kind === "walk");
      if (walkable.length > 0 && !walkable.some((l) => reached.has(l.id))) {
        issues.push({
          file: fileOf("scenes", s.id),
          path: s.id,
          message: `no passage leads to ${s.id} from the start`,
        });
      }
      for (const l of walkable) {
        if (walkable.some((w) => reached.has(w.id)) && !reached.has(l.id))
          issues.push({
            file: fileOf("layers", l.id),
            path: l.id,
            message: `no passage leads to ${l.id} from the start`,
          });
      }
    }
  }

  // ---- languages and text ----------------------------------------------------------------------
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

  if (
    issues.length > 0 ||
    !fullEconomy.success ||
    !fullCalendar.success ||
    !fullParams.success ||
    !languages ||
    !start ||
    !windowPlace
  ) {
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
      districts: list("districts"),
      scenes: list("scenes"),
      layers: list("layers"),
      passages: list("passages"),
      spots: list("spots"),
      buildings: list("buildings"),
      props: list("props"),
      routines: list("routines"),
      residents: list("residents"),
      institutions,
      cases: list("cases"),
      events: list("events"),
      styles: list("styles"),
      recipes: list("recipes"),
      parts: list("parts"),
      landmarks: list("landmarks"),
      calendar: fullCalendar.data,
      start: Start.parse(start),
      window: WindowPlace.parse(windowPlace),
      params: fullParams.data,
      economy: fullEconomy.data,
      locale,
    },
  };
}

/** Every content id in a pack, for checks that need them all. */
export function contentIds(pack: Pack): string[] {
  return ENTITY_SECTION_NAMES.flatMap((name) => (pack[name] as Entity[]).map((e) => e.id));
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
