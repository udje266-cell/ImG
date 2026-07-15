import type { PowerId } from "./Power";

/**
 * L'Étincelle divine (docs/DIVINE_POWERS.md §1.2) — la ressource de TEMPO.
 *
 * Jauge unique 0–100 qui se régénère lentement avec le temps. Les miracles
 * **catastrophiques** (Courroux, Fléaux) en consomment en plus de la Foi :
 * même riche en Foi, on ne peut pas enchaîner les dévastations — c'est le
 * levier d'équilibrage des pouvoirs de fin de partie. Les miracles doux
 * (terraforming, grâces, murmures) n'en coûtent pas.
 */
export interface SparkConfig {
  initial?: number;
  max?: number;
  regenPerTick?: number;
}

/** Coût d'Étincelle par pouvoir (0 = miracle doux, sans tempo). */
export const SPARK_COSTS: Partial<Record<PowerId, number>> = {
  lightning: 8,
  earthquake: 25,
  volcano: 45,
  locusts: 15,
  livestockPlague: 15,
  fireHail: 30,
  darkness: 20,
  deluge: 50,
};

/** ~+1 point / 3 s de temps réel (10 ticks/s × 0,033). */
const DEFAULT_REGEN_PER_TICK = 1 / 30;

export class SparkSystem {
  current: number;
  readonly max: number;
  readonly regenPerTick: number;

  constructor(config: SparkConfig = {}) {
    this.max = config.max ?? 100;
    this.current = Math.min(this.max, config.initial ?? this.max);
    this.regenPerTick = config.regenPerTick ?? DEFAULT_REGEN_PER_TICK;
  }

  /** Dépense atomique : tout ou rien. */
  trySpend(amount: number): boolean {
    if (amount < 0 || !Number.isFinite(amount)) {
      throw new Error(`SparkSystem.trySpend: invalid amount ${amount}`);
    }
    if (amount > this.current) return false;
    this.current -= amount;
    return true;
  }

  /** Régénération passive, une fois par tick. */
  update(): void {
    this.current = Math.min(this.max, this.current + this.regenPerTick);
  }
}
