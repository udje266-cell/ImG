import { SIM_DT_MS } from "../core/time/GameClock";
import type { Simulation } from "../sim/world/Simulation";

/**
 * Fixed-timestep game loop (docs/TDD.md §2.3): the simulation always advances
 * by whole ticks of SIM_DT_MS; rendering runs at display frequency. Speed
 * multiplies how much simulated time each real frame accumulates.
 */
export class GameLoop {
  paused = false;
  speed = 1;

  /** Backlog cap: beyond this many ticks per frame we drop time (no death spiral). */
  private static readonly MAX_TICKS_PER_FRAME = 64;
  /** Clamp huge frame gaps (background tab) to a sane value, in ms. */
  private static readonly MAX_FRAME_MS = 250;

  private accumulator = 0;
  private lastTime: number | null = null;
  private rafId = 0;

  constructor(
    private readonly sim: Simulation,
    private readonly onRender: () => void,
  ) {}

  start(): void {
    this.rafId = requestAnimationFrame(this.frame);
  }

  stop(): void {
    cancelAnimationFrame(this.rafId);
    this.lastTime = null;
  }

  togglePause(): void {
    this.paused = !this.paused;
  }

  setSpeed(speed: number): void {
    this.speed = speed;
    this.paused = false;
  }

  private readonly frame = (now: number): void => {
    const elapsed = this.lastTime === null ? 0 : Math.min(now - this.lastTime, GameLoop.MAX_FRAME_MS);
    this.lastTime = now;

    if (!this.paused) {
      this.accumulator += elapsed * this.speed;
    }

    let ticks = 0;
    while (this.accumulator >= SIM_DT_MS && ticks < GameLoop.MAX_TICKS_PER_FRAME) {
      this.sim.step();
      this.accumulator -= SIM_DT_MS;
      ticks++;
    }
    if (ticks === GameLoop.MAX_TICKS_PER_FRAME) {
      this.accumulator = 0;
    }

    this.onRender();
    this.rafId = requestAnimationFrame(this.frame);
  };
}
