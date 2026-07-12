import { describe, expect, it } from "vitest";
import { Noise2D } from "../../src/core/math/Noise2D";

describe("Noise2D", () => {
  it("is deterministic for a given seed", () => {
    const a = new Noise2D(99);
    const b = new Noise2D(99);
    for (let i = 0; i < 50; i++) {
      const x = i * 0.37;
      const y = i * 0.73;
      expect(a.value(x, y)).toBe(b.value(x, y));
      expect(a.fbm(x, y, 5)).toBe(b.fbm(x, y, 5));
    }
  });

  it("differs across seeds", () => {
    const a = new Noise2D(1);
    const b = new Noise2D(2);
    let identical = 0;
    for (let i = 0; i < 50; i++) {
      if (a.value(i * 0.37, i * 0.73) === b.value(i * 0.37, i * 0.73)) identical++;
    }
    expect(identical).toBeLessThan(5);
  });

  it("fbm output stays within [0, 1]", () => {
    const noise = new Noise2D(1234);
    for (let i = 0; i < 500; i++) {
      const v = noise.fbm(i * 0.11, i * 0.29, 5);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it("is spatially smooth (neighbouring samples stay close)", () => {
    const noise = new Noise2D(1234);
    for (let i = 0; i < 200; i++) {
      const x = i * 0.31;
      const y = i * 0.17;
      const delta = Math.abs(noise.value(x, y) - noise.value(x + 0.01, y));
      expect(delta).toBeLessThan(0.05);
    }
  });
});
