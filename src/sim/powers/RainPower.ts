import type { Simulation } from "../world/Simulation";
import type { Power, RainInvocation } from "./Power";

/** Coût de base + composante liée à la surface ensemencée. */
const BASE_COST = 60;
const COST_PER_RADIUS = 8;

/**
 * Pouvoir « Invoquer la pluie » (docs/GDD.md §5.2, catégorie Climat & météo) :
 * sature les nuages au-dessus de la zone visée. La pluie qui suit — et le
 * verdissement du sol — est le comportement normal du WeatherSystem, pas un
 * effet scripté : le miracle ne fait qu'amorcer la nature.
 */
export class RainPower implements Power<RainInvocation> {
  readonly id = "rain" as const;

  cost(_sim: Simulation, params: RainInvocation): number {
    return BASE_COST + Math.ceil(COST_PER_RADIUS * Math.max(1, params.radius));
  }

  apply(sim: Simulation, params: RainInvocation): void {
    sim.weather.seedClouds(params.x, params.y, params.radius);
  }
}
