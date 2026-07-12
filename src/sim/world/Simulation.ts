import { World } from "../../core/ecs/World";
import { Scheduler } from "../../core/ecs/Scheduler";
import { EventBus } from "../../core/events/EventBus";
import { Rng } from "../../core/math/Rng";
import { GameClock } from "../../core/time/GameClock";
import type { GameEvents } from "../events";
import { FaithSystem, type FaithConfig } from "../powers/FaithSystem";
import { FlattenPower } from "../powers/FlattenPower";
import { PowerSystem } from "../powers/PowerSystem";
import { ProgressionSystem } from "../powers/ProgressionSystem";
import { TerraformPower } from "../powers/TerraformPower";
import type { TerrainGrid } from "../terrain/TerrainGrid";
import { generateWorld } from "../worldgen/WorldGenerator";

/**
 * Root of the simulation — pure domain logic, zero browser APIs, fully
 * deterministic: same seed + same intents => same world, tick for tick.
 * Runs headless in tests exactly as it runs in the browser.
 */
export interface SimulationConfig {
  seed: number;
  width?: number;
  height?: number;
  seaLevel?: number;
  faith?: FaithConfig;
}

export class Simulation {
  readonly bus = new EventBus<GameEvents>();
  readonly clock = new GameClock();
  readonly world = new World();
  readonly rng: Rng;
  readonly terrain: TerrainGrid;
  readonly faith: FaithSystem;
  readonly powers: PowerSystem;
  readonly progression: ProgressionSystem;
  /** Config effective du monde — nécessaire à la sauvegarde (seed + deltas). */
  readonly worldConfig: { seed: number; width: number; height: number; seaLevel: number };
  private readonly scheduler = new Scheduler<Simulation>();

  constructor(config: SimulationConfig) {
    this.rng = new Rng(config.seed);
    this.worldConfig = {
      seed: config.seed,
      width: config.width ?? 256,
      height: config.height ?? 256,
      seaLevel: config.seaLevel ?? 0.5,
    };
    this.terrain = generateWorld(this.worldConfig);
    this.faith = new FaithSystem(config.faith);
    this.progression = new ProgressionSystem(this.bus);
    this.powers = new PowerSystem(this.bus);
    this.powers.register(new TerraformPower());
    this.powers.register(new FlattenPower());

    // Tick order matters and is explicit (docs/UML.md §3).
    this.scheduler.add({ id: "powers", update: (sim) => sim.powers.step(sim) });
    this.scheduler.add({ id: "faith", update: (sim) => sim.faith.update() });
    // Future systems (weather, ecology, agents...) register here, some with
    // an `interval` so they only run every N ticks.
  }

  /** Advance the simulation by exactly one fixed tick. */
  step(): void {
    for (const transition of this.clock.advance()) {
      switch (transition.kind) {
        case "dayStarted":
          this.bus.emit("time:dayStarted", { day: transition.day });
          break;
        case "seasonChanged":
          this.bus.emit("time:seasonChanged", { season: transition.season, year: transition.year });
          break;
        case "yearStarted":
          this.bus.emit("time:yearStarted", { year: transition.year });
          break;
      }
    }

    this.scheduler.step(this, this.clock.tick);

    const chunkIds = this.terrain.refreshDirtyChunks();
    if (chunkIds.length > 0) {
      this.bus.emit("terrain:modified", { chunkIds });
    }

    // Deliver deferred events (including UI intents for the next tick).
    this.bus.drain();
  }
}
