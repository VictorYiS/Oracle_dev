// Runs after `vite build`: the initial payload (entry script, its preloads and CSS) must stay
// within budget. Lazily loaded chunks (LLM adapters, later chapters) are not counted.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

const BUDGET_KB = 500;
const DIST = join(import.meta.dirname, "..", "dist");

const html = readFileSync(join(DIST, "index.html"), "utf8");
const refs = [
  ...html.matchAll(/<script[^>]+src="\.\/([^"]+)"/g),
  ...html.matchAll(/<link[^>]+rel="(?:modulepreload|stylesheet)"[^>]+href="\.\/([^"]+)"/g),
].map((m) => m[1] as string);

let total = gzipSync(html).length;
const rows: string[] = [`  index.html  ${(total / 1024).toFixed(1)} KB`];
for (const ref of new Set(refs)) {
  const size = gzipSync(readFileSync(join(DIST, ref))).length;
  total += size;
  rows.push(`  ${ref}  ${(size / 1024).toFixed(1)} KB`);
}

console.log(
  `Initial payload (gzip):\n${rows.join("\n")}\n  total ${(total / 1024).toFixed(1)} KB / ${BUDGET_KB} KB`,
);
if (total > BUDGET_KB * 1024) {
  console.error(`✗ initial payload exceeds ${BUDGET_KB} KB`);
  process.exit(1);
}
