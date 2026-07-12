/**
 * Seeded 2D value noise with fractal Brownian motion (fBm).
 * Fully deterministic: same seed + same coordinates => same value, forever.
 */
export class Noise2D {
  private readonly seed: number;

  constructor(seed: number) {
    this.seed = seed >>> 0;
  }

  /** Deterministic hash of an integer lattice point to [0, 1). */
  private hash01(ix: number, iy: number): number {
    let h = this.seed ^ Math.imul(ix, 0x27d4eb2d) ^ Math.imul(iy, 0x165667b1);
    h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
    h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  }

  /** Smoothly interpolated value noise in [0, 1). */
  value(x: number, y: number): number {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const fx = x - ix;
    const fy = y - iy;
    // Smoothstep fade for C1-continuous interpolation.
    const sx = fx * fx * (3 - 2 * fx);
    const sy = fy * fy * (3 - 2 * fy);
    const v00 = this.hash01(ix, iy);
    const v10 = this.hash01(ix + 1, iy);
    const v01 = this.hash01(ix, iy + 1);
    const v11 = this.hash01(ix + 1, iy + 1);
    const top = v00 + (v10 - v00) * sx;
    const bottom = v01 + (v11 - v01) * sx;
    return top + (bottom - top) * sy;
  }

  /**
   * Fractal Brownian motion: sum of `octaves` noise layers with increasing
   * frequency (`lacunarity`) and decreasing amplitude (`gain`), normalised
   * to [0, 1].
   */
  fbm(x: number, y: number, octaves: number, lacunarity = 2, gain = 0.5): number {
    let sum = 0;
    let amplitude = 1;
    let frequency = 1;
    let totalAmplitude = 0;
    for (let i = 0; i < octaves; i++) {
      sum += amplitude * this.value(x * frequency, y * frequency);
      totalAmplitude += amplitude;
      amplitude *= gain;
      frequency *= lacunarity;
    }
    return sum / totalAmplitude;
  }
}
