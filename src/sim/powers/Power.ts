import type { Simulation } from "../world/Simulation";

/**
 * Divine powers (see docs/GDD.md §5.2, docs/TDD.md §4.4).
 * Every power invocation is data (a discriminated union), so intents can be
 * queued on the event bus, costed, validated, saved and replayed.
 */
export interface TerraformInvocation {
  power: "terraform";
  /** Brush centre, in world tile coordinates. */
  x: number;
  y: number;
  /** Brush radius in tiles. */
  radius: number;
  /** +1 raises the terrain, -1 lowers it. */
  direction: 1 | -1;
}

/** Levels the land inside the brush towards the height at its centre. */
export interface FlattenInvocation {
  power: "flatten";
  x: number;
  y: number;
  radius: number;
}

/** Sature les nuages au-dessus de la zone : la pluie suit naturellement. */
export interface RainInvocation {
  power: "rain";
  x: number;
  y: number;
  /** Rayon d'ensemencement, en tuiles. */
  radius: number;
}

/** Fait verdoyer la végétation vers sa capacité dans un rayon (école Nature). */
export interface GrowthInvocation {
  power: "growth";
  x: number;
  y: number;
  radius: number;
}

/** Union of all power invocations — grows as new powers are added. */
export type PowerInvocation =
  | TerraformInvocation
  | FlattenInvocation
  | RainInvocation
  | GrowthInvocation;

export type PowerId = PowerInvocation["power"];

export interface Power<P extends PowerInvocation = PowerInvocation> {
  readonly id: P["power"];
  /** Faith cost of this invocation. Pure, deterministic, computed before applying. */
  cost(sim: Simulation, params: P): number;
  /** Apply the effect. Only called after the cost has been paid. */
  apply(sim: Simulation, params: P): void;
}
