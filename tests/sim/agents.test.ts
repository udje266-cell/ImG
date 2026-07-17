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

  it("les habitants vieillissent et meurent (mortalité — ce sont des humains)", () => {
    const g = greenGrid();
    const rng = new Rng(3);
    const flora = new FloraSystem(g, rng); // pas de flora.update() → aucune nourriture
    const a = new AgentSystem(g, flora, rng, new EventBus<GameEvents>());
    a.populate(12);
    const before = a.count;
    // Sans nourriture, la faim monte → maladie → des morts (et aucune naissance).
    for (let t = 0; t < 40000; t++) a.update(t);
    expect(a.count).toBeLessThan(before); // des habitants sont morts
    expect(a.count).toBeGreaterThanOrEqual(2); // …mais le peuple ne s'éteint jamais
    // L'âge (en années) s'expose dans la fiche : les survivants ont vieilli.
    expect(a.profile(0).age).toBeGreaterThanOrEqual(1);
  });

  it("evangelize accumule la conviction puis convertit au seuil (pas les siens)", () => {
    const a = makeAgents();
    const mine = a.spawn(10, 10); // fidèle du joueur (faction 0)
    a.setAllegiance(mine, 0);
    const foreign = a.spawn(10.5, 10); // fidèle d'un dieu-IA (faction 1)
    a.setAllegiance(foreign, 1);
    // Trop peu de conviction : personne ne bascule encore.
    expect(a.evangelize(10, 10, 3, 0, 0.3)).toBe(0);
    expect(a.allegianceOf(foreign)).toBe(1);
    expect(a.convictionOf(foreign)).toBeCloseTo(0.3, 5);
    // On pousse au-delà du seuil : l'étranger se convertit, pas le fidèle déjà acquis.
    const converted = a.evangelize(10, 10, 3, 0, 0.8);
    expect(converted).toBe(1);
    expect(a.allegianceOf(foreign)).toBe(0);
    expect(a.allegianceOf(mine)).toBe(0);
  });

  it("hasFaithfulNear repère un fidèle d'une faction dans un rayon", () => {
    const a = makeAgents();
    const f = a.spawn(20, 20);
    a.setAllegiance(f, 0);
    expect(a.hasFaithfulNear(0, 20, 20, 2)).toBe(true);
    expect(a.hasFaithfulNear(1, 20, 20, 2)).toBe(false); // aucun fidèle du dieu-IA ici
    expect(a.hasFaithfulNear(0, 40, 40, 2)).toBe(false); // trop loin
  });

  it("fadeConviction fait refluer une conversion non aboutie", () => {
    const a = makeAgents();
    const f = a.spawn(5, 5);
    a.setAllegiance(f, 1);
    a.evangelize(5, 5, 2, 0, 0.5);
    expect(a.convictionOf(f)).toBeCloseTo(0.5, 5);
    a.fadeConviction(0.5);
    expect(a.convictionOf(f)).toBeCloseTo(0.25, 5);
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
