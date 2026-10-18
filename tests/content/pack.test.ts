import { describe, expect, it } from "vitest";
import { assemblePack, text, type RawPack } from "../../src/core/content/pack";
import { loadPack, readRawPack } from "../../tools/lib/read-pack";

const parent = readRawPack("interpreter")!;

function child(overrides: Partial<RawPack> = {}): RawPack {
  return {
    origin: "scenarios/test-child",
    manifest: {
      id: "test-child",
      version: "0.1.0",
      engine: "0",
      extends: "interpreter",
      title: "@child.title",
    },
    files: [],
    locales: { en: { "child.title": "Test scenario" }, "zh-CN": { "child.title": "测试剧本" } },
    ...overrides,
  };
}

const resolve = (id: string) => (id === "interpreter" ? parent : undefined);

describe("default pack", () => {
  it("loads cleanly", () => {
    const result = loadPack("interpreter");
    expect(result.issues).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it("ships English first, then Chinese", () => {
    const result = loadPack("interpreter");
    if (!result.ok) throw new Error("pack failed");
    expect(result.pack.languages).toEqual(["en", "zh-CN"]);
  });

  it("resolves text per language and falls back to the first language", () => {
    const result = loadPack("interpreter");
    if (!result.ok) throw new Error("pack failed");
    const { pack } = result;
    const en = text(pack, pack.manifest.title, "en");
    const zh = text(pack, pack.manifest.title, "zh-CN");
    expect(en).not.toMatch(/^@/);
    expect(zh).not.toMatch(/^@/);
    expect(en).not.toBe(zh);
    expect(text(pack, pack.manifest.title, "fr")).toBe(en);
    expect(text(pack, pack.manifest.title, "zh-TW")).toBe(zh);
    expect(text(pack, pack.manifest.title)).toBe(en);
  });
});

describe("languages", () => {
  it("inherits the parent's languages and requires text in each", () => {
    const result = assemblePack(child({ locales: { "zh-CN": { "child.title": "测试剧本" } } }), resolve);
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.message === "missing en text for @child.title")).toBe(true);
  });

  it("lets a pack narrow its languages", () => {
    const result = assemblePack(
      child({
        manifest: { ...(child().manifest as object), languages: ["zh-CN"] },
        locales: { "zh-CN": { "child.title": "测试剧本" } },
      }),
      resolve,
    );
    if (!result.ok) throw new Error(JSON.stringify(result.issues));
    expect(result.pack.languages).toEqual(["zh-CN"]);
  });

  it("rejects a locale file for a language the pack does not list", () => {
    const result = assemblePack(
      child({ locales: { ...child().locales, fr: { "child.title": "Scénario de test" } } }),
      resolve,
    );
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.file.endsWith("locale/fr.yaml"))).toBe(true);
  });

  it("requires a root pack to declare its languages", () => {
    const result = assemblePack(
      {
        origin: "scenarios/lonely",
        manifest: { id: "lonely", version: "0.1.0", engine: "0", title: "@t" },
        files: [],
        locales: { en: { t: "Lonely" } },
      },
      () => undefined,
    );
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.path === "languages")).toBe(true);
  });
});

describe("extends", () => {
  it("inherits everything and overrides by id", () => {
    const result = assemblePack(
      child({
        files: [
          {
            path: "world/resources.yaml",
            data: { resources: [{ id: "res.berry", name: "@child.title", tags: ["changed"] }] },
          },
          { path: "oracle/economy.yaml", data: { economy: { interest_rate: 0.02, repay: { verify: 9 } } } },
        ],
      }),
      resolve,
    );
    if (!result.ok) throw new Error(JSON.stringify(result.issues));
    const { pack } = result;
    expect(pack.lineage).toEqual(["interpreter", "test-child"]);
    expect(pack.resources.find((r) => r.id === "res.berry")?.tags).toEqual(["changed"]);
    expect(pack.economy.interest_rate).toBe(0.02);
    expect(pack.economy.repay.verify).toBe(9);
    // Untouched nested fields come from the parent.
    expect(pack.economy.repay.verify_catch).toBeGreaterThan(0);
  });

  it("removes parent entries", () => {
    const result = assemblePack(
      child({ files: [{ path: "x.yaml", data: { remove: { resources: ["res.paperclip"] } } }] }),
      resolve,
    );
    if (!result.ok) throw new Error(JSON.stringify(result.issues));
    expect(result.pack.resources.some((r) => r.id === "res.paperclip")).toBe(false);
  });

  it("reports an unknown parent", () => {
    const result = assemblePack(child(), () => undefined);
    expect(result.ok).toBe(false);
    expect(result.issues[0]?.message).toContain("unknown parent");
  });

  it("reports a cycle", () => {
    const a: RawPack = { ...child(), manifest: { ...(child().manifest as object), id: "a", extends: "b" } };
    const b: RawPack = { ...child(), manifest: { ...(child().manifest as object), id: "b", extends: "a" } };
    const result = assemblePack(a, (id) => (id === "a" ? a : id === "b" ? b : undefined));
    expect(result.ok).toBe(false);
    expect(result.issues[0]?.message).toContain("cycle");
  });
});

describe("validation", () => {
  it("names the file and field of a bad entry", () => {
    const result = assemblePack(
      child({ files: [{ path: "world/bad.yaml", data: { resources: [{ id: "Wood", name: "@x" }] } }] }),
      resolve,
    );
    expect(result.ok).toBe(false);
    expect(result.issues[0]).toMatchObject({
      file: "scenarios/test-child/world/bad.yaml",
      path: "resources.0.id",
    });
  });

  it("rejects unknown sections", () => {
    const result = assemblePack(child({ files: [{ path: "x.yaml", data: { spells: [] } }] }), resolve);
    expect(result.ok).toBe(false);
  });

  it("does not treat inherited object keys as existing text", () => {
    const result = assemblePack(
      child({ files: [{ path: "w.yaml", data: { resources: [{ id: "res.salt", name: "@constructor" }] } }] }),
      resolve,
    );
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.message.includes("@constructor"))).toBe(true);
  });

  it("requires the folder name to match the manifest id", () => {
    const result = assemblePack({ ...child(), folderId: "renamed-folder" }, resolve);
    expect(result.ok).toBe(false);
    expect(result.issues[0]?.message).toContain("must match the folder name");
  });

  it("reports missing text", () => {
    const result = assemblePack(
      child({
        files: [{ path: "w.yaml", data: { resources: [{ id: "res.salt", name: "@res.salt.name" }] } }],
      }),
      resolve,
    );
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.message.includes("@res.salt.name"))).toBe(true);
  });

  it("reports the same id defined twice in one pack", () => {
    const entry = { id: "res.salt", name: "@child.title" };
    const result = assemblePack(
      child({
        files: [
          { path: "a.yaml", data: { resources: [entry] } },
          { path: "b.yaml", data: { resources: [entry] } },
        ],
      }),
      resolve,
    );
    expect(result.ok).toBe(false);
    expect(result.issues[0]?.message).toContain("also defined in");
  });
});
