// Engine UI copy in English: the reference shape every other language must match.
// Words a scenario could rename (system names, places, units) come from the pack's locale instead.
export const en = {
  language: "Language",
  build: "Build",
  channel: "Channel",
  oracle: "Oracle",
  channels: { artifact: "claude.ai Artifact", static: "Static link", dev: "Local dev" },
  oracleOffline: "Offline (rules engine)",
  oracleClaude: "Available (your Claude account)",
  checking: "Checking…",
  provenance: { seen: "Seen", reading: "Reading", narrated: "Narrated" },
  stage:
    "P0 · Foundations. There is no game here yet, only its skeleton: scenario packs, the trade-off ledger and the economy simulation.",
  next: "Next: P1 · the world core and manual play.",
  source: "Source code",
  packError: "The scenario pack failed to load",
};

type Strings<T> = { [K in keyof T]: T[K] extends string ? string : Strings<T[K]> };

/** Every UI language provides exactly these keys (checked by the type checker). */
export type Messages = Strings<typeof en>;
