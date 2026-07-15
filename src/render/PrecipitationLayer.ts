import {
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Points,
  PointsMaterial,
  type Texture,
} from "three";
import { Rng } from "../core/math/Rng";
import { WEATHER_CELL } from "../sim/weather/WeatherSystem";
import type { Simulation } from "../sim/world/Simulation";
import { groundHeightAt } from "./TerrainMesh";

/** Altitude de départ des gouttes (juste sous les nuages, cf. WeatherLayer). */
const SPAWN_ALTITUDE = 38;
const MAX_PARTICLES = 1400;
/** Vitesse de chute (unités monde / s). */
const RAIN_SPEED = 26;
const SNOW_SPEED = 4.5;
/** Cadence de re-scan des cellules précipitantes (s). */
const RESCAN_INTERVAL = 0.4;

/** Pastille ronde à bord doux (dégradé radial) — goutte/flocon stylisé. */
function makeDropTexture(): Texture {
  const size = 32;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const grad = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(0.45, "rgba(255,255,255,0.7)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  return new CanvasTexture(canvas);
}

/**
 * Précipitations visibles (docs/GDD.md §3.4) : un nuage de `Points` recyclés
 * qui tombent sous les cellules météo où il pleut/neige réellement — la pluie
 * n'est plus seulement une variable d'humidité, on la VOIT tomber. Gouttes
 * bleutées rapides, flocons blancs lents qui ondulent. Un seul draw call,
 * positions recyclées (aucune allocation par frame). Couche de rendu pure :
 * lit la simulation, ne la modifie jamais.
 */
export class PrecipitationLayer {
  readonly points: Points;
  private readonly positions: Float32Array;
  private readonly colors: Float32Array;
  /** Par particule : vitesse de chute, flocon (1) ou goutte (0), sol cible. */
  private readonly speed = new Float32Array(MAX_PARTICLES);
  private readonly snowy = new Uint8Array(MAX_PARTICLES);
  private readonly groundY = new Float32Array(MAX_PARTICLES);
  private readonly phase = new Float32Array(MAX_PARTICLES);
  private readonly rng = new Rng(0x5eed);
  private cells: Array<{ cx: number; cy: number; snow: boolean }> = [];
  private sinceRescan = RESCAN_INTERVAL;
  private time = 0;

  constructor(private readonly sim: Simulation) {
    this.positions = new Float32Array(MAX_PARTICLES * 3);
    this.colors = new Float32Array(MAX_PARTICLES * 3);
    // Toutes cachées sous le monde au départ.
    for (let i = 0; i < MAX_PARTICLES; i++) this.positions[i * 3 + 1] = -100;

    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new BufferAttribute(this.positions, 3));
    geometry.setAttribute("color", new BufferAttribute(this.colors, 3));

    this.points = new Points(
      geometry,
      new PointsMaterial({
        map: makeDropTexture(),
        size: 0.3,
        vertexColors: true,
        transparent: true,
        opacity: 0.75,
        depthWrite: false,
        alphaTest: 0.05,
      }),
    );
    this.points.frustumCulled = false;
    this.points.visible = false;
  }

  /** Avance les particules ; `dt` en secondes (temps réel du rendu). */
  update(dt: number): void {
    this.time += dt;
    this.sinceRescan += dt;
    if (this.sinceRescan >= RESCAN_INTERVAL) {
      this.sinceRescan = 0;
      this.rescan();
    }
    if (this.cells.length === 0) {
      this.points.visible = false;
      return;
    }
    this.points.visible = true;

    for (let i = 0; i < MAX_PARTICLES; i++) {
      const o = i * 3;
      let y = this.positions[o + 1]!;
      if (y <= this.groundY[i]!) {
        this.respawn(i);
        continue;
      }
      y -= this.speed[i]! * dt;
      this.positions[o + 1] = y;
      // Les flocons dérivent latéralement en ondulant.
      if (this.snowy[i]! === 1) {
        this.positions[o] = this.positions[o]! + Math.sin(this.time * 1.8 + this.phase[i]!) * dt * 1.2;
      }
    }
    (this.points.geometry.getAttribute("position") as BufferAttribute).needsUpdate = true;
  }

  /** Recense les cellules météo où il précipite (toutes les RESCAN_INTERVAL s). */
  private rescan(): void {
    const weather = this.sim.weather;
    const next: Array<{ cx: number; cy: number; snow: boolean }> = [];
    for (let cy = 0; cy < weather.cellsY; cy++) {
      for (let cx = 0; cx < weather.cellsX; cx++) {
        if (weather.isSnowing(cx, cy)) next.push({ cx, cy, snow: true });
        else if (weather.isRaining(cx, cy)) next.push({ cx, cy, snow: false });
      }
    }
    this.cells = next;
  }

  /** Replace une particule sous une cellule précipitante, en haut du ciel. */
  private respawn(i: number): void {
    const cell = this.cells[this.rng.int(0, this.cells.length - 1)]!;
    const wx = cell.cx * WEATHER_CELL + this.rng.float() * WEATHER_CELL;
    const wz = cell.cy * WEATHER_CELL + this.rng.float() * WEATHER_CELL;
    const o = i * 3;
    this.positions[o] = wx;
    // Départ étagé pour éviter les « vagues » de gouttes synchronisées.
    this.positions[o + 1] = SPAWN_ALTITUDE - this.rng.float() * 10;
    this.positions[o + 2] = wz;
    this.groundY[i] = Math.max(0, groundHeightAt(this.sim.terrain, wx, wz));
    this.snowy[i] = cell.snow ? 1 : 0;
    this.phase[i] = this.rng.float() * Math.PI * 2;
    this.speed[i] = cell.snow
      ? SNOW_SPEED * (0.8 + this.rng.float() * 0.4)
      : RAIN_SPEED * (0.85 + this.rng.float() * 0.3);
    if (cell.snow) {
      this.colors[o] = 1;
      this.colors[o + 1] = 1;
      this.colors[o + 2] = 1;
    } else {
      this.colors[o] = 0.62;
      this.colors[o + 1] = 0.77;
      this.colors[o + 2] = 0.91;
    }
    (this.points.geometry.getAttribute("color") as BufferAttribute).needsUpdate = true;
  }
}
