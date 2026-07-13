import type { SceneRenderer } from "../render/SceneRenderer";
import type { PowerInvocation } from "../sim/powers/Power";
import type { Simulation } from "../sim/world/Simulation";

/**
 * Contrats implémentés par la couche app (inversion de dépendance : l'UI
 * n'importe jamais depuis `app`).
 */
export interface TimeControl {
  togglePause(): void;
  setSpeed(speed: number): void;
}

export interface GamePersistence {
  save(): void;
  load(): void;
  hasSave(): boolean;
}

export type SculptTool = "raise" | "lower" | "flatten" | "rain";

/** Pouvoirs déblocables associés à un bouton d'outil verrouillable. */
const UNLOCKABLE_TOOLS: ReadonlyArray<{ tool: SculptTool; button: string; icon: string; power: "flatten" | "rain" }> = [
  { tool: "flatten", button: "tool-flatten", icon: "▦", power: "flatten" },
  { tool: "rain", button: "tool-rain", icon: "🌧️", power: "rain" },
];

/** Minimum delay between two sculpt intents while the pointer is held (ms). */
const SCULPT_THROTTLE_MS = 90;

/**
 * Touch-first input (cahier des charges §11 — Android d'abord), mouse as a
 * superset. Never touches the simulation directly: sculpting only QUEUES an
 * `intent:invokePower` that the PowerSystem validates next tick.
 *
 * Touch: 1 finger = sculpt with the active tool; 2 fingers = pan + pinch zoom.
 * Mouse: left = sculpt (Shift inverts raise/lower), right/middle drag = pan,
 * wheel = zoom. Keys: Space pause, 1/2/3 speeds, Q/E rotate camera,
 * S save, L load. Tool buttons in the HUD work for both; "Aplanir" stays
 * disabled until the ProgressionSystem unlocks it.
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
    private readonly sim: Simulation,
    private readonly time: TimeControl,
    private readonly persistence: GamePersistence,
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
    for (const { tool, button, power } of UNLOCKABLE_TOOLS) {
      this.bindToolButton(button, tool);
      this.setToolEnabled(power, this.sim.progression.isUnlocked(power));
    }
    this.sim.bus.on("progression:powerUnlocked", ({ power }) => {
      if (power === "flatten" || power === "rain") this.setToolEnabled(power, true);
    });

    document.getElementById("btn-save")?.addEventListener("click", () => this.persistence.save());
    const loadButton = document.getElementById("btn-load") as HTMLButtonElement | null;
    if (loadButton) {
      loadButton.disabled = !this.persistence.hasSave();
      loadButton.addEventListener("click", () => this.persistence.load());
    }
  }

  private setToolEnabled(power: "flatten" | "rain", enabled: boolean): void {
    const spec = UNLOCKABLE_TOOLS.find((t) => t.power === power);
    if (!spec) return;
    const button = document.getElementById(spec.button) as HTMLButtonElement | null;
    if (!button) return;
    button.disabled = !enabled;
    button.textContent = enabled ? spec.icon : "🔒";
    if (!enabled && this.tool === spec.tool) this.setTool("raise");
  }

  private bindToolButton(id: string, tool: SculptTool): void {
    const button = document.getElementById(id);
    if (!button) return;
    button.addEventListener("click", () => this.setTool(tool));
    if (tool === this.tool) button.classList.add("active");
  }

  private setTool(tool: SculptTool): void {
    const lock = UNLOCKABLE_TOOLS.find((t) => t.tool === tool);
    if (lock && !this.sim.progression.isUnlocked(lock.power)) return;
    this.tool = tool;
    for (const [id, t] of [
      ["tool-raise", "raise"],
      ["tool-lower", "lower"],
      ["tool-flatten", "flatten"],
      ["tool-rain", "rain"],
    ] as const) {
      document.getElementById(id)?.classList.toggle("active", t === tool);
    }
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
      case "KeyS":
        this.persistence.save();
        break;
      case "KeyL":
        this.persistence.load();
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

    let invocation: PowerInvocation;
    if (this.tool === "flatten") {
      invocation = { power: "flatten", x: tile.x, y: tile.y, radius: this.brushRadius };
    } else if (this.tool === "rain") {
      invocation = { power: "rain", x: tile.x, y: tile.y, radius: this.brushRadius };
    } else {
      const lowering = this.shiftHeld ? this.tool === "raise" : this.tool === "lower";
      invocation = {
        power: "terraform",
        x: tile.x,
        y: tile.y,
        radius: this.brushRadius,
        direction: lowering ? -1 : 1,
      };
    }
    this.sim.bus.queue("intent:invokePower", invocation);
  }
}
