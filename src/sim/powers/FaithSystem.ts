/**
 * Faith: the divine resource (see docs/GDD.md §5.1).
 *
 * A small flat regen keeps the world playable before/without believers;
 * the main income now comes from the inhabitants (fervour × population) via
 * `add()` (AgentSystem). Balance constants are provisional.
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

  /** Add faith (believers' income), capped at max. */
  add(amount: number): void {
    if (amount < 0 || !Number.isFinite(amount)) {
      throw new Error(`FaithSystem.add: invalid amount ${amount}`);
    }
    this.current = Math.min(this.max, this.current + amount);
  }

  /** Called once per tick (base passive regen). */
  update(): void {
    this.add(this.regenPerTick);
  }
}
