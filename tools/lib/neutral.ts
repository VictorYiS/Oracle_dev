// Hard rule 2 (docs/plan/Oracle_Dev_Plan.md §1.4): engine code never names scenario content.
// Forbidden terms = every namespaced content id in every pack + each pack's engine_forbidden_terms.
import { contentIds, type Pack } from "../../src/core/content/pack";

export interface NeutralViolation {
  file: string;
  line: number;
  term: string;
  excerpt: string;
}

export function forbiddenTerms(packs: Pack[]): string[] {
  const terms = new Set<string>();
  for (const pack of packs) {
    for (const id of contentIds(pack)) terms.add(id);
    for (const t of pack.manifest.engine_forbidden_terms) terms.add(t);
  }
  return [...terms].sort();
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function matcher(term: string): RegExp {
  // ASCII ids must match as a whole token (so res.wood does not hit res.woodland);
  // CJK proper nouns match anywhere.
  return /^[\x20-\x7e]+$/.test(term)
    ? new RegExp(`(?<![A-Za-z0-9_.])${escape(term)}(?![A-Za-z0-9_])`)
    : new RegExp(escape(term));
}

export function findViolations(
  files: { path: string; content: string }[],
  terms: string[],
): NeutralViolation[] {
  const matchers = terms.map((term) => ({ term, re: matcher(term) }));
  const out: NeutralViolation[] = [];
  for (const file of files) {
    file.content.split(/\r?\n/).forEach((line, i) => {
      for (const { term, re } of matchers) {
        if (re.test(line))
          out.push({ file: file.path, line: i + 1, term, excerpt: line.trim().slice(0, 120) });
      }
    });
  }
  return out;
}
