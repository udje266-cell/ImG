import { describe, expect, it } from "vitest";
import { EventBus } from "../../src/core/events/EventBus";
import type { GameEvents } from "../../src/sim/events";
import { SHIP_MIN_ERA, SHIP_MIN_POP, VoyageSystem } from "../../src/sim/society/VoyageSystem";
import { loadSimulation, serializeSimulation } from "../../src/sim/save/save";
import { sailToNextIsland, Simulation } from "../../src/sim/world/Simulation";

describe("VoyageSystem — voyage vers d'autres îles (inspiration Godus)", () => {
  it("le navire ne se bâtit pas tant que la civilisation n'est pas développée", () => {
    const v = new VoyageSystem(new EventBus<GameEvents>());
    v.update(10, SHIP_MIN_ERA, 100); // trop peu de monde
    expect(v.shipProgress).toBe(0);
    v.update(SHIP_MIN_POP + 20, 0, 100); // pas encore l'âge du fer
    expect(v.shipProgress).toBe(0);
  });

  it("une civilisation avancée bâtit le navire jusqu'à ce qu'il soit prêt", () => {
    const bus = new EventBus<GameEvents>();
    let ready = 0;
    bus.on("voyage:shipReady", () => ready++);
    const v = new VoyageSystem(bus);
    for (let i = 0; i < 500 && !v.shipReady; i++) v.update(SHIP_MIN_POP + 30, SHIP_MIN_ERA, 400);
    expect(v.shipReady).toBe(true);
    expect(v.shipProgress).toBe(1);
    expect(ready).toBe(1); // annoncé une seule fois
    // Plus aucune progression au-delà.
    v.update(200, 7, 1000);
    expect(v.shipProgress).toBe(1);
  });

  it("arriver sur une nouvelle île incrémente l'index et remet le navire à zéro", () => {
    const v = new VoyageSystem(new EventBus<GameEvents>());
    for (let i = 0; i < 500 && !v.shipReady; i++) v.update(80, 3, 300);
    expect(v.shipReady).toBe(true);
    v.arrive(1);
    expect(v.island).toBe(1);
    expect(v.shipProgress).toBe(0);
    expect(v.shipReady).toBe(false);
  });

  it("sailToNextIsland : nouveau monde, mais la progression est conservée", () => {
    const sim = new Simulation({ seed: 123, width: 48, height: 48 });
    sim.progression.addDevotion(5000); // pouvoirs débloqués
    sim.era.restore({ knowledge: 3000, era: 3 }); // Moyen Âge
    sim.faith.current = 900;
    const unlockedBefore = sim.progression.unlockedPowers().length;

    const next = sailToNextIsland(sim);
    expect(next.voyage.island).toBe(1);
    expect(next.worldConfig.seed).not.toBe(sim.worldConfig.seed); // île différente
    expect(next.progression.devotion).toBe(sim.progression.devotion); // savoir divin gardé
    expect(next.progression.unlockedPowers().length).toBe(unlockedBefore);
    expect(next.era.era).toBe(3); // la civilisation garde son âge
    expect(next.agents.count).toBeGreaterThanOrEqual(2); // les colons ont débarqué
    expect(next.faith.current).toBeCloseTo(900, 5);
  });

  it("le voyage survit à la sauvegarde/chargement (save v12)", () => {
    const sim = new Simulation({ seed: 5, width: 48, height: 48 });
    sim.voyage.restore({ island: 2, shipProgress: 0.5, shipReady: false });
    const reloaded = loadSimulation(JSON.parse(JSON.stringify(serializeSimulation(sim))));
    expect(reloaded.voyage.island).toBe(2);
    expect(reloaded.voyage.shipProgress).toBeCloseTo(0.5, 10);
  });

  it("s'intègre à la Simulation : un monde prospère finit par armer un navire", () => {
    const sim = new Simulation({ seed: 8, width: 48, height: 48 });
    sim.agents.populate(60);
    sim.foundSettlements();
    sim.era.restore({ knowledge: 6000, era: 3 });
    for (let i = 0; i < 8000 && !sim.voyage.shipReady; i++) {
      if (i % 200 === 0) sim.agents.bless(24, 24, 64, 1, 0);
      sim.step();
    }
    expect(sim.voyage.shipProgress).toBeGreaterThan(0);
  });
});
