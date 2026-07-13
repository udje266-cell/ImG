import type { Rng } from "../../core/math/Rng";
import type { TerrainGrid } from "../terrain/TerrainGrid";
import type { AgentSystem } from "../agents/AgentSystem";

/**
 * Villages et foyers (docs/GDD.md §4 « Sociétés », cahier des charges §5).
 *
 * Les habitants naissent dispersés ; ce système les **regroupe en villages**
 * de façon déterministe : il agrège les habitants en quelques grappes, fonde
 * un village au barycentre de chacune (calé sur une tuile constructible), y
 * plante des huttes, puis **redéfinit le foyer** de chaque habitant sur le
 * centre de son village. Comme l'objectif « rest » ramène chacun à son foyer,
 * la population se resserre peu à peu autour des villages — vie de village
 * émergente, sans script.
 *
 * Aucune logique par tick : la fondation est un acte ponctuel (au peuplement
 * initial et au chargement d'une partie qui n'en contenait pas). Pur domaine,
 * déterministe (stream RNG « settlements »).
 */
export interface Village {
  x: number;
  y: number;
  population: number;
}
export interface Dwelling {
  x: number;
  y: number;
}

/** Un village par tranche d'habitants (borné). */
const AGENTS_PER_VILLAGE = 12;
const MAX_VILLAGES = 8;
/** Une hutte par tranche d'habitants du village (bornée). */
const DWELLERS_PER_HUT = 4;
const MAX_HUTS_PER_VILLAGE = 14;
/** Rayon de recherche (tuiles) d'une tuile constructible. */
const BUILD_SEARCH_RADIUS = 6;
/** Angle d'or : dispersion régulière des huttes autour du centre. */
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

export class SettlementSystem {
  private readonly _villages: Village[] = [];
  private readonly _dwellings: Dwelling[] = [];
  private readonly rng: Rng;

  constructor(
    private readonly terrain: TerrainGrid,
    baseRng: Rng,
  ) {
    this.rng = baseRng.fork("settlements");
  }

  get villages(): readonly Village[] {
    return this._villages;
  }
  get dwellings(): readonly Dwelling[] {
    return this._dwellings;
  }

  /**
   * Fonde les villages à partir des habitants existants : grappes → centres →
   * huttes → réassignation des foyers. Idempotent (repart d'un état vierge).
   */
  found(agents: AgentSystem): void {
    this._villages.length = 0;
    this._dwellings.length = 0;
    const snap = agents.snapshot();
    const n = snap.count;
    if (n === 0) return;

    const k = Math.max(1, Math.min(MAX_VILLAGES, Math.round(n / AGENTS_PER_VILLAGE)));
    const seeds = this.pickSeeds(snap.x, snap.y, n, k);

    // Affectation au plus proche seed + barycentre par grappe.
    const assign = new Int32Array(n);
    const sumX = new Float64Array(seeds.length);
    const sumY = new Float64Array(seeds.length);
    const cnt = new Int32Array(seeds.length);
    for (let i = 0; i < n; i++) {
      let best = 0;
      let bestD = Infinity;
      for (let s = 0; s < seeds.length; s++) {
        const dx = snap.x[i]! - snap.x[seeds[s]!]!;
        const dy = snap.y[i]! - snap.y[seeds[s]!]!;
        const d = dx * dx + dy * dy;
        if (d < bestD) {
          bestD = d;
          best = s;
        }
      }
      assign[i] = best;
      sumX[best]! += snap.x[i]!;
      sumY[best]! += snap.y[i]!;
      cnt[best]!++;
    }

    // Un village par grappe non vide, centre calé sur une tuile constructible.
    const seedToVillage = new Int32Array(seeds.length).fill(-1);
    for (let s = 0; s < seeds.length; s++) {
      if (cnt[s]! === 0) continue;
      const spot = this.nearestBuildableTile(sumX[s]! / cnt[s]!, sumY[s]! / cnt[s]!);
      if (!spot) continue;
      seedToVillage[s] = this._villages.length;
      this._villages.push({ x: spot.x, y: spot.y, population: cnt[s]! });
    }
    if (this._villages.length === 0) return;

    // Foyer de chaque habitant = centre de son village (fallback : 1er village).
    for (let i = 0; i < n; i++) {
      let v = seedToVillage[assign[i]!]!;
      if (v < 0) v = 0;
      const village = this._villages[v]!;
      agents.setHome(i, village.x, village.y);
    }

    // Huttes autour de chaque centre.
    for (const village of this._villages) {
      this.raiseDwellings(village);
    }
  }

