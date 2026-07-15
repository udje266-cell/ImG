import type { EventBus } from "../../core/events/EventBus";
import type { GameEvents } from "../events";

/**
 * Voyage vers d'autres îles (cahier des charges — inspiration Godus §8).
 *
 * Quand la civilisation est assez développée (âge du fer, population et
 * prospérité suffisantes), son meilleur village entreprend de **bâtir un
 * navire de haute mer**. La réparation avance au fil du développement ; une
 * fois le navire prêt, le peuple peut **cingler vers une nouvelle île** — un
 * monde neuf où il repart, en conservant son savoir (ère) et la puissance
 * divine accumulée (dévotion → pouvoirs débloqués).
 *
 * Pur et déterministe (aucun aléa) ; sérialisé (l'avancement du navire et
 * l'index d'île survivent à la sauvegarde).
 */
export const VOYAGE_INTERVAL = 60;

/** Ère minimale (index) pour entreprendre un navire de haute mer : l'âge du fer. */
export const SHIP_MIN_ERA = 2;
/** Population minimale pour armer une expédition. */
export const SHIP_MIN_POP = 40;
const BASE_RATE = 0.01;
const RATE_PER_PROSPERITY = 0.00015;
const RATE_PER_CAPITA = 0.0004;

export interface VoyageState {
  island: number;
  shipProgress: number;
  shipReady: boolean;
}

export class VoyageSystem {
  /** Index de l'île courante (0 = île de départ). */
  private _island = 0;
  /** Avancement de la réparation du navire [0, 1]. */
  private _shipProgress = 0;
  private _shipReady = false;

  constructor(private readonly bus: EventBus<GameEvents>) {}

  get island(): number {
    return this._island;
  }
  get shipProgress(): number {
    return this._shipProgress;
  }
  get shipReady(): boolean {
    return this._shipReady;
  }
  /** Le chantier naval a-t-il commencé (civilisation assez développée) ? */
  buildable(population: number, era: number): boolean {
    return era >= SHIP_MIN_ERA && population >= SHIP_MIN_POP;
  }

  /**
   * Fait avancer la réparation du navire selon le développement de la
   * civilisation. Émet `voyage:shipReady` au moment où il est achevé.
   */
  update(population: number, era: number, prosperity: number): void {
    if (this._shipReady) return;
    if (!this.buildable(population, era)) return;

    const rate =
      BASE_RATE + prosperity * RATE_PER_PROSPERITY + (population - SHIP_MIN_POP) * RATE_PER_CAPITA;
    this._shipProgress = Math.min(1, this._shipProgress + Math.max(BASE_RATE, rate));
    if (this._shipProgress >= 1) {
      this._shipReady = true;
      this.bus.emit("voyage:shipReady", { island: this._island });
    }
  }

  /**
   * Débarque sur une nouvelle île : incrémente l'index et remet le chantier à
   * zéro (le navire reste à rebâtir sur la terre neuve).
   */
  arrive(island: number): void {
    this._island = island;
    this._shipProgress = 0;
    this._shipReady = false;
  }

  serialize(): VoyageState {
    return { island: this._island, shipProgress: this._shipProgress, shipReady: this._shipReady };
  }

  restore(state: VoyageState): void {
    this._island = state.island;
    this._shipProgress = state.shipProgress;
    this._shipReady = state.shipReady;
  }
}
