// npm run check:copy — UI components hold no translatable text of their own: copy lives in
// src/ui/i18n/<language>.ts (engine UI) or in scenario packs (game content). A CJK character in
// any other UI source file means a string was hard-coded. (English literals are caught by the
// i18n end-to-end test, which renders the Chinese UI and looks for English copy.)
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

const ROOT = join(import.meta.dirname, "..");
const UI = join(ROOT, "src", "ui");
const I18N = join(UI, "i18n");
// CJK ideographs, compatibility ideographs, CJK punctuation and full-width forms.
const CJK_RANGES: [number, number][] = [
  [0x3400, 0x9fff],
  [0xf900, 0xfaff],
  [0x3000, 0x303f],
  [0xff00, 0xffef],
];
const CJK = {
  test: (line: string) =>
    [...line].some((ch) => {
      const code = ch.codePointAt(0) ?? 0;
      return CJK_RANGES.some(([lo, hi]) => code >= lo && code <= hi);
    }),
};

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return full === I18N ? [] : files(full);
    return /\.(tsx?|css)$/.test(name) ? [full] : [];
  });
}

const found: string[] = [];
for (const file of files(UI)) {
  readFileSync(file, "utf8")
    .split(/\r?\n/)
    .forEach((line, i) => {
      if (CJK.test(line))
        found.push(`  ${relative(ROOT, file).split(sep).join("/")}:${i + 1}  ${line.trim()}`);
    });
}

if (found.length > 0) {
  console.error("UI copy is hard-coded outside src/ui/i18n (move it into the message tables):");
  console.error(found.join("\n"));
  process.exit(1);
}
console.log("✓ ui copy: no hard-coded CJK text outside src/ui/i18n");
