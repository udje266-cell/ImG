import { describe, expect, it } from "vitest";
import { Scheduler, type System } from "../../src/core/ecs/Scheduler";
import { World } from "../../src/core/ecs/World";

interface Position {
  x: number;
  y: number;
}

describe("World (ECS)", () => {
  it("creates unique live entities", () => {
    const world = new World();
    const a = world.createEntity();
    const b = world.createEntity();
    expect(a).not.toBe(b);
    expect(world.isAlive(a)).toBe(true);
    expect(world.entityCount).toBe(2);
  });

  it("stores and retrieves components", () => {
    const world = new World();
    const e = world.createEntity();
    const positions = world.store<Position>("position");
    positions.set(e, { x: 3, y: 4 });
    expect(positions.get(e)).toEqual({ x: 3, y: 4 });
    expect(world.store<Position>("position")).toBe(positions); // same store instance
  });

  it("destroying an entity removes all of its components", () => {
    const world = new World();
    const e = world.createEntity();
    world.store<Position>("position").set(e, { x: 1, y: 1 });
    world.store<number>("health").set(e, 10);
    world.destroyEntity(e);
    expect(world.isAlive(e)).toBe(false);
    expect(world.store<Position>("position").get(e)).toBeUndefined();
    expect(world.store<number>("health").get(e)).toBeUndefined();
  });
});

describe("Scheduler", () => {
  it("runs systems in registration order", () => {
    const order: string[] = [];
    const scheduler = new Scheduler<void>();
    scheduler.add({ id: "b", update: () => order.push("b") });
    scheduler.add({ id: "a", update: () => order.push("a") });
    scheduler.step(undefined, 1);
    expect(order).toEqual(["b", "a"]);
  });

  it("honours the interval (system runs every N ticks only)", () => {
    let runs = 0;
    const system: System<void> = { id: "slow", interval: 5, update: () => runs++ };
    const scheduler = new Scheduler<void>();
    scheduler.add(system);
    for (let tick = 1; tick <= 20; tick++) scheduler.step(undefined, tick);
    expect(runs).toBe(4); // ticks 5, 10, 15, 20
  });

  it("rejects duplicate system ids", () => {
    const scheduler = new Scheduler<void>();
    scheduler.add({ id: "x", update: () => {} });
    expect(() => scheduler.add({ id: "x", update: () => {} })).toThrow(/duplicate/);
  });
});
