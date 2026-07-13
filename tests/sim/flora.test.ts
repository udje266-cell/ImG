import { describe, expect, it } from "vitest";
import { Rng } from "../../src/core/math/Rng";
import { FloraSystem } from "../../src/sim/ecology/FloraSystem";
import { TerrainGrid } from "../../src/sim/terrain/TerrainGrid";
import { Biome } from "../../src/sim/worldgen/biomes";

/** Monde plat mono-biome à humidité réglable, pour tester la flore isolément. */
function biomeGrid(biome: Biome, moisture: number): TerrainGrid {
  const g = new TerrainGrid(48, 48, 0.5);
  g.heightMap.fill(0.6);
  g.baseTemperature.fill(0.6);
  g.moisture.fill(moisture);
  g.baselineMoisture.fill(moisture);
  g.biomes.fill(biome);
  return g;
}

function totalDensity(f: FloraSystem): number {
  return f.density.reduce((a, b) => a + b, 0);
}

describe("FloraSystem (docs/GDD.md §3.5)", () => {
  it("is deterministic for a given seed", () => {
    const run = (): number[] => {
      const f = new FloraSystem(biomeGrid(Biome.Grassland, 0.6), new Rng(11));
      for (let i = 0; i < 30; i++) f.update();
      return Array.from(f.density);
    };
    expect(run()).toEqual(run());
  });

  it("grows vegetation in a wet, temperate forest biome", () => {
    const f = new FloraSystem(biomeGrid(Biome.TemperateForest, 0.75), new Rng(3));
    const before = totalDensity(f);
    for (let i = 0; i < 40; i++) f.update();
    expect(totalDensity(f)).toBeGreaterThan(before);
  });

  it("stays barren in a dry desert (moisture below the floor)", () => {
    const f = new FloraSystem(biomeGrid(Biome.Desert, 0.1), new Rng(3));
    for (let i = 0; i < 40; i++) f.update();
    // Densité totale négligeable : le désert ne verdit pas sans eau.
    expect(totalDensity(f)).toBeLessThan(f.density.length * 0.02);
  });

  it("a rained-on desert eventually supports vegetation (weather → ecology)", () => {
    const dry = biomeGrid(Biome.Grassland, 0.12);
    const f = new FloraSystem(dry, new Rng(5));
    for (let i = 0; i < 20; i++) f.update();
    const barren = totalDensity(f);
    // Il « pleut » : on relève l'humidité au-dessus du seuil.
    dry.moisture.fill(0.6);
    for (let i = 0; i < 40; i++) f.update();
    expect(totalDensity(f)).toBeGreaterThan(barren + 1);
  });

  it("nothing grows in winter (seasonal growth = 0)", () => {
    const g = biomeGrid(Biome.Grassland, 0.6);
    const f = new FloraSystem(g, new Rng(7));
    for (let i = 0; i < 10; i++) f.update(); // pousse un peu au printemps
    const spring = totalDensity(f);
    f.setSeason("winter");
    const after = totalDensity(f);
    for (let i = 0; i < 20; i++) f.update();
    // En hiver, pas de croissance : la densité ne monte pas au-dessus du printemps.
    expect(totalDensity(f)).toBeLessThanOrEqual(spring + 0.001);
    expect(after).toBeLessThanOrEqual(spring + 0.001);
  });

  it("serialize/restore round-trips exactly", () => {
    const f = new FloraSystem(biomeGrid(Biome.Grassland, 0.6), new Rng(9));
    for (let i = 0; i < 15; i++) f.update();
    const snap = f.serialize();

    const f2 = new FloraSystem(biomeGrid(Biome.Grassland, 0.6), new Rng(9));
    f2.restore(snap);
    for (let i = 0; i < 15; i++) {
      f.update();
      f2.update();
    }
    expect(Array.from(f2.density)).toEqual(Array.from(f.density));
  });
});
