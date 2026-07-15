import { describe, expect, it } from "vitest";
import { EventBus } from "../../src/core/events/EventBus";
import type { GameEvents } from "../../src/sim/events";
import { Era, ERA_INFO, ERA_KNOWLEDGE, EraSystem } from "../../src/sim/society/EraSystem";
import { loadSimulation, serializeSimulation } from "../../src/sim/save/save";
import { Simulation } from "../../src/sim/world/Simulation";

describe("EraSystem — évolution technologique (docs/GDD.md §7)", () => {
  it("commence à l'âge primitif (clan)", () => {
    const era = new EraSystem(new EventBus<GameEvents>());
    expect(era.era).toBe(Era.Primitive);
    expect(era.info.name).toBe("Âge Primitif");
    expect(era.info.politics).toBe("Clan");
  });

  it("le Savoir accumulé fait franchir les paliers, en ordre, une seule fois chacun", () => {
    const bus = new EventBus<GameEvents>();
    const advances: number[] = [];
    bus.on("era:advanced", (e) => advances.push(e.era));
    const era = new EraSystem(bus);

    // Grosse civilisation : population + villages + temples → progression rapide.
    for (let i = 0; i < 400; i++) era.advance(80, 5, 3);

    expect(era.era).toBe(Era.Iron);
    expect(advances).toEqual([Era.Stone, Era.Bronze, Era.Iron]); // chaque ère annoncée une fois
  });

  it("expose une progression [0,1] vers l'ère suivante", () => {
    const era = new EraSystem(new EventBus<GameEvents>());
    expect(era.progress).toBe(0);
    // À mi-chemin du palier Pierre.
    era.advance(ERA_KNOWLEDGE[Era.Stone]! / 2 / 0.06, 0, 0);
    expect(era.progress).toBeGreaterThan(0.3);
    expect(era.progress).toBeLessThan(0.7);
  });

  it("l'âge du fer est le dernier — progression plafonnée à 1", () => {
    const era = new EraSystem(new EventBus<GameEvents>());
    for (let i = 0; i < 1000; i++) era.advance(100, 8, 5);
    expect(era.era).toBe(Era.Iron);
    expect(era.progress).toBe(1);
    // Ne dépasse jamais le fer.
    for (let i = 0; i < 100; i++) era.advance(100, 8, 5);
    expect(era.era).toBe(Era.Iron);
  });

  it("est déterministe et se sérialise (save v10)", () => {
    const a = new EraSystem(new EventBus<GameEvents>());
    for (let i = 0; i < 50; i++) a.advance(40, 3, 1);
    const b = new EraSystem(new EventBus<GameEvents>());
    b.restore(a.serialize());
    expect(b.serialize()).toEqual(a.serialize());
    expect(b.era).toBe(a.era);
  });

  it("chaque ère a un nom, une politique et une icône", () => {
    expect(ERA_INFO).toHaveLength(4);
    for (const info of ERA_INFO) {
      expect(info.name.length).toBeGreaterThan(0);
      expect(info.politics.length).toBeGreaterThan(0);
      expect(info.icon.length).toBeGreaterThan(0);
    }
  });

  it("s'intègre à la Simulation : une civilisation prospère finit par évoluer", () => {
    const sim = new Simulation({ seed: 5, width: 48, height: 48 });
    sim.agents.populate(50);
    sim.foundSettlements();
    expect(sim.era.era).toBe(Era.Primitive);

    const advances: string[] = [];
    sim.bus.on("era:advanced", (e) => advances.push(e.name));
    // Entretient une grosse population + bénit pour éviter les famines.
    for (let i = 0; i < 6000; i++) {
      if (i % 200 === 0) sim.agents.bless(24, 24, 64, 1, 0);
      sim.step();
    }
    expect(sim.era.era).toBeGreaterThan(Era.Primitive);
    expect(advances.length).toBeGreaterThan(0);
  });

  it("l'ère survit au cycle sauvegarde/chargement de la Simulation", () => {
    const sim = new Simulation({ seed: 5, width: 48, height: 48 });
    sim.era.restore({ knowledge: 2500, era: Era.Bronze });
    const reloaded = loadSimulation(JSON.parse(JSON.stringify(serializeSimulation(sim))));
    expect(reloaded.era.era).toBe(Era.Bronze);
    expect(reloaded.era.knowledge).toBe(2500);
  });
});
