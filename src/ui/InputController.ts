import type { EventBus } from "../core/events/EventBus";
import type { GameEvents } from "../sim/events";
import type { SceneRenderer } from "../render/SceneRenderer";

/**
 * Time control contract implemented by the app layer (dependency inversion:
 * the UI never imports from `app`).
 */
export interface TimeControl {
  togglePause(): void;
  setSpeed(speed: number): void;
}

export type SculptTool = "raise" | "lower";

/** Minimum delay between two sculpt intents while the pointer is held (ms). */
const SCULPT_THROTTLE_MS = 90;

/**
 * Touch-first input (cahier des charges §11 — Android d'abord), mouse as a
 * superset. Never touches the simulation directly: sculpting only QUEUES an
 * `intent:invokePower` that the PowerSystem validates next tick.
 *
 * Touch: 1 finger = sculpt with the active tool; 2 fingers = pan + pinch zoom.
 * Mouse: left = sculpt (Shift inverts the tool), right/middle drag = pan,
 * wheel = zoom. Keys: Space pause, 1/2/3 speeds, Q/E rotate the camera.
 * The raise/lower tool buttons in the HUD work for both.
 */
export class InputController {
  brushRadius = 6;
  tool: SculptTool = "raise";

  private readonly pointers = new Map<number, { x: number; y: number }>();
  private panning = false;
  private sculpting = false;
  private shiftHeld = false;
  private lastIntentAt = 0;
  private lastPinchDistance = 0;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly renderer: SceneRenderer,
    private readonly bus: EventBus<GameEvents>,
    private readonly time: TimeControl,
  ) {}

  attach(): void {
    const canvas = this.canvas;
    canvas.addEventListener("pointerdown", this.onPointerDown);
    canvas.addEventListener("pointermove", this.onPointerMove);
    canvas.addEventListener("pointerup", this.onPointerEnd);
    canvas.addEventListener("pointercancel", this.onPointerEnd);
    canvas.addEventListener("pointerleave", this.onPointerEnd);
    canvas.addEventListener("wheel", this.onWheel, { passive: false });
    canvas.addEventListener("contextmenu", (e) => e.preventDefault());
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    this.bindToolButton("tool-raise", "raise");
    this.bindToolButton("tool-lower", "lower");
  }

  private bindToolButton(id: string, tool: SculptTool): void {
    const button = document.getElementById(id);
    if (!button) return;
    button.addEventListener("click", () => this.setTool(tool));
    if (tool === this.tool) button.classList.add("active");
  }

  private setTool(tool: SculptTool): void {
    this.tool = tool;
    document.getElementById("tool-raise")?.classList.toggle("active", tool === "raise");
    document.getElementById("tool-lower")?.classList.toggle("active", tool === "lower");
  }

  private readonly onPointerDown = (e: PointerEvent): void => {
    this.canvas.setPointerCapture(e.pointerId);
    this.pointers.set(e.pointerId, { x: e.offsetX, y: e.offsetY });

    if (this.pointers.size === 2) {
      // Second finger down: switch from sculpting to camera gestures.
      this.sculpting = false;
      this.panning = false;
      this.lastPinchDistance = this.pinchDistance();
      return;
    }
    if (e.pointerType === "mouse" && e.button !== 0) {
      this.panning = true;
      return;
    }
    this.sculpting = true;
    this.shiftHeld = e.shiftKey;
    this.sculptAt(e.offsetX, e.offsetY);
  };

  private readonly onPointerMove = (e: PointerEvent): void => {
    const previous = this.pointers.get(e.pointerId);
    this.pointers.set(e.pointerId, { x: e.offsetX, y: e.offsetY });
    this.renderer.updateBrushIndicator(e.offsetX, e.offsetY, this.brushRadius);

    if (this.pointers.size === 2) {
      this.twoFingerGesture();
      return;
    }
    if (!previous) return;
    if (this.panning) {
      this.renderer.rig.panByScreen(e.offsetX - previous.x, e.offsetY - previous.y, this.renderer.height);
    } else if (this.sculpting) {
      this.shiftHeld = e.shiftKey;
      this.sculptAt(e.offsetX, e.offsetY);
    }
  };

  private readonly onPointerEnd = (e: PointerEvent): void => {
    this.pointers.delete(e.pointerId);
    if (this.pointers.size < 2) this.lastPinchDistance = 0;
    if (this.pointers.size === 0) {
      this.panning = false;
      this.sculpting = false;
    }
  };

  /** Two-finger pan (centroid drag) + pinch zoom (distance ratio). */
  private twoFingerGesture(): void {
    const [a, b] = [...this.pointers.values()];
    if (!a || !b) return;
    const distance = this.pinchDistance();
    if (this.lastPinchDistance > 0 && distance > 0) {
      this.renderer.rig.dolly(this.lastPinchDistance / distance);
    }
    this.lastPinchDistance = distance;
  }

  private pinchDistance(): number {
    const [a, b] = [...this.pointers.values()];
    if (!a || !b) return 0;
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  private readonly onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    this.renderer.rig.dolly(Math.pow(1.0015, e.deltaY));
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
      case "KeyQ":
        this.renderer.rig.rotate(0.07);
        break;
      case "KeyE":
        this.renderer.rig.rotate(-0.07);
        break;
      case "ShiftLeft":
      case "ShiftRight":
        this.shiftHeld = true;
        break;
    }
  };

  private readonly onKeyUp = (e: KeyboardEvent): void => {
    if (e.code === "ShiftLeft" || e.code === "ShiftRight") this.shiftHeld = false;
  };

  private sculptAt(screenX: number, screenY: number): void {
    const now = performance.now();
    if (now - this.lastIntentAt < SCULPT_THROTTLE_MS) return;

    const tile = this.renderer.pickTile(screenX, screenY);
    if (!tile) return;
    this.lastIntentAt = now;

    const lowering = this.shiftHeld ? this.tool === "raise" : this.tool === "lower";
    this.bus.queue("intent:invokePower", {
      power: "terraform",
      x: tile.x,
      y: tile.y,
      radius: this.brushRadius,
      direction: lowering ? -1 : 1,
    });
  }
}
