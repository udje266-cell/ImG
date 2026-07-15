import { describe, expect, it } from "vitest";
import {
  FIRST_VILLAGE_POPULATION,
  SETTLEMENT_INTERVAL,
  Simulation,
} from "../../src/sim/world/Simulation";

describe("Genèse — les Deux Premiers (un homme et une femme)", () => {
  it("le monde commence avec exactement deux habitants, côte à côte, sur la terre ferme", () => {
    const sim = new Simulation({ seed: 7, width: 64, height: 64 });
    sim.genesis();
    expect(sim.agents.count).toBe(2);
    const snap = sim.agents.snapshot();
    for (let i = 0; i < 2; i++) {
      expect(sim.terrain.isWater(Math.floor(snap.x[i]!), Math.floor(snap.y[i]!))).toBe(false);
    }
    // Côte à côte : une tuile d'écart.
    expect(Math.hypot(snap.x[0]! - snap.x[1]!, snap.y[0]! - snap.y[1]!)).toBeLessThanOrEqual(1.5);
  });

  it("aucun village au commencement — le peuple erre", () => {
    const sim = new Simulation({ seed: 7, width: 64, height: 64 });
    sim.genesis();
    for (let i = 0; i <= SETTLEMENT_INTERVAL; i++) sim.step();
    expect(sim.settlements.villages.length).toBe(0);
  });

  it("quand la lignée atteint le seuil, le premier village se fonde (événement émis)", () => {
    const sim = new Simulation({ seed: 7, width: 64, height: 64 });
    sim.genesis();
    let founded = 0;
    sim.bus.on("settlements:founded", () => founded++);

    // Simule la descendance : naissances directes au campement des Premiers.
    const snap = sim.agents.snapshot();
    while (sim.agents.count < FIRST_VILLAGE_POPULATION) {
      sim.agents.spawn(snap.x[0]!, snap.y[0]!);
    }
    for (let i = 0; i <= SETTLEMENT_INTERVAL; i++) sim.step();

    expect(founded).toBe(1);
    expect(sim.settlements.villages.length).toBeGreaterThan(0);
    expect(sim.settlements.dwellings.length).toBeGreaterThan(0); // les huttes s'élèvent
  });

  it("la fondation ne se produit qu'une fois (pas de re-fondation qui déplacerait les foyers)", () => {
    const sim = new Simulation({ seed: 7, width: 64, height: 64 });
    sim.genesis();
    let founded = 0;
    sim.bus.on("settlements:founded", () => founded++);
    const snap = sim.agents.snapshot();
    for (let k = 0; k < 20; k++) sim.agents.spawn(snap.x[0]!, snap.y[0]!);
    for (let i = 0; i <= SETTLEMENT_INTERVAL * 3; i++) sim.step();
    expect(founded).toBe(1);
  });

  it("est déterministe : même seed → mêmes Premiers", () => {
    const run = (): number[] => {
      const sim = new Simulation({ seed: 21, width: 64, height: 64 });
      sim.genesis();
      const s = sim.agents.snapshot();
      return [s.x[0]!, s.y[0]!, s.x[1]!, s.y[1]!];
    };
    expect(run()).toEqual(run());
  });
});
