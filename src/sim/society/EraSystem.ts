import type { EventBus } from "../../core/events/EventBus";
import type { GameEvents } from "../events";

/**
 * Ères technologiques (docs/GDD.md §7, cahier des charges §7).
 *
 * La civilisation du joueur **évolue** à travers les huit grands âges de
 * l'humanité, de l'âge de pierre au futur. Le moteur est le **Savoir** : il
 * s'accumule avec la population (plus d'esprits, plus d'idées), le nombre de
 * villages (société organisée) et les temples (transmission du savoir). Quand
 * il franchit un palier, le peuple **change d'ère** — ce qui transforme ses
 * bâtiments, ses monuments, son apparence et sa politique (le rendu réagit à
 * `era:advanced`). Pur, déterministe (simple accumulation), cadencé par une
 * passe périodique.
 */
export enum Era {
  Stone = 0,
  Bronze = 1,
  Iron = 2,
  Medieval = 3,
  Renaissance = 4,
  Industrial = 5,
  Modern = 6,
  Future = 7,
}
export const ERA_COUNT = 8;
/** Dernière ère (borne haute). */
export const LAST_ERA: Era = Era.Future;

export interface EraInfo {
  name: string;
  /** Organisation politique dominante de l'ère (réaliste). */
  politics: string;
  icon: string;
}

export const ERA_INFO: readonly EraInfo[] = [
  { name: "Âge de Pierre", politics: "Tribu", icon: "🪨" },
  { name: "Âge du Bronze", politics: "Chefferie", icon: "⚒️" },
  { name: "Âge du Fer", politics: "Royaume", icon: "🛡️" },
  { name: "Moyen Âge", politics: "Féodalité", icon: "🏰" },
  { name: "Renaissance", politics: "Cité-État", icon: "🎨" },
  { name: "Révolution Industrielle", politics: "Nation", icon: "🏭" },
  { name: "Époque Moderne", politics: "République", icon: "🏙️" },
  { name: "Futur", politics: "Fédération", icon: "🚀" },
];

/**
 * Savoir cumulé requis pour ATTEINDRE chaque ère (index = ère). Les paliers
 * s'écartent : chaque révolution technologique demande plus de savoir accumulé
 * que la précédente (de la pierre polie à la fusion).
 */
export const ERA_KNOWLEDGE: readonly number[] = [
  0, // Pierre
  500, // Bronze
  2200, // Fer
  6000, // Moyen Âge
  12000, // Renaissance
  22000, // Révolution Industrielle
  38000, // Époque Moderne
  60000, // Futur
];

/** Cadence (ticks) d'accumulation du Savoir. */
export const ERA_INTERVAL = 50;
const KNOWLEDGE_PER_CAPITA = 0.06;
const KNOWLEDGE_PER_VILLAGE = 0.6;
const KNOWLEDGE_PER_TEMPLE = 2.5;

export class EraSystem {
  private _knowledge = 0;
  private _era: Era = Era.Stone;

  constructor(private readonly bus: EventBus<GameEvents>) {}

  get knowledge(): number {
    return this._knowledge;
  }
  get era(): Era {
    return this._era;
  }
  get info(): EraInfo {
    return ERA_INFO[this._era]!;
  }

  /** Progression [0, 1] vers l'ère suivante (1 si déjà à la dernière ère). */
  get progress(): number {
    if (this._era >= LAST_ERA) return 1;
    const from = ERA_KNOWLEDGE[this._era]!;
    const to = ERA_KNOWLEDGE[this._era + 1]!;
    return Math.min(1, Math.max(0, (this._knowledge - from) / (to - from)));
  }

  /**
   * Accumule le Savoir selon l'état de la civilisation et fait progresser
   * l'ère si un palier est franchi (peut sauter plusieurs paliers d'un coup).
   */
  advance(population: number, villages: number, temples: number): void {
    this._knowledge +=
      population * KNOWLEDGE_PER_CAPITA +
      villages * KNOWLEDGE_PER_VILLAGE +
      temples * KNOWLEDGE_PER_TEMPLE;

    while (this._era < LAST_ERA && this._knowledge >= ERA_KNOWLEDGE[this._era + 1]!) {
      this._era++;
      const info = ERA_INFO[this._era]!;
      this.bus.emit("era:advanced", { era: this._era, name: info.name, politics: info.politics });
    }
  }

  serialize(): { knowledge: number; era: number } {
    return { knowledge: this._knowledge, era: this._era };
  }

  restore(data: { knowledge: number; era: number }): void {
    this._knowledge = data.knowledge;
    this._era = Math.min(LAST_ERA, Math.max(Era.Stone, data.era)) as Era;
  }
}
