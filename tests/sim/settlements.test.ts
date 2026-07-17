import { describe, expect, it } from "vitest";
import { Rng } from "../../src/core/math/Rng";
import { EventBus } from "../../src/core/events/EventBus";
import { AgentSystem } from "../../src/sim/agents/AgentSystem";
import { FloraSystem } from "../../src/sim/ecology/FloraSystem";
import { SettlementSystem } from "../../src/sim/society/SettlementSystem";
import { TerrainGrid } from "../../src/sim/terrain/TerrainGrid";
import { Biome } from "../../src/sim/worldgen/biomes";
import { Simulation } from "../../src/sim/world/Simulation";
import { serializeSimulation, loadSimulation } from "../../src/sim/save/save";

function landGrid(): TerrainGrid {
  const g = new TerrainGrid(48, 48, 0.5);
  g.heightMap.fill(0.6);
  g.baseTemperature.fill(0.6);
  g.moisture.fill(0.6);
  g.baselineMoisture.fill(0.6);
  g.biomes.fill(Biome.Grassland);
  return g;
}

function makeFounded(seed = 7, pop = 60): {
  terrain: TerrainGrid;
  agents: AgentSystem;
  settlements: SettlementSystem;
} {
  const terrain = landGrid();
  const rng = new Rng(seed);
  const flora = new FloraSystem(terrain, rng);
  const agents = new AgentSystem(terrain, flora, rng, new EventBus());
  agents.populate(pop);
  const settlements = new SettlementSystem(terrain, rng);
  settlements.found(agents);
  return { terrain, agents, settlements };
}

