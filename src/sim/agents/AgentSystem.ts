import type { Rng } from "../../core/math/Rng";
import type { EventBus } from "../../core/events/EventBus";
import type { GameEvents } from "../events";
import { BARE_THRESHOLD, type FloraSystem } from "../ecology/FloraSystem";
import type { TerrainGrid } from "../terrain/TerrainGrid";

/**
 * Habitants (docs/GDD.md §4, cahier des charges §5 & §8) — IA vivante.
 *
 * Chaque habitant possède :
 *  - des **besoins** (faim, repos, foi) qui montent avec le temps ;
 *  - une **personnalité** à plusieurs traits (piété, courage, curiosité,
 *    sociabilité) qui pondère ses décisions ;
 *  - des **émotions** (joie, peur, colère, deuil) qui montent sur événement
 *    (bénédiction, fléau, naissance) et s'estompent, modulant le comportement ;
 *  - une **profession** cohérente avec l'ère (chasseur → forgeron → marchand →
 *    ingénieur…), réattribuée quand la civilisation change d'âge ;
 *  - une **famille** (conjoint, parents) ;
 *  - un **objectif** courant choisi par une IA utilitaire.
 *
 * Le joueur ne les contrôle JAMAIS : il n'agit que sur le monde (et, plus tard,
 * sur leurs pondérations via les murmures). Les croyants génèrent de la Foi.
 *
 * Déterministe. Le comportement « physique » (besoins, déplacement, naissances)
 * tire sur le flux "agents" ; la personnalité tire sur un flux séparé
 * "agents:personality" — ainsi enrichir l'IA ne perturbe pas la trajectoire
 * historique du monde. Structure orientée données (tableaux parallèles).
 */
export const AGENT_DECISION_INTERVAL = 20;
/** Durée (ticks) pendant laquelle « Appel du Lointain » guide un habitant. */
const BECKON_DURATION = 300;
/** Vitesse de déplacement, en tuiles/tick. */
const SPEED = 0.06;
/** Naissances : cadence de vérification par habitant, seuils et plafond. */
const BIRTH_CHECK_INTERVAL = 400;
const BIRTH_HUNGER_MAX = 0.35; // il faut être bien nourri…
const BIRTH_FATIGUE_MAX = 0.6; // …et pas épuisé
const BIRTH_CHANCE = 0.3;
export const MAX_POPULATION = 300;
/** Rayon de recherche (tuiles) pour nourriture/foyer. */
const SEARCH_RADIUS = 24;
/** Foi générée par croyant et par tick, avant modulateurs. */
const FAITH_PER_BELIEVER = 0.02;

export type Goal = "forage" | "rest" | "wander" | "worship";

/** Métiers, apparaissant au fil des âges (cohérence historique). */
export type Profession =
  | "hunter"
  | "farmer"
  | "smith"
  | "priest"
  | "merchant"
  | "warrior"
  | "scholar"
  | "worker"
  | "engineer";

export const PROFESSION_LABEL: Record<Profession, string> = {
  hunter: "Chasseur-cueilleur",
  farmer: "Fermier",
  smith: "Forgeron",
  priest: "Prêtre",
  merchant: "Marchand",
  warrior: "Guerrier",
  scholar: "Érudit",
  worker: "Ouvrier",
  engineer: "Ingénieur",
};

/** Métiers disponibles par ère (index = ère, cf. EraSystem). */
const ERA_PROFESSIONS: readonly Profession[][] = [
  ["hunter", "priest"], // Pierre
  ["farmer", "smith", "priest", "hunter"], // Bronze
  ["farmer", "smith", "priest", "merchant", "warrior"], // Fer
  ["farmer", "smith", "priest", "merchant", "warrior"], // Moyen Âge
  ["farmer", "smith", "priest", "merchant", "scholar"], // Renaissance
  ["worker", "smith", "merchant", "scholar", "farmer"], // Industrielle
  ["worker", "engineer", "merchant", "scholar"], // Moderne
  ["engineer", "scholar", "merchant"], // Futur
];

