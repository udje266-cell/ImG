import type { Rng } from "../../core/math/Rng";
import { BARE_THRESHOLD, type FloraSystem } from "./FloraSystem";
import { Biome } from "../worldgen/biomes";
import type { TerrainGrid } from "../terrain/TerrainGrid";

/**
 * Faune (docs/GDD.md §3.5, cahier des charges §5) : une chaîne alimentaire
 * simple et déterministe (stream RNG "fauna"), cadencée chaque tick.
 *
 * - Herbivores : broutent la flore (baisse la densité locale), fuient les
 *   prédateurs, se reproduisent quand rassasiés, meurent de faim.
 * - Prédateurs : chassent l'herbivore le plus proche, se reproduisent, meurent
 *   de faim s'ils ne mangent pas.
 *
 * La population s'auto-régule (proie/prédateur) et se branche sur l'écologie :
 * plus de flore → plus d'herbivores → plus de prédateurs, puis correction.
 * Stores SoA avec suppression par swap pour les morts.
 */
export const FAUNA_DECISION_INTERVAL = 15;

export const HERBIVORE = 0;
export const PREDATOR = 1;
export type Species = typeof HERBIVORE | typeof PREDATOR;

const SPEED: Record<Species, number> = { [HERBIVORE]: 0.05, [PREDATOR]: 0.07 };
const ENERGY_DECAY: Record<Species, number> = { [HERBIVORE]: 0.0006, [PREDATOR]: 0.0011 };
const REPRO_ENERGY = 0.78; // seuil de reproduction
const REPRO_COST = 0.42;
const REPRO_COOLDOWN = 600; // ticks
const EAT_RANGE = 1.1; // portée de prédation (tuiles)
const FLEE_RANGE = 8; // détection de prédateur par l'herbivore
const HUNT_RANGE = 16; // détection de proie par le prédateur (chasse locale)
const FORAGE_RADIUS = 10; // rayon de pâture de l'herbivore (reste dans sa zone)
const GRAZE_AMOUNT = 0.03; // flore consommée par bouchée
const CAP: Record<Species, number> = { [HERBIVORE]: 500, [PREDATOR]: 90 };

/**
 * Habitats sauvages où vit la faune (cahier des charges — « les animaux dans
 * une zone précise, forêt ou jungle »). On y fait naître les bêtes, et leur
 * pâture les y maintient : le gibier ne se mêle plus aux villages.
 */
const WILD_BIOMES: readonly Biome[] = [
  Biome.TemperateForest,
  Biome.TropicalForest,
  Biome.Savanna,
  Biome.Taiga,
];

export interface FaunaSnapshot {
  count: number;
  x: Float32Array;
  y: Float32Array;
  species: Uint8Array;
}

export class FaunaSystem {
  private px: number[] = [];
  private py: number[] = [];
  private energy: number[] = [];
  private species: Species[] = [];
  private cooldown: number[] = [];
  private targetX: number[] = [];
  private targetY: number[] = [];
  private readonly rng: Rng;

  constructor(
    private readonly terrain: TerrainGrid,
    private readonly flora: FloraSystem,
    baseRng: Rng,
  ) {
    this.rng = baseRng.fork("fauna");
  }

  get count(): number {
    return this.px.length;
  }

  counts(): { herbivores: number; predators: number } {
    let h = 0;
    let p = 0;
    for (const s of this.species) (s === HERBIVORE ? h++ : p++);
    return { herbivores: h, predators: p };
  }

  spawn(species: Species, x: number, y: number, energy = 0.6): void {
    this.px.push(x);
    this.py.push(y);
    this.energy.push(energy);
    this.species.push(species);
    this.cooldown.push(this.rng.int(0, REPRO_COOLDOWN));
    this.targetX.push(x);
    this.targetY.push(y);
  }

