import type { Rng } from "../../core/math/Rng";
import type { Season } from "../../core/time/GameClock";
import { Biome } from "../worldgen/biomes";
import type { TerrainGrid } from "../terrain/TerrainGrid";

/**
 * Flore (docs/GDD.md §3.5) : une densité de végétation ∈ [0,1] par tuile qui
 * pousse là où l'humidité, la température et le biome le permettent, essaime
 * vers les voisins, et régresse en sécheresse ou en hiver. Entièrement
 * déterministe (stream RNG "flora"), cadencée tous les FLORA_INTERVAL ticks.
 *
 * C'est la couche qui « anime » l'humidité simulée par la météo : faites
 * pleuvoir sur un désert et la végétation finit par s'y installer.
 */
export const FLORA_INTERVAL = 10;

/** Capacité de végétation d'un biome (0 = stérile, 1 = forêt dense possible). */
const BIOME_CAPACITY: Record<Biome, number> = {
  [Biome.Ocean]: 0,
  [Biome.Beach]: 0.05,
  [Biome.Grassland]: 0.55,
  [Biome.TemperateForest]: 1,
  [Biome.TropicalForest]: 1,
  [Biome.Savanna]: 0.4,
  [Biome.Desert]: 0.05,
  [Biome.Steppe]: 0.3,
  [Biome.Taiga]: 0.8,
  [Biome.Tundra]: 0.15,
  [Biome.Mountain]: 0.1,
  [Biome.Snow]: 0,
};

const GROWTH_RATE = 0.06;
const DECAY_RATE = 0.05;
/** Part de la densité d'une cellule qui essaime vers chaque voisin. */
const SPREAD_RATE = 0.02;
/** Humidité minimale pour toute croissance. */
const MOISTURE_FLOOR = 0.18;
/** Densité en dessous de laquelle une cellule est considérée nue. */
export const BARE_THRESHOLD = 0.08;

/** Multiplicateur de croissance saisonnier (rien ne pousse en hiver). */
const SEASON_GROWTH: Record<Season, number> = {
  spring: 1.2,
  summer: 1,
  autumn: 0.5,
  winter: 0,
};

export class FloraSystem {
  /** Densité de végétation par tuile, [0,1]. */
  readonly density: Float32Array;
  private readonly rng: Rng;
  private season: Season = "spring";

  constructor(
    private readonly terrain: TerrainGrid,
    baseRng: Rng,
  ) {
    this.density = new Float32Array(terrain.width * terrain.height);
    this.rng = baseRng.fork("flora");
    this.seed();
  }

  setSeason(season: Season): void {
    this.season = season;
  }

  /** Capacité effective d'une tuile : biome × adéquation de l'humidité. */
  private capacityAt(i: number): number {
    const terrain = this.terrain;
    if (terrain.heightMap[i]! < terrain.seaLevel) return 0;
    const biomeCap = BIOME_CAPACITY[terrain.biomes[i]! as Biome];
    const moisture = terrain.moisture[i]!;
    if (moisture < MOISTURE_FLOOR) return 0;
    // L'humidité module la capacité entre le seuil (0) et 0.7 (plein régime).
    const moistureFactor = Math.min(1, (moisture - MOISTURE_FLOOR) / (0.7 - MOISTURE_FLOOR));
    return biomeCap * moistureFactor;
  }

  /** Ensemencement initial : un peu de verdure là où le biome s'y prête. */
  private seed(): void {
    for (let i = 0; i < this.density.length; i++) {
      const cap = this.capacityAt(i);
      if (cap > 0.2 && this.rng.float() < cap * 0.5) {
        this.density[i] = this.rng.float() * cap;
      }
    }
  }

  densityAt(x: number, y: number): number {
    return this.density[this.terrain.index(x, y)]!;
  }

  /** Fixe la densité (bornée [0,1]) — le broutage de la faune l'abaisse. */
  setDensity(x: number, y: number, value: number): void {
    this.density[this.terrain.index(x, y)] = Math.min(1, Math.max(0, value));
  }

