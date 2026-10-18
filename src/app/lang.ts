// Which language to show: the player's explicit choice, then the browser's languages, then the
// pack's first language. Only languages that both the UI and the pack ship are offered, so the
// screen never mixes two languages.
import { pickLanguage } from "../core/content/language";
import { UI_LANGUAGES } from "../ui/i18n";

const STORAGE_KEY = "oracle.language";

function storedLanguage(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null; // private mode, blocked storage, Artifact thumbnail capture
  }
}

export function storeLanguage(lang: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    // The choice still applies for this visit.
  }
}

export function preferredLanguages(): string[] {
  const browser = navigator.languages?.length ? navigator.languages : [navigator.language];
  const stored = storedLanguage();
  return [...(stored ? [stored] : []), ...browser].filter(Boolean);
}

/** Languages offered for a pack: the pack's own order, limited to those the UI also ships. */
export function offeredLanguages(packLanguages: readonly string[]): string[] {
  const offered = packLanguages.filter((l) => l in UI_LANGUAGES);
  return offered.length > 0 ? offered : ["en"];
}

export function chooseLanguage(packLanguages: readonly string[]): string {
  return pickLanguage(offeredLanguages(packLanguages), preferredLanguages());
}