  /** Une tuile est-elle un habitat sauvage (forêt, jungle, savane, taïga) ? */
  private isWildHabitat(x: number, y: number): boolean {
    if (this.terrain.isWater(x, y)) return false;
    return WILD_BIOMES.includes(this.terrain.biomeAt(x, y));
  }

  /**
   * Peuple le monde : les **herbivores naissent dans les habitats sauvages**
   * (forêts, jungles…), et les **prédateurs près des troupeaux** — la faune
   * forme ainsi des zones distinctes, à l'écart des futurs villages. Si le
   * monde manque de forêts, on se rabat sur toute terre un peu verte.
   */
  populate(herbivores: number, predators: number): void {
    const herds: number[] = [];
    let placed = 0;
    let guard = 0;
    while (placed < herbivores && guard++ < herbivores * 400) {
      const x = this.rng.int(0, this.terrain.width - 1);
      const y = this.rng.int(0, this.terrain.height - 1);
      // D'abord les vrais habitats ; après beaucoup d'essais, tout sol verdoyant.
      const lenient = guard > herbivores * 200;
      if (lenient) {
        if (this.terrain.isWater(x, y) || this.flora.densityAt(x, y) < BARE_THRESHOLD) continue;
      } else if (!this.isWildHabitat(x, y)) {
        continue;
      }
      this.spawn(HERBIVORE, x + 0.5, y + 0.5);
      herds.push(this.px.length - 1);
      placed++;
    }

    placed = 0;
    guard = 0;
    while (placed < predators && guard++ < predators * 200) {
      let x: number;
      let y: number;
      if (herds.length > 0) {
        const h = herds[this.rng.int(0, herds.length - 1)]!;
        const a = this.rng.float() * Math.PI * 2;
        const d = 2 + this.rng.float() * 6;
        x = Math.floor(this.px[h]! + Math.cos(a) * d);
        y = Math.floor(this.py[h]! + Math.sin(a) * d);
      } else {
        x = this.rng.int(0, this.terrain.width - 1);
        y = this.rng.int(0, this.terrain.height - 1);
      }
      if (!this.terrain.inBounds(x, y) || this.terrain.isWater(x, y)) continue;
      this.spawn(PREDATOR, x + 0.5, y + 0.5);
      placed++;
    }
  }

  /**
   * Fait apparaître un troupeau d'une espèce sur des tuiles de terre autour
   * d'un point (pouvoir « Appel des Bêtes », école Bestiaire). Respecte le
   * plafond de population de l'espèce. Retourne le nombre réellement apparu.
   */
  spawnHerd(cx: number, cy: number, radius: number, count: number, species: Species): number {
    let placed = 0;
    let guard = 0;
    const r = Math.max(1, radius);
    while (placed < count && guard++ < count * 60) {
      if (this.counts()[species === HERBIVORE ? "herbivores" : "predators"] >= CAP[species]) break;
      const a = this.rng.float() * Math.PI * 2;
      const d = this.rng.float() * r;
      const x = Math.floor(cx + Math.cos(a) * d);
      const y = Math.floor(cy + Math.sin(a) * d);
      if (!this.terrain.inBounds(x, y) || this.terrain.isWater(x, y)) continue;
      this.spawn(species, x + 0.5, y + 0.5, 0.7);
      placed++;
    }
    return placed;
  }

  /**
   * Décime la faune dans un rayon (pouvoir « Foudre »/catastrophes). Parcours
   * arrière pour une suppression par swap sûre. Retourne le nombre tué.
   */
  cull(cx: number, cy: number, radius: number): number {
    const r2 = Math.max(1, radius) ** 2;
    let killed = 0;
    for (let i = this.px.length - 1; i >= 0; i--) {
      const dx = this.px[i]! - cx;
      const dy = this.py[i]! - cy;
      if (dx * dx + dy * dy <= r2) {
        this.remove(i);
        killed++;
      }
    }
    return killed;
  }

