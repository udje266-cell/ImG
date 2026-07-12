import { Noise2D } from "../../core/math/Noise2D";
import { Rng } from "../../core/math/Rng";
import { TerrainGrid } from "../terrain/TerrainGrid";

/**
 * Procedural world generation (see docs/TDD.md §4.2).
 * Pure pipeline: seed + config in, TerrainGrid out — same seed, same world.
 */
export interface WorldGenConfig {
  seed: number;
  width: number;
  height: number;
  seaLevel?: number;
}

/** Feature size of the main landmass noise, in tiles. */
const HEIGHT_SCALE = 1 / 56;
const MOISTURE_SCALE = 1 / 36;
const TEMPERATURE_NOISE_SCALE = 1 / 28;

export function generateWorld(config: WorldGenConfig): TerrainGrid {
  const seaLevel = config.seaLevel ?? 0.5;
  const grid = new TerrainGrid(config.width, config.height, seaLevel);

  // Independent named streams: adding a layer never reshuffles the others.
  const rng = new Rng(config.seed);
  const heightNoise = new Noise2D(rng.fork("worldgen:height").nextUint32());
  const moistureNoise = new Noise2D(rng.fork("worldgen:moisture").nextUint32());
  const temperatureNoise = new Noise2D(rng.fork("worldgen:temperature").nextUint32());

  for (let y = 0; y < config.height; y++) {
    // 0 at the equator (map centre), 1 at the poles (top/bottom edges).
    const latitude = Math.abs((2 * y) / (config.height - 1) - 1);
    for (let x = 0; x < config.width; x++) {
      const i = grid.index(x, y);

      // Elevation: 5-octave fBm, redistributed towards lowlands for seas.
      const h = heightNoise.fbm(x * HEIGHT_SCALE, y * HEIGHT_SCALE, 5);
      grid.heightMap[i] = Math.pow(h, 1.2);

      // Sea-level temperature: latitudinal gradient + local variation.
      const wobble = temperatureNoise.value(x * TEMPERATURE_NOISE_SCALE, y * TEMPERATURE_NOISE_SCALE) - 0.5;
      const temperature = 0.92 * (1 - latitude * latitude * 0.95) + 0.16 * wobble;
      grid.baseTemperature[i] = Math.min(1, Math.max(0, temperature));

      grid.moisture[i] = moistureNoise.fbm(x * MOISTURE_SCALE, y * MOISTURE_SCALE, 4);
    }
  }

  grid.refreshAllBiomes();
  return grid;
}
