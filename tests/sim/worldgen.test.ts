import { describe, expect, it } from "vitest";
import { BIOME_COUNT, Biome } from "../../src/sim/worldgen/biomes";
import { generateWorld } from "../../src/sim/worldgen/WorldGenerator";

const CONFIG = { seed: 1337, width: 128, height: 128 };

describe("generateWorld", () => {
  it("is fully deterministic: same seed => identical world", () => {
    const a = generateWorld(CONFIG);
    const b = generateWorld(CONFIG);
    expect(a.heightMap).toEqual(b.heightMap);
    expect(a.baseTemperature).toEqual(b.baseTemperature);
    expect(a.moisture).toEqual(b.moisture);
    expect(a.biomes).toEqual(b.biomes);
  });

  it("different seeds produce different worlds", () => {
    const a = generateWorld(CONFIG);
    const b = generateWorld({ ...CONFIG, seed: 777 });
    expect(a.heightMap).not.toEqual(b.heightMap);
  });

  it("produces both land and water with the default sea level", () => {
    const grid = generateWorld(CONFIG);
    let water = 0;
    let land = 0;
    for (const h of grid.heightMap) h < grid.seaLevel ? water++ : land++;
    expect(water).toBeGreaterThan(0);
    expect(land).toBeGreaterThan(0);
  });

  it("every biome value is valid", () => {
    const grid = generateWorld(CONFIG);
    for (const b of grid.biomes) {
      expect(b).toBeGreaterThanOrEqual(0);
      expect(b).toBeLessThan(BIOME_COUNT);
    }
  });

  it("underwater cells are classified as ocean, land cells are not", () => {
    const grid = generateWorld(CONFIG);
    for (let y = 0; y < grid.height; y += 7) {
      for (let x = 0; x < grid.width; x += 7) {
        if (grid.isWater(x, y)) {
          expect(grid.biomeAt(x, y)).toBe(Biome.Ocean);
        } else {
          expect(grid.biomeAt(x, y)).not.toBe(Biome.Ocean);
        }
      }
    }
  });

  it("poles are colder than the equator (latitudinal gradient)", () => {
    const grid = generateWorld(CONFIG);
    const rowMean = (y: number): number => {
      let sum = 0;
      for (let x = 0; x < grid.width; x++) sum += grid.baseTemperature[grid.index(x, y)]!;
      return sum / grid.width;
    };
    const equator = rowMean(Math.floor(grid.height / 2));
    const northPole = rowMean(0);
    const southPole = rowMean(grid.height - 1);
    expect(equator).toBeGreaterThan(northPole + 0.3);
    expect(equator).toBeGreaterThan(southPole + 0.3);
  });
});
