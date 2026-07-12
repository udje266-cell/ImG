import { describe, expect, it } from "vitest";
import { TICKS_PER_DAY } from "../../src/core/time/GameClock";
import { Simulation } from "../../src/sim/world/Simulation";

const SIM_CONFIG = { seed: 2024, width: 64, height: 64 };

describe("Simulation (integration, headless)", () => {
  it("runs several in-game days and publishes calendar events", () => {
    const sim = new Simulation(SIM_CONFIG);
    const days: number[] = [];
    sim.bus.on("time:dayStarted", (e) => days.push(e.day));

    for (let i = 0; i < TICKS_PER_DAY * 3; i++) sim.step();

    expect(days).toEqual([1, 2, 3]);
    expect(sim.clock.day).toBe(3);
  });

  it("is deterministic end-to-end: same seed + same intents => same state", () => {
    const run = (): { heights: Float32Array; faith: number } => {
      const sim = new Simulation(SIM_CONFIG);
      for (let tick = 0; tick < 200; tick++) {
        if (tick % 17 === 0) {
          sim.bus.queue("intent:invokePower", {
            power: "terraform",
            x: 20 + (tick % 30),
            y: 25,
            radius: 4,
            direction: tick % 2 === 0 ? 1 : -1,
          });
        }
        sim.step();
      }
      return { heights: sim.terrain.heightMap.slice(), faith: sim.faith.current };
    };

    const a = run();
    const b = run();
    expect(a.heights).toEqual(b.heights);
    expect(a.faith).toBe(b.faith);
  });

  it("survives a long unattended run (the world lives on its own)", () => {
    const sim = new Simulation(SIM_CONFIG);
    for (let i = 0; i < TICKS_PER_DAY * 12; i++) sim.step(); // one full season
    expect(sim.clock.season).toBe("summer");
    expect(sim.faith.current).toBe(sim.faith.max); // regen capped, never NaN
  });
});
