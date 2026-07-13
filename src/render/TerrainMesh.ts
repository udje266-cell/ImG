import { BufferAttribute, BufferGeometry, Mesh } from "three";
import type { EventBus } from "../core/events/EventBus";
import type { GameEvents } from "../sim/events";
import { Biome } from "../sim/worldgen/biomes";
import { CHUNK_SIZE, type TerrainGrid } from "../sim/terrain/TerrainGrid";
import { blendedLandColor, DEEP_WATER_FLOOR, lerpColor, type Rgb, SAND_COLOR } from "./biomePalette";
import { sampleHeightBilinear } from "./heightSampler";
import { createTerrainMaterial } from "./TerrainMaterial";
import { landLayer, LAYER_STEP } from "./terraces";

/** World units of height per normalised simulation height unit. */
export const HEIGHT_SCALE = 25;
/** World height of one terrace step. */
export const TERRACE_HEIGHT = LAYER_STEP * HEIGHT_SCALE;
/** Seabed colour ramp reaches full depth at this (normalised) depth. */
const DEPTH_RAMP = 0.15;

/**
 * World-space ground height at any point: terraced on land (flat tops half a
 * step above the layer boundary), smooth seabed below sea level. Single
 * source of truth shared by the mesh and by everything that must stand on
 * the ground (showcase, future agents).
 */
/**
 * Profil de terrasse « plateau + rebord arrondi » (style Godus) : dans chaque
 * strate la hauteur reste plate sur PLATEAU_FRAC, puis monte en douceur
 * (smoothstep) vers la strate suivante — d'où des courbes de niveau fluides
 * au lieu de marches verticales anguleuses. `e` est l'altitude en unités de
 * strate (≥ 0).
 */
const PLATEAU_FRAC = 0.82;
function terraceProfile(e: number): number {
  const layer = Math.floor(e);
  const frac = e - layer;
  if (frac <= PLATEAU_FRAC) return layer;
  const t = (frac - PLATEAU_FRAC) / (1 - PLATEAU_FRAC);
  return layer + t * t * (3 - 2 * t); // smoothstep : rebord arrondi
}

export function groundHeightAt(terrain: TerrainGrid, wx: number, wy: number): number {
  const h = sampleHeightBilinear(terrain, wx, wy);
  if (h < terrain.seaLevel) return (h - terrain.seaLevel) * HEIGHT_SCALE;
  const e = (h - terrain.seaLevel) / LAYER_STEP;
  return (terraceProfile(e) + 0.5) * TERRACE_HEIGHT;
}
/** Assombrissement de la ligne de contour au sommet de chaque rebord. */
const SEAM_SHADE = 0.7;
/** Brightening per terrace so high ground reads as high (contraste vertical). */
const ALTITUDE_LIGHT_PER_LAYER = 0.014;

// Dégradé chaud par altitude (au-dessus du niveau de la mer, en hauteur normalisée) :
// vert vif en bas → orange → terracotta rouge en hauteur, façon Godus.
const WARM_START = 0.035; // le réchauffement démarre tôt (~1 terrasse)
const WARM_MID = 0.1; // portée du 1er mélange (→ orange)
const WARM_HIGH_SPAN = 0.13; // portée du 2e mélange (→ terracotta)
const WARM_TAN: Rgb = [226, 158, 74]; // orange chaud
const WARM_TERRACOTTA: Rgb = [198, 96, 52]; // terracotta rouge

