import type { EventBus } from "../../core/events/EventBus";
import type { GameEvents } from "../events";
import type { Simulation } from "../world/Simulation";
import type { Power, PowerId, PowerInvocation } from "./Power";
import { SPARK_COSTS } from "./SparkSystem";

/**
 * Receives `intent:invokePower` events from the UI, validates them (known
 * power, sufficient faith) and executes them during the simulation tick.
 * The UI never touches the simulation state directly (docs/TDD.md §2.1).
 *
 * Invalid intents are rejected atomically via `power:rejected` — no partial
 * state, no faith spent.
 */
export class PowerSystem {
  private readonly registry = new Map<PowerId, Power>();
  private pending: PowerInvocation[] = [];

  constructor(bus: EventBus<GameEvents>) {
    bus.on("intent:invokePower", (invocation) => {
      this.pending.push(invocation);
    });
  }

  register(power: Power): void {
    if (this.registry.has(power.id)) {
      throw new Error(`PowerSystem: duplicate power id "${power.id}"`);
    }
    this.registry.set(power.id, power);
  }

  /** Process all intents received since the previous tick, in order. */
  step(sim: Simulation): void {
    if (this.pending.length === 0) return;
    const batch = this.pending;
    this.pending = [];
    for (const invocation of batch) {
      const power = this.registry.get(invocation.power);
      if (!power) {
        sim.bus.emit("power:rejected", { power: invocation.power, reason: "unknown-power" });
        continue;
      }
      if (!sim.progression.isUnlocked(invocation.power)) {
        sim.bus.emit("power:rejected", { power: invocation.power, reason: "locked" });
        continue;
      }
      const cost = power.cost(sim, invocation);
      const sparkCost = SPARK_COSTS[invocation.power] ?? 0;
      // Atomicité : on vérifie l'Étincelle avant de toucher à la Foi.
      if (sim.spark.current < sparkCost) {
        sim.bus.emit("power:rejected", { power: invocation.power, reason: "insufficient-spark" });
        continue;
      }
      if (!sim.faith.trySpend(cost)) {
        sim.bus.emit("power:rejected", { power: invocation.power, reason: "insufficient-faith" });
        continue;
      }
      sim.spark.trySpend(sparkCost);
      power.apply(sim, invocation);
      sim.bus.emit("power:invoked", {
        power: invocation.power,
        cost,
        x: invocation.x,
        y: invocation.y,
        radius: invocation.radius,
      });
    }
  }
}
