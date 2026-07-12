import { describe, expect, it } from "vitest";
import { loadSimulation, serializeSimulation } from "../../src/sim/save/save";
import { Simulation } from "../../src/sim/world/Simulation";

const CONFIG = { seed: 909, width: 64, height: 64 };

function sculptedSim(): Simulation {
  const sim = new Simulation(CONFIG);
  for (let i = 0; i < 30; i++) {
    sim.bus.emit("intent:invokePower", {
      power: "terraform",
      x: 20 + (i % 9),
      y: 30,
      radius: 5,
      direction: i % 3 === 0 ? -1 : 1,
    });
    sim.step();
  }
  return sim;
}

describe("save/load (docs/TDD.md §4.6)", () => {
  it("stores only the cells that diverge from the generated baseline", () => {
    const untouched = new Simulation(CONFIG);
    expect(serializeSimulation(untouched).terrain.indices).toHaveLength(0);

    const sculpted = sculptedSim();
    const data = serializeSimulation(sculpted);
    expect(data.terrain.indices.length).toBeGreaterThan(0);
    expect(data.terrain.indices.length).toBeLessThan(64 * 64 * 0.2); // deltas, pas la grille
  });

  it("round-trips exactly: load(save(sim)) has identical state", () => {
    const sim = sculptedSim();
    const restored = loadSimulation(serializeSimulation(sim));

    expect(restored.terrain.heightMap).toEqual(sim.terrain.heightMap);
    expect(restored.terrain.biomes).toEqual(sim.terrain.biomes);
    expect(restored.clock.tick).toBe(sim.clock.tick);
    expect(restored.faith.current).toBe(sim.faith.current);
    expect(restored.progression.devotion).toBe(sim.progression.devotion);
    // Double round-trip: la sauvegarde d'une restauration est identique.
    expect(serializeSimulation(restored)).toEqual(serializeSimulation(sim));
  });

  it("survives JSON stringify/parse (persistance réelle)", () => {
    const sim = sculptedSim();
    const json = JSON.stringify(serializeSimulation(sim));
    const restored = loadSimulation(JSON.parse(json));
    expect(restored.terrain.heightMap).toEqual(sim.terrain.heightMap);
  });

  it("the restored world continues deterministically like the original", () => {
    const original = sculptedSim();
    const restored = loadSimulation(serializeSimulation(original));

    const intent = { power: "terraform", x: 40, y: 40, radius: 4, direction: 1 } as const;
    for (const sim of [original, restored]) {
      sim.bus.emit("intent:invokePower", { ...intent });
      for (let i = 0; i < 100; i++) sim.step();
    }
    expect(restored.terrain.heightMap).toEqual(original.terrain.heightMap);
    expect(restored.faith.current).toBe(original.faith.current);
  });

  it("rejects unsupported versions and corrupted payloads", () => {
    const data = serializeSimulation(new Simulation(CONFIG));
    expect(() => loadSimulation({ ...data, version: 99 as 1 })).toThrow(/version/);
    expect(() =>
      loadSimulation({ ...data, terrain: { indices: [0, 1], heights: [0.5] } }),
    ).toThrow(/mismatch/);
    expect(() =>
      loadSimulation({ ...data, terrain: { indices: [999999], heights: [0.5] } }),
    ).toThrow(/out of bounds/);
  });
});
