import { describe, expect, it } from "vitest";
import { Rng } from "../../src/core/math/Rng";
import { EventBus } from "../../src/core/events/EventBus";
import type { GameEvents } from "../../src/sim/events";
import { AgentSystem } from "../../src/sim/agents/AgentSystem";
import { FloraSystem } from "../../src/sim/ecology/FloraSystem";
import { TerrainGrid } from "../../src/sim/terrain/TerrainGrid";
import { Biome } from "../../src/sim/worldgen/biomes";
import type { SettlementSystem } from "../../src/sim/society/SettlementSystem";
import { WarSystem } from "../../src/sim/society/WarSystem";

function greenGrid(): TerrainGrid {
  const g = new TerrainGrid(48, 48, 0.5);
  g.heightMap.fill(0.6);
  g.baseTemperature.fill(0.6);
  g.moisture.fill(0.6);
  g.baselineMoisture.fill(0.6);
  g.biomes.fill(Biome.Grassland);
  return g;
}

/** Deux villages voisins peuplés, prêts pour la guerre (ère du Fer → guerriers). */
function twoVillages(): { agents: AgentSystem; bus: EventBus<GameEvents>; war: WarSystem } {
  const g = greenGrid();
  const rng = new Rng(42);
  const bus = new EventBus<GameEvents>();
  const agents = new AgentSystem(g, new FloraSystem(g, rng), rng, bus);
  bus.emit("era:advanced", { era: 2, name: "Âge du Fer", politics: "Royaume" }); // débloque les guerriers
  for (let i = 0; i < 25; i++) agents.spawn(10 + (i % 5) * 0.4, 10 + Math.floor(i / 5) * 0.4);
  for (let i = 0; i < 25; i++) agents.spawn(28 + (i % 5) * 0.4, 10 + Math.floor(i / 5) * 0.4);

  const settlements = {
    villages: [
      { x: 10, y: 10, population: 25, huts: 0 },
      { x: 28, y: 10, population: 25, huts: 0 },
    ],
  } as unknown as SettlementSystem;

  const war = new WarSystem(settlements, agents, bus, rng);
  return { agents, bus, war };
}

describe("WarSystem — guerres entre villages (cahier des charges §5)", () => {
  it("la tension monte entre villages voisins", () => {
    const { war } = twoVillages();
    expect(war.tensionBetween(0, 1)).toBe(0);
    war.update();
    expect(war.tensionBetween(0, 1)).toBeGreaterThan(0);
  });

  it("quand la tension déborde, un raid éclate et fait des morts", () => {
    const { agents, bus, war } = twoVillages();
    let declared = 0;
    let raids = 0;
    let totalCasualties = 0;
    bus.on("war:declared", () => declared++);
    bus.on("war:raid", (e) => {
      raids++;
      totalCasualties += e.casualties;
    });

    const before = agents.count;
    for (let i = 0; i < 40; i++) war.update();

    expect(declared).toBeGreaterThan(0);
    expect(raids).toBeGreaterThan(0);
    expect(totalCasualties).toBeGreaterThan(0);
    expect(agents.count).toBeLessThan(before); // des habitants sont tombés
  });

  it("un raid endeuille et terrifie les survivants", () => {
    const { agents, war } = twoVillages();
    for (let i = 0; i < 40; i++) war.update();
    // Au moins un survivant proche d'un village porte le deuil ou la peur.
    let shaken = false;
    for (let i = 0; i < agents.count; i++) {
      const e = agents.profile(i).emotions;
      if (e.grief > 0 || e.fear > 0) {
        shaken = true;
        break;
      }
    }
    expect(shaken).toBe(true);
  });

  it("des villages éloignés ne se font pas la guerre", () => {
    const g = greenGrid();
    const rng = new Rng(7);
    const bus = new EventBus<GameEvents>();
    const agents = new AgentSystem(g, new FloraSystem(g, rng), rng, bus);
    for (let i = 0; i < 10; i++) agents.spawn(4 + (i % 3) * 0.3, 4);
    // Deux villages à ~60 tuiles : hors de portée mutuelle (RIVAL_RANGE = 40).
    const settlements = {
      villages: [
        { x: 4, y: 4, population: 10, huts: 0 },
        { x: 44, y: 44, population: 10, huts: 0 },
      ],
    } as unknown as SettlementSystem;
    const war = new WarSystem(settlements, agents, bus, rng);
    let raids = 0;
    bus.on("war:raid", () => raids++);
    for (let i = 0; i < 50; i++) war.update();
    expect(raids).toBe(0);
    expect(war.tensionBetween(0, 1)).toBe(0);
  });

  it("le culling recolle les liens de famille (pas d'index fantôme)", () => {
    const { agents, war } = twoVillages();
    for (let i = 0; i < 20; i++) war.update();
    // Après des morts, tout conjoint référencé doit exister et être réciproque.
    for (let i = 0; i < agents.count; i++) {
      const s = agents.profile(i).spouse;
      if (s >= 0) {
        expect(s).toBeLessThan(agents.count);
        expect(agents.profile(s).spouse).toBe(i); // lien réciproque intact
      }
    }
  });
});
