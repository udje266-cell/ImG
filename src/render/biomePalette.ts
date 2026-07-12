import { Biome } from "../sim/worldgen/biomes";
import type { TerrainGrid } from "../sim/terrain/TerrainGrid";

/**
 * Pastel low-poly palette (docs/GDD.md §6) and pure colour helpers shared by
 * the 3D terrain mesh. RGB components are 0-255; the mesh normalises them.
 */
export type Rgb = readonly [number, number, number];

export const BIOME_COLORS: Record<Biome, Rgb> = {
  [Biome.Ocean]: [47, 143, 196], // seabed uses the depth ramp below instead
  [Biome.Beach]: [232, 216, 166],
  [Biome.Grassland]: [156, 203, 98],
  [Biome.TemperateForest]: [111, 174, 84],
  [Biome.TropicalForest]: [77, 160, 92],
  [Biome.Savanna]: [207, 194, 110],
  [Biome.Desert]: [232, 212, 148],
  [Biome.Steppe]: [184, 178, 118],
  [Biome.Taiga]: [122, 162, 122],
  [Biome.Tundra]: [185, 192, 174],
  [Biome.Mountain]: [168, 159, 146],
  [Biome.Snow]: [242, 245, 247],
};

export const SAND_COLOR: Rgb = BIOME_COLORS[Biome.Beach];
export const DEEP_WATER_FLOOR: Rgb = [23, 84, 133];

export function lerpColor(a: Rgb, b: Rgb, t: number): [number, number, number] {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

/** Base colour of a cell for land blending; water cells count as sand. */
export function cellLandColor(terrain: TerrainGrid, x: number, y: number): Rgb {
  const cx = Math.min(terrain.width - 1, Math.max(0, x));
  const cy = Math.min(terrain.height - 1, Math.max(0, y));
  if (terrain.isWater(cx, cy)) return SAND_COLOR;
  return BIOME_COLORS[terrain.biomeAt(cx, cy)];
}

/**
 * Bilinear blend of the four cells around a world position, so biome
 * boundaries are soft gradients instead of hard tile edges.
 */
export function blendedLandColor(
  terrain: TerrainGrid,
  wx: number,
  wy: number,
): [number, number, number] {
  const u = wx - 0.5;
  const v = wy - 0.5;
  const x0 = Math.floor(u);
  const y0 = Math.floor(v);
  const fx = u - x0;
  const fy = v - y0;
  const c00 = cellLandColor(terrain, x0, y0);
  const c10 = cellLandColor(terrain, x0 + 1, y0);
  const c01 = cellLandColor(terrain, x0, y0 + 1);
  const c11 = cellLandColor(terrain, x0 + 1, y0 + 1);
  const top = lerpColor(c00, c10, fx);
  const bottom = lerpColor(c01, c11, fx);
  return lerpColor(top, bottom, fy);
}