describe("SettlementSystem (docs/GDD.md §4 « Sociétés »)", () => {
  it("founds a bounded number of villages scaled to population", () => {
    const { settlements } = makeFounded(7, 60);
    expect(settlements.villages.length).toBeGreaterThanOrEqual(1);
    expect(settlements.villages.length).toBeLessThanOrEqual(8);
    // ~60 habitants / 12 ≈ 5 villages.
    expect(settlements.villages.length).toBeGreaterThanOrEqual(3);
  });

  it("places every village and dwelling on land, never on water", () => {
    const terrain = landGrid();
    // moitié gauche = océan
    for (let y = 0; y < terrain.height; y++)
      for (let x = 0; x < 24; x++) terrain.heightMap[terrain.index(x, y)] = 0.3;
    const rng = new Rng(3);
    const agents = new AgentSystem(terrain, new FloraSystem(terrain, rng), rng, new EventBus());
    agents.populate(50);
    const settlements = new SettlementSystem(terrain, rng);
    settlements.found(agents);

    for (const v of settlements.villages) {
      expect(terrain.isWater(Math.floor(v.x), Math.floor(v.y))).toBe(false);
    }
    for (const d of settlements.dwellings) {
      expect(terrain.isWater(Math.floor(d.x), Math.floor(d.y))).toBe(false);
    }
    expect(settlements.dwellings.length).toBeGreaterThan(0);
  });

  it("étale le foyer de chaque habitant autour d'un village (pas empilés)", () => {
    const { agents, settlements } = makeFounded(11, 48);
    const homes = agents.serialize();
    // Chaque foyer est à proximité d'un centre de village (couronne d'habitat),
    // mais pas forcément pile dessus — les habitants ne se superposent plus.
    let exactlyOnCentre = 0;
    for (let i = 0; i < homes.homeX.length; i++) {
      let nearest = Infinity;
      for (const v of settlements.villages) {
        nearest = Math.min(nearest, Math.hypot(homes.homeX[i]! - v.x, homes.homeY[i]! - v.y));
      }
      expect(nearest).toBeLessThan(6); // dans la couronne du village
      if (nearest === 0) exactlyOnCentre++;
    }
    // La répartition en couronne fait que presque personne n'est pile au centre.
    expect(exactlyOnCentre).toBeLessThan(homes.homeX.length);
  });

  it("is deterministic for a given seed", () => {
    const a = makeFounded(21, 55).settlements.serialize();
    const b = makeFounded(21, 55).settlements.serialize();
    expect(b).toEqual(a);
  });

  it("handles an empty population without founding anything", () => {
    const terrain = landGrid();
    const rng = new Rng(1);
    const agents = new AgentSystem(terrain, new FloraSystem(terrain, rng), rng, new EventBus());
    const settlements = new SettlementSystem(terrain, rng);
    settlements.found(agents);
    expect(settlements.villages.length).toBe(0);
    expect(settlements.dwellings.length).toBe(0);
  });

  it("serialize/restore round-trips villages and dwellings", () => {
    const { terrain, settlements } = makeFounded(9, 44);
    const data = settlements.serialize();
    const restored = new SettlementSystem(terrain, new Rng(9));
    restored.restore(data);
    expect(restored.serialize()).toEqual(data);
  });

  it("attribue un lieu de travail : les habitants rassasiés vont travailler", () => {
    const { agents } = makeFounded(7, 60);
    // `found` a déjà attribué les lieux de travail. Les habitants naissent
    // rassasiés et reposés → sans besoin urgent, l'IA doit préférer « work ».
    // Un décide() par agent (staggeré modulo 20) : 40 ticks couvrent un cycle.
    for (let t = 0; t < 40; t++) agents.update(t);
    let working = 0;
    for (let i = 0; i < agents.count; i++) if (agents.profile(i).goal === "work") working++;
    // Sans famine ni fatigue extrême, une bonne part de la population travaille.
    expect(working).toBeGreaterThan(0);
  });

  it("les lieux de travail se ré-dérivent au chargement (non sérialisés)", () => {
    const sim = new Simulation({ seed: 5, width: 48, height: 48 });
    sim.agents.populate(40);
    sim.era.restore({ knowledge: 3000, era: 2 }); // Fer : métiers variés
    sim.foundSettlements();
    for (let i = 0; i < 60; i++) sim.step();
    const reloaded = loadSimulation(JSON.parse(JSON.stringify(serializeSimulation(sim))));
    // Après rechargement, l'IA « work » reste possible (ancres retrouvées).
    for (let t = 0; t < 40; t++) reloaded.agents.update(t);
    let working = 0;
    for (let i = 0; i < reloaded.agents.count; i++) {
      if (reloaded.agents.profile(i).goal === "work") working++;
    }
    expect(working).toBeGreaterThan(0);
  });

  it("donne le village-souche au joueur (faction 0) et les autres aux dieux-IA", () => {
    const { agents, settlements } = makeFounded(7, 60);
    expect(settlements.villages.length).toBeGreaterThan(1);
    settlements.villages.forEach((v, i) => expect(v.faction).toBe(i)); // 0 = joueur, ≥1 = IA
    // Chaque habitant est rattaché (plus aucun non-aligné après la fondation).
    let unaligned = 0;
    for (let i = 0; i < agents.count; i++) if (agents.allegianceOf(i) < 0) unaligned++;
    expect(unaligned).toBe(0);
    // Le joueur a des fidèles, mais pas toute la population (des dieux-IA règnent ailleurs).
    expect(agents.faithfulCount(0)).toBeGreaterThan(0);
    expect(agents.faithfulCount(0)).toBeLessThan(agents.count);
  });

  it("la Foi du joueur ne vient que de SES fidèles", () => {
    const { agents } = makeFounded(7, 60);
    const player = agents.faithIncomeFor(0);
    const everyone = agents.faithIncome();
    expect(player).toBeGreaterThan(0);
    expect(player).toBeLessThan(everyone); // les ouailles des dieux-IA n'y contribuent pas
  });

  it("une conversion survit à l'expansion (l'allégeance acquise n'est jamais récrite)", () => {
    const { agents, settlements } = makeFounded(7, 60);
    // Prend un fidèle d'un dieu-IA et convertis-le au joueur.
    let convert = -1;
    for (let i = 0; i < agents.count; i++) if (agents.allegianceOf(i) === 1) { convert = i; break; }
    expect(convert).toBeGreaterThanOrEqual(0);
    agents.setAllegiance(convert, 0);
    settlements.expand(agents); // réattribution des non-alignés uniquement
    expect(agents.allegianceOf(convert)).toBe(0); // la conversion tient
  });

  it("survives a full save/load cycle through the Simulation", () => {
    const sim = new Simulation({ seed: 5, width: 48, height: 48 });
    sim.agents.populate(40);
    sim.foundSettlements();
    const villagesBefore = sim.settlements.villages.length;
    const dwellingsBefore = sim.settlements.dwellings.length;
    expect(villagesBefore).toBeGreaterThan(0);

    const reloaded = loadSimulation(JSON.parse(JSON.stringify(serializeSimulation(sim))));
    expect(reloaded.settlements.villages.length).toBe(villagesBefore);
    expect(reloaded.settlements.dwellings.length).toBe(dwellingsBefore);
    expect(reloaded.settlements.serialize()).toEqual(sim.settlements.serialize());
  });
});
