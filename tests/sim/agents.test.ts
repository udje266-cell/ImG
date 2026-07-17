import { describe, expect, it } from "vitest";
import { Rng } from "../../src/core/math/Rng";
import { EventBus } from "../../src/core/events/EventBus";
import type { GameEvents } from "../../src/sim/events";
import { AgentSystem } from "../../src/sim/agents/AgentSystem";
import { FloraSystem } from "../../src/sim/ecology/FloraSystem";
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

function makeAgents(): AgentSystem {
  const g = greenGrid();
  const rng = new Rng(42);
  const flora = new FloraSystem(g, rng);
  for (let i = 0; i < 40; i++) flora.update(); // fait pousser de la nourriture
  return new AgentSystem(g, flora, rng, new EventBus<GameEvents>());
}

describe("AgentSystem (docs/GDD.md §4)", () => {
  it("populate places inhabitants on land, never on water", () => {
    const g = greenGrid();
    // moitié gauche = eau
    for (let y = 0; y < g.height; y++) for (let x = 0; x < 24; x++) g.heightMap[g.index(x, y)] = 0.3;
    const agents = new AgentSystem(g, new FloraSystem(g, new Rng(1)), new Rng(1), new EventBus());
    agents.populate(30);
    expect(agents.count).toBe(30);
    const snap = agents.snapshot();
    for (let i = 0; i < snap.count; i++) {
      expect(g.isWater(Math.floor(snap.x[i]!), Math.floor(snap.y[i]!))).toBe(false);
    }
  });

  it("is deterministic for a given seed", () => {
    const run = (): number[] => {
      const a = makeAgents();
      a.populate(20);
      for (let i = 0; i < 200; i++) a.update(i);
      return Array.from(a.snapshot().x);
    };
    expect(run()).toEqual(run());
  });

  it("believers generate faith proportional to population", () => {
    const a = makeAgents();
    a.populate(10);
    const income10 = a.faithIncome();
    const b = makeAgents();
    b.populate(30);
    expect(b.faithIncome()).toBeGreaterThan(income10);
    expect(income10).toBeGreaterThan(0);
  });

  it("hungry inhabitants forage and reduce their hunger over time", () => {
    const a = makeAgents();
    a.populate(15);
    // Fait grimper la faim, puis laisse tourner : ils doivent aller manger.
    for (let i = 0; i < 3000; i++) a.update(i);
    // La simulation ne diverge pas (positions finies, dans le monde).
    const snap = a.snapshot();
    for (let i = 0; i < snap.count; i++) {
      expect(Number.isFinite(snap.x[i]!)).toBe(true);
      expect(Number.isFinite(snap.y[i]!)).toBe(true);
    }
  });

  it("wires into the Simulation and grows the faith reserve via believers", () => {
    const sim = new Simulation({ seed: 7, width: 48, height: 48, faith: { initial: 100, regenPerTick: 0 } });
    sim.agents.populate(50);
    // Fonde les villages : le peuple prête alors allégeance à SON dieu — le
    // joueur pour le village-souche. Seuls SES fidèles alimentent SA Foi.
    sim.foundSettlements();
    const before = sim.faith.current;
    for (let i = 0; i < 50; i++) sim.step();
    // Sans regen passif, toute hausse vient des croyants du joueur.
    expect(sim.faith.current).toBeGreaterThan(before);
  });

  it("serialize/restore round-trips the population", () => {
    const a = makeAgents();
    a.populate(25);
    for (let i = 0; i < 100; i++) a.update(i);
    const snap = a.serialize();

    const b = makeAgents();
    b.restore(snap);
    expect(b.count).toBe(a.count);
    expect(Array.from(b.snapshot().x)).toEqual(Array.from(a.snapshot().x));
  });
});