export type Emotion = "joy" | "fear" | "anger" | "grief";
export const EMOTION_LABEL: Record<Emotion, string> = {
  joy: "Joie",
  fear: "Peur",
  anger: "Colère",
  grief: "Deuil",
};

/** Fiche d'un habitant (inspection / tests). */
export interface AgentProfile {
  index: number;
  profession: string;
  traits: { piety: number; courage: number; curiosity: number; sociability: number };
  dominantEmotion: string;
  emotions: { joy: number; fear: number; anger: number; grief: number };
  spouse: number;
  parents: [number, number];
  children: number;
  goal: Goal;
}

export interface AgentSnapshot {
  count: number;
  x: Float32Array;
  y: Float32Array;
  goal: Uint8Array;
  profession: Uint8Array;
}

const GOAL_CODES: Record<Goal, number> = { forage: 0, rest: 1, wander: 2, worship: 3 };
const PROFESSION_CODES: Record<Profession, number> = {
  hunter: 0, farmer: 1, smith: 2, priest: 3, merchant: 4, warrior: 5, scholar: 6, worker: 7, engineer: 8,
};

export class AgentSystem {
  // Stores SoA (structure de tableaux) — chauds, alignés par index d'agent.
  private readonly px: number[] = [];
  private readonly py: number[] = [];
  private readonly hunger: number[] = []; // 0 rassasié → 1 affamé
  private readonly fatigue: number[] = []; // 0 reposé → 1 épuisé
  private readonly fervour: number[] = []; // 0 → 3, ferveur envers le dieu
  // Personnalité (traits [0,1]) — la piété reste sur le flux "agents"
  // (rétro-compatibilité) ; les autres traits sur le flux "agents:personality".
  private readonly piety: number[] = [];
  private readonly courage: number[] = [];
  private readonly curiosity: number[] = [];
  private readonly sociability: number[] = [];
  // Émotions [0,1] : montent sur événement, s'estompent chaque tick.
  private readonly joy: number[] = [];
  private readonly fear: number[] = [];
  private readonly anger: number[] = [];
  private readonly grief: number[] = [];
  private readonly profession: Profession[] = [];
  // Famille : index du conjoint et des deux parents (-1 = aucun).
  private readonly spouse: number[] = [];
  private readonly parentA: number[] = [];
  private readonly parentB: number[] = [];
  private readonly goal: Goal[] = [];
  private readonly targetX: number[] = [];
  private readonly targetY: number[] = [];
  private readonly homeX: number[] = [];
  private readonly homeY: number[] = [];
  // Influence « Appel du Lointain » : cible + décompte (transitoire, non sauvé).
  private readonly beckonX: number[] = [];
  private readonly beckonY: number[] = [];
  private readonly beckonTicks: number[] = [];
  private readonly rng: Rng;
  private readonly personaRng: Rng;
  /** Ère courante de la civilisation (pilote les professions). */
  private currentEra = 0;

  constructor(
    private readonly terrain: TerrainGrid,
    private readonly flora: FloraSystem,
    baseRng: Rng,
    private readonly bus: EventBus<GameEvents>,
  ) {
    this.rng = baseRng.fork("agents");
    this.personaRng = baseRng.fork("agents:personality");
    // Les métiers évoluent quand le peuple change d'âge.
    this.bus.on("era:advanced", ({ era }) => this.onEraChanged(era));
  }

  get count(): number {
    return this.px.length;
  }

  /** Ère courante utilisée pour attribuer les professions. */
  setEra(era: number): void {
    this.currentEra = Math.max(0, Math.min(ERA_PROFESSIONS.length - 1, era));
  }

  private onEraChanged(era: number): void {
    this.setEra(era);
    for (let i = 0; i < this.px.length; i++) this.profession[i] = this.professionFor(i);
  }

