import type { EventBus } from "../../core/events/EventBus";
import type { AgentSystem } from "../agents/AgentSystem";
import type { GameEvents } from "../events";
import type { PowerId } from "../powers/Power";
import type { SettlementSystem } from "../society/SettlementSystem";

/**
 * Religions dynamiques, première itération (docs/GDD.md §6, cahier des
 * charges §6, docs/ROADMAP.md phase 6).
 *
 * Le peuple ne voit JAMAIS la divinité : il **interprète** ses miracles.
 * Chaque pouvoir invoqué a des témoins (les habitants proches) ; le miracle
 * est vécu selon sa nature — bienfait (Grâces, pluie…), courroux (foudre,
 * volcan…) ou prodige (le relief qui bouge) — et raconté au village, où il
 * devient **mémoire collective** (lore, avec oubli lent : les récits
 * s'estompent s'ils ne sont pas renouvelés).
 *
 * De cette mémoire émerge une **doctrine** par village (la composante
 * dominante) : culte de la Providence, de la Crainte ou des Prodiges. Assez
 * de récits → un **prêtre** s'élève et prêche (la ferveur du village se
 * ravive périodiquement) ; la dévotion continue → le village érige un
 * **temple**, qui rayonne une Foi passive. Le joueur récolte ce qu'il sème :
 * le STYLE de son règne façonne les cultes.
 *
 * Déterministe, piloté par événements + une passe périodique (interval).
 */
export const RELIGION_INTERVAL = 50;
/** Rayon de perception d'un miracle au-delà de son rayon d'effet. */
const WITNESS_EXTRA_RADIUS = 12;
/** Récits nécessaires pour qu'un prêtre s'élève, puis pour un temple. */
export const PRIEST_LORE = 5;
export const TEMPLE_LORE = 12;
/** Oubli : fraction de la mémoire conservée à chaque passe. */
const LORE_DECAY = 0.996;
/** Prêche du prêtre : rayon et ferveur ravivée par passe. */
const PREACH_RADIUS = 10;
const PREACH_FERVOUR = 0.05;
/** Foi passive rayonnée par un temple, par passe. */
const TEMPLE_FAITH = 2.2;

/** Nature d'un miracle aux yeux des mortels. */
export type MiracleNature = "bienfait" | "courroux" | "prodige";

/** Interprétation de chaque pouvoir (les écoles parlent d'elles-mêmes). */
const POWER_NATURE: Record<PowerId, MiracleNature> = {
  growth: "bienfait",
  rain: "bienfait",
  abundance: "bienfait",
  benediction: "bienfait",
  spawnHerd: "bienfait",
  beckon: "prodige",
  terraform: "prodige",
  flatten: "prodige",
  orogenesis: "prodige",
  basin: "prodige",
  drought: "courroux",
  lightning: "courroux",
  earthquake: "courroux",
  volcano: "courroux",
};

/** Ferveur gagnée par témoin selon la nature (la peur aussi fait croire). */
const WITNESS_FERVOUR: Record<MiracleNature, number> = {
  bienfait: 0.5,
  courroux: 0.35,
  prodige: 0.25,
};

export type Doctrine = "Providence" | "Crainte" | "Prodiges";

/** Culte d'un village : mémoire pondérée des miracles + institutions. */
export interface VillageCult {
  bienfait: number;
  courroux: number;
  prodige: number;
  priest: boolean;
  temple: boolean;
}

function emptyCult(): VillageCult {
  return { bienfait: 0, courroux: 0, prodige: 0, priest: false, temple: false };
}

export class ReligionSystem {
  private readonly cults: VillageCult[] = [];

  constructor(
    private readonly settlements: SettlementSystem,
    private readonly agents: AgentSystem,
    private readonly bus: EventBus<GameEvents>,
  ) {
    bus.on("power:invoked", ({ power, x, y, radius }) => this.witness(power, x, y, radius));
  }

  /** Cultes par village (aligné sur `settlements.villages`). */
  get villageCults(): readonly VillageCult[] {
    this.syncLength();
    return this.cults;
  }

  /** Mémoire totale d'un village (tous récits confondus). */
  loreOf(village: number): number {
    this.syncLength();
    const c = this.cults[village];
    return c ? c.bienfait + c.courroux + c.prodige : 0;
  }

