import type { EventBus } from "../core/events/EventBus";
import type { GameEvents } from "../sim/events";
import type { Renderer } from "../render/Renderer";

/**
 * Time control contract implemented by the app layer (dependency inversion:
 * the UI never imports from `app`).
 */
export interface TimeControl {
  togglePause(): void;
  setSpeed(speed: number): void;
}

/** Minimum delay between two sculpt intents while the mouse is held (ms). */
const SCULPT_THROTTLE_MS = 90;

/**
 * Translates raw browser input into camera moves and `intent:invokePower`
 * events. Never touches the simulation directly (docs/TDD.md §2.1):
 * sculpting only QUEUES an intent that the PowerSystem validates next tick.
 *
 * Bindings: left drag = raise terrain, Shift+left = lower, right/middle
 * drag = pan, wheel = zoom, Space = pause, 1/2/3 = speed x1/x4/x16.
 */
export class InputController {
  brushRadius = 6;

  private isPanning = false;
  private isSculpting = false;
  private lastPointerX = 0;
  private lastPointerY = 0;
  private lowering = false;
  private lastIntentAt = 0;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly renderer: Renderer,
    private readonly bus: EventBus<GameEvents>,
    private readonly time: TimeControl,
  ) {}

  attach(): void {
    const canvas = this.canvas;
    canvas.addEventListener("pointerdown", this.onPointerDown);
    canvas.addEventListener("pointermove", this.onPointerMove);
    canvas.addEventListener("pointerup", this.onPointerUp);
    canvas.addEventListener("pointerleave", this.onPointerUp);
    canvas.addEventListener("wheel", this.onWheel, { passive: false });
    canvas.addEventListener("contextmenu", (e) => e.preventDefault());
    window.addEventListener("keydown", this.onKeyDown);
  }

  private readonly onPointerDown = (e: PointerEvent): void => {
    this.canvas.setPointerCapture(e.pointerId);
    this.lastPointerX = e.offsetX;
    this.lastPointerY = e.offsetY;
    if (e.button === 0) {
      this.isSculpting = true;
      this.lowering = e.shiftKey;
      this.sculptAt(e.offsetX, e.offsetY);
    } else {
      this.isPanning = true;
    }
  };

  private readonly onPointerMove = (e: PointerEvent): void => {
    this.renderer.brushCursor = {
      screenX: e.offsetX,
      screenY: e.offsetY,
      radiusTiles: this.brushRadius,
    };
    if (this.isPanning) {
      this.renderer.camera.panPixels(e.offsetX - this.lastPointerX, e.offsetY - this.lastPointerY);
    } else if (this.isSculpting) {
      this.lowering = e.shiftKey;
      this.sculptAt(e.offsetX, e.offsetY);
    }
    this.lastPointerX = e.offsetX;
    this.lastPointerY = e.offsetY;
  };

  private readonly onPointerUp = (): void => {
    this.isPanning = false;
    this.isSculpting = false;
  };

  private readonly onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    const factor = Math.pow(1.0015, -e.deltaY);
    this.renderer.camera.zoomAt(e.offsetX, e.offsetY, factor, this.renderer.width, this.renderer.height);
  };

  private readonly onKeyDown = (e: KeyboardEvent): void => {
    switch (e.code) {
      case "Space":
        e.preventDefault();
        this.time.togglePause();
        break;
      case "Digit1":
        this.time.setSpeed(1);
        break;
      case "Digit2":
        this.time.setSpeed(4);
        break;
      case "Digit3":
        this.time.setSpeed(16);
        break;
    }
  };

  private sculptAt(screenX: number, screenY: number): void {
    const now = performance.now();
    if (now - this.lastIntentAt < SCULPT_THROTTLE_MS) return;
    this.lastIntentAt = now;

    const world = this.renderer.camera.screenToWorld(
      screenX,
      screenY,
      this.renderer.width,
      this.renderer.height,
    );
    this.bus.queue("intent:invokePower", {
      power: "terraform",
      x: Math.round(world.x),
      y: Math.round(world.y),
      radius: this.brushRadius,
      direction: this.lowering ? -1 : 1,
    });
  }
}