  /**
   * Réassigne le foyer d'un habitant (utilisé par `SettlementSystem` quand des
   * villages se fondent : l'objectif "rest" y ramène alors les habitants, qui
   * se regroupent peu à peu autour de leur village).
   */
  setHome(i: number, x: number, y: number): void {
    this.homeX[i] = x;
    this.homeY[i] = y;
  }

  /** Marie deux habitants (lien réciproque). */
  marry(a: number, b: number): void {
    if (a === b || a < 0 || b < 0 || a >= this.px.length || b >= this.px.length) return;
    this.spouse[a] = b;
    this.spouse[b] = a;
  }

  /** Foi produite ce tick par l'ensemble des croyants. */
  faithIncome(): number {
    let sum = 0;
    for (let i = 0; i < this.fervour.length; i++) sum += this.fervour[i]! * FAITH_PER_BELIEVER;
    return sum;
  }

  /**
   * Bénédiction sur une zone (école Grâces — « Corne d'Abondance », « Onction »)
   * : soulage la faim/fatigue, ravive la ferveur et emplit de joie les habitants
   * du disque (la peur reflue). Retourne le nombre d'habitants touchés.
   */
  bless(cx: number, cy: number, radius: number, hungerRelief: number, fervourGain: number): number {
    const r2 = Math.max(1, radius) ** 2;
    let touched = 0;
    for (let i = 0; i < this.px.length; i++) {
      const dx = this.px[i]! - cx;
      const dy = this.py[i]! - cy;
      if (dx * dx + dy * dy > r2) continue;
      this.hunger[i] = Math.max(0, this.hunger[i]! - hungerRelief);
      this.fatigue[i] = Math.max(0, this.fatigue[i]! - hungerRelief * 0.5);
      this.fervour[i] = Math.min(3, this.fervour[i]! + fervourGain);
      this.joy[i] = Math.min(1, this.joy[i]! + 0.35);
      this.fear[i] = this.fear[i]! * 0.5;
      touched++;
    }
    return touched;
  }

  /**
   * Terreur divine (école Fléaux — « Ténèbres ») : la ferveur des habitants du
   * disque s'effondre — l'effroi éteint la louange —, la peur et la colère
   * enflent (le récit du fléau nourrira le culte de la Crainte). Retourne le
   * nombre de frappés.
   */
  terrify(cx: number, cy: number, radius: number, fervourLoss: number): number {
    const r2 = Math.max(1, radius) ** 2;
    let struck = 0;
    for (let i = 0; i < this.px.length; i++) {
      const dx = this.px[i]! - cx;
      const dy = this.py[i]! - cy;
      if (dx * dx + dy * dy > r2) continue;
      this.fervour[i] = Math.max(0, this.fervour[i]! - fervourLoss);
      this.fear[i] = Math.min(1, this.fear[i]! + 0.5);
      this.anger[i] = Math.min(1, this.anger[i]! + 0.3);
      this.joy[i] = this.joy[i]! * 0.4;
      struck++;
    }
    return struck;
  }

  /**
   * Force militaire d'un secteur (guerres) : les guerriers pèsent lourd, la
   * foule un peu ; le courage de chacun compte. Somme sur le disque.
   */
  strengthNear(cx: number, cy: number, radius: number): number {
    const r2 = Math.max(1, radius) ** 2;
    let s = 0;
    for (let i = 0; i < this.px.length; i++) {
      const dx = this.px[i]! - cx;
      const dy = this.py[i]! - cy;
      if (dx * dx + dy * dy > r2) continue;
      const w = this.profession[i] === "warrior" ? 1.6 : 0.25;
      s += w * (0.5 + this.courage[i]!);
    }
    return s;
  }

  /** Nombre d'habitants dans un rayon (recensement d'un village). */
  countNear(cx: number, cy: number, radius: number): number {
    const r2 = Math.max(1, radius) ** 2;
    let c = 0;
    for (let i = 0; i < this.px.length; i++) {
      const dx = this.px[i]! - cx;
      const dy = this.py[i]! - cy;
      if (dx * dx + dy * dy <= r2) c++;
    }
    return c;
  }

