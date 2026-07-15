import type { EventBus } from "../../core/events/EventBus";
import type { GameEvents } from "../events";

/**
 * Ères technologiques (docs/GDD.md §7, cahier des charges §7).
 *
 * La civilisation du joueur **évolue** de l'âge primitif à l'âge du fer. Le
 * moteur est le **Savoir** : il s'accumule avec la population (plus d'esprits,
 * plus d'idées), le nombre de villages (société organisée) et les temples
 * (transmission du savoir). Quand il franchit un palier, le peuple **change
 * d'ère** — ce qui transforme ses bâtiments, ses monuments, son apparence et
 * sa politique (le rendu réagit à `era:advanced`). Pur, déterministe (simple
 * accumulation), cadencé par une passe périodique.
 */
export enum Era {
  Primitive = 0,
  Stone = 1,
  Bronze = 2,
  Iron = 3,
}
export const ERA_COUNT = 4;

export interface EraInfo {
  name: string;
  /** Organisation politique de l'ère. */
  politics: string;
  icon: string;
}

export const ERA_INFO: readonly EraInfo[] = [
  { name: "Âge Primitif", politics: "Clan", icon: "🦴" },
  { name: "Âge de Pierre", politics: "Tribu", icon: "🪨" },
  { name: "Âge du Bronze", politics: "Chefferie", icon: "⚒️" },
  { name: "Âge du Fer", politics: "Royaume", icon: "🛡️" },
];

/** Savoir cumulé requis pour ATTEINDRE chaque ère (index = ère). */
export const ERA_KNOWLEDGE: readonly number[] = [0, 500, 2200, 6000];

/** Cadence (ticks) d'accumulation du Savoir. */
export const ERA_INTERVAL = 50;
const KNOWLEDGE_PER_CAPITA = 0.06;
const KNOWLEDGE_PER_VILLAGE = 0.6;
const KNOWLEDGE_PER_TEMPLE = 2.5;

export class EraSystem {
  private _knowledge = 0;
  private _era: Era = Era.Primitive;

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

  /** Progression [0, 1] vers l'ère suivante (1 si déjà à l'âge du fer). */
  get progress(): number {
    if (this._era >= Era.Iron) return 1;
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

    while (this._era < Era.Iron && this._knowledge >= ERA_KNOWLEDGE[this._era + 1]!) {
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
    this._era = Math.min(Era.Iron, Math.max(Era.Primitive, data.era)) as Era;
  }
}
