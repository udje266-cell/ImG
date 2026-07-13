import type { Season } from "../../core/time/GameClock";

/**
 * Décalage thermique appliqué à la classification des biomes selon la saison
 * (docs/GDD.md §3.4). Positif en été (les biomes chauds s'étendent), négatif
 * en hiver (la neige et la toundra descendent). Fonction pure et testée.
 *
 * Valeur en unités de température normalisée (comme baseTemperature ∈ [0,1]).
 */
export const SEASONAL_TEMPERATURE_OFFSET: Record<Season, number> = {
  spring: 0,
  summer: 0.12,
  autumn: 0,
  winter: -0.12,
};

export function seasonalOffset(season: Season): number {
  return SEASONAL_TEMPERATURE_OFFSET[season];
}