  /** Deuil : la perte des siens endeuille et effraie les survivants du secteur. */
  mourn(cx: number, cy: number, radius: number, amount: number): void {
    const r2 = Math.max(1, radius) ** 2;
    for (let i = 0; i < this.px.length; i++) {
      const dx = this.px[i]! - cx;
      const dy = this.py[i]! - cy;
      if (dx * dx + dy * dy > r2) continue;
      this.grief[i] = Math.min(1, this.grief[i]! + amount);
      this.fear[i] = Math.min(1, this.fear[i]! + amount * 0.5);
      this.joy[i] = this.joy[i]! * 0.5;
    }
  }

  /**
   * Retire (morts au combat) les `count` habitants les plus proches d'un point,
   * en recollant les liens de famille (indices ré-adressés). Garde toujours au
   * moins une âme au monde. Retourne le nombre réellement retiré.
   */
  cullNear(cx: number, cy: number, count: number): number {
    const n = this.px.length;
    if (count <= 0 || n <= 1) return 0;
    const order = [...Array(n).keys()].sort((a, b) => {
      const da = (this.px[a]! - cx) ** 2 + (this.py[a]! - cy) ** 2;
      const db = (this.px[b]! - cx) ** 2 + (this.py[b]! - cy) ** 2;
      return da - db;
    });
    const victims = new Set(order.slice(0, Math.min(count, n - 1)));
    this.compact((i) => !victims.has(i));
    return victims.size;
  }

  /** Compacte tous les tableaux en ne gardant que `keep(i)` ; ré-adresse la famille. */
  private compact(keep: (i: number) => boolean): void {
    const n = this.px.length;
    const remap = new Int32Array(n);
    let w = 0;
    for (let i = 0; i < n; i++) remap[i] = keep(i) ? w++ : -1;
    if (w === n) return;
    const numeric = [
      this.px, this.py, this.hunger, this.fatigue, this.fervour, this.piety, this.courage,
      this.curiosity, this.sociability, this.joy, this.fear, this.anger, this.grief,
      this.spouse, this.parentA, this.parentB, this.targetX, this.targetY, this.homeX,
      this.homeY, this.beckonX, this.beckonY, this.beckonTicks,
    ];
    for (const a of numeric) {
      let k = 0;
      for (let i = 0; i < n; i++) if (remap[i]! >= 0) a[k++] = a[i]!;
      a.length = w;
    }
    let k = 0;
    for (let i = 0; i < n; i++) if (remap[i]! >= 0) this.profession[k++] = this.profession[i]!;
    this.profession.length = w;
    k = 0;
    for (let i = 0; i < n; i++) if (remap[i]! >= 0) this.goal[k++] = this.goal[i]!;
    this.goal.length = w;
    // Ré-adresse les liens de famille (index déplacés ; cible morte → aucun).
    for (let i = 0; i < w; i++) {
      this.spouse[i] = this.spouse[i]! >= 0 ? remap[this.spouse[i]!]! : -1;
      this.parentA[i] = this.parentA[i]! >= 0 ? remap[this.parentA[i]!]! : -1;
      this.parentB[i] = this.parentB[i]! >= 0 ? remap[this.parentB[i]!]! : -1;
    }
  }

  /**
   * Appelle les habitants d'un rayon vers un point (école Murmures — « Appel
   * du Lointain ») : fixe leur cible de déplacement sur la destination. Ils
   * s'y rendent, puis reprennent leur vie. Retourne le nombre d'appelés.
   */
  beckon(cx: number, cy: number, radius: number): number {
    const r2 = Math.max(1, radius) ** 2;
    let called = 0;
    for (let i = 0; i < this.px.length; i++) {
      const dx = this.px[i]! - cx;
      const dy = this.py[i]! - cy;
      if (dx * dx + dy * dy > r2) continue;
      this.beckonX[i] = cx;
      this.beckonY[i] = cy;
      this.beckonTicks[i] = BECKON_DURATION;
      this.goal[i] = "wander";
      this.targetX[i] = cx;
      this.targetY[i] = cy;
      called++;
    }
    return called;
  }

