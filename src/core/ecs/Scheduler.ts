/**
 * Ordered system scheduler. Systems run in registration order; a system may
 * declare an `interval` to run every N ticks only (cheap LOD for slow systems
 * such as weather or ecology — see docs/TDD.md §5).
 */
export interface System<Ctx> {
  readonly id: string;
  /** Run every `interval` ticks (default 1 = every tick). */
  readonly interval?: number;
  update(ctx: Ctx, tick: number): void;
}

export class Scheduler<Ctx> {
  private readonly systems: Array<System<Ctx>> = [];

  add(system: System<Ctx>): void {
    if (this.systems.some((s) => s.id === system.id)) {
      throw new Error(`Scheduler: duplicate system id "${system.id}"`);
    }
    this.systems.push(system);
  }

  step(ctx: Ctx, tick: number): void {
    for (const system of this.systems) {
      const interval = system.interval ?? 1;
      if (tick % interval === 0) {
        system.update(ctx, tick);
      }
    }
  }
}
