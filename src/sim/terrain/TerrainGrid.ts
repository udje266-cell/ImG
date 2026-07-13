import { Biome, classifyBiome } from "../worldgen/biomes";

/**
 * The world's terrain: dense typed arrays, chunked dirty tracking
 * (see docs/TDD.md §4.1). All values are normalised to [0, 1].
 *
 * The grid is NOT part of the ECS: it is a singleton resource owned by the
 * Simulation. Any height modification marks the containing chunk dirty;
 * `refreshDirtyChunks()` (called once per tick) re-derives biomes locally and
 * reports which chunks changed so the renderer can redraw only those.
 */
export const CHUNK_SIZE = 32;

export class TerrainGrid {
  readonly width: number;
  readonly height: number;
  readonly seaLevel: number;
  readonly chunksX: number;
  readonly chunksY: number;

  readonly heightMap: Float32Array;
  /** Sea-level temperature; altitude lapse is applied at classification time. */
  readonly baseTemperature: Float32Array;
  /** Humidité vivante — la météo la recharge (pluie) ou l'assèche. */
  readonly moisture: Float32Array;
  /** Humidité d'équilibre issue de la génération : la météo y ramène `moisture`. */
  readonly baselineMoisture: Float32Array;
  /** Derived cache — always recomputed from the layers above. */
  readonly biomes: Uint8Array;

  /** Décalage thermique saisonnier appliqué à la classification (hiver < 0). */
  private seasonalTemperatureOffset = 0;

  private readonly dirtyChunks = new Set<number>();

  constructor(width: number, height: number, seaLevel = 0.5) {
    if (width <= 0 || height <= 0) throw new Error("TerrainGrid: invalid size");
    this.width = width;
    this.height = height;
    this.seaLevel = seaLevel;
    this.chunksX = Math.ceil(width / CHUNK_SIZE);
    this.chunksY = Math.ceil(height / CHUNK_SIZE);
    const cells = width * height;
    this.heightMap = new Float32Array(cells);
    this.baseTemperature = new Float32Array(cells);
    this.moisture = new Float32Array(cells);
    this.baselineMoisture = new Float32Array(cells);
    this.biomes = new Uint8Array(cells);
  }

  index(x: number, y: number): number {
    return y * this.width + x;
  }

  inBounds(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.width && y < this.height;
  }

  heightAt(x: number, y: number): number {
    return this.heightMap[this.index(x, y)]!;
  }

  biomeAt(x: number, y: number): Biome {
    return this.biomes[this.index(x, y)]! as Biome;
  }

  isWater(x: number, y: number): boolean {
    return this.heightAt(x, y) < this.seaLevel;
  }

  chunkIdAt(x: number, y: number): number {
    return Math.floor(y / CHUNK_SIZE) * this.chunksX + Math.floor(x / CHUNK_SIZE);
  }

  /** Set height (clamped to [0, 1]) and mark the containing chunk dirty. */
  setHeight(x: number, y: number, value: number): void {
    const clamped = Math.min(1, Math.max(0, value));
    const i = this.index(x, y);
    if (this.heightMap[i] === clamped) return;
    this.heightMap[i] = clamped;
    this.dirtyChunks.add(this.chunkIdAt(x, y));
  }

  modifyHeight(x: number, y: number, delta: number): void {
    this.setHeight(x, y, this.heightAt(x, y) + delta);
  }

  /** Set soil moisture (clamped to [0, 1]) and mark the chunk dirty. */
  setMoisture(x: number, y: number, value: number): void {
    const clamped = Math.min(1, Math.max(0, value));
    const i = this.index(x, y);
    if (this.moisture[i] === clamped) return;
    this.moisture[i] = clamped;
    this.dirtyChunks.add(this.chunkIdAt(x, y));
  }

  get seasonalOffset(): number {
    return this.seasonalTemperatureOffset;
  }

  /**
   * Décalage thermique de la saison courante : re-classifie TOUT le monde
   * (une fois par changement de saison — la neige descend en hiver).
   */
  setSeasonalTemperatureOffset(offset: number): void {
    if (this.seasonalTemperatureOffset === offset) return;
    this.seasonalTemperatureOffset = offset;
    for (let id = 0; id < this.chunksX * this.chunksY; id++) {
      this.dirtyChunks.add(id);
    }
  }

  /**
   * Recompute biomes of all dirty chunks. Returns the (sorted) chunk ids that
   * were refreshed and clears the dirty set. Called once per simulation tick.
   */
  refreshDirtyChunks(): number[] {
    if (this.dirtyChunks.size === 0) return [];
    const ids = [...this.dirtyChunks].sort((a, b) => a - b);
    this.dirtyChunks.clear();
    for (const id of ids) this.refreshChunkBiomes(id);
    return ids;
  }

  /** Recompute every biome — used once after world generation. */
  refreshAllBiomes(): void {
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        this.refreshCellBiome(x, y);
      }
    }
    this.dirtyChunks.clear();
  }

  private refreshChunkBiomes(chunkId: number): void {
    const x0 = (chunkId % this.chunksX) * CHUNK_SIZE;
    const y0 = Math.floor(chunkId / this.chunksX) * CHUNK_SIZE;
    const x1 = Math.min(x0 + CHUNK_SIZE, this.width);
    const y1 = Math.min(y0 + CHUNK_SIZE, this.height);
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        this.refreshCellBiome(x, y);
      }
    }
  }

  private refreshCellBiome(x: number, y: number): void {
    const i = this.index(x, y);
    this.biomes[i] = classifyBiome(
      this.heightMap[i]!,
      this.baseTemperature[i]! + this.seasonalTemperatureOffset,
      this.moisture[i]!,
      this.seaLevel,
    );
  }
}
