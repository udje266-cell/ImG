import type { EventBus } from "../core/events/EventBus";
import type { GameEvents } from "../sim/events";
import { Biome } from "../sim/worldgen/biomes";
import { CHUNK_SIZE, type TerrainGrid } from "../sim/terrain/TerrainGrid";
import type { Camera2D } from "./Camera2D";

/** Base colour per biome (r, g, b). Placeholder art direction — GDD §6. */
const BIOME_COLORS: Record<Biome, readonly [number, number, number]> = {
  [Biome.Ocean]: [24, 68, 128],
  [Biome.Beach]: [214, 198, 148],
  [Biome.Grassland]: [116, 158, 76],
  [Biome.TemperateForest]: [62, 112, 58],
  [Biome.TropicalForest]: [34, 108, 52],
  [Biome.Savanna]: [178, 164, 84],
  [Biome.Desert]: [222, 196, 130],
  [Biome.Steppe]: [150, 142, 92],
  [Biome.Taiga]: [82, 110, 86],
  [Biome.Tundra]: [148, 148, 132],
  [Biome.Mountain]: [128, 120, 112],
  [Biome.Snow]: [236, 240, 246],
};

/**
 * Chunked terrain renderer: one offscreen canvas per 32x32 chunk, redrawn
 * ONLY when the simulation reports it dirty via `terrain:modified`
 * (docs/TDD.md §4.5). Reads the simulation, never writes to it.
 */
export class TerrainRenderer {
  private readonly chunkCanvases = new Map<number, HTMLCanvasElement>();
  private readonly dirty = new Set<number>();

  constructor(
    private readonly terrain: TerrainGrid,
    bus: EventBus<GameEvents>,
  ) {
    bus.on("terrain:modified", ({ chunkIds }) => {
      for (const id of chunkIds) this.dirty.add(id);
    });
  }

  draw(ctx: CanvasRenderingContext2D, camera: Camera2D, viewW: number, viewH: number): void {
    ctx.imageSmoothingEnabled = false;

    const topLeft = camera.screenToWorld(0, 0, viewW, viewH);
    const bottomRight = camera.screenToWorld(viewW, viewH, viewW, viewH);
    const cx0 = Math.max(0, Math.floor(topLeft.x / CHUNK_SIZE));
    const cy0 = Math.max(0, Math.floor(topLeft.y / CHUNK_SIZE));
    const cx1 = Math.min(this.terrain.chunksX - 1, Math.floor(bottomRight.x / CHUNK_SIZE));
    const cy1 = Math.min(this.terrain.chunksY - 1, Math.floor(bottomRight.y / CHUNK_SIZE));

    for (let cy = cy0; cy <= cy1; cy++) {
      for (let cx = cx0; cx <= cx1; cx++) {
        const chunkId = cy * this.terrain.chunksX + cx;
        const canvas = this.chunkCanvas(chunkId);
        const origin = camera.worldToScreen(cx * CHUNK_SIZE, cy * CHUNK_SIZE, viewW, viewH);
        ctx.drawImage(canvas, origin.x, origin.y, CHUNK_SIZE * camera.zoom, CHUNK_SIZE * camera.zoom);
      }
    }
  }

  private chunkCanvas(chunkId: number): HTMLCanvasElement {
    let canvas = this.chunkCanvases.get(chunkId);
    if (!canvas) {
      canvas = document.createElement("canvas");
      canvas.width = CHUNK_SIZE;
      canvas.height = CHUNK_SIZE;
      this.chunkCanvases.set(chunkId, canvas);
      this.dirty.add(chunkId);
    }
    if (this.dirty.delete(chunkId)) {
      this.redrawChunk(chunkId, canvas);
    }
    return canvas;
  }

  private redrawChunk(chunkId: number, canvas: HTMLCanvasElement): void {
    const terrain = this.terrain;
    const x0 = (chunkId % terrain.chunksX) * CHUNK_SIZE;
    const y0 = Math.floor(chunkId / terrain.chunksX) * CHUNK_SIZE;
    const ctx = canvas.getContext("2d")!;
    const image = ctx.createImageData(CHUNK_SIZE, CHUNK_SIZE);
    const pixels = image.data;

    for (let py = 0; py < CHUNK_SIZE; py++) {
      for (let px = 0; px < CHUNK_SIZE; px++) {
        const x = x0 + px;
        const y = y0 + py;
        const o = (py * CHUNK_SIZE + px) * 4;
        if (!terrain.inBounds(x, y)) {
          pixels[o + 3] = 0;
          continue;
        }
        const [r, g, b] = this.shadeCell(x, y);
        pixels[o] = r;
        pixels[o + 1] = g;
        pixels[o + 2] = b;
        pixels[o + 3] = 255;
      }
    }
    ctx.putImageData(image, 0, 0);
  }

  /** Biome colour + hillshading (NW light) + water depth shading. */
  private shadeCell(x: number, y: number): [number, number, number] {
    const terrain = this.terrain;
    const base = BIOME_COLORS[terrain.biomeAt(x, y)];
    const h = terrain.heightAt(x, y);

    let light: number;
    if (h < terrain.seaLevel) {
      // Deeper water gets darker.
      const depth = Math.min(1, (terrain.seaLevel - h) / terrain.seaLevel);
      light = 1 - 0.65 * depth;
    } else {
      const hx = terrain.inBounds(x - 1, y - 1) ? terrain.heightAt(x - 1, y - 1) : h;
      const slope = (h - hx) * 14;
      light = Math.min(1.35, Math.max(0.62, 1 + slope));
      // Subtle altitude brightness so plateaus still read as high ground.
      light *= 0.88 + 0.24 * (h - terrain.seaLevel);
    }

    return [
      Math.min(255, Math.round(base[0] * light)),
      Math.min(255, Math.round(base[1] * light)),
      Math.min(255, Math.round(base[2] * light)),
    ];
  }
}
