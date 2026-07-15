import type { Rng } from "../../core/math/Rng";
import type { EventBus } from "../../core/events/EventBus";
import type { GameEvents } from "../events";
import { BARE_THRESHOLD, type FloraSystem } from "../ecology/FloraSystem";
import type { TerrainGrid } from "../terrain/TerrainGrid";

/**
 * Habitants (docs/GDD.md §4, cahier des charges §5 & §8) — première itération.
 *
 * Chaque habitant a des besoins (faim, repos, foi), une personnalité, une
 * mémoire courte et un objectif courant choisi par une IA utilitaire simple.
 * Le joueur ne les contrôle JAMAIS : il n'agit que sur le monde et, plus tard,
 * sur leurs pondérations (murmures). Les croyants génèrent de la Foi.
 *
 * Déterministe (stream RNG "agents"), cadencé chaque tick. Structure orientée
 * données (tableaux typés parallèles) pour tenir des milliers d'agents ;
 * l'IA n'est ré-évaluée que tous les DECISION_INTERVAL ticks par agent (LOD).
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

export interface AgentSnapshot {
  count: number;
  x: Float32Array;
  y: Float32Array;
  goal: Uint8Array;
}

const GOAL_CODES: Record<Goal, number> = { forage: 0, rest: 1, wander: 2, worship: 3 };

export class AgentSystem {
  // Stores SoA (structure de tableaux) — chauds, alignés par index d'agent.
  private readonly px: number[] = [];
  private readonly py: number[] = [];
  private readonly hunger: number[] = []; // 0 rassasié → 1 affamé
  private readonly fatigue: number[] = []; // 0 reposé → 1 épuisé
  private readonly fervour: number[] = []; // 0 → 3, ferveur envers le dieu
  private readonly piety: number[] = []; // trait de personnalité [0,1]
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

  constructor(
    private readonly terrain: TerrainGrid,
    private readonly flora: FloraSystem,
    baseRng: Rng,
    private readonly bus: EventBus<GameEvents>,
  ) {
    this.rng = baseRng.fork("agents");
  }

  get count(): number {
    return this.px.length;
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

  /** Foi produite ce tick par l'ensemble des croyants. */
  faithIncome(): number {
    let sum = 0;
    for (let i = 0; i < this.fervour.length; i++) sum += this.fervour[i]! * FAITH_PER_BELIEVER;
    return sum;
  }

  /**
   * Bénédiction sur une zone (école Grâces — « Corne d'Abondance », « Onction »)
   * : soulage la faim/fatigue et ravive la ferveur des habitants du disque.
   * Retourne le nombre d'habitants touchés.
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
      touched++;
    }
    return touched;
  }

  /**
   * Terreur divine (école Fléaux — « Ténèbres ») : la ferveur des habitants
   * du disque s'effondre — l'effroi éteint la louange, même si le récit du
   * fléau nourrira le culte de la Crainte. Retourne le nombre de frappés.
   */
  terrify(cx: number, cy: number, radius: number, fervourLoss: number): number {
    const r2 = Math.max(1, radius) ** 2;
    let struck = 0;
    for (let i = 0; i < this.px.length; i++) {
      const dx = this.px[i]! - cx;
      const dy = this.py[i]! - cy;
      if (dx * dx + dy * dy > r2) continue;
      this.fervour[i] = Math.max(0, this.fervour[i]! - fervourLoss);
      struck++;
    }
    return struck;
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

  /** Fait naître un habitant à (x, y) — son foyer initial. */
  spawn(x: number, y: number): void {
    this.px.push(x);
    this.py.push(y);
    this.hunger.push(this.rng.float() * 0.3);
    this.fatigue.push(this.rng.float() * 0.3);
    this.fervour.push(0.5 + this.rng.float());
    this.piety.push(this.rng.float());
    this.goal.push("wander");
    this.targetX.push(x);
    this.targetY.push(y);
    this.homeX.push(x);
    this.homeY.push(y);
    this.beckonX.push(x);
    this.beckonY.push(y);
    this.beckonTicks.push(0);
  }

  /** Peuple le monde de `n` habitants sur des tuiles de terre viables. */
  populate(n: number): void {
    let placed = 0;
    let guard = 0;
    while (placed < n && guard++ < n * 200) {
      const x = this.rng.int(0, this.terrain.width - 1);
      const y = this.rng.int(0, this.terrain.height - 1);
      if (this.terrain.isWater(x, y)) continue;
      this.spawn(x + 0.5, y + 0.5);
      placed++;
    }
  }

  update(tick: number): void {
    // Borne figée : les enfants nés ce tick ne sont mis à jour qu'au suivant.
    const n = this.px.length;
    for (let i = 0; i < n; i++) {
      // Besoins qui montent avec le temps.
      this.hunger[i] = Math.min(1, this.hunger[i]! + 0.0008);
      this.fatigue[i] = Math.min(1, this.fatigue[i]! + 0.0006);

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
        this.spawn(this.homeX[i]!, this.homeY[i]!);
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

  /** IA utilitaire : choisit l'objectif au besoin dominant. */
  private decide(i: number): void {
    const hunger = this.hunger[i]!;
    const fatigue = this.fatigue[i]!;
    const piety = this.piety[i]!;

    // Utilités concurrentes (émotions/besoins pondérés par la personnalité).
    const uForage = hunger * 1.2;
    const uRest = fatigue;
    const uWorship = piety * 0.6 * (this.fervour[i]! / 3);
    const uWander = 0.25;

    let best: Goal = "wander";
    let bestU = uWander;
    if (uForage > bestU) (best = "forage"), (bestU = uForage);
    if (uRest > bestU) (best = "rest"), (bestU = uRest);
    if (uWorship > bestU) (best = "worship"), (bestU = uWorship);

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
        // La prière renforce la ferveur (plafonnée).
        this.fervour[i] = Math.min(3, this.fervour[i]! + 0.05);
        break;
      case "wander":
        break;
    }
  }

  /** Snapshot compact pour le rendu (positions + objectif courant). */
  snapshot(): AgentSnapshot {
    const n = this.px.length;
    const x = new Float32Array(n);
    const y = new Float32Array(n);
    const goal = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      x[i] = this.px[i]!;
      y[i] = this.py[i]!;
      goal[i] = GOAL_CODES[this.goal[i]!];
    }
    return { count: n, x, y, goal };
  }

  serialize(): {
    px: number[]; py: number[]; hunger: number[]; fatigue: number[];
    fervour: number[]; piety: number[]; homeX: number[]; homeY: number[]; rngState: number;
  } {
    return {
      px: [...this.px], py: [...this.py], hunger: [...this.hunger], fatigue: [...this.fatigue],
      fervour: [...this.fervour], piety: [...this.piety], homeX: [...this.homeX],
      homeY: [...this.homeY], rngState: this.rng.getState(),
    };
  }

  restore(data: ReturnType<AgentSystem["serialize"]>): void {
    this.px.length = 0;
    for (let i = 0; i < data.px.length; i++) {
      this.px.push(data.px[i]!);
      this.py.push(data.py[i]!);
      this.hunger.push(data.hunger[i]!);
      this.fatigue.push(data.fatigue[i]!);
      this.fervour.push(data.fervour[i]!);
      this.piety.push(data.piety[i]!);
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
    void this.bus; // réservé (événements de naissance/mort à venir)
  }
}
