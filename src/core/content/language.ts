// Language negotiation shared by scenario text and engine UI copy.

/**
 * Choose which of `supported` to show for a player whose preferences are `preferred`
 * (most preferred first, e.g. navigator.languages). Exact tags win, then the same base
 * language (a `zh-TW` reader gets `zh-CN` rather than English), else the first supported.
 */
export function pickLanguage(supported: readonly string[], preferred: readonly string[]): string {
  const fallback = supported[0];
  if (fallback === undefined) throw new RangeError("no supported languages");
  const lower = supported.map((s) => s.toLowerCase());
  for (const want of preferred) {
    const exact = lower.indexOf(want.toLowerCase());
    if (exact >= 0) return supported[exact] as string;
    const base = want.toLowerCase().split("-")[0];
    const sameBase = lower.findIndex((s) => s.split("-")[0] === base);
    if (sameBase >= 0) return supported[sameBase] as string;
  }
  return fallback;
}
