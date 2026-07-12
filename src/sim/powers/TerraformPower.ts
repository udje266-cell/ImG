import type { Simulation } from "../world/Simulation";
import type { Power, TerraformInvocation } from "./Power";

/** Height change at the brush centre for a single invocation. */
export const TERRAFORM_STRENGTH = 0.02;
/** Faith cost per unit of |Δheight| moved. Provisional balance value. */
export const FAITH_PER_HEIGHT = 8;

/**
 * The first divine power: raise or lower the land with a soft round brush
 * (quadratic falloff). Biomes react on their own — dig below sea level and
 * the sea floods in; pile land high enough and snow caps appear.
 */
export class TerraformPower implements Power<TerraformInvocation> {
  readonly id = "terraform" as const;

  cost(sim: Simulation, params: TerraformInvocation): number {
    let totalDelta = 0;
    this.forEachBrushCell(sim, params, (_x, _y, delta) => {
      totalDelta += Math.abs(delta);
    });
    return Math.ceil(totalDelta * FAITH_PER_HEIGHT);
  }

  apply(sim: Simulation, params: TerraformInvocation): void {
    this.forEachBrushCell(sim, params, (x, y, delta) => {
      sim.terrain.modifyHeight(x, y, delta);
    });
  }

  /** Visit every in-bounds cell of the brush with its height delta. */
  private forEachBrushCell(
    sim: Simulation,
    params: TerraformInvocation,
    visit: (x: number, y: number, delta: number) => void,
  ): void {
    const { x: cx, y: cy, radius, direction } = params;
    const r = Math.max(1, Math.floor(radius));
    const r2 = r * r;
    for (let y = cy - r; y <= cy + r; y++) {
      for (let x = cx - r; x <= cx + r; x++) {
        if (!sim.terrain.inBounds(x, y)) continue;
        const d2 = (x - cx) * (x - cx) + (y - cy) * (y - cy);
        if (d2 > r2) continue;
        const falloff = 1 - d2 / r2;
        visit(x, y, direction * TERRAFORM_STRENGTH * falloff);
      }
    }
  }
}
