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
  /** Nombre de huttes déjà bâties (l'expansion en ajoute avec la croissance). */
  huts: number;
}
export interface Dwelling {
  x: number;
  y: number;
}
/** Parcelle cultivée d'un village (nourriture + visuel de civilisation). */
export interface Field {
  x: number;
  y: number;
}

/** Un village par tranche d'habitants (borné). */
const AGENTS_PER_VILLAGE = 12;
const MAX_VILLAGES = 8;
/** Une hutte par tranche d'habitants du village (bornée). */
const DWELLERS_PER_HUT = 4;
const MAX_HUTS_PER_VILLAGE = 14;
/** Champs cultivés par village (posés en couronne au-delà des huttes). */
const FIELDS_PER_VILLAGE = 2;
/** Rayon de recherche (tuiles) d'une tuile constructible. */
const BUILD_SEARCH_RADIUS = 6;
/** Angle d'or : dispersion régulière des huttes autour du centre. */
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

export class SettlementSystem {
  private readonly _villages: Village[] = [];
  private readonly _dwellings: Dwelling[] = [];
  private readonly _fields: Field[] = [];
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
  get fields(): readonly Field[] {
    return this._fields;
  }

  /**
   * Fonde les villages à partir des habitants existants : grappes → centres →
   * huttes → réassignation des foyers. Idempotent (repart d'un état vierge).
   */
  found(agents: AgentSystem): void {
    this._villages.length = 0;
    this._dwellings.length = 0;
    this._fields.length = 0;
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
      this._villages.push({ x: spot.x, y: spot.y, population: cnt[s]!, huts: 0 });
    }
    if (this._villages.length === 0) return;

    // Foyer de chaque habitant = centre de son village (fallback : 1er village).
    for (let i = 0; i < n; i++) {
      let v = seedToVillage[assign[i]!]!;
      if (v < 0) v = 0;
      const village = this._villages[v]!;
      agents.setHome(i, village.x, village.y);
    }

