import { describe, expect, it } from "vitest";
import { HERBIVORE } from "../../src/sim/ecology/FaunaSystem";
import type { PowerId } from "../../src/sim/powers/Power";
import { Simulation } from "../../src/sim/world/Simulation";

/** Simulation tout débloqué, Foi illimitée. */
function godSim(): Simulation {
  const sim = new Simulation({ seed: 42, width: 64, height: 64 });
  sim.progression.addDevotion(10000); // franchit tous les seuils (deluge: 1100)
  sim.faith.add(1_000_000);
  return sim;
}

function cast(sim: Simulation, power: PowerId, x: number, y: number, radius: number): void {
  sim.bus.emit("intent:invokePower", { power, x, y, radius } as never);
  sim.step();
}

describe("Pouvoirs bibliques — école des Fléaux (Exode 7-12, Genèse 7)", () => {
  it("Nuée de Sauterelles : toute végétation du disque est dévorée", () => {
    const sim = godSim();
    sim.flora.setDensity(30, 30, 0.9);
    sim.flora.setDensity(32, 32, 0.7);
    cast(sim, "locusts", 31, 31, 6);
    expect(sim.flora.densityAt(30, 30)).toBe(0);
    expect(sim.flora.densityAt(32, 32)).toBe(0);
  });

  it("Peste du Bétail : la faune du disque périt", () => {
    const sim = godSim();
    for (let k = 0; k < 8; k++) sim.fauna.spawn(HERBIVORE, 30 + k * 0.3, 30);
    const before = sim.fauna.count;
    cast(sim, "livestockPlague", 31, 30, 6);
    expect(sim.fauna.count).toBeLessThan(before);
  });

  it("Grêle de Feu : flore brûlée, faune décimée, terre criblée", () => {
    const sim = godSim();
    sim.flora.setDensity(20, 20, 0.8);
    for (let k = 0; k < 6; k++) sim.fauna.spawn(HERBIVORE, 20 + k * 0.2, 20);
    const faunaBefore = sim.fauna.count;
    const heights = sim.terrain.heightMap.slice();
    cast(sim, "fireHail", 20, 20, 6);
    expect(sim.flora.densityAt(20, 20)).toBe(0);
    expect(sim.fauna.count).toBeLessThan(faunaBefore);
    expect(sim.terrain.heightMap).not.toEqual(heights); // impacts de grêlons
  });

  it("Ténèbres : la ferveur s'effondre — le revenu de Foi chute", () => {
    const sim = godSim();
    for (let k = 0; k < 10; k++) sim.agents.spawn(32 + k * 0.1, 32);
    const before = sim.agents.faithIncome();
    cast(sim, "darkness", 32, 32, 8);
    // La terreur (-0.6) l'emporte largement sur la ferveur de témoin (+0.35).
    expect(sim.agents.faithIncome()).toBeLessThan(before);
  });

  it("Déluge : les nuages saturent et le sol s'engorge sur une vaste zone", () => {
    const sim = godSim();
    const moistureBefore = sim.terrain.moisture.reduce((a, b) => a + b, 0);
    const cloudBefore = sim.weather.cloud.reduce((a, b) => a + b, 0);
    cast(sim, "deluge", 32, 32, 10);
    expect(sim.terrain.moisture.reduce((a, b) => a + b, 0)).toBeGreaterThan(moistureBefore);
    expect(sim.weather.cloud.reduce((a, b) => a + b, 0)).toBeGreaterThan(cloudBefore);
  });
});

describe("Pouvoirs bibliques — Grâces et Mystères", () => {
  it("Manne Céleste : la faim des habitants est effacée (Exode 16)", () => {
    const sim = godSim();
    for (let k = 0; k < 8; k++) sim.agents.spawn(32 + k * 0.2, 32);
    // Affame tout le monde puis fait tomber la manne.
    for (let i = 0; i < 500; i++) sim.agents.update(i);
    cast(sim, "manna", 32, 32, 8);
    // Rassasiés → prospères : le revenu de Foi remonte aussi (gratitude).
    expect(sim.agents.faithIncome()).toBeGreaterThan(0);
  });

  it("Buisson Ardent : la ferveur s'embrase (Exode 3)", () => {
    const sim = godSim();
    for (let k = 0; k < 8; k++) sim.agents.spawn(32 + k * 0.2, 32);
    const before = sim.agents.faithIncome();
    cast(sim, "burningBush", 32, 32, 4);
    expect(sim.agents.faithIncome()).toBeGreaterThan(before * 1.3);
  });

  it("les Fléaux nourrissent le culte de la Crainte (religions)", () => {
    const sim = godSim();
    sim.agents.populate(50);
    sim.foundSettlements();
    const v = sim.settlements.villages[0]!;
    cast(sim, "locusts", Math.round(v.x), Math.round(v.y), 6);
    cast(sim, "darkness", Math.round(v.x), Math.round(v.y), 6);
    expect(sim.religion.doctrineOf(0)).toBe("Crainte");
  });
});