function smoothstep(x: number): number {
  const t = Math.min(1, Math.max(0, x));
  return t * t * (3 - 2 * t);
}

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
  /** Poids de matière par sommet : [grass, sand, rock, dirt] (splatting). */
  private readonly splat: Float32Array;
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
    this.splat = new Float32Array(vertexCount * 4);

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
    this.geometry.setAttribute("splat", new BufferAttribute(this.splat, 4));
    this.geometry.setIndex(new BufferAttribute(indices, 1));
    this.geometry.computeVertexNormals();

    // Terrain texturé : 4 matières splattées (biome/pente/altitude) + normal
    // maps, sur les normales lissées, la couleur par sommet servant de teinte.
    this.mesh = new Mesh(this.geometry, createTerrainMaterial());

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
    (this.geometry.getAttribute("splat") as BufferAttribute).needsUpdate = true;
    // Normales lissées à recalculer après un changement de relief (smooth shading).
    this.geometry.computeVertexNormals();
    this.geometry.computeBoundingSphere();
  }

  private writeVertex(vx: number, vy: number): void {
    const terrain = this.terrain;
    const i = (vy * this.vertsX + vx) * 3;
    const h = sampleHeightBilinear(terrain, vx, vy);

    this.positions[i] = vx;
    this.positions[i + 1] = groundHeightAt(terrain, vx, vy);
    this.positions[i + 2] = vy;

    let r: number;
    let g: number;
    let b: number;
    if (h < terrain.seaLevel) {
      // Sand fades to deep blue with depth.
      const t = Math.min(1, (terrain.seaLevel - h) / DEPTH_RAMP);
      [r, g, b] = lerpColor(SAND_COLOR, DEEP_WATER_FLOOR, t);
    } else {
      const above = h - terrain.seaLevel;
      const layer = landLayer(h, terrain.seaLevel);

      // Dégradé chaud par altitude (style Godus) : vert vif en bas → jaune →
      // tan → terracotta en hauteur. Deux paliers de mélange.
      let base = blendedLandColor(terrain, vx, vy);
      const warmA = smoothstep((above - WARM_START) / WARM_MID);
      if (warmA > 0) base = lerpColor(base, WARM_TAN, warmA);
      const warmB = smoothstep((above - WARM_MID - WARM_START) / WARM_HIGH_SPAN);
      if (warmB > 0) base = lerpColor(base, WARM_TERRACOTTA, warmB);

      // Ligne de contour : bande sombre au sommet de chaque rebord de terrasse
      // pour détacher nettement les paliers (comme des courbes de niveau).
      const frac = (above / LAYER_STEP) - layer;
      const contour = frac > 0.84 ? SEAM_SHADE : 1;
      const light = (1 + layer * ALTITUDE_LIGHT_PER_LAYER) * contour;
      r = base[0] * light;
      g = base[1] * light;
      b = base[2] * light;
    }
    this.colors[i] = Math.min(255, r) / 255;
    this.colors[i + 1] = Math.min(255, g) / 255;
    this.colors[i + 2] = Math.min(255, b) / 255;

    this.writeSplat(vx, vy, h);
  }

  /**
   * Poids de matière [grass, sand, rock, dirt] par sommet, selon biome, pente
   * et altitude. Le shader (`TerrainMaterial`) les normalise et mélange les 4
   * textures. Sous l'eau : fond sableux.
   */
  private writeSplat(vx: number, vy: number, h: number): void {
    const terrain = this.terrain;
    const s = (vy * this.vertsX + vx) * 4;

    if (h < terrain.seaLevel) {
      this.splat[s] = 0;
      this.splat[s + 1] = 1; // sand
      this.splat[s + 2] = 0;
      this.splat[s + 3] = 0;
      return;
    }

    const above = h - terrain.seaLevel;
    const tileX = Math.min(terrain.width - 1, Math.floor(vx));
    const tileY = Math.min(terrain.height - 1, Math.floor(vy));
    const biome = terrain.biomeAt(tileX, tileY);
    const green =
      biome === Biome.Grassland ||
      biome === Biome.TemperateForest ||
      biome === Biome.TropicalForest ||
      biome === Biome.Taiga;
    const dry = biome === Biome.Desert || biome === Biome.Steppe || biome === Biome.Savanna;

    // Pente locale (en unités de terrasse) via les voisins.
    const hx = sampleHeightBilinear(terrain, vx + 1, vy);
    const hy = sampleHeightBilinear(terrain, vx, vy + 1);
    const slope = (Math.abs(hx - h) + Math.abs(hy - h)) / LAYER_STEP;

    const grass = green ? 1 : 0.12;
    const sand = biome === Biome.Beach || above < 0.02 ? 1.4 : 0;
    const rock = smoothstep((slope - 0.55) / 0.8) * 1.3 + smoothstep((above - 0.26) / 0.16);
    const dirt = 0.22 + (dry ? 0.7 : 0) + smoothstep((slope - 0.3) / 0.6) * 0.4;

    this.splat[s] = grass;
    this.splat[s + 1] = sand;
    this.splat[s + 2] = rock;
    this.splat[s + 3] = dirt;
  }
}
