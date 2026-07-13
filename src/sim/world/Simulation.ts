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
import { RainPower } from "../powers/RainPower";
import { TerraformPower } from "../powers/TerraformPower";
import type { TerrainGrid } from "../terrain/TerrainGrid";
import { FLORA_INTERVAL, FloraSystem } from "../ecology/FloraSystem";
import { seasonalOffset } from "../weather/seasons";
import { WEATHER_INTERVAL, WeatherSystem } from "../weather/WeatherSystem";
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
  /** Horloge de mesure injectée (DI) : active le chronométrage par système. */
  now?: () => number;
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
  readonly weather: WeatherSystem;
  readonly flora: FloraSystem;
  /** Config effective du monde — nécessaire à la sauvegarde (seed + deltas). */
  readonly worldConfig: { seed: number; width: number; height: number; seaLevel: number };
  private readonly scheduler: Scheduler<Simulation>;

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
    this.powers.register(new RainPower());
    this.weather = new WeatherSystem(this.terrain, this.rng);
    this.flora = new FloraSystem(this.terrain, this.rng);
    this.applySeasonalOffset();
    this.flora.setSeason(this.clock.season);

    // Re-classifie les biomes et met à jour la flore à chaque changement de saison.
    this.bus.on("time:seasonChanged", () => {
      this.applySeasonalOffset();
      this.flora.setSeason(this.clock.season);
    });

    // Tick order matters and is explicit (docs/UML.md §3).
    this.scheduler = new Scheduler<Simulation>(config.now);
    this.scheduler.add({ id: "powers", update: (sim) => sim.powers.step(sim) });
    this.scheduler.add({ id: "faith", update: (sim) => sim.faith.update() });
    this.scheduler.add({
      id: "weather",
      interval: WEATHER_INTERVAL,
      update: (sim) => sim.weather.update(),
    });
    this.scheduler.add({
      id: "flora",
      interval: FLORA_INTERVAL,
      update: (sim) => {
        sim.flora.update();
        sim.bus.emit("flora:updated", {});
      },
    });
    // Future systems (agents...) register here.
  }

  /** Durée du dernier passage de chaque système (ms) — overlay de perf. */
  get systemDurations(): ReadonlyMap<string, number> {
    return this.scheduler.lastDurations;
  }

  private applySeasonalOffset(): void {
    this.terrain.setSeasonalTemperatureOffset(seasonalOffset(this.clock.season));
  }

  /** Réaligne saison (offset thermique + flore) sur le tick courant (après un chargement). */
  reapplySeasonalOffset(): void {
    this.applySeasonalOffset();
    this.flora.setSeason(this.clock.season);
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
