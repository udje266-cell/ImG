import type { Simulation } from "../sim/world/Simulation";

/**
 * Overlay de performance (docs/TDD.md §5) : durée du dernier passage de chaque
 * système de simulation + FPS de rendu. Basculé par la touche P. Obligatoire
 * avant d'empiler des systèmes coûteux (météo, écologie, agents).
 */
export class PerfOverlay {
  private visible = false;
  private frames = 0;
  private lastFpsAt = performance.now();
  private fps = 0;

  constructor(
    private readonly element: HTMLElement,
    private readonly sim: Simulation,
  ) {
    window.addEventListener("keydown", (e) => {
      if (e.code === "KeyP") this.toggle();
    });
  }

  toggle(): void {
    this.visible = !this.visible;
    this.element.style.display = this.visible ? "block" : "none";
  }

  /** Appelé à chaque frame de rendu. */
  update(): void {
    this.frames++;
    const now = performance.now();
    if (now - this.lastFpsAt >= 500) {
      this.fps = Math.round((this.frames * 1000) / (now - this.lastFpsAt));
      this.frames = 0;
      this.lastFpsAt = now;
    }
    if (!this.visible) return;

    const lines = [`FPS : ${this.fps}`, "— sim (ms/tick) —"];
    for (const [id, ms] of this.sim.systemDurations) {
      lines.push(`${id.padEnd(10)} ${ms.toFixed(3)}`);
    }
    this.element.textContent = lines.join("\n");
  }
}
