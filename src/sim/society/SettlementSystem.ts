import type { Rng } from "../../core/math/Rng";
import type { TerrainGrid } from "../terrain/TerrainGrid";
import { PROFESSION_CODES, type AgentSystem } from "../agents/AgentSystem";

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
  /**
   * Faction (dieu) qui règne sur ce village. 0 = le joueur (village-souche du
   * couple de la Genèse) ; ≥ 1 = un dieu-IA rival. Fixe l'allégeance initiale
   * des habitants du village.
   */
  faction: number;
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
/**
 * **Une maison par habitant** : chacun bâtit son propre foyer (il serait
 * illogique que tout un village partage une seule hutte). Au-delà du plafond de
 * maisons du village (terrain constructible limité), les habitants en surnombre
 * se partagent les maisons existantes — mais décalés (cf. `occupantOffset`),
 * jamais empilés au même point.
 */
const DWELLERS_PER_HUT = 1;
const MAX_HUTS_PER_VILLAGE = 64;
/** Décalage (tuiles) des co-occupants autour de leur maison, pour ne pas s'empiler. */
const OCCUPANT_OFFSET = 0.34;
/** Champs cultivés par village (posés en couronne au-delà des huttes). */
const FIELDS_PER_VILLAGE = 2;
/** Rayon de recherche (tuiles) d'une tuile constructible. */
const BUILD_SEARCH_RADIUS = 6;
/** Écart minimal (au carré) entre deux maisons — évite les huttes entassées. */
const MIN_HUT_SPACING2 = 1.6 * 1.6;
/** Rayon (tuiles) du premier anneau de maisons autour de la place. */
const RING0 = 2.2;
/** Écart radial entre deux anneaux de maisons concentriques. */
const RING_GAP = 1.9;
/** Longueur d'arc cible entre deux maisons d'un même anneau. */
const HUT_ARC = 1.9;

/**
 * Position géométrique de la n-ième maison : des **anneaux concentriques**
 * réguliers autour de la place du village, en quinconce d'un anneau à l'autre.
 * Fonction pure et déterministe (pas d'aléa) → un plan de village net.
 */
function ringSlot(slot: number): { radius: number; angle: number } {
  let idx = slot;
  for (let ring = 1; ring <= 24; ring++) {
    const radius = RING0 + (ring - 1) * RING_GAP;
    const cap = Math.max(3, Math.floor((2 * Math.PI * radius) / HUT_ARC));
    if (idx < cap) {
      const stagger = (ring % 2) * (Math.PI / cap); // décalage en quinconce
      return { radius, angle: (idx / cap) * Math.PI * 2 + stagger };
    }
    idx -= cap;
  }
  return { radius: RING0, angle: 0 };
}

/**
 * Décalage du j-ième occupant d'une maison : le premier est pile au foyer, les
 * suivants se répartissent en **rosace** (angle d'or) autour, sur un ou deux
 * anneaux serrés — de quoi loger quelques co-occupants sans jamais les empiler.
 * Déterministe (aucun aléa).
 */
function occupantOffset(j: number): { x: number; y: number } {
  if (j <= 0) return { x: 0, y: 0 };
  const angle = j * 2.399963; // angle d'or (rad) → points bien répartis
  const radius = OCCUPANT_OFFSET * (1 + Math.floor((j - 1) / 6) * 0.7);
  return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius };
}

/**
 * Ancres de travail d'un village : les lieux où l'on exerce chaque métier
 * (atelier/forge, place de marché, poste de garde, champ, cœur du village).
 */
interface WorkAnchors {
  forge: Dwelling; // forgeron, ouvrier, ingénieur (atelier)
  market: Dwelling; // marchand (place)
  guard: Dwelling; // guerrier, chasseur (lisière/poste de garde)
  field: Dwelling; // fermier (champ cultivé)
  center: Dwelling; // prêtre, érudit (cœur du village / temple)
}

/** Lieu de travail correspondant à un métier (code) dans un village donné. */
function workplaceFor(prof: number, a: WorkAnchors): Dwelling {
  switch (prof) {
    case PROFESSION_CODES.smith:
    case PROFESSION_CODES.worker:
    case PROFESSION_CODES.engineer:
      return a.forge;
    case PROFESSION_CODES.merchant:
      return a.market;
    case PROFESSION_CODES.warrior:
    case PROFESSION_CODES.hunter:
      return a.guard;
    case PROFESSION_CODES.farmer:
      return a.field;
    // prêtre, érudit et tout métier sans atelier dédié : le cœur du village.
    default:
      return a.center;
  }
}

export class SettlementSystem {
  private readonly _villages: Village[] = [];
  private readonly _dwellings: Dwelling[] = [];
  private readonly _fields: Field[] = [];

