import { describe, expect, it } from "vitest";
import { CHUNK_SIZE, TerrainGrid } from "../../src/sim/terrain/TerrainGrid";
import { Biome } from "../../src/sim/worldgen/biomes";

function makeFlatLand(): TerrainGrid {
  const grid = new TerrainGrid(64, 64, 0.5);
  grid.heightMap.fill(0.55);
  grid.baseTemperature.fill(0.6);
  grid.moisture.fill(0.45);
  grid.refreshAllBiomes();
  return grid;
}

describe("TerrainGrid", () => {
  it("clamps heights to [0, 1]", () => {
    const grid = makeFlatLand();
    grid.setHeight(1, 1, 3);
    expect(grid.heightAt(1, 1)).toBe(1);
    grid.setHeight(1, 1, -2);
    expect(grid.heightAt(1, 1)).toBe(0);
  });

  it("marks only the touched chunks dirty and reports them once", () => {
    const grid = makeFlatLand();
    grid.modifyHeight(1, 1, 0.1); // chunk 0
    grid.modifyHeight(CHUNK_SIZE + 1, 1, 0.1); // chunk 1
    const dirty = grid.refreshDirtyChunks();
    expect(dirty).toEqual([0, 1]);
    expect(grid.refreshDirtyChunks()).toEqual([]); // consumed
  });

  it("terraforming below sea level floods the cell (biome becomes ocean)", () => {
    const grid = makeFlatLand();
    expect(grid.biomeAt(5, 5)).toBe(Biome.Grassland);
    grid.setHeight(5, 5, 0.4);
    grid.refreshDirtyChunks();
    expect(grid.biomeAt(5, 5)).toBe(Biome.Ocean);
    expect(grid.isWater(5, 5)).toBe(true);
  });

  it("raising a peak high enough caps it with snow", () => {
    const grid = makeFlatLand();
    grid.setHeight(5, 5, 0.98);
    grid.refreshDirtyChunks();
    expect(grid.biomeAt(5, 5)).toBe(Biome.Snow);
  });

  it("does not mark dirty when the write is a no-op", () => {
    const grid = makeFlatLand();
    grid.refreshDirtyChunks();
    grid.setHeight(2, 2, grid.heightAt(2, 2));
    expect(grid.refreshDirtyChunks()).toEqual([]);
  });
});
