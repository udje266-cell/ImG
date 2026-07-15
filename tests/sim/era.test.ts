import { describe, expect, it } from "vitest";
import { EventBus } from "../../src/core/events/EventBus";
import type { GameEvents } from "../../src/sim/events";
import { Era, ERA_COUNT, ERA_INFO, ERA_KNOWLEDGE, EraSystem } from "../../src/sim/society/EraSystem";
import { loadSimulation, serializeSimulation } from "../../src/sim/save/save";
import { Simulation } from "../../src/sim/world/Simulation";

describe("EraSystem — les huit âges de l'humanité (docs/GDD.md §7)", () => {
  it("commence à l'âge de pierre (tribu)", () => {
    const era = new EraSystem(new EventBus<GameEvents>());
    expect(era.era).toBe(Era.Stone);
    expect(era.info.name).toBe("Âge de Pierre");
    expect(era.info.politics).toBe("Tribu");
  });

  it("le Savoir accumulé fait franchir les huit paliers, en ordre, une seule fois chacun", () => {
    const bus = new EventBus<GameEvents>();
    const advances: number[] = [];
    bus.on("era:advanced", (e) => advances.push(e.era));
    const era = new EraSystem(bus);

    // Grosse civilisation entretenue longtemps → traverse tous les âges.
    for (let i = 0; i < 5000; i++) era.advance(80, 5, 3);

    expect(era.era).toBe(Era.Future);
    // Chaque ère au-delà de la première, annoncée une fois, dans l'ordre.
    expect(advances).toEqual([
      Era.Bronze,
      Era.Iron,
      Era.Medieval,
      Era.Renaissance,
      Era.Industrial,
      Era.Modern,
      Era.Future,
    ]);
  });

  it("expose une progression [0,1] vers l'ère suivante", () => {
    const era = new EraSystem(new EventBus<GameEvents>());
    expect(era.progress).toBe(0);
    // À mi-chemin du palier Bronze (250 / 500 de Savoir).
    era.advance(ERA_KNOWLEDGE[Era.Bronze]! / 2 / 0.06, 0, 0);
    expect(era.progress).toBeGreaterThan(0.3);
    expect(era.progress).toBeLessThan(0.7);
    expect(era.era).toBe(Era.Stone); // pas encore franchi
  });

  it("le Futur est la dernière ère — progression plafonnée à 1", () => {
    const era = new EraSystem(new EventBus<GameEvents>());
    for (let i = 0; i < 20000; i++) era.advance(100, 8, 5);
    expect(era.era).toBe(Era.Future);
    expect(era.progress).toBe(1);
    // Ne dépasse jamais le futur.
    for (let i = 0; i < 100; i++) era.advance(100, 8, 5);
    expect(era.era).toBe(Era.Future);
  });

  it("est déterministe et se sérialise", () => {
    const a = new EraSystem(new EventBus<GameEvents>());
    for (let i = 0; i < 50; i++) a.advance(40, 3, 1);
    const b = new EraSystem(new EventBus<GameEvents>());
    b.restore(a.serialize());
    expect(b.serialize()).toEqual(a.serialize());
    expect(b.era).toBe(a.era);
  });

  it("il y a huit ères, chacune avec un nom, une politique et une icône", () => {
    expect(ERA_COUNT).toBe(8);
    expect(ERA_INFO).toHaveLength(8);
    for (const info of ERA_INFO) {
      expect(info.name.length).toBeGreaterThan(0);
      expect(info.politics.length).toBeGreaterThan(0);
      expect(info.icon.length).toBeGreaterThan(0);
    }
    // Ordre historique attendu.
    expect(ERA_INFO.map((i) => i.name)).toEqual([
      "Âge de Pierre",
      "Âge du Bronze",
      "Âge du Fer",
      "Moyen Âge",
      "Renaissance",
      "Révolution Industrielle",
      "Époque Moderne",
      "Futur",
    ]);
  });

  it("s'intègre à la Simulation : une civilisation prospère finit par évoluer", () => {
    const sim = new Simulation({ seed: 5, width: 48, height: 48 });
    sim.agents.populate(50);
    sim.foundSettlements();
    expect(sim.era.era).toBe(Era.Stone);

    const advances: string[] = [];
    sim.bus.on("era:advanced", (e) => advances.push(e.name));
    for (let i = 0; i < 6000; i++) {
      if (i % 200 === 0) sim.agents.bless(24, 24, 64, 1, 0);
      sim.step();
    }
    expect(sim.era.era).toBeGreaterThan(Era.Stone);
    expect(advances.length).toBeGreaterThan(0);
  });

  it("l'ère survit au cycle sauvegarde/chargement de la Simulation", () => {
    const sim = new Simulation({ seed: 5, width: 48, height: 48 });
    sim.era.restore({ knowledge: 8000, era: Era.Renaissance });
    const reloaded = loadSimulation(JSON.parse(JSON.stringify(serializeSimulation(sim))));
    expect(reloaded.era.era).toBe(Era.Renaissance);
    expect(reloaded.era.knowledge).toBe(8000);
  });
});