  /**
   * Graines de village par échantillonnage du point le plus éloigné : première
   * graine = habitant le plus proche du centre du monde, puis à chaque fois
   * l'habitant qui maximise sa distance minimale aux graines déjà choisies.
   * Étale les villages sans recourir à un k-means coûteux, de façon déterministe.
   */
  private pickSeeds(x: Float32Array, y: Float32Array, n: number, k: number): number[] {
    const cx = this.terrain.width / 2;
    const cy = this.terrain.height / 2;
    let first = 0;
    let firstD = Infinity;
    for (let i = 0; i < n; i++) {
      const d = (x[i]! - cx) ** 2 + (y[i]! - cy) ** 2;
      if (d < firstD) {
        firstD = d;
        first = i;
      }
    }
    const seeds = [first];
    while (seeds.length < k && seeds.length < n) {
      let far = -1;
      let farD = -1;
      for (let i = 0; i < n; i++) {
        let minD = Infinity;
        for (const s of seeds) {
          const d = (x[i]! - x[s]!) ** 2 + (y[i]! - y[s]!) ** 2;
          if (d < minD) minD = d;
        }
        if (minD > farD) {
          farD = minD;
          far = i;
        }
      }
      if (far < 0) break;
      seeds.push(far);
    }
    return seeds;
  }

  /** Plante les huttes du village en spirale sur des tuiles constructibles. */
  private raiseDwellings(village: Village): void {
    const huts = Math.max(
      1,
      Math.min(MAX_HUTS_PER_VILLAGE, Math.ceil(village.population / DWELLERS_PER_HUT)),
    );
    let placed = 0;
    for (let h = 0; placed < huts && h < huts * 4; h++) {
      const angle = h * GOLDEN_ANGLE + this.rng.float() * 0.5;
      const radius = 1.3 + Math.floor(h / 6) * 1.2 + this.rng.float() * 0.5;
      const tx = village.x + Math.cos(angle) * radius;
      const ty = village.y + Math.sin(angle) * radius;
      const spot = this.nearestBuildableTile(tx, ty);
      if (!spot) continue;
      // Évite les huttes qui se chevauchent (< 0,8 tuile).
      if (this._dwellings.some((d) => (d.x - spot.x) ** 2 + (d.y - spot.y) ** 2 < 0.64)) continue;
      this._dwellings.push(spot);
      placed++;
    }
  }

  /**
   * Tuile constructible (terre ferme, hors eau) la plus proche de (cx, cy),
   * recherchée en anneaux croissants. Retourne le centre de tuile, ou null.
   */
  private nearestBuildableTile(cx: number, cy: number): Dwelling | null {
    const bx = Math.floor(cx);
    const by = Math.floor(cy);
    for (let r = 0; r <= BUILD_SEARCH_RADIUS; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue; // périmètre de l'anneau
          const x = bx + dx;
          const y = by + dy;
          if (!this.terrain.inBounds(x, y) || this.terrain.isWater(x, y)) continue;
          return { x: x + 0.5, y: y + 0.5 };
        }
      }
    }
    return null;
  }

  serialize(): { vx: number[]; vy: number[]; vpop: number[]; dx: number[]; dy: number[] } {
    return {
      vx: this._villages.map((v) => v.x),
      vy: this._villages.map((v) => v.y),
      vpop: this._villages.map((v) => v.population),
      dx: this._dwellings.map((d) => d.x),
      dy: this._dwellings.map((d) => d.y),
    };
  }

  restore(data: ReturnType<SettlementSystem["serialize"]>): void {
    this._villages.length = 0;
    this._dwellings.length = 0;
    for (let i = 0; i < data.vx.length; i++) {
      this._villages.push({ x: data.vx[i]!, y: data.vy[i]!, population: data.vpop[i]! });
    }
    for (let i = 0; i < data.dx.length; i++) {
      this._dwellings.push({ x: data.dx[i]!, y: data.dy[i]! });
    }
  }
}
