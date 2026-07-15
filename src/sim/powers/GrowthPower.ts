import type { Simulation } from "../world/Simulation";
import type { GrowthInvocation, Power } from "./Power";

/** Coût de base + composante liée à la surface verdie. */
const BASE_COST = 50;
const COST_PER_RADIUS = 5;

/**
 * Pouvoir « Verdoiement » (docs/DIVINE_POWERS.md, école Nature) : d'un geste,
 * la divinité fait jaillir la végétation vers la capacité écologique de la
 * zone. Comme la pluie, le miracle **amorce la nature** (il ne peut verdir ni
 * l'eau ni un sol stérile) : les habitants y trouveront ensuite de quoi se
 * nourrir, ce qui nourrit la Foi — la boucle divine du GDD §2.
 */
export class GrowthPower implements Power<GrowthInvocation> {
  readonly id = "growth" as const;

  cost(_sim: Simulation, params: GrowthInvocation): number {
    return BASE_COST + Math.ceil(COST_PER_RADIUS * Math.max(1, params.radius));
  }

  apply(sim: Simulation, params: GrowthInvocation): void {
    sim.flora.fertilize(params.x, params.y, params.radius);
    // Réveille le rendu des forêts (la couche se reconstruit sur cet événement).
    sim.bus.emit("flora:updated", {});
  }
}