  /**
   * Miracle de fertilité (pouvoir « Verdoiement ») : pousse la végétation vers
   * sa capacité dans un disque, avec atténuation vers les bords. Ne dépasse
   * jamais la capacité écologique de la tuile (le miracle accélère la nature,
   * il ne la falsifie pas) — sol nu/aride ou sous l'eau : sans effet.
   * Retourne le nombre de tuiles réellement verdies.
   */
  fertilize(cx: number, cy: number, radius: number, strength = 0.75): number {
    const terrain = this.terrain;
    const r = Math.max(1, radius);
    let touched = 0;
    for (let y = Math.max(0, Math.ceil(cy - r)); y <= Math.min(terrain.height - 1, Math.floor(cy + r)); y++) {
      for (let x = Math.max(0, Math.ceil(cx - r)); x <= Math.min(terrain.width - 1, Math.floor(cx + r)); x++) {
        const dx = x - cx;
        const dy = y - cy;
        const dist = Math.hypot(dx, dy);
        if (dist > r) continue;
        const i = terrain.index(x, y);
        const cap = this.capacityAt(i);
        if (cap <= 0) continue; // sol non viable : la nature ne ment pas
        const falloff = 1 - dist / r; // plein effet au centre, nul au bord
        const boosted = this.density[i]! + (cap - this.density[i]!) * strength * falloff;
        // Amorce au moins la germination sur une tuile nue mais viable.
        const next = Math.max(boosted, Math.min(cap, BARE_THRESHOLD * falloff));
        if (next > this.density[i]!) {
          this.density[i] = next;
          touched++;
        }
      }
    }
    return touched;
  }

  /** Un pas d'écologie (tous les FLORA_INTERVAL ticks). */
  update(): void {
    const terrain = this.terrain;
    const w = terrain.width;
    const h = terrain.height;
    const growth = GROWTH_RATE * SEASON_GROWTH[this.season];
    const spillover = new Float32Array(this.density.length);

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        const cap = this.capacityAt(i);
        let d = this.density[i]!;

        if (d > cap) {
          // Au-dessus de la capacité (sécheresse, gel du biome) : régression.
          d += (cap - d) * DECAY_RATE;
        } else if (cap > 0 && growth > 0) {
          // Croissance logistique vers la capacité (nulle en hiver).
          d += growth * d * (1 - d / cap);
          // Une cellule nue mais viable peut germer spontanément (rare).
          if (d < BARE_THRESHOLD && this.rng.float() < 0.02 * cap) d = BARE_THRESHOLD;
        }

        // Essaimage vers les 4 voisins si assez dense.
        if (d > 0.3 && growth > 0) {
          const give = d * SPREAD_RATE;
          if (x > 0) spillover[i - 1] = spillover[i - 1]! + give;
          if (x < w - 1) spillover[i + 1] = spillover[i + 1]! + give;
          if (y > 0) spillover[i - w] = spillover[i - w]! + give;
          if (y < h - 1) spillover[i + w] = spillover[i + w]! + give;
        }

        this.density[i] = Math.min(1, Math.max(0, d));
      }
    }

    // Applique l'essaimage reçu, borné par la capacité de la cellule cible.
    for (let i = 0; i < this.density.length; i++) {
      if (spillover[i]! === 0) continue;
      const cap = this.capacityAt(i);
      if (cap <= 0) continue;
      this.density[i] = Math.min(cap, this.density[i]! + spillover[i]!);
    }
  }

  serialize(): { density: number[]; rngState: number } {
    return { density: Array.from(this.density), rngState: this.rng.getState() };
  }

  restore(data: { density: number[]; rngState: number }): void {
    if (data.density.length !== this.density.length) {
      throw new Error("Corrupted save: flora grid size mismatch");
    }
    this.density.set(data.density);
    this.rng.setState(data.rngState);
  }
}
