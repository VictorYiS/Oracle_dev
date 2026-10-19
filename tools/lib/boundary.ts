// The write boundary (P1 acceptance A5): the world changes only through the command bus.
// - src/core/world/mutate (the write interface) may be imported only by src/core/world/** and
//   src/core/commands/**.
// - The systems that change state as time passes (time, routines, create, and the residents, hero,
//   observation and case systems they run) may also be imported by src/core/game/**, the facade
//   that advances time and creates worlds. (units is the grid-era name, still guarded.)
// Everything else submits commands and reads views.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import ts from "typescript";

const REPO = join(import.meta.dirname, "..", "..");
const WORLD = resolve(REPO, "src/core/world");
const COMMANDS = resolve(REPO, "src/core/commands");
const GAME = resolve(REPO, "src/core/game");
const SCANNED = ["src", "tools"];

/** World modules that change state, besides the writer itself. */
export const STATE_SYSTEMS = ["time", "routines", "units", "create", "residents", "hero", "observe", "cases"];

/** Each guarded module and the folders allowed to import it. */
const GUARDED: { module: string; allowed: string[] }[] = [
  { module: resolve(WORLD, "mutate"), allowed: [WORLD, COMMANDS] },
  ...STATE_SYSTEMS.map((name) => ({
    module: resolve(WORLD, name),
    allowed: [WORLD, COMMANDS, GAME],
  })),
];

export interface BoundaryViolation {
  file: string;
  line: number;
  specifier: string;
}

/** Imports in `content` (from a file at `file`) that reach a guarded module from outside its allowed folders. */
export function findBoundaryViolations(file: string, content: string): BoundaryViolation[] {
  const abs = resolve(REPO, file);
  const inside = (dir: string) => abs.startsWith(dir + sep);
  // The compiler's own import scanner: multi-line imports, `export … from`, dynamic import(),
  // and nothing inside comments or strings.
  const { importedFiles } = ts.preProcessFile(content, true, true);
  const out: BoundaryViolation[] = [];
  for (const { fileName: spec, pos } of importedFiles) {
    if (!spec.startsWith(".")) continue;
    const target = resolve(dirname(abs), spec).replace(/\.(ts|js)$/, "");
    const guard = GUARDED.find((g) => g.module === target);
    if (!guard || guard.allowed.some(inside)) continue;
    const line = content.slice(0, pos).split("\n").length;
    out.push({ file: relative(REPO, abs).split(sep).join("/"), line, specifier: spec });
  }
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
  return SCANNED.map((d) => join(REPO, d))
    .filter((dir) => existsSync(dir))
    .flatMap((dir) =>
      sources(dir).flatMap((f) => findBoundaryViolations(relative(REPO, f), readFileSync(f, "utf8"))),
    );
}

// The Oracle's boundary (P2 acceptance A3): the Oracle reads the records and nothing else.
// src/core/oracle/** may import only the records (src/core/world/records), the pack's content types
// (src/core/content/**) and itself. Everything else in the world reads the truth (query, the
// state's types, the game facade, the pack index with its starting truth), so it is out of reach.
const ORACLE = resolve(REPO, "src/core/oracle");
const ORACLE_MAY_READ = [resolve(WORLD, "records")];
const ORACLE_MAY_READ_DIRS = [resolve(REPO, "src/core/content"), ORACLE];

/** Imports in a file under src/core/oracle that reach anything but the records, content or the Oracle itself. */
export function findOracleViolations(file: string, content: string): BoundaryViolation[] {
  const abs = resolve(REPO, file);
  if (!abs.startsWith(ORACLE + sep)) return [];
  const { importedFiles } = ts.preProcessFile(content, true, true);
  const out: BoundaryViolation[] = [];
  for (const { fileName: spec, pos } of importedFiles) {
    if (!spec.startsWith(".")) continue;
    const target = resolve(dirname(abs), spec).replace(/\.(ts|js)$/, "");
    if (ORACLE_MAY_READ.includes(target) || ORACLE_MAY_READ_DIRS.some((d) => target.startsWith(d + sep)))
      continue;
    const line = content.slice(0, pos).split("\n").length;
    out.push({ file: relative(REPO, abs).split(sep).join("/"), line, specifier: spec });
  }
  return out;
}

export function scanOracle(): BoundaryViolation[] {
  if (!existsSync(ORACLE)) return [];
  return sources(ORACLE).flatMap((f) => findOracleViolations(relative(REPO, f), readFileSync(f, "utf8")));
}
