import { describe, expect, it } from "vitest";
import { Rng } from "../../src/core/math/Rng";

describe("Rng (determinism is a hard requirement — docs/TDD.md §2.2)", () => {
  it("produces the same sequence for the same seed", () => {
    const a = new Rng(12345);
    const b = new Rng(12345);
    for (let i = 0; i < 100; i++) {
      expect(a.nextUint32()).toBe(b.nextUint32());
    }
  });

  it("produces different sequences for different seeds", () => {
    const a = new Rng(1);
    const b = new Rng(2);
    const sameCount = Array.from({ length: 20 }, () => a.nextUint32() === b.nextUint32()).filter(Boolean).length;
    expect(sameCount).toBeLessThan(3);
  });

  it("float() stays in [0, 1)", () => {
    const rng = new Rng(7);
    for (let i = 0; i < 1000; i++) {
      const v = rng.float();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it("int(min, max) covers the inclusive range and stays inside it", () => {
    const rng = new Rng(7);
    const seen = new Set<number>();
    for (let i = 0; i < 1000; i++) {
      const v = rng.int(3, 6);
      expect(v).toBeGreaterThanOrEqual(3);
      expect(v).toBeLessThanOrEqual(6);
      seen.add(v);
    }
    expect(seen.size).toBe(4);
  });

  it("fork() derives from the ORIGINAL seed, independent of consumed state", () => {
    const a = new Rng(42);
    const b = new Rng(42);
    b.nextUint32(); // consume some state on one of them
    b.nextUint32();
    expect(a.fork("weather").nextUint32()).toBe(b.fork("weather").nextUint32());
  });

  it("named streams are independent of each other", () => {
    const rng = new Rng(42);
    expect(rng.fork("weather").nextUint32()).not.toBe(rng.fork("ecology").nextUint32());
  });
});