  constructor(
    private readonly terrain: TerrainGrid,
    // Le placement est désormais purement géométrique (anneaux) : plus besoin
    // d'aléa. Le paramètre reste pour la compatibilité des appelants/tests.
    _baseRng: Rng,
  ) {}

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
      // Faction = ordre de fondation. Le premier village fondé descend du seed
      // le plus proche du centre du monde — le foyer du couple de la Genèse —,
      // il revient donc au JOUEUR (faction 0) ; les suivants aux dieux-IA (≥ 1).
      seedToVillage[s] = this._villages.length;
      this._villages.push({ x: spot.x, y: spot.y, population: cnt[s]!, huts: 0, faction: this._villages.length });
    }
    if (this._villages.length === 0) return;

    // Huttes (en anneaux concentriques) puis champs autour de chaque centre.
    for (const village of this._villages) {
      this.raiseDwellings(village);
      this.sowFields(village);
    }

    // Chaque habitant emménage dans SA maison (la plus proche), les
    // co-occupants éventuels décalés autour d'elle.
    this.assignHomes(agents);
    // …puis rejoint son lieu de travail selon son métier (forge, champ, marché…).
    this.assignWorkplaces(agents);
    // …et prête allégeance au dieu de son village (le joueur pour le village-souche).
    this.assignAllegiances(agents);
  }

  /**
   * Loge chaque habitant dans **sa** maison : celle qui lui est la plus proche
   * (on vit dans la maison voisine de là où on s'est regroupé). Les éventuels
   * co-occupants d'une même maison sont **décalés en rosace** autour d'elle
   * (jamais empilés au même point). Si aucune maison n'existe encore, on se rabat
   * sur le centre du village le plus proche. Purement géométrique, déterministe.
   */
  private assignHomes(agents: AgentSystem): void {
    const snap = agents.snapshot();
    const n = snap.count;
    if (n === 0) return;
    const dwellings = this._dwellings;
    const occ = new Int32Array(dwellings.length); // nb d'occupants déjà logés par maison
    for (let i = 0; i < n; i++) {
      const ax = snap.x[i]!;
      const ay = snap.y[i]!;
      if (dwellings.length > 0) {
        let best = 0;
        let bestD = Infinity;
        for (let d = 0; d < dwellings.length; d++) {
          const dd = (dwellings[d]!.x - ax) ** 2 + (dwellings[d]!.y - ay) ** 2;
          if (dd < bestD) {
            bestD = dd;
            best = d;
          }
        }
        const home = dwellings[best]!;
        const j = occ[best]!++;
        const off = occupantOffset(j);
        agents.setHome(i, home.x + off.x, home.y + off.y);
      } else {
        // Aucune maison : rabattre sur le village le plus proche.
        let vx = ax;
        let vy = ay;
        let bestD = Infinity;
        for (const v of this._villages) {
          const dd = (v.x - ax) ** 2 + (v.y - ay) ** 2;
          if (dd < bestD) {
            bestD = dd;
            vx = v.x;
            vy = v.y;
          }
        }
        agents.setHome(i, vx, vy);
      }
    }
  }

  /**
   * Attribue à chaque habitant un **lieu de travail** cohérent avec son métier,
   * ancré dans son village : le forgeron/ouvrier/ingénieur à l'atelier, le
   * marchand au marché, le guerrier/chasseur au poste de garde (lisière), le
   * fermier à son champ, le prêtre/érudit au cœur du village. Le geste de métier
   * (rendu) se joue ainsi à un **vrai endroit**, pas au hasard près du foyer.
   * Purement géométrique et déterministe (anneaux fixes + champ le plus proche).
   * À appeler après `found`/`expand` et au chargement d'une partie.
   */
  assignWorkplaces(agents: AgentSystem): void {
    if (this._villages.length === 0) return;
    const snap = agents.snapshot();
    const n = snap.count;
    if (n === 0) return;

    // Ancres de métier par village (déterministes : angles/rayons fixes calés
    // sur une tuile constructible ; le champ = la parcelle la plus proche).
    const anchors: WorkAnchors[] = this._villages.map((v) => {
      const at = (angle: number, radius: number): Dwelling =>
        this.nearestBuildableTile(v.x + Math.cos(angle) * radius, v.y + Math.sin(angle) * radius) ?? {
          x: v.x,
          y: v.y,
        };
      let field: Dwelling = { x: v.x, y: v.y };
      let bestD = Infinity;
      for (const f of this._fields) {
        const d = (f.x - v.x) ** 2 + (f.y - v.y) ** 2;
        if (d < bestD) {
          bestD = d;
          field = f;
        }
      }
      if (bestD === Infinity) field = at(Math.PI / 2, RING0 + 3 * RING_GAP);
      return {
        forge: at(0.4, RING0 + RING_GAP),
        market: at(2.5, RING0),
        guard: at(4.5, RING0 + 2 * RING_GAP),
        field,
        center: { x: v.x, y: v.y },
      };
    });

    for (let i = 0; i < n; i++) {
      let bv = 0;
      let bestD = Infinity;
      for (let v = 0; v < this._villages.length; v++) {
        const d = (snap.x[i]! - this._villages[v]!.x) ** 2 + (snap.y[i]! - this._villages[v]!.y) ** 2;
        if (d < bestD) {
          bestD = d;
          bv = v;
        }
      }
      const spot = workplaceFor(snap.profession[i]!, anchors[bv]!);
      agents.setWork(i, spot.x, spot.y);
    }
  }

  /**
   * Rattache chaque habitant **non encore aligné** à la faction (dieu) de son
   * village le plus proche : le village-souche revient au joueur, les autres à
   * leurs dieux-IA. On ne récrit JAMAIS une allégeance déjà fixée — une
   * conversion (ou un héritage à la naissance) est ainsi préservée à travers les
   * refondations et l'expansion. À appeler après `found`/`expand` et au chargement.
   */
  assignAllegiances(agents: AgentSystem): void {
    if (this._villages.length === 0) return;
    const snap = agents.snapshot();
    for (let i = 0; i < snap.count; i++) {
      if (agents.allegianceOf(i) >= 0) continue; // déjà rallié (né/converti)
      let bv = 0;
      let bestD = Infinity;
      for (let v = 0; v < this._villages.length; v++) {
        const d = (snap.x[i]! - this._villages[v]!.x) ** 2 + (snap.y[i]! - this._villages[v]!.y) ** 2;
        if (d < bestD) {
          bestD = d;
          bv = v;
        }
      }
      agents.alignIfUnset(i, this._villages[bv]!.faction);
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
    let hutsAdded = false;
    for (let v = 0; v < this._villages.length; v++) {
      const village = this._villages[v]!;
      if (counts[v]! !== village.population) {
        village.population = counts[v]!;
        changed = true;
      }
      if (this.raiseDwellings(village) > 0) {
        hutsAdded = true;
        changed = true;
      }
    }
    // De nouvelles maisons ont poussé (le village s'étend) : on reloge tout le
    // monde pour que chacun occupe la maison la plus proche, sans entassement.
    if (hutsAdded) this.assignHomes(agents);
    // Réattribue les lieux de travail : couvre les nouveau-nés (sans travail
    // encore) et tout changement de métier survenu depuis la dernière passe.
    this.assignWorkplaces(agents);
    // Rattache les éventuels habitants encore non alignés (immigrants, chargements
    // anciens). Les nouveau-nés héritent déjà de la foi de leurs parents.
    this.assignAllegiances(agents);
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
    // Anneaux concentriques réguliers autour du centre (place de village) : les
    // maisons forment des cercles nets, pas un tas désordonné. Purement
    // géométrique et déterministe (aucun aléa).
    for (let slot = 0; village.huts < wanted && slot < wanted * 4 + 8; slot++) {
      const { radius, angle } = ringSlot(slot);
      const tx = village.x + Math.cos(angle) * radius;
      const ty = village.y + Math.sin(angle) * radius;
      const spot = this.nearestBuildableTile(tx, ty);
      if (!spot) continue;
      // Un emplacement déjà pris (par ce village ou un voisin) est ignoré :
      // ré-itérer les mêmes anneaux reste donc idempotent.
      if (this._dwellings.some((d) => (d.x - spot.x) ** 2 + (d.y - spot.y) ** 2 < MIN_HUT_SPACING2)) continue;
      this._dwellings.push(spot);
      village.huts++;
      placed++;
    }
    return placed;
  }

  /**
   * Sème les champs du village en **couronne régulière**, au-delà du cercle des
   * maisons : angles répartis uniformément (géométrique, sans aléa).
   */
  private sowFields(village: Village): void {
    const radius = RING0 + 3 * RING_GAP; // au-delà des anneaux de maisons
    let sown = 0;
    for (let f = 0; sown < FIELDS_PER_VILLAGE && f < FIELDS_PER_VILLAGE * 6; f++) {
      const angle = (f / FIELDS_PER_VILLAGE) * Math.PI * 2 + Math.PI / FIELDS_PER_VILLAGE;
      const spot = this.nearestBuildableTile(
        village.x + Math.cos(angle) * radius,
        village.y + Math.sin(angle) * radius,
      );
      if (!spot) continue;
      // Bien à l'écart des maisons et des autres champs.
      if (this._dwellings.some((d) => (d.x - spot.x) ** 2 + (d.y - spot.y) ** 2 < 4)) continue;
      if (this._fields.some((p) => (p.x - spot.x) ** 2 + (p.y - spot.y) ** 2 < 6)) continue;
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
    vx: number[]; vy: number[]; vpop: number[]; vhuts: number[]; vfaction: number[];
    dx: number[]; dy: number[]; fx: number[]; fy: number[];
  } {
    return {
      vx: this._villages.map((v) => v.x),
      vy: this._villages.map((v) => v.y),
      vpop: this._villages.map((v) => v.population),
      vhuts: this._villages.map((v) => v.huts),
      vfaction: this._villages.map((v) => v.faction),
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
        // Sauvegarde d'avant les factions : faction = ordre de fondation (0 = joueur).
        faction: data.vfaction?.[i] ?? i,
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
