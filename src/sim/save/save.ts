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
 * état du stream RNG "weather"). Une sauvegarde v1 se charge sans météo.
 * v2 → v3 : ajout de la flore (densité + état du stream RNG "flora").
 * v3 → v4 : ajout des habitants (positions, besoins, ferveur, foyers, RNG).
 * v4 → v5 : ajout de la faune (positions, énergie, espèce, RNG).
 * v5 → v6 : ajout des villages/foyers (centres de village + huttes).
 * v6 → v7 : vie de village — huttes par village (vhuts) + champs (fx, fy).
 * Une sauvegarde plus ancienne se charge sans la partie manquante.
 */
export const SAVE_VERSION = 7;

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

interface FloraState {
  density: number[];
  rngState: number;
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

export interface SaveDataV3 {
  version: 3;
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
  flora: FloraState;
}

type AgentsState = ReturnType<Simulation["agents"]["serialize"]>;
type FaunaState = ReturnType<Simulation["fauna"]["serialize"]>;
type SettlementsState = ReturnType<Simulation["settlements"]["serialize"]>;

/** Forme FIGÉE des villages en v6 (avant vie de village) — ne pas dériver. */
interface SettlementsStateV6 {
  vx: number[];
  vy: number[];
  vpop: number[];
  dx: number[];
  dy: number[];
}

export interface SaveDataV4 extends Omit<SaveDataV3, "version"> {
  version: 4;
  agents: AgentsState;
}

export interface SaveDataV5 extends Omit<SaveDataV4, "version"> {
  version: 5;
  fauna: FaunaState;
}

export interface SaveDataV6 extends Omit<SaveDataV5, "version"> {
  version: 6;
  settlements: SettlementsStateV6;
}

export interface SaveDataV7 extends Omit<SaveDataV6, "version" | "settlements"> {
  version: 7;
  settlements: SettlementsState;
}

export type AnySaveData =
  | SaveDataV1
  | SaveDataV2
  | SaveDataV3
  | SaveDataV4
  | SaveDataV5
  | SaveDataV6
  | SaveDataV7;

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
export function serializeSimulation(sim: Simulation): SaveDataV7 {
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
    agents: sim.agents.serialize(),
    fauna: sim.fauna.serialize(),
    settlements: sim.settlements.serialize(),
    heightDeltas: diff(sim.terrain.heightMap, baseline.heightMap),
    moistureDeltas: diff(sim.terrain.moisture, baseline.moisture),
    weather: sim.weather.serialize(),
    flora: sim.flora.serialize(),
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

const EMPTY_WEATHER: WeatherState = { cloud: [], windAngle: 0, advectionX: 0, advectionY: 0, rngState: 0 };
const EMPTY_FLORA: FloraState = { density: [], rngState: 0 };
const EMPTY_AGENTS: AgentsState = {
  px: [], py: [], hunger: [], fatigue: [], fervour: [], piety: [], homeX: [], homeY: [], rngState: 0,
};
const EMPTY_FAUNA: FaunaState = { px: [], py: [], energy: [], species: [], cooldown: [], rngState: 0 };
const EMPTY_SETTLEMENTS: SettlementsState = { vx: [], vy: [], vpop: [], vhuts: [], dx: [], dy: [], fx: [], fy: [] };

/** Migre une sauvegarde v1 (sans météo/flore/habitants/faune/villages) vers la structure courante. */
function migrateV1(data: SaveDataV1): SaveDataV7 {
  return {
    version: 7,
    seed: data.seed,
    width: data.width,
    height: data.height,
    seaLevel: data.seaLevel,
    tick: data.tick,
    faith: data.faith,
    devotion: data.devotion,
    heightDeltas: { indices: data.terrain.indices, values: data.terrain.heights },
    moistureDeltas: { indices: [], values: [] },
    weather: EMPTY_WEATHER,
    flora: EMPTY_FLORA,
    agents: EMPTY_AGENTS,
    fauna: EMPTY_FAUNA,
    settlements: EMPTY_SETTLEMENTS,
  };
}

function migrateV2(data: SaveDataV2): SaveDataV7 {
  return {
    ...data, version: 7, flora: EMPTY_FLORA, agents: EMPTY_AGENTS,
    fauna: EMPTY_FAUNA, settlements: EMPTY_SETTLEMENTS,
  };
}

function migrateV3(data: SaveDataV3): SaveDataV7 {
  return { ...data, version: 7, agents: EMPTY_AGENTS, fauna: EMPTY_FAUNA, settlements: EMPTY_SETTLEMENTS };
}

function migrateV4(data: SaveDataV4): SaveDataV7 {
  return { ...data, version: 7, fauna: EMPTY_FAUNA, settlements: EMPTY_SETTLEMENTS };
}

function migrateV5(data: SaveDataV5): SaveDataV7 {
  return { ...data, version: 7, settlements: EMPTY_SETTLEMENTS };
}

/** v6 → v7 : villages sans vie de village — huttes estimées au restore, aucun champ. */
function migrateV6(data: SaveDataV6): SaveDataV7 {
  return {
    ...data,
    version: 7,
    settlements: { ...data.settlements, vhuts: [], fx: [], fy: [] },
  };
}

/**
 * Reconstruit une simulation à l'état exact de la sauvegarde. `options.now`
 * est passé tel quel au constructeur (injection de l'horloge de mesure).
 */
export function loadSimulation(raw: AnySaveData, options: { now?: () => number } = {}): Simulation {
  let data: SaveDataV7;
  if (raw.version === 1) data = migrateV1(raw);
  else if (raw.version === 2) data = migrateV2(raw);
  else if (raw.version === 3) data = migrateV3(raw);
  else if (raw.version === 4) data = migrateV4(raw);
  else if (raw.version === 5) data = migrateV5(raw);
  else if (raw.version === 6) data = migrateV6(raw);
  else if (raw.version === 7) data = raw;
  else throw new Error(`Save version ${(raw as { version: number }).version} not supported`);

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

  // Restaure météo, flore et habitants si présents (absents pour une sauvegarde ancienne).
  if (data.weather.cloud.length > 0) sim.weather.restore(data.weather);
  if (data.flora.density.length > 0) sim.flora.restore(data.flora);
  if (data.agents.px.length > 0) sim.agents.restore(data.agents);
  if (data.fauna.px.length > 0) sim.fauna.restore(data.fauna);
  if (data.settlements.vx.length > 0) sim.settlements.restore(data.settlements);

  // Ré-applique la saison du tick chargé, puis re-classifie.
  sim.reapplySeasonalOffset();
  sim.terrain.refreshDirtyChunks();
  return sim;
}
