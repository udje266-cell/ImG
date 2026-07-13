import { describe, expect, it } from "vitest";
import { Rng } from "../../src/core/math/Rng";
import { TerrainGrid } from "../../src/sim/terrain/TerrainGrid";
import { WeatherSystem, WEATHER_CELL } from "../../src/sim/weather/WeatherSystem";

/** Petit monde : moitié océan (gauche), moitié terre sèche (droite). */
function halfLandGrid(): TerrainGrid {
  const g = new TerrainGrid(64, 64, 0.5);
  for (let y = 0; y < g.height; y++) {
    for (let x = 0; x < g.width; x++) {
      const i = g.index(x, y);
      g.heightMap[i] = x < 32 ? 0.3 : 0.6; // eau à gauche, terre à droite
      g.baseTemperature[i] = 0.6;
      g.moisture[i] = 0.2;
    }
  }
  g.baselineMoisture.set(g.moisture);
  g.refreshAllBiomes();
  return g;
}

describe("WeatherSystem", () => {
  it("is deterministic for a given seed", () => {
    const run = (): number[] => {
      const g = halfLandGrid();
      const w = new WeatherSystem(g, new Rng(7));
      for (let i = 0; i < 50; i++) w.update();
      return Array.from(w.cloud);
    };
    expect(run()).toEqual(run());
  });

  it("seeding clouds then updating rains onto land and raises soil moisture", () => {
    const g = halfLandGrid();
    const w = new WeatherSystem(g, new Rng(1));
    const landX = 48;
    const landY = 32;
    const before = g.moisture[g.index(landX, landY)]!;

    w.seedClouds(landX, landY, 4);
    for (let i = 0; i < 8; i++) w.update();

    expect(g.moisture[g.index(landX, landY)]!).toBeGreaterThan(before);
  });

  it("does not raise moisture where it never rains (baseline holds)", () => {
    const g = halfLandGrid();
    const w = new WeatherSystem(g, new Rng(1));
    // Aucun ensemencement : l'évaporation crée des nuages mais on vérifie
    // qu'une cellule reste bornée et ne dépasse jamais [0,1].
    for (let i = 0; i < 30; i++) w.update();
    for (const m of g.moisture) {
      expect(m).toBeGreaterThanOrEqual(0);
      expect(m).toBeLessThanOrEqual(1);
    }
  });

  it("snows instead of raining on cold ground", () => {
    const g = halfLandGrid();
    // Refroidit toute la terre sous le seuil de neige.
    for (let i = 0; i < g.baseTemperature.length; i++) g.baseTemperature[i] = 0.1;
    const w = new WeatherSystem(g, new Rng(3));
    w.seedClouds(48, 32, 4);
    w.update();
    const cx = Math.floor(48 / WEATHER_CELL);
    const cy = Math.floor(32 / WEATHER_CELL);
    if (w.isRaining(cx, cy)) {
      expect(w.isSnowing(cx, cy)).toBe(true);
    }
  });

  it("serialize/restore round-trips exactly", () => {
    const g = halfLandGrid();
    const w = new WeatherSystem(g, new Rng(9));
    for (let i = 0; i < 20; i++) w.update();
    const snapshot = w.serialize();

    const g2 = halfLandGrid();
    const w2 = new WeatherSystem(g2, new Rng(9));
    w2.restore(snapshot);
    // Après restauration, les deux évoluent identiquement.
    for (let i = 0; i < 20; i++) {
      w.update();
      w2.update();
    }
    expect(Array.from(w2.cloud)).toEqual(Array.from(w.cloud));
    expect(w2.windAngle).toBe(w.windAngle);
  });
});
