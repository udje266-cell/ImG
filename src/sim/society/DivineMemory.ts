import type { GameClock } from "../../core/time/GameClock";
import type { EventBus } from "../../core/events/EventBus";
import type { GameEvents } from "../events";
import { POWER_CATALOG } from "../powers/catalog";
import type { PowerId } from "../powers/Power";
import { POWER_NATURE, type MiracleNature } from "../religion/ReligionSystem";

/**
 * Mémoire divine (cahier des charges §5 — « se souvenir des interventions du
 * joueur »).
 *
 * La civilisation **se souvient** des hauts faits du dieu. Chaque miracle
 * invoqué est consigné dans une **chronique** (l'an, sa nature, son lieu), et
 * nourrit deux mémoires longues, qui s'estompent lentement :
 *  - la **révérence**, née des bienfaits (et de l'émerveillement des prodiges) ;
 *  - l'**effroi**, né des courroux (fléaux, catastrophes).
 *
 * La révérence accumulée fait rayonner une **faveur** — une Foi passive : un
 * dieu dont on garde bon souvenir est prié même en son absence. L'effroi, lui,
 * nourrit la Crainte (le culte sombre du ReligionSystem). Pur et déterministe :
 * il ne fait qu'écouter `power:invoked` et estomper le temps venu.
 */
export type Deed = {
  year: number;
  kind: MiracleNature; // bienfait | courroux | prodige
  power: string; // nom lisible du pouvoir
  x: number;
  y: number;
};

export interface DivineMemoryState {
  deeds: Deed[];
  reverence: number;
  dread: number;
}

/** Longueur maximale de la chronique (les plus vieux récits s'oublient). */
export const CHRONICLE_MAX = 24;
const REVERENCE_GAIN = 1; // par bienfait
const DREAD_GAIN = 1; // par courroux
const WONDER_REVERENCE = 0.4; // un prodige émerveille (un peu de révérence)
const MEMORY_CAP = 40;
/** Décroissance par jour de la mémoire longue (≈ oubli progressif). */
const MEMORY_FADE = 0.985;
/** Foi passive par point de révérence, à chaque estompage (une fois/jour). */
const FAVOR_PER_REVERENCE = 0.4;

export class DivineMemory {
  private readonly _deeds: Deed[] = [];
  private _reverence = 0;
  private _dread = 0;

  constructor(
    private readonly bus: EventBus<GameEvents>,
    private readonly clock: GameClock,
  ) {
    this.bus.on("power:invoked", ({ power, x, y }) => this.record(power, x, y));
  }

  /** Consigne un haut fait divin et met à jour révérence / effroi. */
  private record(power: PowerId, x: number, y: number): void {
    const kind = POWER_NATURE[power];
    if (!kind) return;
    const name = POWER_CATALOG.find((m) => m.power === power)?.name ?? power;
    this._deeds.unshift({ year: this.clock.year + 1, kind, power: name, x, y });
    if (this._deeds.length > CHRONICLE_MAX) this._deeds.pop();

    if (kind === "bienfait") this._reverence = Math.min(MEMORY_CAP, this._reverence + REVERENCE_GAIN);
    else if (kind === "courroux") this._dread = Math.min(MEMORY_CAP, this._dread + DREAD_GAIN);
    else this._reverence = Math.min(MEMORY_CAP, this._reverence + WONDER_REVERENCE);
  }

  /**
   * Estompe la mémoire longue (appelée une fois par jour) et retourne la Foi
   * passive née de la révérence — la faveur d'un dieu dont on se souvient.
   */
  fade(): number {
    const favor = this._reverence * FAVOR_PER_REVERENCE;
    this._reverence *= MEMORY_FADE;
    this._dread *= MEMORY_FADE;
    return favor;
  }

  get reverence(): number {
    return this._reverence;
  }
  get dread(): number {
    return this._dread;
  }

  /** Chronique des hauts faits, du plus récent au plus ancien. */
  chronicle(): readonly Deed[] {
    return this._deeds;
  }

  serialize(): DivineMemoryState {
    return {
      deeds: this._deeds.map((d) => ({ ...d })),
      reverence: this._reverence,
      dread: this._dread,
    };
  }

  restore(state: DivineMemoryState): void {
    this._deeds.length = 0;
    for (const d of state.deeds) this._deeds.push({ ...d });
    this._reverence = state.reverence;
    this._dread = state.dread;
  }
}
