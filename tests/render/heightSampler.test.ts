import { describe, expect, it } from "vitest";
import { sampleHeightBilinear } from "../../src/render/heightSampler";
import { TerrainGrid } from "../../src/sim/terrain/TerrainGrid";

function grid(width: number, height: number, fill: number): TerrainGrid {
  const g = new TerrainGrid(width, height, 0.5);
  g.heightMap.fill(fill);
  return g;
}

describe("sampleHeightBilinear", () => {
  it("returns the cell height when sampling exactly at a cell centre", () => {
    const g = grid(8, 8, 0.3);
    g.setHeight(3, 4, 0.9);
    expect(sampleHeightBilinear(g, 3.5, 4.5)).toBeCloseTo(0.9, 6);
  });

  it("interpolates halfway between two adjacent cells", () => {
    const g = grid(8, 8, 0);
    g.setHeight(2, 2, 0.2);
    g.setHeight(3, 2, 0.8);
    // Midpoint between the centres of (2,2) and (3,2).
    expect(sampleHeightBilinear(g, 3.0, 2.5)).toBeCloseTo(0.5, 6);
  });

  it("is constant over a flat field, including between cells", () => {
    const g = grid(8, 8, 0.42);
    for (const [x, y] of [[0.1, 0.1], [3.7, 5.2], [7.9, 7.9]] as const) {
      expect(sampleHeightBilinear(g, x, y)).toBeCloseTo(0.42, 6);
    }
  });

  it("clamps at the map edges without NaN or out-of-bounds reads", () => {
    const g = grid(4, 4, 0.6);
    expect(sampleHeightBilinear(g, -5, -5)).toBeCloseTo(0.6, 6);
    expect(sampleHeightBilinear(g, 99, 99)).toBeCloseTo(0.6, 6);
  });
});
