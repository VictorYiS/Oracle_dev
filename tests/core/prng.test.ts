import { describe, expect, it } from "vitest";
import { Rng } from "../../src/core/random/prng";

describe("Rng", () => {
  it("produces the same stream for the same seed", () => {
    const a = Rng.fromSeed("delta");
    const b = Rng.fromSeed("delta");
    for (let i = 0; i < 1000; i++) expect(a.nextU32()).toBe(b.nextU32());
  });

  it("matches the golden stream on every platform", () => {
    // If this fails on one OS or browser but not another, determinism is broken.
    const rng = Rng.fromSeed(42);
    expect(Array.from({ length: 5 }, () => rng.nextU32())).toMatchSnapshot();
  });

  it("restores from a saved state", () => {
    const a = Rng.fromSeed(7);
    for (let i = 0; i < 10; i++) a.nextU32();
    const b = Rng.fromState(a.state());
    expect(b.nextU32()).toBe(a.nextU32());
  });

  it("forks independent but reproducible children", () => {
    const parent = Rng.fromSeed(1);
    expect(parent.fork("world").nextU32()).toBe(Rng.fromSeed(1).fork("world").nextU32());
    expect(parent.fork("world").nextU32()).not.toBe(parent.fork("offers").nextU32());
  });

  it("keeps int() in range and roughly uniform", () => {
    const rng = Rng.fromSeed(3);
    const counts = [0, 0, 0, 0];
    for (let i = 0; i < 40000; i++) counts[rng.int(4)]! += 1;
    for (const c of counts) expect(c).toBeGreaterThan(9500);
  });
});
