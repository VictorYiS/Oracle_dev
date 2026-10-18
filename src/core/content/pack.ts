// Assembles a scenario pack from already-parsed files: validates every file,
// resolves `extends`, merges sections by id and checks cross-references.
// Parsing (YAML, zip, fetch) happens outside src/core.
import type { z } from "zod";
import { pickLanguage } from "./language";
import { EconomyParams, LocaleTable, PackFile, ScenarioManifest, type Resource } from "./schema";

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
  economy: EconomyParams;
  locale: Record<string, LocaleTable>;
}

export interface PackIssue {
  file: string;
  path: string;
  message: string;
}

export type PackResult = { ok: true; pack: Pack; issues: [] } | { ok: false; issues: PackIssue[] };

function zodIssues(file: string, error: z.ZodError): PackIssue[] {
  return error.issues.map((issue) => ({
    file,
    path: issue.path.map(String).join(".") || "(root)",
    message: issue.message,
  }));
}

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

  // Start from the parent, if any.
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

  const resources = new Map<string, Resource>(parent?.resources.map((r) => [r.id, r]) ?? []);
  let economy: Partial<EconomyParams> = { ...(parent?.economy ?? {}) };
  const definedHere = new Map<string, string>();

  for (const file of raw.files) {
    const fileName = `${raw.origin}/${file.path}`;
    const parsed = PackFile.safeParse(file.data ?? {});
    if (!parsed.success) {
      issues.push(...zodIssues(fileName, parsed.error));
      continue;
    }
    const data = parsed.data;
    for (const id of data.remove?.resources ?? []) {
      if (!parent)
        issues.push({
          file: fileName,
          path: "remove",
          message: "remove is only allowed in a pack that extends another",
        });
      else if (!resources.delete(id))
        issues.push({ file: fileName, path: "remove", message: `parent has no resource "${id}"` });
    }
    for (const resource of data.resources ?? []) {
      const previous = definedHere.get(resource.id);
      if (previous) {
        issues.push({
          file: fileName,
          path: "resources",
          message: `"${resource.id}" is also defined in ${previous}`,
        });
      }
      definedHere.set(resource.id, fileName);
      resources.set(resource.id, resource);
    }
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

  const fullEconomy = EconomyParams.safeParse(economy);
  if (!fullEconomy.success) {
    issues.push(...zodIssues(`${raw.origin} (merged economy)`, fullEconomy.error));
  }

  const locale: Record<string, LocaleTable> = {};
  for (const [lang, table] of Object.entries(parent?.locale ?? {})) locale[lang] = { ...table };
  for (const [lang, data] of Object.entries(raw.locales)) {
    const parsed = LocaleTable.safeParse(data ?? {});
    if (!parsed.success) issues.push(...zodIssues(`${raw.origin}/locale/${lang}.yaml`, parsed.error));
    else locale[lang] = { ...locale[lang], ...parsed.data };
  }

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

  // Every text reference must resolve in every language the pack ships.
  const refs: { file: string; path: string; key: string | undefined }[] = [
    { file: manifestFile, path: "title", key: m.title },
    { file: manifestFile, path: "tagline", key: m.tagline },
    ...[...resources.values()].map((r) => ({
      file: definedHere.get(r.id) ?? "(parent)",
      path: `${r.id}.name`,
      key: r.name,
    })),
  ];
  for (const lang of languages ?? []) {
    const table = locale[lang] ?? {};
    for (const ref of refs) {
      if (ref.key && !Object.hasOwn(table, ref.key.slice(1))) {
        issues.push({ file: ref.file, path: ref.path, message: `missing ${lang} text for ${ref.key}` });
      }
    }
  }

  if (issues.length > 0 || !fullEconomy.success || !languages) return { ok: false, issues };
  return {
    ok: true,
    issues: [],
    pack: {
      manifest: m,
      lineage: [...(parent?.lineage ?? []), m.id],
      languages,
      resources: [...resources.values()],
      economy: fullEconomy.data,
      locale,
    },
  };
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
