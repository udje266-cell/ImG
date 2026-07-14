import type { Simulation } from "../world/Simulation";
import { areaCost, forEachDisc } from "./brush";
import type { DroughtInvocation, Power } from "./Power";

/**
 * Sécheresse (École Climatomancie, contre de la Pluie) : assèche le sol dans
 * la zone. La végétation régresse ensuite d'elle-même, la capacité tombant
 * avec l'humidité — la nature sanctionne, le miracle ne fait qu'ôter l'eau.
 */
export class DroughtPower implements Power<DroughtInvocation> {
  readonly id = "drought" as const;

  cost(_sim: Simulation, params: DroughtInvocation): number {
    return areaCost(45, 6, params);
  }

  apply(sim: Simulation, params: DroughtInvocation): void {
    forEachDisc(sim.terrain, params.x, params.y, params.radius, (x, y, f) => {
      const cur = sim.terrain.moisture[sim.terrain.index(x, y)]!;
      sim.terrain.setMoisture(x, y, cur * (1 - 0.8 * f));
    });
  }
}
