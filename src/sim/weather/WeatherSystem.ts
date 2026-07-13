import type { Rng } from "../../core/math/Rng";
import type { TerrainGrid } from "../terrain/TerrainGrid";

/**
 * Météo cellulaire (docs/GDD.md §3.4, TDD §4.x) sur une grille grossière
 * (1 cellule = WEATHER_CELL tuiles), cadencée tous les WEATHER_INTERVAL ticks.
 *
 * Boucle de l'eau, entièrement déterministe (stream RNG "weather") :
 *   évaporation au-dessus de l'eau → nuages advectés par un vent qui tourne
 *   lentement → précipitations quand un nuage sature au-dessus des terres →
 *   l'humidité du sol monte (les biomes verdissent) → sans pluie, le sol
 *   revient vers son humidité d'équilibre (baseline).
 *
 * Le pouvoir divin « Pluie » (`RainPower`) ne fait que saturer des nuages :
 * la pluie qui suit est le comportement normal du système.
 */
export const WEATHER_CELL = 8;
export const WEATHER_INTERVAL = 5;

/** Cloudiness above which it rains (or snows on cold ground). */
export const PRECIPITATION_THRESHOLD = 0.62;
/** Soil moisture gained per rained-on tile per weather update. */
const RAIN_MOISTURE = 0.01;
/** Cloud mass lost per rainy update. */
const RAIN_DEPLETION = 0.045;
/** Cloud gained per update over open water. */
const EVAPORATION = 0.035;
/** Fraction of the gap to baseline moisture closed per update (drying). */
const DRY_RATE = 0.002;
/** Passive cloud dissipation per update. */
const DISSIPATION = 0.996;
/** Ground base temperature below which precipitation falls as snow. */
export const SNOW_TEMPERATURE = 0.3;

export class WeatherSystem {
  readonly cellsX: number;
  readonly cellsY: number;
  /** Couverture nuageuse par cellule, [0, 1]. */
  readonly cloud: Float32Array;
  windAngle: number;
  private advectionX = 0;
  private advectionY = 0;
  private readonly rng: Rng;

  constructor(
    private readonly terrain: TerrainGrid,
    baseRng: Rng,
  ) {
    this.cellsX = Math.ceil(terrain.width / WEATHER_CELL);
    this.cellsY = Math.ceil(terrain.height / WEATHER_CELL);
    this.cloud = new Float32Array(this.cellsX * this.cellsY);
    this.rng = baseRng.fork("weather");
    this.windAngle = this.rng.float() * Math.PI * 2;
    for (let i = 0; i < this.cloud.length; i++) {
      this.cloud[i] = this.rng.float() * 0.4;
    }
  }

  cellIndex(cx: number, cy: number): number {
    return cy * this.cellsX + cx;
  }

  cloudAt(cx: number, cy: number): number {
    return this.cloud[this.cellIndex(cx, cy)]!;
  }

  /** Pluie en cours dans cette cellule ? (rendu + gameplay) */
  isRaining(cx: number, cy: number): boolean {
    return this.cloudAt(cx, cy) > PRECIPITATION_THRESHOLD && !this.isCellOverWater(cx, cy);
  }

  /** Neige plutôt que pluie : sol froid (latitude/saison via baseTemperature). */
  isSnowing(cx: number, cy: number): boolean {
    if (!this.isRaining(cx, cy)) return false;
    const { x, y } = this.cellCentreTile(cx, cy);
    return this.terrain.baseTemperature[this.terrain.index(x, y)]! + this.terrain.seasonalOffset < SNOW_TEMPERATURE;
  }

  /** Sature les nuages autour d'un point (utilisé par le pouvoir Pluie). */
  seedClouds(tileX: number, tileY: number, tileRadius: number): void {
    const cx0 = Math.floor((tileX - tileRadius) / WEATHER_CELL);
    const cy0 = Math.floor((tileY - tileRadius) / WEATHER_CELL);
    const cx1 = Math.floor((tileX + tileRadius) / WEATHER_CELL);
    const cy1 = Math.floor((tileY + tileRadius) / WEATHER_CELL);
    for (let cy = Math.max(0, cy0); cy <= Math.min(this.cellsY - 1, cy1); cy++) {
      for (let cx = Math.max(0, cx0); cx <= Math.min(this.cellsX - 1, cx1); cx++) {
        this.cloud[this.cellIndex(cx, cy)] = 1;
      }
    }
  }

