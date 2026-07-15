import type { Simulation } from "../world/Simulation";
import { areaCost } from "./brush";
import type { BurningBushInvocation, Power } from "./Power";

/**
 * Buisson Ardent (École Mystères — Exode 3:2 : « le buisson était tout en feu,
 * et le buisson ne se consumait point ») : un prodige pur, sans effet matériel
 * — mais quiconque le voit en ressort embrasé. La ferveur des habitants du
 * disque bondit ; c'est le pouvoir de révélation par excellence.
 */
export class BurningBushPower implements Power<BurningBushInvocation> {
  readonly id = "burningBush" as const;

  cost(_sim: Simulation, params: BurningBushInvocation): number {
    return areaCost(60, 5, params);
  }

  apply(sim: Simulation, params: BurningBushInvocation): void {
    sim.agents.bless(params.x, params.y, Math.min(params.radius, 6), 0, 1.2);
  }
}
