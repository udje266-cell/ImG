import type { Simulation } from "../world/Simulation";
import { areaCost } from "./brush";
import type { AbundanceInvocation, BenedictionInvocation, Power } from "./Power";

/**
 * Corne d'Abondance (École Grâces) : la terre se couvre de verdure luxuriante
 * et les habitants de la zone sont rassasiés, leur ferveur ravivée. Le pouvoir
 * de « bon dieu » par excellence — cher, mais fidélise un peuple.
 */
export class AbundancePower implements Power<AbundanceInvocation> {
  readonly id = "abundance" as const;

  cost(_sim: Simulation, params: AbundanceInvocation): number {
    return areaCost(140, 10, params);
  }

  apply(sim: Simulation, params: AbundanceInvocation): void {
    sim.flora.fertilize(params.x, params.y, params.radius, 0.95);
    sim.agents.bless(params.x, params.y, params.radius, 0.6, 0.4);
    sim.bus.emit("flora:updated", {});
  }
}

/**
 * Onction (École Grâces) : bénédiction spirituelle — la ferveur des habitants
 * du rayon bondit (peu d'effet matériel). Nourrit directement la Foi.
 */
export class BenedictionPower implements Power<BenedictionInvocation> {
  readonly id = "benediction" as const;

  cost(_sim: Simulation, params: BenedictionInvocation): number {
    return areaCost(70, 6, params);
  }

  apply(sim: Simulation, params: BenedictionInvocation): void {
    sim.agents.bless(params.x, params.y, params.radius, 0.1, 0.9);
  }
}
