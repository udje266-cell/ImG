/**
 * Faith: the divine resource (see docs/GDD.md §5.1).
 *
 * MVP: flat passive regeneration. From the religion phase onwards, income
 * will be driven by believers (fervour x population) instead.
 * Balance constants are provisional and will be tuned with playtests.
 */
export interface FaithConfig {
  initial?: number;
  max?: number;
  regenPerTick?: number;
}

export class FaithSystem {
  current: number;
  readonly max: number;
  readonly regenPerTick: number;

  constructor(config: FaithConfig = {}) {
    this.max = config.max ?? 2000;
    this.current = Math.min(this.max, config.initial ?? 1000);
    this.regenPerTick = config.regenPerTick ?? 4;
  }

  /** Spend atomically: either the full amount is paid, or nothing happens. */
  trySpend(amount: number): boolean {
    if (amount < 0 || !Number.isFinite(amount)) {
      throw new Error(`FaithSystem.trySpend: invalid amount ${amount}`);
    }
    if (amount > this.current) return false;
    this.current -= amount;
    return true;
  }

  /** Called once per tick. */
  update(): void {
    this.current = Math.min(this.max, this.current + this.regenPerTick);
  }
}
