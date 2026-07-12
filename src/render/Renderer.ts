import type { Simulation } from "../sim/world/Simulation";
import { Camera2D } from "./Camera2D";
import { TerrainRenderer } from "./TerrainRenderer";

/** Brush cursor indicator, fed by the UI layer. */
export interface BrushCursor {
  screenX: number;
  screenY: number;
  radiusTiles: number;
}

/**
 * Render orchestrator: owns the main canvas, the camera and the layer
 * renderers. Reads simulation state, never mutates it (docs/TDD.md §2.1).
 */
export class Renderer {
  readonly camera: Camera2D;
  brushCursor: BrushCursor | null = null;

  private readonly ctx: CanvasRenderingContext2D;
  private readonly terrainRenderer: TerrainRenderer;
  private viewW = 0;
  private viewH = 0;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    sim: Simulation,
  ) {
    this.ctx = canvas.getContext("2d")!;
    this.camera = new Camera2D(sim.terrain.width / 2, sim.terrain.height / 2);
    this.terrainRenderer = new TerrainRenderer(sim.terrain, sim.bus);
  }

  /** Match the canvas backing store to its CSS size (call on window resize). */
  resize(): void {
    const dpr = window.devicePixelRatio || 1;
    this.viewW = this.canvas.clientWidth;
    this.viewH = this.canvas.clientHeight;
    this.canvas.width = Math.round(this.viewW * dpr);
    this.canvas.height = Math.round(this.viewH * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  render(sim: Simulation): void {
    const { ctx, viewW, viewH } = this;
    ctx.fillStyle = "#0b0e14";
    ctx.fillRect(0, 0, viewW, viewH);

    this.terrainRenderer.draw(ctx, this.camera, viewW, viewH);
    this.drawDayNight(sim);
    this.drawBrushCursor();
  }

  /** Night tint driven by the simulation clock (docs/TDD.md §4.5). */
  private drawDayNight(sim: Simulation): void {
    const darkness = 1 - sim.clock.daylight;
    const alpha = 0.5 * darkness * darkness;
    if (alpha < 0.02) return;
    this.ctx.fillStyle = `rgba(14, 18, 48, ${alpha.toFixed(3)})`;
    this.ctx.fillRect(0, 0, this.viewW, this.viewH);
  }

  private drawBrushCursor(): void {
    const brush = this.brushCursor;
    if (!brush) return;
    this.ctx.beginPath();
    this.ctx.arc(brush.screenX, brush.screenY, brush.radiusTiles * this.camera.zoom, 0, Math.PI * 2);
    this.ctx.strokeStyle = "rgba(255, 255, 255, 0.7)";
    this.ctx.lineWidth = 1.5;
    this.ctx.stroke();
  }

  get width(): number {
    return this.viewW;
  }

  get height(): number {
    return this.viewH;
  }
}