  update(tick: number): void {
    // Parcours arrière : permet la suppression par swap sans sauter d'éléments.
    for (let i = this.px.length - 1; i >= 0; i--) {
      this.energy[i] = this.energy[i]! - ENERGY_DECAY[this.species[i]!];
      if (this.cooldown[i]! > 0) this.cooldown[i] = this.cooldown[i]! - 1;

      if (this.energy[i]! <= 0) {
        this.remove(i); // mort de faim
        continue;
      }
      if ((tick + i) % FAUNA_DECISION_INTERVAL === 0) this.decide(i);
      this.act(i);
    }
  }

  private decide(i: number): void {
    if (this.species[i] === HERBIVORE) {
      // Fuir un prédateur proche prime sur tout.
      const pred = this.nearest(PREDATOR, this.px[i]!, this.py[i]!, FLEE_RANGE, i);
      if (pred >= 0) {
        this.targetX[i] = this.px[i]! + (this.px[i]! - this.px[pred]!) * 2;
        this.targetY[i] = this.py[i]! + (this.py[i]! - this.py[pred]!) * 2;
        return;
      }
      // Sinon chercher de l'herbe.
      const spot = this.findFlora(this.px[i]!, this.py[i]!);
      this.targetX[i] = spot.x;
      this.targetY[i] = spot.y;
    } else {
      // Prédateur : viser l'herbivore le plus proche.
      const prey = this.nearest(HERBIVORE, this.px[i]!, this.py[i]!, HUNT_RANGE, i);
      if (prey >= 0) {
        this.targetX[i] = this.px[prey]!;
        this.targetY[i] = this.py[prey]!;
      } else {
        this.wander(i);
      }
    }
  }

  private act(i: number): void {
    const dx = this.targetX[i]! - this.px[i]!;
    const dy = this.targetY[i]! - this.py[i]!;
    const dist = Math.hypot(dx, dy);
    const speed = SPEED[this.species[i]!];

    if (dist > speed) {
      let nx = this.px[i]! + (dx / dist) * speed;
      let ny = this.py[i]! + (dy / dist) * speed;
      if (this.terrain.isWater(Math.floor(nx), Math.floor(ny))) {
        // Ne va pas dans l'eau : reste sur place et re-décidera.
        nx = this.px[i]!;
        ny = this.py[i]!;
      }
      this.px[i] = nx;
      this.py[i] = ny;
    }

    if (this.species[i] === HERBIVORE) this.grazeAndBreed(i);
    else this.huntAndBreed(i);
  }

  private grazeAndBreed(i: number): void {
    const tx = Math.floor(this.px[i]!);
    const ty = Math.floor(this.py[i]!);
    if (this.terrain.inBounds(tx, ty)) {
      const d = this.flora.densityAt(tx, ty);
      if (d > BARE_THRESHOLD) {
        const eaten = Math.min(GRAZE_AMOUNT, d);
        this.flora.setDensity(tx, ty, d - eaten);
        this.energy[i] = Math.min(1, this.energy[i]! + eaten * 6);
      }
    }
    this.tryBreed(i);
  }

  private huntAndBreed(i: number): void {
    // Ne teste la prédation que si la cible (proie visée) est à portée de gueule,
    // ce qui évite un balayage O(n) à chaque tick pour chaque prédateur.
    const dx = this.targetX[i]! - this.px[i]!;
    const dy = this.targetY[i]! - this.py[i]!;
    if (dx * dx + dy * dy <= EAT_RANGE * EAT_RANGE) {
      const prey = this.nearest(HERBIVORE, this.px[i]!, this.py[i]!, EAT_RANGE, i);
      if (prey >= 0) {
        this.energy[i] = Math.min(1, this.energy[i]! + 0.55);
        this.remove(prey); // proie dévorée
      }
    }
    this.tryBreed(i);
  }

