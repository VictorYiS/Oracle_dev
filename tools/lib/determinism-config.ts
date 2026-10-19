/** The run that npm run determinism and tests/e2e/determinism.spec.ts both reproduce. */
export const DETERMINISM = { pack: "interpreter", seed: 42, days: 100 } as const;