  /** Doctrine émergente : la composante dominante de la mémoire. */
  doctrineOf(village: number): Doctrine {
    this.syncLength();
    const c = this.cults[village] ?? emptyCult();
    if (c.courroux > c.bienfait && c.courroux > c.prodige) return "Crainte";
    if (c.prodige > c.bienfait && c.prodige > c.courroux) return "Prodiges";
    return "Providence";
  }

  /**
   * Un miracle vient d'être accompli : les habitants proches en sont témoins
   * (leur ferveur bouge selon la nature du prodige) et le récit rejoint la
   * mémoire du village le plus proche — pondéré par le nombre de témoins :
   * un miracle sans témoin ne devient jamais un récit.
   */
  private witness(power: PowerId, x: number, y: number, radius: number): void {
    const nature = POWER_NATURE[power];
    const witnesses = this.agents.bless(x, y, radius + WITNESS_EXTRA_RADIUS, 0, WITNESS_FERVOUR[nature]);
    if (witnesses === 0) return;

    const v = this.nearestVillage(x, y);
    if (v < 0) return;
    this.syncLength();
    const cult = this.cults[v]!;
    // Plus de témoins → récit plus fort (borné : un village entier suffit).
    cult[nature] += 0.5 + Math.min(1.5, witnesses * 0.1);
    this.checkInstitutions(v);
  }

  /** Passe périodique : les récits s'estompent, les prêtres prêchent, les temples rayonnent. */
  update(): number {
    this.syncLength();
    let templeFaith = 0;
    const villages = this.settlements.villages;
    for (let v = 0; v < this.cults.length; v++) {
      const cult = this.cults[v]!;
      cult.bienfait *= LORE_DECAY;
      cult.courroux *= LORE_DECAY;
      cult.prodige *= LORE_DECAY;

      const village = villages[v];
      if (!village) continue;
      if (cult.priest) {
        // Le prêtre entretient la flamme : la ferveur du village se ravive.
        this.agents.bless(village.x, village.y, PREACH_RADIUS, 0, PREACH_FERVOUR);
      }
      if (cult.temple) templeFaith += TEMPLE_FAITH;
    }
    return templeFaith;
  }

  /** Assez de récits → prêtre ; la dévotion continue → temple. */
  private checkInstitutions(v: number): void {
    const cult = this.cults[v]!;
    const lore = cult.bienfait + cult.courroux + cult.prodige;
    if (!cult.priest && lore >= PRIEST_LORE) {
      cult.priest = true;
      this.bus.emit("religion:priestOrdained", { village: v, doctrine: this.doctrineOf(v) });
    }
    if (cult.priest && !cult.temple && lore >= TEMPLE_LORE) {
      cult.temple = true;
      this.bus.emit("religion:templeRaised", { village: v, doctrine: this.doctrineOf(v) });
    }
  }

  private nearestVillage(x: number, y: number): number {
    const villages = this.settlements.villages;
    let best = -1;
    let bestD = Infinity;
    for (let v = 0; v < villages.length; v++) {
      const d = (villages[v]!.x - x) ** 2 + (villages[v]!.y - y) ** 2;
      if (d < bestD) {
        bestD = d;
        best = v;
      }
    }
    return best;
  }

  /** Garde un culte par village (les villages sont fondés après coup). */
  private syncLength(): void {
    while (this.cults.length < this.settlements.villages.length) this.cults.push(emptyCult());
    this.cults.length = this.settlements.villages.length;
  }

  serialize(): {
    bienfait: number[]; courroux: number[]; prodige: number[];
    priest: number[]; temple: number[];
  } {
    this.syncLength();
    return {
      bienfait: this.cults.map((c) => c.bienfait),
      courroux: this.cults.map((c) => c.courroux),
      prodige: this.cults.map((c) => c.prodige),
      priest: this.cults.map((c) => (c.priest ? 1 : 0)),
      temple: this.cults.map((c) => (c.temple ? 1 : 0)),
    };
  }

  restore(data: ReturnType<ReligionSystem["serialize"]>): void {
    this.cults.length = 0;
    for (let i = 0; i < data.bienfait.length; i++) {
      this.cults.push({
        bienfait: data.bienfait[i]!,
        courroux: data.courroux[i]!,
        prodige: data.prodige[i]!,
        priest: data.priest[i] === 1,
        temple: data.temple[i] === 1,
      });
    }
  }
}
