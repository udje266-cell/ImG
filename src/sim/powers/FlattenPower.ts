import type { Simulation } from "../world/Simulation";
import type { FlattenInvocation, Power } from "./Power";
import { FAITH_PER_HEIGHT } from "./TerraformPower";

/** Fraction of the gap to the target height closed by one invocation. */
export const FLATTEN_STRENGTH = 0.45;

/**
 * Second divine power (unlocked through devotion — docs/GDD.md §5.1):
 * levels the land inside the brush towards the height at its centre,
 * carving plateaus where villages can settle. Cost is proportional to the
 * total |Δheight| moved, like all terraforming.
 */
export class FlattenPower implements Power<FlattenInvocation> {
  readonly id = "flatten" as const;

  cost(sim: Simulation, params: FlattenInvocation): number {
    let total = 0;
    this.forEachBrushCell(sim, params, (_x, _y, delta) => {
      total += Math.abs(delta);
    });
    return Math.ceil(total * FAITH_PER_HEIGHT);
  }

  apply(sim: Simulation, params: FlattenInvocation): void {
    this.forEachBrushCell(sim, params, (x, y, delta) => {
      sim.terrain.modifyHeight(x, y, delta);
    });
  }

  private forEachBrushCell(
    sim: Simulation,
    params: FlattenInvocation,
    visit: (x: number, y: number, delta: number) => void,
  ): void {
    const { x: cx, y: cy, radius } = params;
    if (!sim.terrain.inBounds(cx, cy)) return;
    const target = sim.terrain.heightAt(cx, cy);
    const r = Math.max(1, Math.floor(radius));
    const r2 = r * r;
    for (let y = cy - r; y <= cy + r; y++) {
      for (let x = cx - r; x <= cx + r; x++) {
        if (!sim.terrain.inBounds(x, y)) continue;
        const d2 = (x - cx) * (x - cx) + (y - cy) * (y - cy);
        if (d2 > r2) continue;
        const falloff = 1 - d2 / r2;
        const gap = target - sim.terrain.heightAt(x, y);
        visit(x, y, gap * FLATTEN_STRENGTH * falloff);
      }
    }
  }
}