  private tryBreed(i: number): void {
    const s = this.species[i]!;
    if (this.energy[i]! < REPRO_ENERGY || this.cooldown[i]! > 0) return;
    if (this.speciesCount(s) >= CAP[s]) return;
    this.energy[i] = this.energy[i]! - REPRO_COST;
    this.cooldown[i] = REPRO_COOLDOWN;
    const angle = this.rng.float() * Math.PI * 2;
    this.spawn(s, this.px[i]! + Math.cos(angle), this.py[i]! + Math.sin(angle), 0.5);
  }

  private speciesCount(s: Species): number {
    let n = 0;
    for (const sp of this.species) if (sp === s) n++;
    return n;
  }

  /** Index de l'individu d'espèce `s` le plus proche dans `radius`, ou -1. */
  private nearest(s: Species, x: number, y: number, radius: number, self: number): number {
    let best = -1;
    let bestD2 = radius * radius;
    for (let j = 0; j < this.px.length; j++) {
      if (j === self || this.species[j] !== s) continue;
      const d2 = (this.px[j]! - x) ** 2 + (this.py[j]! - y) ** 2;
      if (d2 < bestD2) {
        bestD2 = d2;
        best = j;
      }
    }
    return best;
  }

  private findFlora(cx: number, cy: number): { x: number; y: number } {
    let best = -1;
    let bx = cx;
    let by = cy;
    for (let s = 0; s < 10; s++) {
      const x = Math.floor(cx) + this.rng.int(-FORAGE_RADIUS, FORAGE_RADIUS);
      const y = Math.floor(cy) + this.rng.int(-FORAGE_RADIUS, FORAGE_RADIUS);
      if (!this.terrain.inBounds(x, y) || this.terrain.isWater(x, y)) continue;
      const d = this.flora.densityAt(x, y);
      if (d > best) {
        best = d;
        bx = x + 0.5;
        by = y + 0.5;
      }
    }
    return { x: bx, y: by };
  }

  private wander(i: number): void {
    const angle = this.rng.float() * Math.PI * 2;
    const dist = 3 + this.rng.float() * 8;
    this.targetX[i] = this.px[i]! + Math.cos(angle) * dist;
    this.targetY[i] = this.py[i]! + Math.sin(angle) * dist;
  }

  /** Suppression par swap (O(1)) : échange avec le dernier puis dépile. */
  private remove(i: number): void {
    const last = this.px.length - 1;
    if (i !== last) {
      this.px[i] = this.px[last]!;
      this.py[i] = this.py[last]!;
      this.energy[i] = this.energy[last]!;
      this.species[i] = this.species[last]!;
      this.cooldown[i] = this.cooldown[last]!;
      this.targetX[i] = this.targetX[last]!;
      this.targetY[i] = this.targetY[last]!;
    }
    this.px.pop();
    this.py.pop();
    this.energy.pop();
    this.species.pop();
    this.cooldown.pop();
    this.targetX.pop();
    this.targetY.pop();
  }

  snapshot(): FaunaSnapshot {
    const n = this.px.length;
    const x = new Float32Array(n);
    const y = new Float32Array(n);
    const species = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      x[i] = this.px[i]!;
      y[i] = this.py[i]!;
      species[i] = this.species[i]!;
    }
    return { count: n, x, y, species };
  }

  serialize(): { px: number[]; py: number[]; energy: number[]; species: number[]; cooldown: number[]; rngState: number } {
    return {
      px: [...this.px], py: [...this.py], energy: [...this.energy],
      species: [...this.species], cooldown: [...this.cooldown], rngState: this.rng.getState(),
    };
  }

  restore(data: ReturnType<FaunaSystem["serialize"]>): void {
    this.px = [...data.px];
    this.py = [...data.py];
    this.energy = [...data.energy];
    this.species = data.species.map((s) => (s === PREDATOR ? PREDATOR : HERBIVORE));
    this.cooldown = [...data.cooldown];
    this.targetX = [...data.px];
    this.targetY = [...data.py];
    this.rng.setState(data.rngState);
  }
}
