import { beforeEach, describe, expect, it } from "vitest";
import type { TerraformInvocation } from "../../src/sim/powers/Power";
import { Simulation } from "../../src/sim/world/Simulation";

const SIM_CONFIG = { seed: 42, width: 64, height: 64 };

function terraformIntent(overrides: Partial<TerraformInvocation> = {}): TerraformInvocation {
  return { power: "terraform", x: 32, y: 32, radius: 5, direction: 1, ...overrides };
}

describe("PowerSystem + TerraformPower + FaithSystem", () => {
  let sim: Simulation;

  beforeEach(() => {
    sim = new Simulation(SIM_CONFIG);
  });

  it("raises the terrain at the brush centre and spends faith", () => {
    const before = sim.terrain.heightAt(32, 32);
    const faithBefore = sim.faith.current;
    const invoked: number[] = [];
    sim.bus.on("power:invoked", (e) => invoked.push(e.cost));

    sim.bus.emit("intent:invokePower", terraformIntent());
    sim.step();

    expect(sim.terrain.heightAt(32, 32)).toBeGreaterThan(before);
    expect(invoked).toHaveLength(1);
    expect(invoked[0]!).toBeGreaterThan(0);
    // faith = before - cost + one tick of regen
    expect(sim.faith.current).toBe(
      Math.min(sim.faith.max, faithBefore - invoked[0]! + sim.faith.regenPerTick),
    );
  });

  it("lowers the terrain with direction -1", () => {
    const before = sim.terrain.heightAt(32, 32);
    sim.bus.emit("intent:invokePower", terraformIntent({ direction: -1 }));
    sim.step();
    expect(sim.terrain.heightAt(32, 32)).toBeLessThan(before);
  });

  it("does not touch cells outside the brush radius", () => {
    const farBefore = sim.terrain.heightAt(50, 50);
    sim.bus.emit("intent:invokePower", terraformIntent({ x: 10, y: 10, radius: 4 }));
    sim.step();
    expect(sim.terrain.heightAt(50, 50)).toBe(farBefore);
  });

  it("rejects atomically when faith is insufficient — no partial terraform", () => {
    const poor = new Simulation({ ...SIM_CONFIG, faith: { initial: 0, regenPerTick: 0 } });
    const heightsBefore = poor.terrain.heightMap.slice();
    const rejections: string[] = [];
    poor.bus.on("power:rejected", (e) => rejections.push(e.reason));

    poor.bus.emit("intent:invokePower", terraformIntent());
    poor.step();

    expect(rejections).toEqual(["insufficient-faith"]);
    expect(poor.terrain.heightMap).toEqual(heightsBefore);
  });

  it("publishes terrain:modified with the touched chunk ids", () => {
    let chunkIds: number[] = [];
    sim.bus.on("terrain:modified", (e) => (chunkIds = e.chunkIds));
    sim.bus.emit("intent:invokePower", terraformIntent());
    sim.step();
    expect(chunkIds).toContain(sim.terrain.chunkIdAt(32, 32));
  });

  it("intents queued on the bus (UI path) are applied on the following tick", () => {
    const before = sim.terrain.heightAt(32, 32);
    sim.bus.queue("intent:invokePower", terraformIntent());
    sim.step(); // drain delivers the intent at end of this tick
    expect(sim.terrain.heightAt(32, 32)).toBe(before);
    sim.step(); // processed here
    expect(sim.terrain.heightAt(32, 32)).toBeGreaterThan(before);
  });

  it("faith regenerates over time and caps at max", () => {
    const s = new Simulation({ ...SIM_CONFIG, faith: { initial: 0, max: 10, regenPerTick: 3 } });
    s.step();
    expect(s.faith.current).toBe(3);
    for (let i = 0; i < 10; i++) s.step();
    expect(s.faith.current).toBe(10);
  });
});
