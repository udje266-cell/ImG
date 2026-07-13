import { Simulation } from "../world/Simulation";
import { generateWorld } from "../worldgen/WorldGenerator";

/**
 * Sauvegarde versionnée (docs/TDD.md §4.6). Le terrain n'est pas stocké en
 * entier : on régénère la baseline depuis la seed (déterminisme garanti) et
 * on ne garde que les cellules qui en divergent (terraforming + humidité
 * modifiée par la météo).
 *
 * Toute évolution du format incrémente `version` et passe par une migration
 * explicite dans `loadSimulation` — jamais de champ réinterprété en place.
 *
 * v1 → v2 : ajout des deltas d'humidité et de l'état météo (nuages, vent,
 * état du stream RNG "weather"). Une sauvegarde v1 se charge sans météo
 * (grille neuve, humidité = baseline).
 */
export const SAVE_VERSION = 2;

interface CellDeltas {
  /** Indices (y * width + x) des cellules modifiées vs la baseline. */
  indices: number[];
  /** Valeurs actuelles de ces cellules, alignées sur `indices`. */
  values: number[];
}

interface WeatherState {
  cloud: number[];
  windAngle: number;
  advectionX: number;
  advectionY: number;
  rngState: number;
}

export interface SaveDataV1 {
  version: 1;
  seed: number;
  width: number;
  height: number;
  seaLevel: number;
  tick: number;
  faith: number;
  devotion: number;
  terrain: { indices: number[]; heights: number[] };
}

export interface SaveDataV2 {
  version: 2;
  seed: number;
  width: number;
  height: number;
  seaLevel: number;
  tick: number;
  faith: number;
  devotion: number;
  heightDeltas: CellDeltas;
  moistureDeltas: CellDeltas;
  weather: WeatherState;
}

export type AnySaveData = SaveDataV1 | SaveDataV2;

function diff(current: Float32Array, baseline: Float32Array): CellDeltas {
  const indices: number[] = [];
  const values: number[] = [];
  for (let i = 0; i < current.length; i++) {
    if (current[i]! !== baseline[i]!) {
      indices.push(i);
      values.push(current[i]!);
    }
  }
  return { indices, values };
}

/** Capture l'état complet de la simulation en données JSON-sérialisables. */
export function serializeSimulation(sim: Simulation): SaveDataV2 {
  const { seed, width, height, seaLevel } = sim.worldConfig;
  const baseline = generateWorld(sim.worldConfig);
  return {
    version: SAVE_VERSION,
    seed,
    width,
    height,
    seaLevel,
    tick: sim.clock.tick,
    faith: sim.faith.current,
    devotion: sim.progression.devotion,
    heightDeltas: diff(sim.terrain.heightMap, baseline.heightMap),
    moistureDeltas: diff(sim.terrain.moisture, baseline.moisture),
    weather: sim.weather.serialize(),
  };
}

function applyDeltas(
  sim: Simulation,
  deltas: CellDeltas,
  set: (x: number, y: number, value: number) => void,
): void {
  if (deltas.indices.length !== deltas.values.length) {
    throw new Error("Corrupted save: deltas indices/values length mismatch");
  }
  for (let k = 0; k < deltas.indices.length; k++) {
    const i = deltas.indices[k]!;
    const x = i % sim.terrain.width;
    const y = Math.floor(i / sim.terrain.width);
    if (!sim.terrain.inBounds(x, y)) {
      throw new Error(`Corrupted save: index ${i} out of bounds`);
    }
    set(x, y, deltas.values[k]!);
  }
}

/** Migre une sauvegarde v1 vers la structure v2 (sans état météo). */
function migrateV1toV2(data: SaveDataV1): SaveDataV2 {
  return {
    version: 2,
    seed: data.seed,
    width: data.width,
    height: data.height,
    seaLevel: data.seaLevel,
    tick: data.tick,
    faith: data.faith,
    devotion: data.devotion,
    heightDeltas: { indices: data.terrain.indices, values: data.terrain.heights },
    moistureDeltas: { indices: [], values: [] },
    weather: { cloud: [], windAngle: 0, advectionX: 0, advectionY: 0, rngState: 0 },
  };
}

/**
 * Reconstruit une simulation à l'état exact de la sauvegarde. `options.now`
 * est passé tel quel au constructeur (injection de l'horloge de mesure).
 */
export function loadSimulation(raw: AnySaveData, options: { now?: () => number } = {}): Simulation {
  if (raw.version !== 1 && raw.version !== 2) {
    throw new Error(`Save version ${(raw as { version: number }).version} not supported`);
  }
  const data = raw.version === 1 ? migrateV1toV2(raw) : raw;

  const sim = new Simulation({
    seed: data.seed,
    width: data.width,
    height: data.height,
    seaLevel: data.seaLevel,
    ...(options.now ? { now: options.now } : {}),
  });

  applyDeltas(sim, data.heightDeltas, (x, y, v) => sim.terrain.setHeight(x, y, v));
  applyDeltas(sim, data.moistureDeltas, (x, y, v) => sim.terrain.setMoisture(x, y, v));

  sim.clock.tick = data.tick;
  sim.faith.current = Math.min(sim.faith.max, data.faith);
  sim.progression.restoreDevotion(data.devotion);

  // Restaure la météo si présente (absente pour une sauvegarde v1 migrée).
  if (data.weather.cloud.length > 0) {
    sim.weather.restore(data.weather);
  }

  // Ré-applique l'offset saisonnier du tick chargé, puis re-classifie.
  sim.reapplySeasonalOffset();
  sim.terrain.refreshDirtyChunks();
  return sim;
}
