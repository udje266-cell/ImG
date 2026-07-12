/**
 * 2D camera: world position (in tiles) at the screen centre + zoom
 * (pixels per tile). Pure math, no DOM dependency.
 */
export class Camera2D {
  static readonly MIN_ZOOM = 1.5;
  static readonly MAX_ZOOM = 64;

  x: number;
  y: number;
  zoom = 4;

  constructor(x = 0, y = 0) {
    this.x = x;
    this.y = y;
  }

  screenToWorld(sx: number, sy: number, viewW: number, viewH: number): { x: number; y: number } {
    return {
      x: this.x + (sx - viewW / 2) / this.zoom,
      y: this.y + (sy - viewH / 2) / this.zoom,
    };
  }

  worldToScreen(wx: number, wy: number, viewW: number, viewH: number): { x: number; y: number } {
    return {
      x: (wx - this.x) * this.zoom + viewW / 2,
      y: (wy - this.y) * this.zoom + viewH / 2,
    };
  }

  /** Pan by a screen-space delta (e.g. mouse drag). */
  panPixels(dx: number, dy: number): void {
    this.x -= dx / this.zoom;
    this.y -= dy / this.zoom;
  }

  /** Zoom by `factor`, keeping the world point under (sx, sy) fixed. */
  zoomAt(sx: number, sy: number, factor: number, viewW: number, viewH: number): void {
    const before = this.screenToWorld(sx, sy, viewW, viewH);
    this.zoom = Math.min(Camera2D.MAX_ZOOM, Math.max(Camera2D.MIN_ZOOM, this.zoom * factor));
    const after = this.screenToWorld(sx, sy, viewW, viewH);
    this.x += before.x - after.x;
    this.y += before.y - after.y;
  }
}
