// The write boundary (P1 acceptance A5): only src/core/world/** and src/core/commands/** may import
// src/core/world/mutate. Everything else changes the world by submitting commands.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";

const REPO = join(import.meta.dirname, "..", "..");
const WRITER = resolve(REPO, "src/core/world/mutate");
const ALLOWED = [resolve(REPO, "src/core/world"), resolve(REPO, "src/core/commands")];
const SCANNED = ["src", "tools", "spikes"];

export interface BoundaryViolation {
  file: string;
  line: number;
  specifier: string;
}

const IMPORT = /(?:import|export)\s[^'"]*?from\s*["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)/g;

/** Imports in `content` (from a file at `file`) that reach the writer from outside the allowed folders. */
export function findBoundaryViolations(file: string, content: string): BoundaryViolation[] {
  const abs = resolve(REPO, file);
  if (ALLOWED.some((dir) => abs.startsWith(dir + sep))) return [];
  const out: BoundaryViolation[] = [];
  content.split(/\r?\n/).forEach((line, i) => {
    for (const m of line.matchAll(IMPORT)) {
      const spec = m[1] ?? m[2] ?? "";
      if (!spec.startsWith(".")) continue;
      const target = resolve(dirname(abs), spec).replace(/\.(ts|js)$/, "");
      if (target === WRITER)
        out.push({ file: relative(REPO, abs).split(sep).join("/"), line: i + 1, specifier: spec });
    }
  });
  return out;
}

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return name === "node_modules" ? [] : sources(full);
    return /\.(ts|tsx)$/.test(name) ? [full] : [];
  });
}

export function scanBoundary(): BoundaryViolation[] {
  return SCANNED.flatMap((d) => {
    const dir = join(REPO, d);
    try {
      return sources(dir).flatMap((f) => findBoundaryViolations(relative(REPO, f), readFileSync(f, "utf8")));
    } catch {
      return [];
    }
  });
}
