// Seeded, platform-independent PRNG (xoshiro128**). Only 32-bit integer ops,
// so every browser and Node produce the same stream for the same seed.

export type RngState = readonly [number, number, number, number];

function fnv1a(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

function splitmix32(seed: number): () => number {
  let x = seed >>> 0;
  return () => {
    x = (x + 0x9e3779b9) >>> 0;
    let z = x;
    z = Math.imul(z ^ (z >>> 16), 0x85ebca6b) >>> 0;
    z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35) >>> 0;
    return (z ^ (z >>> 16)) >>> 0;
  };
}

const rotl = (x: number, k: number) => ((x << k) | (x >>> (32 - k))) >>> 0;

export class Rng {
  private s0: number;
  private s1: number;
  private s2: number;
  private s3: number;

  private constructor(state: RngState) {
    [this.s0, this.s1, this.s2, this.s3] = state;
    if ((this.s0 | this.s1 | this.s2 | this.s3) === 0) this.s0 = 1;
  }

  static fromSeed(seed: number | string): Rng {
    const next = splitmix32(typeof seed === "string" ? fnv1a(seed) : seed);
    return new Rng([next(), next(), next(), next()]);
  }

  static fromState(state: RngState): Rng {
    return new Rng(state);
  }

  state(): RngState {
    return [this.s0, this.s1, this.s2, this.s3];
  }

  /** Independent child stream; the same label always yields the same child. */
  fork(label: string): Rng {
    return Rng.fromSeed((this.s0 ^ fnv1a(label)) >>> 0);
  }

  nextU32(): number {
    const result = Math.imul(rotl(Math.imul(this.s1, 5) >>> 0, 7), 9) >>> 0;
    const t = (this.s1 << 9) >>> 0;
    this.s2 = (this.s2 ^ this.s0) >>> 0;
    this.s3 = (this.s3 ^ this.s1) >>> 0;
    this.s1 = (this.s1 ^ this.s2) >>> 0;
    this.s0 = (this.s0 ^ this.s3) >>> 0;
    this.s2 = (this.s2 ^ t) >>> 0;
    this.s3 = rotl(this.s3, 11);
    return result;
  }

  /** Uniform in [0, 1). */
  float(): number {
    return this.nextU32() / 4294967296;
  }

  /** Uniform integer in [0, maxExclusive). */
  int(maxExclusive: number): number {
    if (maxExclusive <= 0) throw new RangeError("maxExclusive must be positive");
    return Math.floor(this.float() * maxExclusive);
  }

  /** True with probability bp / 10000. */
  chanceBp(bp: number): boolean {
    return this.int(10000) < bp;
  }

  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new RangeError("cannot pick from an empty list");
    return items[this.int(items.length)] as T;
  }

  /** Fisher–Yates on a copy. */
  shuffle<T>(items: readonly T[]): T[] {
    const out = items.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = this.int(i + 1);
      [out[i], out[j]] = [out[j] as T, out[i] as T];
    }
    return out;
  }
}