    // Huttes puis champs autour de chaque centre.
    for (const village of this._villages) {
      this.raiseDwellings(village);
      this.sowFields(village);
    }
  }

  /**
   * Croissance des villages : recompte la population de chaque village
   * (habitant → village le plus proche) et bâtit de nouvelles huttes quand
   * elle dépasse la capacité. Appelée périodiquement par la Simulation.
   * Retourne true si quelque chose a changé (le rendu doit se reconstruire).
   */
  expand(agents: AgentSystem): boolean {
    if (this._villages.length === 0) return false;
    const snap = agents.snapshot();

    const counts = new Int32Array(this._villages.length);
    for (let i = 0; i < snap.count; i++) {
      let best = 0;
      let bestD = Infinity;
      for (let v = 0; v < this._villages.length; v++) {
        const dx = snap.x[i]! - this._villages[v]!.x;
        const dy = snap.y[i]! - this._villages[v]!.y;
        const d = dx * dx + dy * dy;
        if (d < bestD) {
          bestD = d;
          best = v;
        }
      }
      counts[best]!++;
    }

    let changed = false;
    for (let v = 0; v < this._villages.length; v++) {
      const village = this._villages[v]!;
      if (counts[v]! !== village.population) {
        village.population = counts[v]!;
        changed = true;
      }
      if (this.raiseDwellings(village) > 0) changed = true;
    }
    return changed;
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

  /**
   * Complète les huttes du village jusqu'à sa capacité (1 hutte / 4 habitants,
   * bornée) en spirale sur des tuiles constructibles. Incrémental : ne bâtit
   * que les huttes manquantes, en poursuivant la spirale existante.
   * Retourne le nombre de huttes ajoutées.
   */
  private raiseDwellings(village: Village): number {
    const wanted = Math.max(
      1,
      Math.min(MAX_HUTS_PER_VILLAGE, Math.ceil(village.population / DWELLERS_PER_HUT)),
    );
    let placed = 0;
    for (let h = village.huts; village.huts < wanted && h < wanted * 4; h++) {
      const angle = h * GOLDEN_ANGLE + this.rng.float() * 0.5;
      const radius = 1.3 + Math.floor(h / 6) * 1.2 + this.rng.float() * 0.5;
      const tx = village.x + Math.cos(angle) * radius;
      const ty = village.y + Math.sin(angle) * radius;
      const spot = this.nearestBuildableTile(tx, ty);
      if (!spot) continue;
      // Évite les huttes qui se chevauchent (< 0,8 tuile).
      if (this._dwellings.some((d) => (d.x - spot.x) ** 2 + (d.y - spot.y) ** 2 < 0.64)) continue;
      this._dwellings.push(spot);
      village.huts++;
      placed++;
    }
    return placed;
  }

  /** Sème les champs du village en couronne, au-delà du cercle des huttes. */
  private sowFields(village: Village): void {
    let sown = 0;
    for (let f = 0; sown < FIELDS_PER_VILLAGE && f < FIELDS_PER_VILLAGE * 5; f++) {
      const angle = f * GOLDEN_ANGLE * 2.4 + this.rng.float() * 0.6;
      const radius = 3.2 + this.rng.float() * 1.6;
      const spot = this.nearestBuildableTile(
        village.x + Math.cos(angle) * radius,
        village.y + Math.sin(angle) * radius,
      );
      if (!spot) continue;
      // À l'écart des huttes et des autres champs.
      if (this._dwellings.some((d) => (d.x - spot.x) ** 2 + (d.y - spot.y) ** 2 < 1.2)) continue;
      if (this._fields.some((p) => (p.x - spot.x) ** 2 + (p.y - spot.y) ** 2 < 2.5)) continue;
      this._fields.push(spot);
      sown++;
    }
  }

  /**
   * Tuile **constructible** (terre ferme ET assez plate — cœur Godus) la plus
   * proche de (cx, cy), recherchée en anneaux croissants. Les habitants ne
   * bâtissent que sur du plat : au joueur d'aplanir le sol pour leur ouvrir de
   * nouveaux terrains. Retourne le centre de tuile, ou null si rien de plat à
   * portée (rien ne se bâtit alors — il faut terrasser).
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
          if (!this.terrain.inBounds(x, y) || !this.terrain.isBuildable(x, y)) continue;
          return { x: x + 0.5, y: y + 0.5 };
        }
      }
    }
    return null;
  }

  serialize(): {
    vx: number[]; vy: number[]; vpop: number[]; vhuts: number[];
    dx: number[]; dy: number[]; fx: number[]; fy: number[];
  } {
    return {
      vx: this._villages.map((v) => v.x),
      vy: this._villages.map((v) => v.y),
      vpop: this._villages.map((v) => v.population),
      vhuts: this._villages.map((v) => v.huts),
      dx: this._dwellings.map((d) => d.x),
      dy: this._dwellings.map((d) => d.y),
      fx: this._fields.map((f) => f.x),
      fy: this._fields.map((f) => f.y),
    };
  }

  restore(data: ReturnType<SettlementSystem["serialize"]>): void {
    this._villages.length = 0;
    this._dwellings.length = 0;
    this._fields.length = 0;
    for (let i = 0; i < data.vx.length; i++) {
      this._villages.push({
        x: data.vx[i]!,
        y: data.vy[i]!,
        population: data.vpop[i]!,
        // Sauvegarde v6 (sans vhuts) : estime depuis la population.
        huts: data.vhuts[i] ?? Math.ceil(data.vpop[i]! / DWELLERS_PER_HUT),
      });
    }
    for (let i = 0; i < data.dx.length; i++) {
      this._dwellings.push({ x: data.dx[i]!, y: data.dy[i]! });
    }
    for (let i = 0; i < data.fx.length; i++) {
      this._fields.push({ x: data.fx[i]!, y: data.fy[i]! });
    }
  }
}
