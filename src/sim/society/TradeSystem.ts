import type { EventBus } from "../../core/events/EventBus";
import type { GameEvents } from "../events";
import type { AgentSystem } from "../agents/AgentSystem";
import type { SettlementSystem } from "./SettlementSystem";
import type { WarSystem } from "./WarSystem";

/**
 * Commerce entre villages (cahier des charges §5 — « faire du commerce »).
 *
 * Deux villages voisins **en paix** ouvrent une route commerciale : les biens
 * circulent, et la **prospérité** monte de part et d'autre. Concrètement, une
 * route active chaque pas :
 *  - **ravitaille** les deux villages (la faim reflue, le contentement monte) ;
 *  - fait rayonner une **faveur** de Foi (un peuple prospère honore ses dieux) ;
 *  - nourrit un indice de **prospérité** par village (affiché, décroissant).
 *
 * La guerre coupe le commerce : au-dessus d'un seuil de tension (cf.
 * `WarSystem`), la route se ferme. Pur et déterministe (aucune source
 * d'aléa) ; la prospérité est émergente et éphémère (non sauvegardée).
 */
export const TRADE_INTERVAL = 80;

/** Distance maximale d'une route commerciale (un peu moins que la portée de guerre). */
const TRADE_RANGE = 36;
/** Au-dessus de cette tension, les villages ne commercent plus (quasi-guerre). */
const TRADE_PEACE = 0.6;
/** Population minimale pour tenir un comptoir. */
const MIN_TRADE_POP = 4;
/** Rayon de ravitaillement autour d'un village. */
const VILLAGE_RADIUS = 8;
/** Faveur de Foi née de la prospérité, par route active et par pas. */
const TRADE_FAITH = 0.35;
/** Prospérité gagnée par route active, par village et par pas. */
const PROSPERITY_GAIN = 0.5;
/** Décroissance de la prospérité (sans commerce, la richesse retombe). */
const PROSPERITY_DECAY = 0.98;
/** Apaisement de la faim apporté par une route (biens/vivres). */
const PROVISION_RELIEF = 0.04;

export class TradeSystem {
  /** Prospérité par village (émergente, éphémère). */
  private readonly prosperity: number[] = [];
  private readonly routes = new Set<string>();

  constructor(
    private readonly settlements: SettlementSystem,
    private readonly agents: AgentSystem,
    private readonly war: WarSystem,
    private readonly bus: EventBus<GameEvents>,
  ) {}

  prosperityOf(village: number): number {
    return this.prosperity[village] ?? 0;
  }

  get totalProsperity(): number {
    let s = 0;
    for (const p of this.prosperity) s += p;
    return s;
  }

  /** Nombre de routes commerciales actives au dernier pas. */
  get activeRoutes(): number {
    return this.routes.size;
  }

  /**
   * Un pas de commerce : ouvre/entretient les routes entre villages voisins en
   * paix et retourne la faveur de Foi née de la prospérité générée.
   */
  update(): number {
    const villages = this.settlements.villages;
    for (let i = 0; i < villages.length; i++) {
      this.prosperity[i] = (this.prosperity[i] ?? 0) * PROSPERITY_DECAY;
    }
    if (villages.length < 2) {
      this.routes.clear();
      return 0;
    }

    const activeNow = new Set<string>();
    let faith = 0;
    for (let a = 0; a < villages.length; a++) {
      for (let b = a + 1; b < villages.length; b++) {
        const va = villages[a]!;
        const vb = villages[b]!;
        const dist = Math.hypot(va.x - vb.x, va.y - vb.y);
        if (dist > TRADE_RANGE) continue;
        if (this.war.tensionBetween(a, b) >= TRADE_PEACE) continue; // la guerre coupe le commerce
        if (
          this.agents.countNear(va.x, va.y, VILLAGE_RADIUS) < MIN_TRADE_POP ||
          this.agents.countNear(vb.x, vb.y, VILLAGE_RADIUS) < MIN_TRADE_POP
        ) {
          continue;
        }

        const key = `${a}-${b}`;
        activeNow.add(key);
        if (!this.routes.has(key)) this.bus.emit("trade:established", { a, b });

        this.prosperity[a] = (this.prosperity[a] ?? 0) + PROSPERITY_GAIN;
        this.prosperity[b] = (this.prosperity[b] ?? 0) + PROSPERITY_GAIN;
        this.agents.provision(va.x, va.y, VILLAGE_RADIUS, PROVISION_RELIEF);
        this.agents.provision(vb.x, vb.y, VILLAGE_RADIUS, PROVISION_RELIEF);
        faith += TRADE_FAITH;
      }
    }
    this.routes.clear();
    for (const k of activeNow) this.routes.add(k);
    return faith;
  }
}