  /** Fait naître un habitant à (x, y) — son foyer initial. Retourne son index. */
  spawn(x: number, y: number): number {
    const i = this.px.length;
    this.px.push(x);
    this.py.push(y);
    this.hunger.push(this.rng.float() * 0.3);
    this.fatigue.push(this.rng.float() * 0.3);
    this.fervour.push(0.5 + this.rng.float());
    this.piety.push(this.rng.float());
    // Traits de personnalité : flux dédié (n'altère pas la trajectoire du monde).
    this.courage.push(this.personaRng.float());
    this.curiosity.push(this.personaRng.float());
    this.sociability.push(this.personaRng.float());
    this.joy.push(0);
    this.fear.push(0);
    this.anger.push(0);
    this.grief.push(0);
    this.spouse.push(-1);
    this.parentA.push(-1);
    this.parentB.push(-1);
    this.profession.push("hunter"); // provisoire, fixé juste après
    this.profession[i] = this.professionFor(i);
    this.goal.push("wander");
    this.targetX.push(x);
    this.targetY.push(y);
    this.homeX.push(x);
    this.homeY.push(y);
    this.beckonX.push(x);
    this.beckonY.push(y);
    this.beckonTicks.push(0);
    return i;
  }

  /** Peuple le monde de `n` habitants sur des tuiles de terre, mariés par couples. */
  populate(n: number): void {
    const placed: number[] = [];
    let guard = 0;
    while (placed.length < n && guard++ < n * 200) {
      const x = this.rng.int(0, this.terrain.width - 1);
      const y = this.rng.int(0, this.terrain.height - 1);
      if (this.terrain.isWater(x, y)) continue;
      placed.push(this.spawn(x + 0.5, y + 0.5));
    }
    // Couples : marie les habitants deux par deux (foyers du peuplement initial).
    for (let k = 0; k + 1 < placed.length; k += 2) this.marry(placed[k]!, placed[k + 1]!);
  }

  /**
   * Choisit la profession la mieux accordée aux traits de l'habitant parmi
   * celles disponibles à l'ère courante (fonction pure des traits — pas de
   * tirage aléatoire, donc déterministe et stable).
   */
  private professionFor(i: number): Profession {
    const options = ERA_PROFESSIONS[this.currentEra] ?? ERA_PROFESSIONS[0]!;
    let best = options[0]!;
    let bestScore = -Infinity;
    for (const p of options) {
      const s = this.professionScore(p, i);
      if (s > bestScore) {
        bestScore = s;
        best = p;
      }
    }
    return best;
  }

  private professionScore(p: Profession, i: number): number {
    const courage = this.courage[i]!;
    const curiosity = this.curiosity[i]!;
    const sociability = this.sociability[i]!;
    const piety = this.piety[i]!;
    switch (p) {
      case "hunter":
        return 0.35 + courage;
      case "farmer":
        return 0.5 + (1 - courage) * 0.2;
      case "smith":
        return 0.4 + courage * 0.25;
      case "priest":
        return piety * 1.25;
      case "merchant":
        return sociability * 1.1;
      case "warrior":
        return courage * 1.15;
      case "scholar":
        return curiosity * 1.2;
      case "worker":
        return 0.5 + (1 - curiosity) * 0.15;
      case "engineer":
        return curiosity * 1.15;
    }
  }

