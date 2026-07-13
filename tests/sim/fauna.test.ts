import { describe, expect, it } from "vitest";
import { Rng } from "../../src/core/math/Rng";
import { FaunaSystem, HERBIVORE, PREDATOR } from "../../src/sim/ecology/FaunaSystem";
import { FloraSystem } from "../../src/sim/ecology/FloraSystem";
import { TerrainGrid } from "../../src/sim/terrain/TerrainGrid";
import { Biome } from "../../src/sim/worldgen/biomes";

function greenGrid(): TerrainGrid {
  const g = new TerrainGrid(48, 48, 0.5);
  g.heightMap.fill(0.6);
  g.baseTemperature.fill(0.6);
  g.moisture.fill(0.7);
  g.baselineMoisture.fill(0.7);
  g.biomes.fill(Biome.Grassland);
  return g;
}

function lushFauna(seed = 4): { fauna: FaunaSystem; flora: FloraSystem } {
  const g = greenGrid();
  const rng = new Rng(seed);
  const flora = new FloraSystem(g, rng);
  for (let i = 0; i < 60; i++) flora.update(); // pâturage abondant
  return { fauna: new FaunaSystem(g, flora, rng), flora };
}

describe("FaunaSystem (docs/GDD.md §3.5)", () => {
  it("populate places animals on land, never on water", () => {
    const g = greenGrid();
    for (let y = 0; y < g.height; y++) for (let x = 0; x < 24; x++) g.heightMap[g.index(x, y)] = 0.3;
    const f = new FaunaSystem(g, new FloraSystem(g, new Rng(1)), new Rng(1));
    f.populate(20, 5);
    expect(f.count).toBe(25);
    const snap = f.snapshot();
    for (let i = 0; i < snap.count; i++) {
      expect(g.isWater(Math.floor(snap.x[i]!), Math.floor(snap.y[i]!))).toBe(false);
    }
  });

  it("is deterministic for a given seed", () => {
    const run = (): number[] => {
      const { fauna } = lushFauna();
      fauna.populate(30, 6);
      for (let i = 0; i < 300; i++) fauna.update(i);
      return Array.from(fauna.snapshot().x);
    };
    expect(run()).toEqual(run());
  });

  it("herbivores graze and reduce local flora density", () => {
    const { fauna, flora } = lushFauna();
    const total = (): number => flora.density.reduce((a, b) => a + b, 0);
    fauna.populate(60, 0);
    const before = total();
    for (let i = 0; i < 400; i++) fauna.update(i);
    expect(total()).toBeLessThan(before); // les troupeaux broutent
  });

  it("well-fed herbivores reproduce and grow the population", () => {
    const { fauna } = lushFauna();
    fauna.populate(20, 0);
    const start = fauna.counts().herbivores;
    for (let i = 0; i < 1500; i++) fauna.update(i);
    expect(fauna.counts().herbivores).toBeGreaterThan(start);
  });

  it("predators starve without prey and die out", () => {
    const { fauna } = lushFauna();
    fauna.populate(0, 20); // que des prédateurs, aucune proie
    for (let i = 0; i < 1500; i++) fauna.update(i);
    expect(fauna.counts().predators).toBeLessThan(20);
  });

  it("predators cull herbivores (predation removes prey)", () => {
    const { fauna } = lushFauna(9);
    fauna.populate(40, 25);
    const herbStart = fauna.counts().herbivores;
    let anyPredEvent = false;
    for (let i = 0; i < 2000; i++) {
      fauna.update(i);
      if (fauna.counts().herbivores < herbStart) anyPredEvent = true;
    }
    // À un moment, la population d'herbivores est descendue sous son départ
    // (prédation), preuve que la chaîne alimentaire fonctionne.
    expect(anyPredEvent).toBe(true);
  });

  it("population never exceeds the species caps", () => {
    const { fauna } = lushFauna();
    fauna.populate(60, 20);
    for (let i = 0; i < 2500; i++) fauna.update(i);
    expect(fauna.counts().herbivores).toBeLessThanOrEqual(500);
    expect(fauna.counts().predators).toBeLessThanOrEqual(90);
  });

  it("serialize/restore round-trips the fauna", () => {
    const { fauna } = lushFauna();
    fauna.populate(25, 8);
    for (let i = 0; i < 200; i++) fauna.update(i);
    const snap = fauna.serialize();

    const { fauna: f2 } = lushFauna();
    f2.restore(snap);
    expect(f2.count).toBe(fauna.count);
    expect(Array.from(f2.snapshot().x)).toEqual(Array.from(fauna.snapshot().x));
    expect(Array.from(f2.snapshot().species)).toEqual(Array.from(fauna.snapshot().species));
  });

  it("species codes are stable (herbivore=0, predator=1)", () => {
    expect(HERBIVORE).toBe(0);
    expect(PREDATOR).toBe(1);
  });
});
