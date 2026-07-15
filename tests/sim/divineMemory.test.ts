import { describe, expect, it } from "vitest";
import { EventBus } from "../../src/core/events/EventBus";
import { GameClock } from "../../src/core/time/GameClock";
import type { GameEvents } from "../../src/sim/events";
import { CHRONICLE_MAX, DivineMemory } from "../../src/sim/society/DivineMemory";
import { loadSimulation, serializeSimulation } from "../../src/sim/save/save";
import { Simulation } from "../../src/sim/world/Simulation";

function invoke(bus: EventBus<GameEvents>, power: string, x = 10, y = 10): void {
  bus.emit("power:invoked", { power: power as never, cost: 0, x, y, radius: 6 });
}

describe("DivineMemory — le peuple se souvient du dieu (cahier des charges §5)", () => {
  it("consigne les hauts faits dans une chronique, du plus récent au plus ancien", () => {
    const bus = new EventBus<GameEvents>();
    const clock = new GameClock();
    const mem = new DivineMemory(bus, clock);
    invoke(bus, "rain"); // bienfait
    invoke(bus, "volcano"); // courroux
    const chron = mem.chronicle();
    expect(chron).toHaveLength(2);
    expect(chron[0]!.kind).toBe("courroux"); // le plus récent d'abord
    expect(chron[1]!.kind).toBe("bienfait");
    expect(chron[0]!.power.length).toBeGreaterThan(0); // nom lisible
  });

  it("les bienfaits nourrissent la révérence, les courroux l'effroi", () => {
    const bus = new EventBus<GameEvents>();
    const mem = new DivineMemory(bus, new GameClock());
    invoke(bus, "rain");
    invoke(bus, "abundance");
    expect(mem.reverence).toBeGreaterThan(0);
    expect(mem.dread).toBe(0);

    invoke(bus, "earthquake");
    expect(mem.dread).toBeGreaterThan(0);
  });

  it("la chronique est bornée : les plus vieux récits s'oublient", () => {
    const bus = new EventBus<GameEvents>();
    const mem = new DivineMemory(bus, new GameClock());
    for (let i = 0; i < CHRONICLE_MAX + 10; i++) invoke(bus, "rain");
    expect(mem.chronicle()).toHaveLength(CHRONICLE_MAX);
  });

  it("la révérence rayonne une faveur (Foi passive) puis la mémoire s'estompe", () => {
    const bus = new EventBus<GameEvents>();
    const mem = new DivineMemory(bus, new GameClock());
    for (let i = 0; i < 5; i++) invoke(bus, "abundance");
    const before = mem.reverence;
    const favor = mem.fade();
    expect(favor).toBeGreaterThan(0); // un dieu dont on se souvient est prié
    expect(mem.reverence).toBeLessThan(before); // …mais le souvenir pâlit
  });

  it("s'intègre à la Simulation : un dieu généreux voit la révérence de son peuple croître", () => {
    const sim = new Simulation({ seed: 3, width: 48, height: 48 });
    sim.agents.populate(20);
    // Le joueur bénit régulièrement : chaque miracle est un pouvoir invoqué.
    for (let i = 0; i < 20; i++) sim.bus.emit("power:invoked", { power: "abundance", cost: 0, x: 24, y: 24, radius: 6 });
    expect(sim.divineMemory.reverence).toBeGreaterThan(0);
    expect(sim.divineMemory.chronicle().length).toBeGreaterThan(0);
  });

  it("la mémoire divine survit à la sauvegarde/chargement (save v11)", () => {
    const sim = new Simulation({ seed: 3, width: 48, height: 48 });
    sim.bus.emit("power:invoked", { power: "rain", cost: 0, x: 24, y: 24, radius: 6 });
    sim.bus.emit("power:invoked", { power: "volcano", cost: 0, x: 12, y: 12, radius: 6 });
    const reloaded = loadSimulation(JSON.parse(JSON.stringify(serializeSimulation(sim))));
    expect(reloaded.divineMemory.chronicle()).toHaveLength(2);
    expect(reloaded.divineMemory.reverence).toBeCloseTo(sim.divineMemory.reverence, 10);
    expect(reloaded.divineMemory.dread).toBeCloseTo(sim.divineMemory.dread, 10);
  });
});
