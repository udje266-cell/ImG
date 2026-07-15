import type { Simulation } from "../world/Simulation";
import { areaCost, forEachDisc, hash01 } from "./brush";
import type {
  EarthquakeInvocation,
  LightningInvocation,
  Power,
  VolcanoInvocation,
} from "./Power";

/**
 * Foudre (École Courroux) : un éclair frappe un point — la végétation se
 * calcine et la faune proche périt sur un petit rayon. Peu coûteux, chirurgical.
 */
export class LightningPower implements Power<LightningInvocation> {
  readonly id = "lightning" as const;

  cost(_sim: Simulation, params: LightningInvocation): number {
    return areaCost(40, 4, params);
  }

  apply(sim: Simulation, params: LightningInvocation): void {
    const r = Math.max(1, Math.min(3, params.radius));
    sim.flora.scorch(params.x, params.y, r);
    sim.fauna.cull(params.x, params.y, r);
  }
}

/**
 * Réveil du Titan (École Courroux, T5) : un cône volcanique jaillit, la terre
 * brûle tout autour et la faune fuit ou périt. Trace durable dans le relief.
 */
export class VolcanoPower implements Power<VolcanoInvocation> {
  readonly id = "volcano" as const;

  cost(_sim: Simulation, params: VolcanoInvocation): number {
    return areaCost(220, 20, params);
  }

  apply(sim: Simulation, params: VolcanoInvocation): void {
    // Cône escarpé (falloff³ = pointe marquée).
    forEachDisc(sim.terrain, params.x, params.y, params.radius, (x, y, f) => {
      sim.terrain.modifyHeight(x, y, 0.11 * f * f * f);
    });
    // Terres brûlées et faune décimée sur une aire plus large que le cône.
    const blast = params.radius * 1.6;
    sim.flora.scorch(params.x, params.y, blast);
    sim.fauna.cull(params.x, params.y, blast);
  }
}

/**
 * Séisme (École Courroux) : le relief se convulse dans un rayon (perturbation
 * déterministe, forte au centre). Ravine les plateaux, éboule les pentes.
 */
export class EarthquakePower implements Power<EarthquakeInvocation> {
  readonly id = "earthquake" as const;

  cost(_sim: Simulation, params: EarthquakeInvocation): number {
    return areaCost(120, 10, params);
  }

  apply(sim: Simulation, params: EarthquakeInvocation): void {
    const { x: cx, y: cy } = params;
    forEachDisc(sim.terrain, cx, cy, params.radius, (x, y, f) => {
      // Bruit stable par tuile+épicentre : ±amplitude, atténué vers le bord.
      const n = hash01(x * 13.1 + cx, y * 7.3 + cy) - 0.5;
      sim.terrain.modifyHeight(x, y, n * 0.06 * f);
    });
  }
}
