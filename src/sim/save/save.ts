import { Simulation } from "../world/Simulation";
import { generateWorld } from "../worldgen/WorldGenerator";

/**
 * Sauvegarde versionnée (docs/TDD.md §4.6). Le terrain n'est pas stocké en
 * entier : on régénère la baseline depuis la seed (déterminisme garanti) et
 * on ne garde que les cellules qui en divergent (terraforming du joueur).
 *
 * Toute évolution du format incrémente `version` et passe par une migration
 * explicite dans `loadSimulation` — jamais de champ réinterprété en place.
 *
 * NOTE v1 : aucun consommateur de `sim.rng` n'existe encore (le worldgen a
 * ses propres streams dérivés de la seed). Quand la météo/écologie arriveront,
 * l'état des streams RNG devra entrer dans la sauvegarde (version 2).
 */
export const SAVE_VERSION = 1;

export interface SaveDataV1 {
  version: 1;
  seed: number;
  width: number;
  height: number;
  seaLevel: number;
  tick: number;
  faith: number;
  devotion: number;
  terrain: {
    /** Indices (y * width + x) des cellules modifiées par rapport à la baseline. */
    indices: number[];
    /** Hauteurs actuelles de ces cellules, alignées sur `indices`. */
    heights: number[];
  };
}

/** Capture l'état complet de la simulation en données JSON-sérialisables. */
export function serializeSimulation(sim: Simulation): SaveDataV1 {
  const { seed, width, height, seaLevel } = sim.worldConfig;
  const baseline = generateWorld(sim.worldConfig);
  const indices: number[] = [];
  const heights: number[] = [];
  for (let i = 0; i < sim.terrain.heightMap.length; i++) {
    const current = sim.terrain.heightMap[i]!;
    if (current !== baseline.heightMap[i]!) {
      indices.push(i);
      heights.push(current);
    }
  }
  return {
    version: SAVE_VERSION,
    seed,
    width,
    height,
    seaLevel,
    tick: sim.clock.tick,
    faith: sim.faith.current,
    devotion: sim.progression.devotion,
    terrain: { indices, heights },
  };
}

/** Reconstruit une simulation à l'état exact de la sauvegarde. */
export function loadSimulation(data: SaveDataV1): Simulation {
  if (data.version !== SAVE_VERSION) {
    throw new Error(`Save version ${data.version} not supported (expected ${SAVE_VERSION})`);
  }
  if (data.terrain.indices.length !== data.terrain.heights.length) {
    throw new Error("Corrupted save: terrain indices/heights length mismatch");
  }

  const sim = new Simulation({
    seed: data.seed,
    width: data.width,
    height: data.height,
    seaLevel: data.seaLevel,
  });

  const { indices, heights } = data.terrain;
  for (let k = 0; k < indices.length; k++) {
    const i = indices[k]!;
    const x = i % sim.terrain.width;
    const y = Math.floor(i / sim.terrain.width);
    if (!sim.terrain.inBounds(x, y)) {
      throw new Error(`Corrupted save: terrain index ${i} out of bounds`);
    }
    sim.terrain.setHeight(x, y, heights[k]!);
  }
  // Re-dérive les biomes des chunks touchés avant le premier rendu.
  sim.terrain.refreshDirtyChunks();

  sim.clock.tick = data.tick;
  sim.faith.current = Math.min(sim.faith.max, data.faith);
  sim.progression.restoreDevotion(data.devotion);
  return sim;
}
