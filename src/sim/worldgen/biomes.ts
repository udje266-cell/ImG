/**
 * Biome classification (see docs/GDD.md §3.2).
 *
 * A biome is a pure function of (height, base temperature, moisture, sea
 * level). Base temperature is the sea-level temperature; the altitude lapse
 * is applied here, so raising a mountain naturally turns its top to snow and
 * digging below sea level naturally floods — the heart of terraforming.
 */
export enum Biome {
  Ocean = 0,
  Beach = 1,
  Grassland = 2,
  TemperateForest = 3,
  TropicalForest = 4,
  Savanna = 5,
  Desert = 6,
  Steppe = 7,
  Taiga = 8,
  Tundra = 9,
  Mountain = 10,
  Snow = 11,
}

export const BIOME_COUNT = 12;

/** Temperature drop per unit of height above sea level (normalised units). */
export const ALTITUDE_LAPSE = 2.0;

/** Height above sea level where bare rock replaces vegetation. */
export const MOUNTAIN_LEVEL = 0.75;

/** Width of the coastal band above sea level. */
export const BEACH_BAND = 0.02;

export function classifyBiome(
  height: number,
  baseTemperature: number,
  moisture: number,
  seaLevel: number,
): Biome {
  if (height < seaLevel) return Biome.Ocean;
  if (height < seaLevel + BEACH_BAND) return Biome.Beach;

  const temperature = baseTemperature - ALTITUDE_LAPSE * (height - seaLevel);

  if (temperature < 0.12) return Biome.Snow; // polar latitudes or high peaks
  if (height >= MOUNTAIN_LEVEL) return Biome.Mountain;
  if (temperature < 0.24) return Biome.Tundra;
  if (temperature < 0.45) return moisture < 0.35 ? Biome.Steppe : Biome.Taiga;
  if (temperature < 0.7) {
    if (moisture < 0.3) return Biome.Steppe;
    if (moisture < 0.62) return Biome.Grassland;
    return Biome.TemperateForest;
  }
  if (moisture < 0.28) return Biome.Desert;
  if (moisture < 0.55) return Biome.Savanna;
  return Biome.TropicalForest;
}
