import { describe, expect, it } from "vitest";
import { Biome, classifyBiome, MOUNTAIN_LEVEL } from "../../src/sim/worldgen/biomes";

const SEA = 0.5;

describe("classifyBiome", () => {
  it("below sea level is always ocean, whatever the climate", () => {
    expect(classifyBiome(0.2, 0.9, 0.9, SEA)).toBe(Biome.Ocean);
    expect(classifyBiome(0.49, 0.1, 0.1, SEA)).toBe(Biome.Ocean);
  });

  it("a thin band just above sea level is beach", () => {
    expect(classifyBiome(SEA + 0.005, 0.6, 0.5, SEA)).toBe(Biome.Beach);
  });

  it("hot + dry = desert, hot + medium = savanna, hot + wet = tropical forest", () => {
    const lowland = SEA + 0.03;
    expect(classifyBiome(lowland, 0.9, 0.1, SEA)).toBe(Biome.Desert);
    expect(classifyBiome(lowland, 0.9, 0.4, SEA)).toBe(Biome.Savanna);
    expect(classifyBiome(lowland, 0.9, 0.8, SEA)).toBe(Biome.TropicalForest);
  });

  it("temperate: steppe / grassland / forest by increasing moisture", () => {
    const lowland = SEA + 0.03;
    expect(classifyBiome(lowland, 0.6, 0.2, SEA)).toBe(Biome.Steppe);
    expect(classifyBiome(lowland, 0.6, 0.45, SEA)).toBe(Biome.Grassland);
    expect(classifyBiome(lowland, 0.6, 0.8, SEA)).toBe(Biome.TemperateForest);
  });

  it("cold: taiga when wet, tundra when colder", () => {
    const lowland = SEA + 0.03;
    expect(classifyBiome(lowland, 0.4, 0.6, SEA)).toBe(Biome.Taiga);
    expect(classifyBiome(lowland, 0.25, 0.5, SEA)).toBe(Biome.Tundra);
  });

  it("polar latitudes are snow even at sea level", () => {
    expect(classifyBiome(SEA + 0.05, 0.05, 0.5, SEA)).toBe(Biome.Snow);
  });

  it("altitude cools the climate: high peaks get snow, high ground gets rock", () => {
    // Warm base climate, but very high: the lapse pushes it below freezing.
    expect(classifyBiome(0.95, 0.8, 0.5, SEA)).toBe(Biome.Snow);
    // High enough for rock, warm enough to avoid snow.
    expect(classifyBiome(MOUNTAIN_LEVEL + 0.01, 0.9, 0.5, SEA)).toBe(Biome.Mountain);
  });
});
