import type { EventBus } from "../core/events/EventBus";
import type { GameEvents } from "../sim/events";
import { Biome } from "../sim/worldgen/biomes";
import { CHUNK_SIZE, type TerrainGrid } from "../sim/terrain/TerrainGrid";
import type { Camera2D } from "./Camera2D";
import { sampleHeightBilinear } from "./heightSampler";
import { LAYER_STEP, type WaterBand } from "./terraces";

/**
 * Godus-inspired art direction (docs/GDD.md §6): flat pastel colours, no
 * texture noise, terrain read as stacked terraces separated by dark contour
 * seams, stepped turquoise water with a foam line along the coast.
 *
 * The height field is rendered at sub-tile resolution (SUBSAMPLE pixels per
 * tile) with bilinear sampling, so terraces and coastlines are smooth
 * organic curves instead of hard cell blocks.
 */
const BIOME_COLORS: Record<Biome, readonly [number, number, number]> = {
  [Biome.Ocean]: [47, 143, 196], // unused directly — water uses bands below
  [Biome.Beach]: [232, 216, 166],
  [Biome.Grassland]: [156, 203, 98],
  [Biome.TemperateForest]: [111, 174, 84],
  [Biome.TropicalForest]: [77, 160, 92],
  [Biome.Savanna]: [207, 194, 110],
  [Biome.Desert]: [232, 212, 148],
  [Biome.Steppe]: [184, 178, 118],
  [Biome.Taiga]: [122, 162, 122],
  [Biome.Tundra]: [185, 192, 174],
  [Biome.Mountain]: [168, 159, 146],
  [Biome.Snow]: [242, 245, 247],
};

const WATER_COLORS: Record<WaterBand, readonly [number, number, number]> = {
  shallow: [86, 184, 216],
  mid: [47, 143, 196],
  deep: [31, 111, 174],
};

const FOAM_COLOR: readonly [number, number, number] = [214, 240, 244];

