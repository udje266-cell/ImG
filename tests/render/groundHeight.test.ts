import { describe, expect, it } from "vitest";
import { groundHeightAt, HEIGHT_SCALE, TERRACE_HEIGHT } from "../../src/render/TerrainMesh";
import { landLayer } from "../../src/render/terraces";
import { TerrainGrid } from "../../src/sim/terrain/TerrainGrid";

function flatGrid(height: number): TerrainGrid {
  const g = new TerrainGrid(16, 16, 0.5);
  g.heightMap.fill(height);
  return g;
}

describe("groundHeightAt (shared by mesh, showcase and future agents)", () => {
  it("land sits half a terrace above its layer boundary", () => {
    const g = flatGrid(0.55);
    const expected = (landLayer(0.55, 0.5) + 0.5) * TERRACE_HEIGHT;
    expect(groundHeightAt(g, 8, 8)).toBeCloseTo(expected, 6);
    expect(groundHeightAt(g, 8, 8)).toBeGreaterThan(0);
  });

  it("seabed is smooth and below the water plane (y=0)", () => {
    const g = flatGrid(0.4);
    expect(groundHeightAt(g, 8, 8)).toBeCloseTo((0.4 - 0.5) * HEIGHT_SCALE, 6);
    expect(groundHeightAt(g, 8, 8)).toBeLessThan(0);
  });

  it("is monotone non-decreasing when land rises", () => {
    const g = flatGrid(0.5);
    let previous = -Infinity;
    for (let h = 0.5; h <= 1; h += 0.01) {
      g.heightMap.fill(h);
      const y = groundHeightAt(g, 8, 8);
      expect(y).toBeGreaterThanOrEqual(previous);
      previous = y;
    }
  });
});
