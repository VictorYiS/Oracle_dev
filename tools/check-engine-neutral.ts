// npm run check:neutral — fail if engine code (core, ui, render, providers) mentions scenario content.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { findViolations, forbiddenTerms } from "./lib/neutral";
import { listPackIds, loadPack } from "./lib/read-pack";

const ROOT = join(import.meta.dirname, "..");
const ENGINE_DIRS = ["src/core", "src/ui", "src/render", "src/oracle-providers"];

function sources(dir: string): string[] {
  try {
    return readdirSync(dir).flatMap((name) => {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) return sources(full);
      return /\.(ts|tsx|css)$/.test(name) ? [full] : [];
    });
  } catch {
    return [];
  }
}

// A pack that does not load cannot contribute its terms, so the check would pass on a blind spot.
const broken: string[] = [];
const packs = listPackIds().flatMap((id) => {
  const result = loadPack(id);
  if (!result.ok) broken.push(id);
  return result.ok ? [result.pack] : [];
});
if (broken.length > 0) {
  console.error(
    `Cannot check engine neutrality: pack(s) ${broken.join(", ")} failed to load (run npm run validate).`,
  );
  process.exit(1);
}
const terms = forbiddenTerms(packs);
const files = ENGINE_DIRS.flatMap((d) => sources(join(ROOT, d))).map((full) => ({
  path: relative(ROOT, full).split(sep).join("/"),
  content: readFileSync(full, "utf8"),
}));

const violations = findViolations(files, terms);
if (violations.length > 0) {
  console.error("Engine code mentions scenario content (move it into a scenario pack):");
  for (const v of violations) console.error(`  ${v.file}:${v.line}  "${v.term}"  ${v.excerpt}`);
  process.exit(1);
}
console.log(`✓ engine neutral: ${files.length} files checked against ${terms.length} scenario terms`);
