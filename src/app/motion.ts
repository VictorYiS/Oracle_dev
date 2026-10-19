// "Reduce motion": the player's choice if they made one, else the system's setting. Kept in this
// browser only; storage may be missing (private windows), and then the choice lasts for the visit.
const KEY = "oracle.reduceMotion";

export function reducedMotion(): boolean {
  try {
    const stored = localStorage.getItem(KEY);
    if (stored !== null) return stored === "1";
  } catch {
    // fall through to the system setting
  }
  return typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function storeReducedMotion(on: boolean): void {
  try {
    localStorage.setItem(KEY, on ? "1" : "0");
  } catch {
    // The choice still applies for this visit.
  }
}
