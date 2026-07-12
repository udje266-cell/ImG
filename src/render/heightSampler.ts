import type { TerrainGrid } from "../sim/terrain/TerrainGrid";

/**
 * Bilinear height sampling between cell centres, clamped at the map edges.
 * Lets the renderer draw the height field at sub-tile resolution, turning
 * blocky cells into the smooth organic contour curves of the Godus look.
 * Read-only helper — pure function of the grid.
 */
export function sampleHeightBilinear(terrain: TerrainGrid, wx: number, wy: number): number {
  // Cell (x, y) holds the height at its centre (x + 0.5, y + 0.5).
  const u = Math.min(terrain.width - 1, Math.max(0, wx - 0.5));
  const v = Math.min(terrain.height - 1, Math.max(0, wy - 0.5));
  const x0 = Math.floor(u);
  const y0 = Math.floor(v);
  const x1 = Math.min(x0 + 1, terrain.width - 1);
  const y1 = Math.min(y0 + 1, terrain.height - 1);
  const fx = u - x0;
  const fy = v - y0;

  const h00 = terrain.heightMap[y0 * terrain.width + x0]!;
  const h10 = terrain.heightMap[y0 * terrain.width + x1]!;
  const h01 = terrain.heightMap[y1 * terrain.width + x0]!;
  const h11 = terrain.heightMap[y1 * terrain.width + x1]!;

  const top = h00 + (h10 - h00) * fx;
  const bottom = h01 + (h11 - h01) * fx;
  return top + (bottom - top) * fy;
}
