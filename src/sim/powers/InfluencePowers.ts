import { HERBIVORE } from "../ecology/FaunaSystem";
import type { Simulation } from "../world/Simulation";
import { areaCost } from "./brush";
import type { BeckonInvocation, Power, SpawnHerdInvocation } from "./Power";

/**
 * Appel du Lointain (École Murmures) : les habitants du rayon convergent vers
 * le point désigné, puis reprennent leur vie. La divinité oriente sans jamais
 * contraindre — elle ne pilote pas les habitants, elle les inspire.
 */
export class BeckonPower implements Power<BeckonInvocation> {
  readonly id = "beckon" as const;

  cost(_sim: Simulation, params: BeckonInvocation): number {
    return areaCost(30, 3, params);
  }

  apply(sim: Simulation, params: BeckonInvocation): void {
    sim.agents.beckon(params.x, params.y, params.radius);
  }
}

/**
 * Appel des Bêtes (École Bestiaire) : un troupeau d'herbivores surgit autour
 * du point. Nourrit les prédateurs et le garde-manger des chasseurs à venir.
 */
export class SpawnHerdPower implements Power<SpawnHerdInvocation> {
  readonly id = "spawnHerd" as const;

  cost(_sim: Simulation, params: SpawnHerdInvocation): number {
    return areaCost(90, 12, params);
  }

  apply(sim: Simulation, params: SpawnHerdInvocation): void {
    const count = Math.max(3, Math.round(params.radius));
    sim.fauna.spawnHerd(params.x, params.y, params.radius, count, HERBIVORE);
  }
}
