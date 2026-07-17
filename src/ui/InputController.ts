import type { SceneRenderer } from "../render/SceneRenderer";
import { POWER_CATALOG, type PowerMeta } from "../sim/powers/catalog";
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

const RAISE_META = POWER_CATALOG.find((m) => m.key === "raise")!;

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
  /**
   * Pouvoir actif sélectionné dans le grimoire (défaut : Soulèvement). `null` =
   * mode « Main » : aucun pouvoir armé → un doigt déplace la carte (on peut
   * ainsi se balader librement et désélectionner un pouvoir).
   */
  activePower: PowerMeta | null = RAISE_META;

  private readonly pointers = new Map<number, { x: number; y: number }>();
  private panning = false;
  private sculpting = false;
  private shiftHeld = false;
  private lastIntentAt = 0;
  private lastPinchDistance = 0;
  private lastCentroid: { x: number; y: number } | null = null;

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

    // La sélection des pouvoirs (boutons Élever/Abaisser + grimoire) est gérée
    // par le composant `Grimoire`, qui appelle `setActivePower`.
    document.getElementById("btn-save")?.addEventListener("click", () => this.persistence.save());
    const loadButton = document.getElementById("btn-load") as HTMLButtonElement | null;
    if (loadButton) {
      loadButton.disabled = !this.persistence.hasSave();
      loadButton.addEventListener("click", () => this.persistence.load());
    }
  }

  /** Sélectionne le pouvoir actif (appelé par le grimoire) ; `null` = mode Main. */
  setActivePower(meta: PowerMeta | null): void {
    this.activePower = meta;
  }

  private readonly onPointerDown = (e: PointerEvent): void => {
    this.canvas.setPointerCapture(e.pointerId);
    this.pointers.set(e.pointerId, { x: e.offsetX, y: e.offsetY });

    if (this.pointers.size === 2) {
      // Second finger down: switch from sculpting to camera gestures (pan + zoom).
      this.sculpting = false;
      this.panning = false;
      this.lastPinchDistance = this.pinchDistance();
      this.lastCentroid = this.centroid();
      return;
    }
    if (e.pointerType === "mouse" && e.button !== 0) {
      this.panning = true;
      return;
    }
    // Mode « Main » (aucun pouvoir armé) : un doigt déplace la carte.
    if (this.activePower === null) {
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
    if (this.pointers.size < 2) {
      this.lastPinchDistance = 0;
      this.lastCentroid = null;
    }
    if (this.pointers.size === 0) {
      this.panning = false;
      this.sculpting = false;
    }
  };

  /** Two-finger PAN (centroid drag) + pinch zoom (distance ratio) — navigation toujours dispo. */
  private twoFingerGesture(): void {
    const distance = this.pinchDistance();
    const centroid = this.centroid();
    if (this.lastPinchDistance > 0 && distance > 0) {
      this.renderer.rig.dolly(this.lastPinchDistance / distance);
    }
    if (this.lastCentroid && centroid) {
      this.renderer.rig.panByScreen(
        centroid.x - this.lastCentroid.x,
        centroid.y - this.lastCentroid.y,
        this.renderer.height,
      );
    }
    this.lastPinchDistance = distance;
    this.lastCentroid = centroid;
  }

  private pinchDistance(): number {
    const [a, b] = [...this.pointers.values()];
    if (!a || !b) return 0;
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  /** Milieu des deux doigts (pour le pan à deux doigts). */
  private centroid(): { x: number; y: number } | null {
    const [a, b] = [...this.pointers.values()];
    if (!a || !b) return null;
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
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

    const meta = this.activePower;
    if (!meta || !meta.power) return; // mode Main, ou pouvoir « à venir » : rien à invoquer

    let invocation: PowerInvocation;
    if (meta.power === "terraform") {
      // Maj inverse le sens (Élever ↔ Abaisser).
      const base = meta.direction ?? 1;
      invocation = {
        power: "terraform",
        x: tile.x,
        y: tile.y,
        radius: this.brushRadius,
        direction: this.shiftHeld ? ((base * -1) as 1 | -1) : base,
      };
    } else {
      invocation = { power: meta.power, x: tile.x, y: tile.y, radius: this.brushRadius };
    }
    this.sim.bus.queue("intent:invokePower", invocation);
  }
}
