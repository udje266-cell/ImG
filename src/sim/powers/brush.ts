import type { TerrainGrid } from "../terrain/TerrainGrid";
import type { AreaParams } from "./Power";

/**
 * Outils partagés par les pouvoirs de zone (docs/DIVINE_POWERS.md).
 * `forEachDisc` visite chaque tuile dans le disque (centre + rayon) avec son
 * atténuation radiale (1 au centre → 0 au bord). `areaCost` donne le barème
 * commun coût = base + parRayon × rayon.
 */
export function forEachDisc(
  terrain: TerrainGrid,
  cx: number,
  cy: number,
  radius: number,
  visit: (x: number, y: number, falloff: number) => void,
): void {
  const r = Math.max(1, Math.floor(radius));
  const r2 = r * r;
  for (let y = cy - r; y <= cy + r; y++) {
    for (let x = cx - r; x <= cx + r; x++) {
      if (!terrain.inBounds(x, y)) continue;
      const d2 = (x - cx) * (x - cx) + (y - cy) * (y - cy);
      if (d2 > r2) continue;
      visit(x, y, 1 - d2 / r2);
    }
  }
}

/** Barème de coût de Foi commun aux pouvoirs de zone. */
export function areaCost(base: number, perRadius: number, params: AreaParams): number {
  return base + Math.ceil(perRadius * Math.max(1, params.radius));
}

/** Bruit déterministe [0,1) stable par (x, y) — perturbations sans état RNG. */
export function hash01(x: number, y: number): number {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
}
