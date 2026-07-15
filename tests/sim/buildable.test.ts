import { describe, expect, it } from "vitest";
import { Rng } from "../../src/core/math/Rng";
import { EventBus } from "../../src/core/events/EventBus";
import type { GameEvents } from "../../src/sim/events";
import { AgentSystem } from "../../src/sim/agents/AgentSystem";
import { FloraSystem } from "../../src/sim/ecology/FloraSystem";
import { TerrainGrid, BUILDABLE_MAX_SLOPE } from "../../src/sim/terrain/TerrainGrid";
import { Biome } from "../../src/sim/worldgen/biomes";
import { SettlementSystem } from "../../src/sim/society/SettlementSystem";

/** Terrain « en damier » : chaque tuile diffère de ses voisines → tout est pentu. */
function ruggedGrid(): TerrainGrid {
  const g = new TerrainGrid(48, 48, 0.5);
  for (let y = 0; y < 48; y++)
    for (let x = 0; x < 48; x++) {
      g.heightMap[g.index(x, y)] = 0.6 + ((x + y) % 2) * 0.03; // pente 0.03 > seuil partout
    }
  g.baseTemperature.fill(0.6);
  g.moisture.fill(0.6);
  g.baselineMoisture.fill(0.6);
  g.biomes.fill(Biome.Grassland);
  return g;
}

/** Aplanit un carré de tuiles à une hauteur constante (comme le pouvoir « Aplanir »). */
function flatten(g: TerrainGrid, x0: number, y0: number, size: number, h = 0.6): void {
  for (let dy = 0; dy < size; dy++) for (let dx = 0; dx < size; dx++) g.setHeight(x0 + dx, y0 + dy, h);
}

function agentsAt(g: TerrainGrid, cx: number, cy: number, n: number): AgentSystem {
  const rng = new Rng(1);
  const agents = new AgentSystem(g, new FloraSystem(g, rng), rng, new EventBus<GameEvents>());
  for (let i = 0; i < n; i++) agents.spawn(cx + (i % 4) * 0.3, cy + Math.floor(i / 4) * 0.3);
  return agents;
}

describe("Terrain constructible — cœur Godus (bâtir sur du plat)", () => {
  it("isBuildable : plat oui, eau non, pentu non", () => {
    const g = new TerrainGrid(16, 16, 0.5);
    g.heightMap.fill(0.6); // parfaitement plat
    expect(g.isBuildable(8, 8)).toBe(true);

    g.setHeight(3, 3, 0.3); // sous le niveau de la mer
    expect(g.isBuildable(3, 3)).toBe(false); // eau

    g.setHeight(10, 10, 0.6 + BUILDABLE_MAX_SLOPE * 3); // marche abrupte
    expect(g.slopeAt(10, 10)).toBeGreaterThan(BUILDABLE_MAX_SLOPE);
    expect(g.isBuildable(10, 10)).toBe(false); // trop pentu
  });

  it("sur un terrain entièrement accidenté, aucun village ne se fonde", () => {
    const g = ruggedGrid();
    const agents = agentsAt(g, 22, 22, 12);
    const settlements = new SettlementSystem(g, new Rng(2));
    settlements.found(agents);
    expect(settlements.villages.length).toBe(0); // rien de plat → rien à bâtir
  });

  it("aplanir un plateau ouvre un terrain : le village peut alors se fonder", () => {
    const g = ruggedGrid();
    flatten(g, 20, 20, 6); // la divinité aplanit un carré 6×6
    const agents = agentsAt(g, 22, 22, 12);
    const settlements = new SettlementSystem(g, new Rng(2));
    settlements.found(agents);

    expect(settlements.villages.length).toBeGreaterThan(0);
    // Le village et toutes ses huttes sont sur des tuiles constructibles (plates).
    for (const v of settlements.villages) {
      expect(g.isBuildable(Math.floor(v.x), Math.floor(v.y))).toBe(true);
    }
    for (const d of settlements.dwellings) {
      expect(g.isBuildable(Math.floor(d.x), Math.floor(d.y))).toBe(true);
    }
  });

  it("un village bloqué s'agrandit après qu'on lui a aplani plus de terrain", () => {
    const g = ruggedGrid();
    flatten(g, 20, 20, 6);
    const agents = agentsAt(g, 22, 22, 40); // grosse population, avide de logements
    const settlements = new SettlementSystem(g, new Rng(2));
    settlements.found(agents);
    const hutsBefore = settlements.dwellings.length;

    // La divinité aplanit une seconde esplanade juste à côté.
    flatten(g, 26, 20, 6);
    settlements.expand(agents);
    expect(settlements.dwellings.length).toBeGreaterThanOrEqual(hutsBefore);
    for (const d of settlements.dwellings) {
      expect(g.isBuildable(Math.floor(d.x), Math.floor(d.y))).toBe(true);
    }
  });
});
