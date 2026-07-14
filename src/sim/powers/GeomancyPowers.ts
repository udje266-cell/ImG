import type { Simulation } from "../world/Simulation";
import { areaCost, forEachDisc } from "./brush";
import type { BasinInvocation, OrogenesisInvocation, Power } from "./Power";

/** Amplitude de relief d'une invocation (bien plus fort que le pinceau de base). */
const PEAK_STRENGTH = 0.07;

/**
 * Orogenèse (École Géomancie) : soulève une montagne escarpée d'un seul geste
 * — le relief monte fort au centre, s'estompe au bord. La neige coiffe les
 * sommets d'elle-même (le biome réagit à l'altitude).
 */
export class OrogenesisPower implements Power<OrogenesisInvocation> {
  readonly id = "orogenesis" as const;

  cost(_sim: Simulation, params: OrogenesisInvocation): number {
    return areaCost(90, 14, params);
  }

  apply(sim: Simulation, params: OrogenesisInvocation): void {
    // Falloff² : pic pointu au centre plutôt qu'un dôme mou.
    forEachDisc(sim.terrain, params.x, params.y, params.radius, (x, y, f) => {
      sim.terrain.modifyHeight(x, y, PEAK_STRENGTH * f * f);
    });
  }
}

/**
 * Bassin (École Géomancie) : creuse une cuvette. Sous le niveau de la mer,
 * l'eau s'y engouffre — un lac ou une baie naît sans être scriptée.
 */
export class BasinPower implements Power<BasinInvocation> {
  readonly id = "basin" as const;

  cost(_sim: Simulation, params: BasinInvocation): number {
    return areaCost(80, 12, params);
  }

  apply(sim: Simulation, params: BasinInvocation): void {
    forEachDisc(sim.terrain, params.x, params.y, params.radius, (x, y, f) => {
      sim.terrain.modifyHeight(x, y, -PEAK_STRENGTH * f * f);
    });
  }
}
