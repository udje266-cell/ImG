import { describe, expect, it } from "vitest";
import { MAX_POPULATION } from "../../src/sim/agents/AgentSystem";
import { loadSimulation, serializeSimulation, type SaveDataV6 } from "../../src/sim/save/save";
import { SETTLEMENT_INTERVAL, Simulation } from "../../src/sim/world/Simulation";

/** Monde peuplé avec villages fondés (comme au boot du jeu). */
function livingSim(seed = 5, pop = 40): Simulation {
  const sim = new Simulation({ seed, width: 48, height: 48 });
  sim.agents.populate(pop);
  sim.foundSettlements();
  return sim;
}

describe("Vie de village — naissances (docs/GDD.md §4)", () => {
  it("des enfants naissent quand les habitants prospèrent (population croît)", () => {
    const sim = livingSim(5, 40);
    // Prospérité entretenue artificiellement : on bénit tout le monde
    // régulièrement (faim/fatigue effacées) pour isoler la mécanique de naissance.
    const before = sim.agents.count;
    for (let i = 0; i < 3000; i++) {
      if (i % 100 === 0) sim.agents.bless(24, 24, 64, 1, 0);
      sim.step();
    }
    expect(sim.agents.count).toBeGreaterThan(before);
  });

  it("la population reste bornée par MAX_POPULATION", () => {
    const sim = livingSim(9, 60);
    for (let i = 0; i < 5000; i++) {
      if (i % 50 === 0) sim.agents.bless(24, 24, 64, 1, 0);
      sim.step();
    }
    expect(sim.agents.count).toBeLessThanOrEqual(MAX_POPULATION);
  });

  it("les naissances sont déterministes pour une même seed", () => {
    const run = (): number => {
      const sim = livingSim(21, 30);
      for (let i = 0; i < 1500; i++) {
        if (i % 100 === 0) sim.agents.bless(24, 24, 64, 1, 0);
        sim.step();
      }
      return sim.agents.count;
    };
    expect(run()).toBe(run());
  });
});

describe("Vie de village — champs et expansion", () => {
  it("chaque village fondé possède des champs, posés sur la terre ferme", () => {
    const sim = livingSim(5, 40);
    expect(sim.settlements.fields.length).toBeGreaterThan(0);
    for (const f of sim.settlements.fields) {
      expect(sim.terrain.isWater(Math.floor(f.x), Math.floor(f.y))).toBe(false);
    }
  });

  it("les champs sont semés fertiles (nourriture proche du village)", () => {
    const sim = livingSim(5, 40);
    for (const f of sim.settlements.fields) {
      expect(sim.flora.densityAt(Math.floor(f.x), Math.floor(f.y))).toBeGreaterThanOrEqual(0.5);
    }
  });

  it("l'expansion bâtit de nouvelles huttes quand la population grandit", () => {
    const sim = livingSim(13, 24);
    const hutsBefore = sim.settlements.dwellings.length;
    // Simule une forte croissance : naissances directes au premier village.
    const v = sim.settlements.villages[0]!;
    for (let k = 0; k < 40; k++) sim.agents.spawn(v.x, v.y);
    const changed = sim.settlements.expand(sim.agents);
    expect(changed).toBe(true);
    expect(sim.settlements.dwellings.length).toBeGreaterThan(hutsBefore);
  });

  it("l'expansion périodique tourne dans la Simulation et émet l'événement", () => {
    const sim = livingSim(13, 24);
    let updates = 0;
    sim.bus.on("settlements:updated", () => updates++);
    const v = sim.settlements.villages[0]!;
    for (let k = 0; k < 40; k++) sim.agents.spawn(v.x, v.y);
    for (let i = 0; i <= SETTLEMENT_INTERVAL; i++) sim.step();
    expect(updates).toBeGreaterThan(0);
  });
});

describe("Vie de village — sauvegarde", () => {
  it("v7 : huttes par village et champs survivent au cycle save/load", () => {
    const sim = livingSim(5, 40);
    const reloaded = loadSimulation(JSON.parse(JSON.stringify(serializeSimulation(sim))));
    expect(reloaded.settlements.serialize()).toEqual(sim.settlements.serialize());
    expect(reloaded.settlements.fields.length).toBe(sim.settlements.fields.length);
  });

  it("migration v6 → v7 : une sauvegarde sans vie de village se charge (huttes estimées)", () => {
    const sim = livingSim(5, 40);
    const v7 = serializeSimulation(sim);
    // Fabrique une v6 : retire vhuts/fx/fy comme avant la vie de village.
    const { vhuts: _vh, fx: _fx, fy: _fy, ...v6Settlements } = v7.settlements;
    const v6 = { ...v7, version: 6, settlements: v6Settlements } as unknown as SaveDataV6;

    const reloaded = loadSimulation(JSON.parse(JSON.stringify(v6)));
    expect(reloaded.settlements.villages.length).toBe(sim.settlements.villages.length);
    // Huttes estimées depuis la population ; aucun champ (ils seront resemés).
    for (const v of reloaded.settlements.villages) expect(v.huts).toBeGreaterThan(0);
    expect(reloaded.settlements.fields.length).toBe(0);
  });
});
