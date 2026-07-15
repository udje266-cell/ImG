import { World } from "../../core/ecs/World";
import { Scheduler } from "../../core/ecs/Scheduler";
import { EventBus } from "../../core/events/EventBus";
import { Rng } from "../../core/math/Rng";
import { GameClock, TICKS_PER_DAY } from "../../core/time/GameClock";
import type { GameEvents } from "../events";
import { FaithSystem, type FaithConfig } from "../powers/FaithSystem";
import { FlattenPower } from "../powers/FlattenPower";
import { GrowthPower } from "../powers/GrowthPower";
import { BasinPower, OrogenesisPower } from "../powers/GeomancyPowers";
import { DroughtPower } from "../powers/NaturePowers";
import { EarthquakePower, LightningPower, VolcanoPower } from "../powers/CatastrophePowers";
import { AbundancePower, BenedictionPower, MannaPower } from "../powers/GracePowers";
import { BurningBushPower } from "../powers/MysteryPowers";
import {
  DarknessPower,
  DelugePower,
  FireHailPower,
  LivestockPlaguePower,
  LocustsPower,
} from "../powers/PlaguePowers";
import { BeckonPower, SpawnHerdPower } from "../powers/InfluencePowers";
import { PowerSystem } from "../powers/PowerSystem";
import { SparkSystem } from "../powers/SparkSystem";
import { ProgressionSystem } from "../powers/ProgressionSystem";
import { RainPower } from "../powers/RainPower";
import { TerraformPower } from "../powers/TerraformPower";
import type { TerrainGrid } from "../terrain/TerrainGrid";
import { AgentSystem } from "../agents/AgentSystem";
import { RELIGION_INTERVAL, ReligionSystem } from "../religion/ReligionSystem";
import { DivineMemory } from "../society/DivineMemory";
import { ERA_INTERVAL, EraSystem } from "../society/EraSystem";
import { SettlementSystem } from "../society/SettlementSystem";
import { WAR_INTERVAL, WarSystem } from "../society/WarSystem";
import { FaunaSystem } from "../ecology/FaunaSystem";
import { FLORA_INTERVAL, FloraSystem } from "../ecology/FloraSystem";
import { seasonalOffset } from "../weather/seasons";
import { WEATHER_INTERVAL, WeatherSystem } from "../weather/WeatherSystem";
import { generateWorld } from "../worldgen/WorldGenerator";

