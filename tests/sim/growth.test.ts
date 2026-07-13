import { describe, expect, it } from "vitest";
import { Rng } from "../../src/core/math/Rng";
import { FloraSystem } from "../../src/sim/ecology/FloraSystem";
import { GrowthPower } from "../../src/sim/powers/GrowthPower";
import { POWER_UNLOCK_THRESHOLDS } from "../../src/sim/powers/ProgressionSystem";
import { TerrainGrid } from "../../src/sim/terrain/TerrainGrid";
import { Biome } from "../../src/sim/worldgen/biomes";
import { Simulation } from "../../src/sim/world/Simulation";

function greenGrid(): TerrainGrid {
  const g = new TerrainGrid(48, 48, 0.5);
  g.heightMap.fill(0.6);
  g.baseTemperature.fill(0.6);
  g.moisture.fill(0.6);
  g.baselineMoisture.fill(0.6);
  g.biomes.fill(Biome.Grassland);
  return g;
}

function totalDensity(flora: FloraSystem): number {
  let sum = 0;
  for (let i = 0; i < flora.density.length; i++) sum += flora.density[i]!;
  return sum;
}

describe("FloraSystem.fertilize (pouvoir Verdoiement)", () => {
  it("raises vegetation inside the disc and leaves the rest untouched", () => {
    const flora = new FloraSystem(greenGrid(), new Rng(1));
    const before = flora.densityAt(24, 24);
    const outsideBefore = flora.densityAt(2, 2);
    const touched = flora.fertilize(24, 24, 6);
    expect(touched).toBeGreaterThan(0);
    expect(flora.densityAt(24, 24)).toBeGreaterThan(before);
    expect(flora.densityAt(2, 2)).toBe(outsideBefore); // hors du disque
  });

  it("never exceeds the tile capacity and never greens water", () => {
    const g = greenGrid();
    // creuse un lac au centre
    for (let y = 20; y < 28; y++) for (let x = 20; x < 28; x++) g.heightMap[g.index(x, y)] = 0.3;
    const flora = new FloraSystem(g, new Rng(2));
    flora.fertilize(24, 24, 10);
    for (let y = 20; y < 28; y++) {
      for (let x = 20; x < 28; x++) expect(flora.densityAt(x, y)).toBe(0); // sous l'eau : stérile
    }
    for (let i = 0; i < flora.density.length; i++) expect(flora.density[i]!).toBeLessThanOrEqual(1);
  });
});

describe("GrowthPower", () => {
  it("scales its faith cost with the radius", () => {
    const power = new GrowthPower();
    const sim = {} as Simulation;
    const small = power.cost(sim, { power: "growth", x: 0, y: 0, radius: 2 });
    const large = power.cost(sim, { power: "growth", x: 0, y: 0, radius: 10 });
    expect(large).toBeGreaterThan(small);
  });

  it("is locked until its devotion threshold, then greens the land when invoked", () => {
    const sim = new Simulation({ seed: 55, width: 64, height: 64 });
    expect(sim.progression.isUnlocked("growth")).toBe(false);

    // Verrouillé → rejeté, aucune Foi dépensée.
    const rejections: string[] = [];
    sim.bus.on("power:rejected", (e) => rejections.push(e.reason));
    sim.bus.emit("intent:invokePower", { power: "growth", x: 32, y: 32, radius: 6 });
    sim.step();
    expect(rejections).toContain("locked");

    // Accumule la dévotion via le terraforming jusqu'au seuil de Verdoiement.
    let guard = 0;
    while (sim.progression.devotion < POWER_UNLOCK_THRESHOLDS.growth) {
      if (++guard > 500) throw new Error("devotion never reached");
      sim.bus.emit("intent:invokePower", {
        power: "terraform", x: 32, y: 32, radius: 5, direction: guard % 2 === 0 ? 1 : -1,
      });
      sim.step();
    }
    expect(sim.progression.isUnlocked("growth")).toBe(true);

    // Une fois débloqué, l'invoquer fait grimper la végétation totale.
    const before = totalDensity(sim.flora);
    sim.faith.add(500);
    sim.bus.emit("intent:invokePower", { power: "growth", x: 32, y: 32, radius: 10 });
    sim.step();
    expect(totalDensity(sim.flora)).toBeGreaterThan(before);
  });
});
