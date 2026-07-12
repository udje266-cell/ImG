/**
 * Deterministic pseudo-random generator (splitmix32).
 *
 * Simulation code must NEVER use `Math.random` (enforced by the architecture
 * test). Each subsystem gets its own named stream via `fork`, so adding a new
 * consumer of randomness never desynchronises the others.
 */
export class Rng {
  private state: number;
  private readonly seed: number;

  constructor(seed: number) {
    this.seed = seed >>> 0;
    this.state = this.seed;
  }

  /** Next raw 32-bit unsigned integer. */
  nextUint32(): number {
    let z = (this.state = (this.state + 0x9e3779b9) >>> 0);
    z ^= z >>> 16;
    z = Math.imul(z, 0x21f0aaad);
    z ^= z >>> 15;
    z = Math.imul(z, 0x735a2d97);
    z ^= z >>> 15;
    return z >>> 0;
  }

  /** Uniform float in [0, 1). */
  float(): number {
    return this.nextUint32() / 4294967296;
  }

  /** Uniform integer in [min, max] (inclusive). */
  int(min: number, max: number): number {
    return min + Math.floor(this.float() * (max - min + 1));
  }

  /**
   * Derive an independent, reproducible stream from this generator's ORIGINAL
   * seed and a stream name. Forking does not consume state, so the order in
   * which streams are created never matters.
   */
  fork(stream: string): Rng {
    // FNV-1a hash of the stream name, mixed with the original seed.
    let h = 2166136261 >>> 0;
    for (let i = 0; i < stream.length; i++) {
      h ^= stream.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return new Rng((this.seed ^ h) >>> 0);
  }
}