  /** Un pas de météo (appelé tous les WEATHER_INTERVAL ticks). */
  update(): void {
    this.driftWind();
    this.advect();

    for (let cy = 0; cy < this.cellsY; cy++) {
      for (let cx = 0; cx < this.cellsX; cx++) {
        const i = this.cellIndex(cx, cy);
        const overWater = this.isCellOverWater(cx, cy);

        if (overWater) {
          this.cloud[i] = Math.min(1, this.cloud[i]! + EVAPORATION);
        } else if (this.cloud[i]! > PRECIPITATION_THRESHOLD) {
          this.cloud[i] = this.cloud[i]! - RAIN_DEPLETION;
          this.rainOnCell(cx, cy);
        }

        this.cloud[i] = this.cloud[i]! * DISSIPATION;
      }
    }

    this.drySoil();
  }

  /** Le vent tourne lentement et aléatoirement (déterministe). */
  private driftWind(): void {
    this.windAngle += (this.rng.float() - 0.5) * 0.15;
  }

  /** Advection : décale la grille de nuages d'une cellule quand le vent a assez soufflé. */
  private advect(): void {
    const speed = 0.35; // cellules par update
    this.advectionX += Math.cos(this.windAngle) * speed;
    this.advectionY += Math.sin(this.windAngle) * speed;
    while (Math.abs(this.advectionX) >= 1) {
      this.shift(Math.sign(this.advectionX), 0);
      this.advectionX -= Math.sign(this.advectionX);
    }
    while (Math.abs(this.advectionY) >= 1) {
      this.shift(0, Math.sign(this.advectionY));
      this.advectionY -= Math.sign(this.advectionY);
    }
  }

  /** Décalage torique de la grille de nuages. */
  private shift(dx: number, dy: number): void {
    const { cellsX, cellsY } = this;
    const source = this.cloud.slice();
    for (let cy = 0; cy < cellsY; cy++) {
      for (let cx = 0; cx < cellsX; cx++) {
        const sx = (cx - dx + cellsX) % cellsX;
        const sy = (cy - dy + cellsY) % cellsY;
        this.cloud[this.cellIndex(cx, cy)] = source[this.cellIndex(sx, sy)]!;
      }
    }
  }

  private rainOnCell(cx: number, cy: number): void {
    const x0 = cx * WEATHER_CELL;
    const y0 = cy * WEATHER_CELL;
    const x1 = Math.min(x0 + WEATHER_CELL, this.terrain.width);
    const y1 = Math.min(y0 + WEATHER_CELL, this.terrain.height);
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        if (this.terrain.isWater(x, y)) continue;
        const i = this.terrain.index(x, y);
        this.terrain.setMoisture(x, y, this.terrain.moisture[i]! + RAIN_MOISTURE);
      }
    }
  }

  /** Sans pluie, l'humidité revient lentement vers l'équilibre généré. */
  private drySoil(): void {
    const terrain = this.terrain;
    for (let i = 0; i < terrain.moisture.length; i++) {
      const gap = terrain.baselineMoisture[i]! - terrain.moisture[i]!;
      if (Math.abs(gap) < 0.0005) continue;
      const x = i % terrain.width;
      const y = Math.floor(i / terrain.width);
      terrain.setMoisture(x, y, terrain.moisture[i]! + gap * DRY_RATE);
    }
  }

  private isCellOverWater(cx: number, cy: number): boolean {
    const { x, y } = this.cellCentreTile(cx, cy);
    return this.terrain.isWater(x, y);
  }

  private cellCentreTile(cx: number, cy: number): { x: number; y: number } {
    return {
      x: Math.min(this.terrain.width - 1, cx * WEATHER_CELL + WEATHER_CELL / 2),
      y: Math.min(this.terrain.height - 1, cy * WEATHER_CELL + WEATHER_CELL / 2),
    };
  }

  /** Snapshot pour la sauvegarde (v2). */
  serialize(): { cloud: number[]; windAngle: number; advectionX: number; advectionY: number; rngState: number } {
    return {
      cloud: Array.from(this.cloud),
      windAngle: this.windAngle,
      advectionX: this.advectionX,
      advectionY: this.advectionY,
      rngState: this.rng.getState(),
    };
  }

  /** Restauration depuis une sauvegarde (v2). */
  restore(data: { cloud: number[]; windAngle: number; advectionX: number; advectionY: number; rngState: number }): void {
    if (data.cloud.length !== this.cloud.length) {
      throw new Error("Corrupted save: weather grid size mismatch");
    }
    this.cloud.set(data.cloud);
    this.windAngle = data.windAngle;
    this.advectionX = data.advectionX;
    this.advectionY = data.advectionY;
    this.rng.setState(data.rngState);
  }
}
