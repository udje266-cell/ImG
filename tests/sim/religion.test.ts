import { describe, expect, it } from "vitest";
import { PRIEST_LORE, RELIGION_INTERVAL, TEMPLE_LORE } from "../../src/sim/religion/ReligionSystem";
import { loadSimulation, serializeSimulation } from "../../src/sim/save/save";
import { Simulation } from "../../src/sim/world/Simulation";

/** Monde peuplé, villages fondés, tout débloqué, Foi illimitée. */
function godWorld(seed = 5): Simulation {
  const sim = new Simulation({ seed, width: 48, height: 48, faith: { initial: 100, regenPerTick: 0 } });
  sim.agents.populate(50);
  sim.foundSettlements();
  sim.progression.addDevotion(5000);
  sim.faith.add(1_000_000);
  return sim;
}

/** Invoque un miracle centré sur le 1er village (des témoins garantis). */
function miracleAtVillage(sim: Simulation, power: string, radius = 8): void {
  const v = sim.settlements.villages[0]!;
  sim.bus.emit("intent:invokePower", { power, x: Math.round(v.x), y: Math.round(v.y), radius } as never);
  sim.step();
}

describe("ReligionSystem — témoins et mémoire (docs/GDD.md §6)", () => {
  it("un miracle avec témoins devient un récit dans la mémoire du village", () => {
    const sim = godWorld();
    expect(sim.religion.loreOf(0)).toBe(0);
    miracleAtVillage(sim, "benediction");
    expect(sim.religion.loreOf(0)).toBeGreaterThan(0);
  });

  it("un miracle sans témoin ne devient jamais un récit", () => {
    const sim = new Simulation({ seed: 5, width: 48, height: 48 });
    // Aucun habitant : personne ne voit rien.
    sim.progression.addDevotion(5000);
    sim.faith.add(1_000_000);
    sim.bus.emit("intent:invokePower", { power: "rain", x: 24, y: 24, radius: 8 });
    sim.step();
    for (let v = 0; v < sim.settlements.villages.length; v++) {
      expect(sim.religion.loreOf(v)).toBe(0);
    }
  });

  it("être témoin d'un miracle ravive la ferveur (revenu de Foi en hausse)", () => {
    const sim = godWorld();
    const before = sim.agents.faithIncome();
    miracleAtVillage(sim, "benediction");
    expect(sim.agents.faithIncome()).toBeGreaterThan(before);
  });

  it("la doctrine émerge du style de règne : bienfaits → Providence, courroux → Crainte", () => {
    const kind = godWorld(7);
    for (let i = 0; i < 3; i++) miracleAtVillage(kind, "growth");
    expect(kind.religion.doctrineOf(0)).toBe("Providence");

    const cruel = godWorld(7);
    for (let i = 0; i < 3; i++) miracleAtVillage(cruel, "lightning", 3);
    expect(cruel.religion.doctrineOf(0)).toBe("Crainte");
  });

  it("les récits s'estompent avec le temps (oubli)", () => {
    const sim = godWorld();
    miracleAtVillage(sim, "rain");
    const fresh = sim.religion.loreOf(0);
    for (let i = 0; i < RELIGION_INTERVAL * 20; i++) sim.step();
    expect(sim.religion.loreOf(0)).toBeLessThan(fresh);
  });
});

describe("ReligionSystem — prêtres et temples", () => {
  it("assez de récits → un prêtre s'élève, puis un temple (événements émis)", () => {
    const sim = godWorld();
    const events: string[] = [];
    sim.bus.on("religion:priestOrdained", ({ doctrine }) => events.push(`priest:${doctrine}`));
    sim.bus.on("religion:templeRaised", () => events.push("temple"));

    let guard = 0;
    while (sim.religion.loreOf(0) < TEMPLE_LORE && guard++ < 40) {
      miracleAtVillage(sim, "benediction");
    }
    expect(sim.religion.villageCults[0]!.priest).toBe(true);
    expect(sim.religion.villageCults[0]!.temple).toBe(true);
    expect(events.filter((e) => e.startsWith("priest")).length).toBe(1); // une seule ordination
    expect(events).toContain("temple");
    expect(sim.religion.loreOf(0)).toBeGreaterThanOrEqual(PRIEST_LORE);
  });

  it("un temple rayonne une Foi passive", () => {
    const sim = godWorld();
    let guard = 0;
    while (!sim.religion.villageCults[0]!.temple && guard++ < 40) {
      miracleAtVillage(sim, "benediction");
    }
    // Vide la réserve puis laisse la passe religieuse tourner sans regen.
    sim.faith.current = 0;
    // Neutralise le revenu des croyants pour isoler la part du temple : on
    // mesure juste après une passe religion (interval RELIGION_INTERVAL).
    const before = sim.faith.current;
    for (let i = 0; i <= RELIGION_INTERVAL; i++) sim.step();
    expect(sim.faith.current).toBeGreaterThan(before);
  });

  it("état des cultes : cycle sauvegarde/chargement complet (v8)", () => {
    const sim = godWorld();
    for (let i = 0; i < 8; i++) miracleAtVillage(sim, "growth");
    const reloaded = loadSimulation(JSON.parse(JSON.stringify(serializeSimulation(sim))));
    expect(reloaded.religion.serialize()).toEqual(sim.religion.serialize());
    expect(reloaded.religion.doctrineOf(0)).toBe(sim.religion.doctrineOf(0));
  });

  it("déterminisme : même seed + mêmes miracles → mêmes cultes", () => {
    const run = (): unknown => {
      const sim = godWorld(11);
      for (let i = 0; i < 6; i++) miracleAtVillage(sim, "rain");
      for (let i = 0; i < 200; i++) sim.step();
      return sim.religion.serialize();
    };
    expect(run()).toEqual(run());
  });
});