  update(tick: number): void {
    // Borne figée : les enfants nés ce tick ne sont mis à jour qu'au suivant.
    const n = this.px.length;
    for (let i = 0; i < n; i++) {
      // Besoins qui montent avec le temps.
      this.hunger[i] = Math.min(1, this.hunger[i]! + 0.0008);
      this.fatigue[i] = Math.min(1, this.fatigue[i]! + 0.0006);
      this.decayEmotions(i);

      // Naissance : un habitant prospère (nourri, reposé) fonde une famille.
      // L'enfant naît au foyer (le village) — la population croît avec la
      // prospérité, que les Grâces divines peuvent entretenir (GDD §2).
      if (
        (tick + i * 37) % BIRTH_CHECK_INTERVAL === 0 &&
        this.px.length < MAX_POPULATION &&
        this.hunger[i]! < BIRTH_HUNGER_MAX &&
        this.fatigue[i]! < BIRTH_FATIGUE_MAX &&
        this.rng.float() < BIRTH_CHANCE
      ) {
        const child = this.spawn(this.homeX[i]!, this.homeY[i]!);
        this.parentA[child] = i;
        this.parentB[child] = this.spouse[i]!;
        this.joy[i] = Math.min(1, this.joy[i]! + 0.5); // la naissance réjouit
      }

      // Sous l'effet de l'Appel du Lointain : la cible reste le point d'appel,
      // l'IA normale est suspendue jusqu'à l'expiration du décompte.
      if (this.beckonTicks[i]! > 0) {
        this.beckonTicks[i]!--;
        this.goal[i] = "wander";
        this.targetX[i] = this.beckonX[i]!;
        this.targetY[i] = this.beckonY[i]!;
        this.act(i);
        continue;
      }

      // Décision (LOD : décalée par agent pour lisser le coût).
      if ((tick + i) % AGENT_DECISION_INTERVAL === 0) {
        this.decide(i);
      }
      this.act(i);
    }
  }

  /** Les émotions s'estompent chaque tick ; une faim extrême nourrit l'angoisse. */
  private decayEmotions(i: number): void {
    this.joy[i] = this.joy[i]! * 0.995;
    this.fear[i] = this.fear[i]! * 0.99;
    this.anger[i] = this.anger[i]! * 0.99;
    this.grief[i] = this.grief[i]! * 0.997;
    if (this.hunger[i]! > 0.85) this.fear[i] = Math.min(1, this.fear[i]! + 0.003);
  }

  /** IA utilitaire : choisit l'objectif au besoin dominant, teinté d'émotion. */
  private decide(i: number): void {
    const hunger = this.hunger[i]!;
    const fatigue = this.fatigue[i]!;
    const piety = this.piety[i]!;
    const fear = this.fear[i]!;
    const joy = this.joy[i]!;
    const grief = this.grief[i]!;

    // Utilités concurrentes (besoins pondérés par la personnalité et l'émotion).
    const uForage = hunger * 1.2;
    const uRest = fatigue + fear * 0.8; // la peur pousse à se replier au foyer
    const uWorship = Math.max(0, piety * 0.6 * (this.fervour[i]! / 3) + joy * 0.2 - fear * 0.3);
    const uWander = 0.25 + joy * 0.3 + this.sociability[i]! * 0.1;

    // Le deuil rend apathique : toutes les envies s'émoussent.
    const damp = 1 - grief * 0.4;

    let best: Goal = "wander";
    let bestU = uWander * damp;
    if (uForage * damp > bestU) (best = "forage"), (bestU = uForage * damp);
    if (uRest * damp > bestU) (best = "rest"), (bestU = uRest * damp);
    if (uWorship * damp > bestU) (best = "worship"), (bestU = uWorship * damp);

    if (best !== this.goal[i]) this.goal[i] = best;
    this.pickTarget(i, best);
  }

  /** Choisit une cible cohérente avec l'objectif. */
  private pickTarget(i: number, goal: Goal): void {
    switch (goal) {
      case "forage": {
        const spot = this.findFood(this.px[i]!, this.py[i]!);
        this.targetX[i] = spot.x;
        this.targetY[i] = spot.y;
        break;
      }
      case "rest":
        this.targetX[i] = this.homeX[i]!;
        this.targetY[i] = this.homeY[i]!;
        break;
      case "worship":
      case "wander": {
        const angle = this.rng.float() * Math.PI * 2;
        const dist = 2 + this.rng.float() * 6;
        this.targetX[i] = this.px[i]! + Math.cos(angle) * dist;
        this.targetY[i] = this.py[i]! + Math.sin(angle) * dist;
        break;
      }
    }
  }

