import { BufferAttribute, BufferGeometry, Mesh, MeshLambertMaterial } from "three";
import type { EventBus } from "../core/events/EventBus";
import type { GameEvents } from "../sim/events";
import { CHUNK_SIZE, type TerrainGrid } from "../sim/terrain/TerrainGrid";
import { blendedLandColor, DEEP_WATER_FLOOR, lerpColor, SAND_COLOR } from "./biomePalette";
import { sampleHeightBilinear } from "./heightSampler";
import { landLayer, LAYER_STEP } from "./terraces";

/** World units of height per normalised simulation height unit. */
export const HEIGHT_SCALE = 25;
/** World height of one terrace step. */
export const TERRACE_HEIGHT = LAYER_STEP * HEIGHT_SCALE;
/** Seabed colour ramp reaches full depth at this (normalised) depth. */
const DEPTH_RAMP = 0.15;
/** Brightness multiplier of the darker stripe on odd terraces. */
const STRIPE_SHADE = 0.95;
/** Subtle brightening per terrace so high ground still reads as high. */
const ALTITUDE_LIGHT_PER_LAYER = 0.012;

/**
 * The world as one low-poly heightmap mesh (docs/TDD.md §4.5, ADR 0002).
 *
 * Vertices sit on tile corners; their height is QUANTISED to terraces
 * (Godus look, now as real geometry), while the seabed stays smooth and dips
 * under the translucent water plane at y=0. Colours are per-vertex pastel
 * biome blends — no textures, flat shading.
 *
 * On `terrain:modified`, only the vertices covered by the dirty chunks
 * (plus a safety border) are recomputed.
 */
export class TerrainMesh {
  readonly mesh: Mesh;
  private readonly geometry: BufferGeometry;
  private readonly positions: Float32Array;
  private readonly colors: Float32Array;
  private readonly vertsX: number;
  private readonly vertsY: number;

  constructor(
    private readonly terrain: TerrainGrid,
    bus: EventBus<GameEvents>,
  ) {
    this.vertsX = terrain.width + 1;
    this.vertsY = terrain.height + 1;
    const vertexCount = this.vertsX * this.vertsY;
    this.positions = new Float32Array(vertexCount * 3);
    this.colors = new Float32Array(vertexCount * 3);

    for (let vy = 0; vy < this.vertsY; vy++) {
      for (let vx = 0; vx < this.vertsX; vx++) {
        this.writeVertex(vx, vy);
      }
    }

    const indices = new Uint32Array(terrain.width * terrain.height * 6);
    let o = 0;
    for (let ty = 0; ty < terrain.height; ty++) {
      for (let tx = 0; tx < terrain.width; tx++) {
        const a = ty * this.vertsX + tx;
        const b = a + 1;
        const c = a + this.vertsX;
        const d = c + 1;
        indices[o++] = a;
        indices[o++] = c;
        indices[o++] = b;
        indices[o++] = b;
        indices[o++] = c;
        indices[o++] = d;
      }
    }

    this.geometry = new BufferGeometry();
    this.geometry.setAttribute("position", new BufferAttribute(this.positions, 3));
    this.geometry.setAttribute("color", new BufferAttribute(this.colors, 3));
    this.geometry.setIndex(new BufferAttribute(indices, 1));
    // Flat shading derives face normals in the fragment shader, so vertex
    // normals never need recomputing after terraform updates.
    this.geometry.computeVertexNormals();

    const material = new MeshLambertMaterial({ vertexColors: true, flatShading: true });
    this.mesh = new Mesh(this.geometry, material);

    bus.on("terrain:modified", ({ chunkIds }) => this.updateChunks(chunkIds));
  }

  /** Recompute the vertices covered by these chunks (+1 vertex border). */
  private updateChunks(chunkIds: number[]): void {
    const terrain = this.terrain;
    for (const chunkId of chunkIds) {
      const x0 = (chunkId % terrain.chunksX) * CHUNK_SIZE;
      const y0 = Math.floor(chunkId / terrain.chunksX) * CHUNK_SIZE;
      const vx0 = Math.max(0, x0 - 1);
      const vy0 = Math.max(0, y0 - 1);
      const vx1 = Math.min(this.vertsX - 1, x0 + CHUNK_SIZE + 1);
      const vy1 = Math.min(this.vertsY - 1, y0 + CHUNK_SIZE + 1);
      for (let vy = vy0; vy <= vy1; vy++) {
        for (let vx = vx0; vx <= vx1; vx++) {
          this.writeVertex(vx, vy);
        }
      }
    }
    (this.geometry.getAttribute("position") as BufferAttribute).needsUpdate = true;
    (this.geometry.getAttribute("color") as BufferAttribute).needsUpdate = true;
    this.geometry.computeBoundingSphere();
  }

  private writeVertex(vx: number, vy: number): void {
    const terrain = this.terrain;
    const i = (vy * this.vertsX + vx) * 3;
    const h = sampleHeightBilinear(terrain, vx, vy);

    this.positions[i] = vx;
    this.positions[i + 2] = vy;

    let r: number;
    let g: number;
    let b: number;
    if (h < terrain.seaLevel) {
      // Smooth seabed dipping under the water plane; sand fades to deep blue.
      this.positions[i + 1] = (h - terrain.seaLevel) * HEIGHT_SCALE;
      const t = Math.min(1, (terrain.seaLevel - h) / DEPTH_RAMP);
      [r, g, b] = lerpColor(SAND_COLOR, DEEP_WATER_FLOOR, t);
    } else {
      // Terraced land: flat tops half a step above the layer boundary.
      const layer = landLayer(h, terrain.seaLevel);
      this.positions[i + 1] = (layer + 0.5) * TERRACE_HEIGHT;
      let light = 1 + layer * ALTITUDE_LIGHT_PER_LAYER;
      if (layer % 2 === 1) light *= STRIPE_SHADE;
      const base = blendedLandColor(terrain, vx, vy);
      r = base[0] * light;
      g = base[1] * light;
      b = base[2] * light;
    }
    this.colors[i] = Math.min(255, r) / 255;
    this.colors[i + 1] = Math.min(255, g) / 255;
    this.colors[i + 2] = Math.min(255, b) / 255;
  }
}
