import { describe, expect, it } from "vitest";
import { SPARK_COSTS, SparkSystem } from "../../src/sim/powers/SparkSystem";
import { loadSimulation, serializeSimulation } from "../../src/sim/save/save";
import { Simulation } from "../../src/sim/world/Simulation";

/** Simulation tout débloqué, Foi illimitée (l'Étincelle reste la contrainte). */
function godSim(): Simulation {
  const sim = new Simulation({ seed: 42, width: 64, height: 64, faith: { regenPerTick: 0 } });
  sim.progression.addDevotion(10000);
  sim.faith.add(1_000_000);
  return sim;
}

describe("SparkSystem — l'Étincelle divine (docs/DIVINE_POWERS.md §1.2)", () => {
  it("se régénère lentement avec le temps, plafonnée au max", () => {
    const spark = new SparkSystem({ initial: 0, max: 100 });
    for (let i = 0; i < 300; i++) spark.update(); // 300 ticks = 30 s réelles
    expect(spark.current).toBeCloseTo(10, 0); // ~+1 / 3 s
    for (let i = 0; i < 100_000; i++) spark.update();
    expect(spark.current).toBe(100);
  });

  it("dépense atomique : tout ou rien", () => {
    const spark = new SparkSystem({ initial: 30 });
    expect(spark.trySpend(45)).toBe(false);
    expect(spark.current).toBe(30);
    expect(spark.trySpend(30)).toBe(true);
    expect(spark.current).toBe(0);
  });

  it("un fléau consomme son Étincelle en plus de la Foi", () => {
    const sim = godSim();
    const sparkBefore = sim.spark.current;
    sim.bus.emit("intent:invokePower", { power: "volcano", x: 32, y: 32, radius: 4 });
    sim.step();
    // -45 d'Étincelle (+ la régén d'un tick, négligeable).
    expect(sim.spark.current).toBeLessThan(sparkBefore - 40);
  });

  it("sans Étincelle, le fléau est rejeté SANS dépenser de Foi (atomicité)", () => {
    const sim = godSim();
    sim.spark.current = 5; // pas assez pour un déluge (50)
    const faithBefore = sim.faith.current;
    const rejects: string[] = [];
    sim.bus.on("power:rejected", (e) => rejects.push(e.reason));

    sim.bus.emit("intent:invokePower", { power: "deluge", x: 32, y: 32, radius: 10 });
    sim.step();

    expect(rejects).toContain("insufficient-spark");
    expect(sim.faith.current).toBe(faithBefore); // aucune Foi brûlée
    expect(sim.spark.current).toBeGreaterThanOrEqual(5); // aucune Étincelle brûlée
  });

  it("les miracles doux (grâces, terraforming) ne coûtent aucune Étincelle", () => {
    const sim = godSim();
    const before = sim.spark.current;
    sim.bus.emit("intent:invokePower", { power: "growth", x: 32, y: 32, radius: 6 });
    sim.bus.emit("intent:invokePower", { power: "benediction", x: 32, y: 32, radius: 6 });
    sim.step();
    expect(sim.spark.current).toBeGreaterThanOrEqual(before);
  });

  it("l'anti-spam : la jauge pleine paie deux volcans, jamais trois d'affilée", () => {
    const sim = godSim();
    const rejects: string[] = [];
    sim.bus.on("power:rejected", (e) => rejects.push(e.reason));
    for (const [x, y] of [[20, 20], [44, 44], [32, 32]] as const) {
      sim.bus.emit("intent:invokePower", { power: "volcano", x, y, radius: 4 });
      sim.step();
    }
    // 100 → 55 → 10 : le troisième volcan (45) est refusé.
    expect(rejects).toEqual(["insufficient-spark"]);
  });

  it("l'Étincelle survit au cycle sauvegarde/chargement (v9)", () => {
    const sim = godSim();
    sim.spark.current = 33.5;
    const reloaded = loadSimulation(JSON.parse(JSON.stringify(serializeSimulation(sim))));
    expect(reloaded.spark.current).toBeCloseTo(33.5, 5);
  });

  it("tous les fléaux et catastrophes ont un coût d'Étincelle", () => {
    for (const id of ["lightning", "earthquake", "volcano", "locusts", "livestockPlague", "fireHail", "darkness", "deluge"] as const) {
      expect(SPARK_COSTS[id] ?? 0).toBeGreaterThan(0);
    }
  });
});