  /** Cherche la tuile la plus verte à portée (nourriture = flore). */
  private findFood(cx: number, cy: number): { x: number; y: number } {
    let best = -1;
    let bx = cx;
    let by = cy;
    for (let s = 0; s < 12; s++) {
      const x = Math.floor(cx) + this.rng.int(-SEARCH_RADIUS, SEARCH_RADIUS);
      const y = Math.floor(cy) + this.rng.int(-SEARCH_RADIUS, SEARCH_RADIUS);
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

  /** Applique le déplacement et les effets d'arrivée. */
  private act(i: number): void {
    const dx = this.targetX[i]! - this.px[i]!;
    const dy = this.targetY[i]! - this.py[i]!;
    const dist = Math.hypot(dx, dy);

    if (dist > SPEED) {
      this.px[i] = this.px[i]! + (dx / dist) * SPEED;
      this.py[i] = this.py[i]! + (dy / dist) * SPEED;
      return;
    }
    // Arrivé : résout l'objectif.
    switch (this.goal[i]) {
      case "forage": {
        const tx = Math.floor(this.px[i]!);
        const ty = Math.floor(this.py[i]!);
        if (this.terrain.inBounds(tx, ty) && this.flora.densityAt(tx, ty) > BARE_THRESHOLD) {
          this.hunger[i] = Math.max(0, this.hunger[i]! - 0.5);
        }
        break;
      }
      case "rest":
        this.fatigue[i] = Math.max(0, this.fatigue[i]! - 0.5);
        break;
      case "worship":
        // La prière renforce la ferveur (plafonnée) et apaise (petite joie).
        this.fervour[i] = Math.min(3, this.fervour[i]! + 0.05);
        this.joy[i] = Math.min(1, this.joy[i]! + 0.02);
        break;
      case "wander":
        break;
    }
  }

  /** Émotion dominante d'un habitant (ou "calm" si serein). */
  private dominantEmotion(i: number): Emotion | "calm" {
    const es: [Emotion, number][] = [
      ["joy", this.joy[i]!],
      ["fear", this.fear[i]!],
      ["anger", this.anger[i]!],
      ["grief", this.grief[i]!],
    ];
    let best: Emotion | "calm" = "calm";
    let bestV = 0.15; // seuil de sérénité
    for (const [e, v] of es) if (v > bestV) (best = e), (bestV = v);
    return best;
  }

  /** Fiche complète d'un habitant (inspection dans l'UI, tests). */
  profile(i: number): AgentProfile {
    let children = 0;
    for (let k = 0; k < this.px.length; k++) {
      if (this.parentA[k] === i || this.parentB[k] === i) children++;
    }
    const dom = this.dominantEmotion(i);
    return {
      index: i,
      profession: PROFESSION_LABEL[this.profession[i]!],
      traits: {
        piety: this.piety[i]!,
        courage: this.courage[i]!,
        curiosity: this.curiosity[i]!,
        sociability: this.sociability[i]!,
      },
      dominantEmotion: dom === "calm" ? "Serein" : EMOTION_LABEL[dom],
      emotions: { joy: this.joy[i]!, fear: this.fear[i]!, anger: this.anger[i]!, grief: this.grief[i]! },
      spouse: this.spouse[i]!,
      parents: [this.parentA[i]!, this.parentB[i]!],
      children,
      goal: this.goal[i]!,
    };
  }

  /** Snapshot compact pour le rendu (positions, objectif et métier courants). */
  snapshot(): AgentSnapshot {
    const n = this.px.length;
    const x = new Float32Array(n);
    const y = new Float32Array(n);
    const goal = new Uint8Array(n);
    const profession = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      x[i] = this.px[i]!;
      y[i] = this.py[i]!;
      goal[i] = GOAL_CODES[this.goal[i]!];
      profession[i] = PROFESSION_CODES[this.profession[i]!];
    }
    return { count: n, x, y, goal, profession };
  }

  serialize(): {
    px: number[]; py: number[]; hunger: number[]; fatigue: number[]; fervour: number[];
    piety: number[]; courage: number[]; curiosity: number[]; sociability: number[];
    joy: number[]; fear: number[]; anger: number[]; grief: number[];
    profession: number[]; spouse: number[]; parentA: number[]; parentB: number[];
    homeX: number[]; homeY: number[]; rngState: number; personaRngState: number; era: number;
  } {
    return {
      px: [...this.px], py: [...this.py], hunger: [...this.hunger], fatigue: [...this.fatigue],
      fervour: [...this.fervour], piety: [...this.piety], courage: [...this.courage],
      curiosity: [...this.curiosity], sociability: [...this.sociability],
      joy: [...this.joy], fear: [...this.fear], anger: [...this.anger], grief: [...this.grief],
      profession: this.profession.map((p) => PROFESSION_CODES[p]),
      spouse: [...this.spouse], parentA: [...this.parentA], parentB: [...this.parentB],
      homeX: [...this.homeX], homeY: [...this.homeY],
      rngState: this.rng.getState(), personaRngState: this.personaRng.getState(), era: this.currentEra,
    };
  }

  restore(data: ReturnType<AgentSystem["serialize"]>): void {
    this.clearAll();
    const professionNames = Object.keys(PROFESSION_CODES) as Profession[];
    for (let i = 0; i < data.px.length; i++) {
      this.px.push(data.px[i]!);
      this.py.push(data.py[i]!);
      this.hunger.push(data.hunger[i]!);
      this.fatigue.push(data.fatigue[i]!);
      this.fervour.push(data.fervour[i]!);
      this.piety.push(data.piety[i]!);
      // Rétro-compatibilité : les sauvegardes d'avant l'IA vivante n'ont pas ces
      // champs — on comble avec des valeurs neutres et déterministes.
      this.courage.push(data.courage?.[i] ?? 0.5);
      this.curiosity.push(data.curiosity?.[i] ?? 0.5);
      this.sociability.push(data.sociability?.[i] ?? 0.5);
      this.joy.push(data.joy?.[i] ?? 0);
      this.fear.push(data.fear?.[i] ?? 0);
      this.anger.push(data.anger?.[i] ?? 0);
      this.grief.push(data.grief?.[i] ?? 0);
      this.profession.push(professionNames[data.profession?.[i] ?? 0] ?? "hunter");
      this.spouse.push(data.spouse?.[i] ?? -1);
      this.parentA.push(data.parentA?.[i] ?? -1);
      this.parentB.push(data.parentB?.[i] ?? -1);
      this.goal.push("wander");
      this.targetX.push(data.px[i]!);
      this.targetY.push(data.py[i]!);
      this.homeX.push(data.homeX[i]!);
      this.homeY.push(data.homeY[i]!);
      this.beckonX.push(data.px[i]!);
      this.beckonY.push(data.py[i]!);
      this.beckonTicks.push(0);
    }
    this.rng.setState(data.rngState);
    if (data.personaRngState !== undefined) this.personaRng.setState(data.personaRngState);
    if (data.era !== undefined) this.setEra(data.era);
  }

  private clearAll(): void {
    const arrays = [
      this.px, this.py, this.hunger, this.fatigue, this.fervour, this.piety, this.courage,
      this.curiosity, this.sociability, this.joy, this.fear, this.anger, this.grief,
      this.spouse, this.parentA, this.parentB, this.targetX, this.targetY, this.homeX,
      this.homeY, this.beckonX, this.beckonY, this.beckonTicks,
    ];
    for (const a of arrays) a.length = 0;
    this.profession.length = 0;
    this.goal.length = 0;
  }
}
