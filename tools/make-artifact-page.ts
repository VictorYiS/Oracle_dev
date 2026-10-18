// Turns a Vite build into the claude.ai Artifact page shape: the page file holds no doctype/html/
// head/body of its own (the publisher wraps it), keeps its <title> first, and references every
// other built file relatively. Writes <dist>/artifact.html and <dist>/artifact-files.json
// (published path -> source path) for the Artifact publish call.
//
//   npx tsx tools/make-artifact-page.ts dist-spike/artifact-probe
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";

const dist = resolve(process.argv[2] ?? "dist");
const html = readFileSync(join(dist, "index.html"), "utf8");

const head = /<head>([\s\S]*?)<\/head>/i.exec(html)?.[1] ?? "";
const body = /<body[^>]*>([\s\S]*?)<\/body>/i.exec(html)?.[1] ?? "";
const title = /<title>[\s\S]*?<\/title>/i.exec(head)?.[0] ?? "<title>Oracle</title>";
const styles = head.match(/<style[\s\S]*?<\/style>/gi) ?? [];
const links = head.match(/<link[^>]+rel="(?:stylesheet|modulepreload)"[^>]*>/gi) ?? [];
const headScripts = head.match(/<script[\s\S]*?<\/script>/gi) ?? [];

const page = [
  title,
  // Side gutters use max(16px, env(safe-area-inset-*)), which this tag promises.
  '<meta name="claude:viewport-fit-sides" content="cover">',
  ...styles,
  ...links,
  body.replace(/<script[\s\S]*?<\/script>/gi, "").trim(),
  ...(body.match(/<script[\s\S]*?<\/script>/gi) ?? []),
  ...headScripts,
].join("\n");

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

const files: Record<string, string> = {};
for (const full of walk(dist)) {
  const published = relative(dist, full).split(sep).join("/");
  if (["index.html", "artifact.html", "artifact-files.json"].includes(published)) continue;
  files[published] = relative(process.cwd(), full).split(sep).join("/");
}

writeFileSync(join(dist, "artifact.html"), `${page}\n`);
writeFileSync(join(dist, "artifact-files.json"), `${JSON.stringify(files, null, 2)}\n`);
console.log(`artifact page: ${relative(process.cwd(), join(dist, "artifact.html"))}`);
console.log(JSON.stringify(files, null, 2));