/** Rendered pixels per terrain tile in the chunk canvases. */
const SUBSAMPLE = 4;
/** Water shallower than this along the coast is drawn as foam. */
const FOAM_DEPTH = 0.006;
/** Brightness multiplier of the darker stripe on odd terraces. */
const STRIPE_SHADE = 0.95;
/** Brightness multiplier of the contour seam between two terraces. */
const SEAM_SHADE = 0.72;
/** Contour line thickness, in sub-pixels along the height gradient. */
const SEAM_WIDTH = 1.4;
/** Subtle brightening per terrace so high ground still reads as high. */
const ALTITUDE_LIGHT_PER_LAYER = 0.012;

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
      for (const id of chunkIds) this.markDirtyWithNeighbours(id);
    });
  }

  /**
   * Bilinear sampling reads up to one tile into adjacent chunks, so a change
   * in one chunk can alter the pixels of its neighbours along the border.
   */
  private markDirtyWithNeighbours(chunkId: number): void {
    this.dirty.add(chunkId);
    const cx = chunkId % this.terrain.chunksX;
    const cy = Math.floor(chunkId / this.terrain.chunksX);
    if (cx > 0) this.dirty.add(chunkId - 1);
    if (cx < this.terrain.chunksX - 1) this.dirty.add(chunkId + 1);
    if (cy > 0) this.dirty.add(chunkId - this.terrain.chunksX);
    if (cy < this.terrain.chunksY - 1) this.dirty.add(chunkId + this.terrain.chunksX);
  }

  draw(ctx: CanvasRenderingContext2D, camera: Camera2D, viewW: number, viewH: number): void {
    // The canvases are higher-resolution than the tile grid; smoothing keeps
    // the contour curves soft when zoomed in past SUBSAMPLE px/tile.
    ctx.imageSmoothingEnabled = true;

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
      canvas.width = CHUNK_SIZE * SUBSAMPLE;
      canvas.height = CHUNK_SIZE * SUBSAMPLE;
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
    const size = CHUNK_SIZE * SUBSAMPLE;
    const x0 = (chunkId % terrain.chunksX) * CHUNK_SIZE;
    const y0 = Math.floor(chunkId / terrain.chunksX) * CHUNK_SIZE;
    const ctx = canvas.getContext("2d")!;
    const image = ctx.createImageData(size, size);
    const pixels = image.data;
    const step = 1 / SUBSAMPLE;

    for (let py = 0; py < size; py++) {
      const wy = y0 + (py + 0.5) * step;
      for (let px = 0; px < size; px++) {
        const wx = x0 + (px + 0.5) * step;
        const o = (py * size + px) * 4;

        if (Math.floor(wx) >= terrain.width || Math.floor(wy) >= terrain.height) {
          pixels[o + 3] = 0; // outside the map (partial edge chunks)
          continue;
        }

        const h = sampleHeightBilinear(terrain, wx, wy);
        const [r, g, b] =
          h < terrain.seaLevel ? this.shadeWater(h) : this.shadeLand(h, wx, wy, step);
        pixels[o] = r;
        pixels[o + 1] = g;
        pixels[o + 2] = b;
        pixels[o + 3] = 255;
      }
    }
    ctx.putImageData(image, 0, 0);
  }

  /** Stepped depth bands; the shallowest fringe along the coast is foam. */
  private shadeWater(h: number): readonly [number, number, number] {
    const depth = this.terrain.seaLevel - h;
    if (depth < FOAM_DEPTH) return FOAM_COLOR;
    if (depth < 0.04) return WATER_COLORS.shallow;
    if (depth < 0.12) return WATER_COLORS.mid;
    return WATER_COLORS.deep;
  }

  /** Base colour of a cell for land blending; water cells count as sand. */
  private landBaseColor(x: number, y: number): readonly [number, number, number] {
    const terrain = this.terrain;
    const cx = Math.min(terrain.width - 1, Math.max(0, x));
    const cy = Math.min(terrain.height - 1, Math.max(0, y));
    if (terrain.isWater(cx, cy)) return BIOME_COLORS[Biome.Beach];
    return BIOME_COLORS[terrain.biomeAt(cx, cy)];
  }

  /**
   * Bilinear blend of the four surrounding cells' colours, so biome
   * boundaries are soft gradients instead of hard tile edges.
   */
  private blendedLandColor(wx: number, wy: number): [number, number, number] {
    const u = wx - 0.5;
    const v = wy - 0.5;
    const x0 = Math.floor(u);
    const y0 = Math.floor(v);
    const fx = u - x0;
    const fy = v - y0;
    const c00 = this.landBaseColor(x0, y0);
    const c10 = this.landBaseColor(x0 + 1, y0);
    const c01 = this.landBaseColor(x0, y0 + 1);
    const c11 = this.landBaseColor(x0 + 1, y0 + 1);
    const blend = (i: 0 | 1 | 2): number => {
      const top = c00[i] + (c10[i] - c00[i]) * fx;
      const bottom = c01[i] + (c11[i] - c01[i]) * fx;
      return top + (bottom - top) * fy;
    };
    return [blend(0), blend(1), blend(2)];
  }

  /**
   * Terraced land. The contour seam is drawn where the height crosses a
   * layer boundary, with thickness proportional to the local gradient — the
   * classic contour-line trick: flat plateaus never get stray lines.
   */
  private shadeLand(
    h: number,
    wx: number,
    wy: number,
    step: number,
  ): [number, number, number] {
    const terrain = this.terrain;
    const base = this.blendedLandColor(wx, wy);

    const t = (h - terrain.seaLevel) / LAYER_STEP;
    const layer = Math.floor(t);
    const frac = t - layer;

    const hx = sampleHeightBilinear(terrain, wx + step, wy);
    const hy = sampleHeightBilinear(terrain, wx, wy + step);
    const gradient = (Math.abs(hx - h) + Math.abs(hy - h)) / LAYER_STEP;
    const isSeam = frac < gradient * SEAM_WIDTH;

    let light = 1 + layer * ALTITUDE_LIGHT_PER_LAYER;
    if (layer % 2 === 1) light *= STRIPE_SHADE;
    if (isSeam) light *= SEAM_SHADE;

    return [
      Math.min(255, Math.round(base[0] * light)),
      Math.min(255, Math.round(base[1] * light)),
      Math.min(255, Math.round(base[2] * light)),
    ];
  }
}