/** Cadence (ticks) du recensement/expansion des villages. */
export const SETTLEMENT_INTERVAL = 200;
/** Population à partir de laquelle le peuple fonde son premier village. */
export const FIRST_VILLAGE_POPULATION = 6;

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
  readonly spark: SparkSystem;
  readonly powers: PowerSystem;
  readonly progression: ProgressionSystem;
  readonly weather: WeatherSystem;
  readonly flora: FloraSystem;
  readonly fauna: FaunaSystem;
  readonly agents: AgentSystem;
  readonly settlements: SettlementSystem;
  readonly religion: ReligionSystem;
  readonly era: EraSystem;
  readonly divineMemory: DivineMemory;
  readonly war: WarSystem;
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
    this.spark = new SparkSystem();
    this.progression = new ProgressionSystem(this.bus);
    this.powers = new PowerSystem(this.bus);
    this.powers.register(new TerraformPower());
    this.powers.register(new FlattenPower());
    this.powers.register(new GrowthPower());
    this.powers.register(new RainPower());
    this.powers.register(new OrogenesisPower());
    this.powers.register(new BasinPower());
    this.powers.register(new DroughtPower());
    this.powers.register(new LightningPower());
    this.powers.register(new EarthquakePower());
    this.powers.register(new VolcanoPower());
    this.powers.register(new AbundancePower());
    this.powers.register(new BenedictionPower());
    this.powers.register(new BeckonPower());
    this.powers.register(new SpawnHerdPower());
    this.powers.register(new MannaPower());
    this.powers.register(new BurningBushPower());
    this.powers.register(new LocustsPower());
    this.powers.register(new LivestockPlaguePower());
    this.powers.register(new FireHailPower());
    this.powers.register(new DarknessPower());
    this.powers.register(new DelugePower());
    this.weather = new WeatherSystem(this.terrain, this.rng);
    this.flora = new FloraSystem(this.terrain, this.rng);
    this.fauna = new FaunaSystem(this.terrain, this.flora, this.rng);
    this.agents = new AgentSystem(this.terrain, this.flora, this.rng, this.bus);
    this.settlements = new SettlementSystem(this.terrain, this.rng);
    this.religion = new ReligionSystem(this.settlements, this.agents, this.bus);
    this.era = new EraSystem(this.bus);
    this.divineMemory = new DivineMemory(this.bus, this.clock);
    this.war = new WarSystem(this.settlements, this.agents, this.bus, this.rng);
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
    this.scheduler.add({
      id: "faith",
      update: (sim) => {
        sim.faith.update();
        sim.spark.update();
      },
    });
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
    this.scheduler.add({ id: "fauna", update: (sim) => sim.fauna.update(sim.clock.tick) });
    this.scheduler.add({
      id: "agents",
      update: (sim) => {
        sim.agents.update(sim.clock.tick);
        // Les croyants génèrent de la Foi : la boucle est bouclée (GDD §2).
        sim.faith.add(sim.agents.faithIncome());
      },
    });
    // Religions : les récits s'estompent, les prêtres prêchent, les temples
    // rayonnent une Foi passive (les cultes récompensent le dieu présent).
    this.scheduler.add({
      id: "religion",
      interval: RELIGION_INTERVAL,
      update: (sim) => {
        sim.faith.add(sim.religion.update());
      },
    });
    // Mémoire divine : le peuple se souvient des hauts faits du dieu. Une fois
    // par jour, la mémoire s'estompe un peu et la révérence accumulée rayonne
    // une Foi passive (on prie le dieu dont on garde bon souvenir).
    this.scheduler.add({
      id: "divineMemory",
      interval: TICKS_PER_DAY,
      update: (sim) => {
        sim.faith.add(sim.divineMemory.fade());
      },
    });
    // Ères technologiques : le Savoir s'accumule avec la population, les
    // villages et les temples ; franchir un palier fait évoluer la civilisation.
    this.scheduler.add({
      id: "era",
      interval: ERA_INTERVAL,
      update: (sim) => {
        let temples = 0;
        for (const c of sim.religion.villageCults) if (c.temple) temples++;
        sim.era.advance(sim.agents.count, sim.settlements.villages.length, temples);
      },
    });
    // Guerres : les villages voisins montent en tension et, quand elle déborde,
    // se livrent des raids (pertes selon la force militaire — les guerriers).
    this.scheduler.add({
      id: "war",
      interval: WAR_INTERVAL,
      update: (sim) => sim.war.update(),
    });
    // Croissance des villages : suit la population (naissances) et bâtit de
    // nouvelles huttes quand un village dépasse sa capacité.
    this.scheduler.add({
      id: "settlements",
      interval: SETTLEMENT_INTERVAL,
      update: (sim) => {
        // Genèse : tant qu'aucun village n'existe, le peuple erre. Quand la
        // lignée des Premiers atteint le seuil, il fonde son premier village.
        if (sim.settlements.villages.length === 0) {
          if (sim.agents.count >= FIRST_VILLAGE_POPULATION) {
            sim.foundSettlements();
            sim.bus.emit("settlements:founded", {});
            sim.bus.emit("settlements:updated", {});
          }
          return;
        }
        if (sim.settlements.expand(sim.agents)) {
          sim.bus.emit("settlements:updated", {});
        }
      },
    });
  }

  /**
   * Genèse (« au commencement ») : fait naître les Deux Premiers — un homme
   * et une femme — côte à côte sur la terre viable la plus proche du centre
   * du monde, de préférence végétalisée (il faut bien manger). Le premier
   * village naîtra de leur descendance (voir la passe "settlements").
   */
  genesis(): void {
    const cx = Math.floor(this.terrain.width / 2);
    const cy = Math.floor(this.terrain.height / 2);
    let best: { x: number; y: number } | null = null;
    let bestScore = -Infinity;
    // Anneaux croissants : première bonne terre proche du centre.
    for (let r = 0; r < Math.max(this.terrain.width, this.terrain.height) / 2; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          const x = cx + dx;
          const y = cy + dy;
          if (!this.terrain.inBounds(x, y) || this.terrain.isWater(x, y)) continue;
          if (!this.terrain.inBounds(x + 1, y) || this.terrain.isWater(x + 1, y)) continue;
          const score = this.flora.densityAt(x, y) - r * 0.02; // vert et central
          if (score > bestScore) {
            bestScore = score;
            best = { x, y };
          }
        }
      }
      if (best && bestScore > 0.15) break; // assez vert : on s'installe
    }
    const spot = best ?? { x: cx, y: cy };
    // L'homme puis la femme (l'ordre fixe les modèles 3D du rendu) : les Deux
    // Premiers forment le premier couple, souche de toute la descendance.
    const man = this.agents.spawn(spot.x + 0.5, spot.y + 0.5);
    const woman = this.agents.spawn(spot.x + 1.5, spot.y + 0.5);
    this.agents.marry(man, woman);
  }

  /** Fonde les villages à partir des habitants présents (peuplement initial). */
  foundSettlements(): void {
    this.settlements.found(this.agents);
    // Les champs sont semés fertiles : nourriture proche des villages.
    for (const field of this.settlements.fields) {
      const x = Math.floor(field.x);
      const y = Math.floor(field.y);
      this.flora.setDensity(x, y, Math.max(this.flora.densityAt(x, y), 0.75));
    }
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
