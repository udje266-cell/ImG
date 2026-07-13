import { describe, expect, it } from "vitest";
import { POWER_UNLOCK_THRESHOLDS } from "../../src/sim/powers/ProgressionSystem";
import { Simulation } from "../../src/sim/world/Simulation";

const CONFIG = { seed: 55, width: 64, height: 64 };

function sculptUntil(sim: Simulation, devotion: number): void {
  let guard = 0;
  while (sim.progression.devotion < devotion) {
    if (++guard > 500) throw new Error("sculptUntil: devotion never reached");
    sim.bus.emit("intent:invokePower", {
      power: "terraform",
      x: 32,
      y: 32,
      radius: 5,
      direction: guard % 2 === 0 ? 1 : -1,
    });
    sim.step();
  }
}

describe("ProgressionSystem (cahier des charges §7)", () => {
  it("terraform is available from the start, flatten is locked", () => {
    const sim = new Simulation(CONFIG);
    expect(sim.progression.isUnlocked("terraform")).toBe(true);
    expect(sim.progression.isUnlocked("flatten")).toBe(false);
    expect(sim.progression.unlockedPowers()).toEqual(["terraform"]);
  });

  it("a locked power is rejected atomically: no faith spent, no terrain change", () => {
    const sim = new Simulation(CONFIG);
    const faithBefore = sim.faith.current;
    const heights = sim.terrain.heightMap.slice();
    const rejections: string[] = [];
    sim.bus.on("power:rejected", (e) => rejections.push(e.reason));

    sim.bus.emit("intent:invokePower", { power: "flatten", x: 32, y: 32, radius: 5 });
    sim.step();

    expect(rejections).toEqual(["locked"]);
    expect(sim.terrain.heightMap).toEqual(heights);
    expect(sim.faith.current).toBe(Math.min(sim.faith.max, faithBefore + sim.faith.regenPerTick));
  });

  it("devotion accumulates from invoked miracles and unlocks flatten exactly once", () => {
    const sim = new Simulation(CONFIG);
    const unlocks: string[] = [];
    sim.bus.on("progression:powerUnlocked", (e) => unlocks.push(e.power));

    sculptUntil(sim, POWER_UNLOCK_THRESHOLDS.flatten + 50);

    expect(unlocks).toEqual(["flatten"]);
    expect(sim.progression.isUnlocked("flatten")).toBe(true);
  });

  it("once unlocked, flatten levels the terrain towards the brush centre", () => {
    const sim = new Simulation(CONFIG);
    sculptUntil(sim, POWER_UNLOCK_THRESHOLDS.flatten);

    const cx = 32;
    const cy = 32;
    const variance = (): number => {
      const target = sim.terrain.heightAt(cx, cy);
      let sum = 0;
      let n = 0;
      for (let y = cy - 4; y <= cy + 4; y++) {
        for (let x = cx - 4; x <= cx + 4; x++) {
          sum += Math.abs(sim.terrain.heightAt(x, y) - target);
          n++;
        }
      }
      return sum / n;
    };

    const before = variance();
    for (let i = 0; i < 6; i++) {
      sim.bus.emit("intent:invokePower", { power: "flatten", x: cx, y: cy, radius: 5 });
      sim.step();
    }
    expect(variance()).toBeLessThan(before);
  });

  it("rain unlocks at its threshold and then makes it rain", () => {
    const sim = new Simulation(CONFIG);
    expect(sim.progression.isUnlocked("rain")).toBe(false);

    // Rain rejeté tant que verrouillé.
    const rejections: string[] = [];
    sim.bus.on("power:rejected", (e) => rejections.push(e.reason));
    sim.bus.emit("intent:invokePower", { power: "rain", x: 32, y: 32, radius: 5 });
    sim.step();
    expect(rejections).toContain("locked");

    sculptUntil(sim, POWER_UNLOCK_THRESHOLDS.rain);
    expect(sim.progression.isUnlocked("rain")).toBe(true);

    // Une fois débloqué, invoquer la pluie ensemence les nuages : la pluie
    // qui suit fait monter l'humidité totale du sol (effet gameplay réel).
    const totalMoisture = (): number => sim.terrain.moisture.reduce((a, b) => a + b, 0);
    const before = totalMoisture();
    sim.bus.emit("intent:invokePower", { power: "rain", x: 32, y: 32, radius: 8 });
    for (let i = 0; i < 25; i++) sim.step();
    expect(totalMoisture()).toBeGreaterThan(before);
  });

  it("restoring devotion from a save does not re-emit unlock events", () => {
    const sim = new Simulation(CONFIG);
    const unlocks: string[] = [];
    sim.bus.on("progression:powerUnlocked", (e) => unlocks.push(e.power));
    sim.progression.restoreDevotion(POWER_UNLOCK_THRESHOLDS.flatten + 10);
    expect(unlocks).toEqual([]);
    expect(sim.progression.isUnlocked("flatten")).toBe(true);
  });
});
