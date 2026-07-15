import type { Rng } from "../../core/math/Rng";
import type { EventBus } from "../../core/events/EventBus";
import type { GameEvents } from "../events";
import type { AgentSystem } from "../agents/AgentSystem";
import type { SettlementSystem } from "./SettlementSystem";

/**
 * Guerres entre villages (cahier des charges §5 — « déclarer des guerres »).
 *
 * Les villages voisins entrent en **tension** : la proximité et la pression
 * démographique l'attisent, l'éloignement l'apaise. Quand elle déborde, la
 * guerre éclate et un **raid** se résout : la force militaire de chaque camp
 * (surtout ses **guerriers**) décide des pertes — le plus faible enterre le
 * plus de morts. Les survivants sont endeuillés et terrifiés (leurs émotions
 * s'en ressentent), et le récit de la bataille attise la Crainte.
 *
 * Déterministe (flux RNG « war »). La tension est émergente et éphémère : elle
 * se reconstruit à partir de la carte des villages, elle n'est pas sauvegardée.
 */
export const WAR_INTERVAL = 120;

/** Rayon (tuiles) de recensement et de combat autour d'un village. */
const VILLAGE_RADIUS = 8;
/** Au-delà de cette distance, deux villages s'ignorent. */
const RIVAL_RANGE = 40;
/** Tension au-delà de laquelle la guerre éclate. */
const TENSION_THRESHOLD = 1;
/** Apaisement de la tension entre villages trop éloignés. */
const TENSION_DECAY = 0.9;
/** Pertes de base infligées lors d'un raid (avant rapport de force). */
const BASE_CASUALTIES = 2;
/**
 * Population minimale d'un village pour prendre part à une guerre : en deçà, il
 * est trop exsangue — on ne l'achève pas (les guerres ne doivent pas exterminer
 * un peuple, seulement le saigner).
 */
const MIN_COMBAT_POP = 8;
/**
 * Tension imposée après un raid : négative → une longue trêve s'installe avant
 * que la rancœur ne remonte (les guerres restent occasionnelles).
 */
const POST_RAID_TENSION = -0.6;

export class WarSystem {
  /** Tension par paire de villages (matrice triangulaire, éphémère). */
  private tension: number[][] = [];
  private readonly atWar = new Set<string>();
  private readonly rng: Rng;

  constructor(
    private readonly settlements: SettlementSystem,
    private readonly agents: AgentSystem,
    private readonly bus: EventBus<GameEvents>,
    baseRng: Rng,
  ) {
    this.rng = baseRng.fork("war");
  }

  /** Tension courante entre deux villages (0 si hors de portée). */
  tensionBetween(a: number, b: number): number {
    const [lo, hi] = a < b ? [a, b] : [b, a];
    return this.tension[lo]?.[hi] ?? 0;
  }

  private ensure(n: number): void {
    for (let i = 0; i < n; i++) {
      if (!this.tension[i]) this.tension[i] = [];
    }
  }

  /** Un pas de guerre : attise les tensions et résout les guerres déclarées. */
  update(): void {
    const villages = this.settlements.villages;
    if (villages.length < 2) return;
    this.ensure(villages.length);

    for (let a = 0; a < villages.length; a++) {
      for (let b = a + 1; b < villages.length; b++) {
        const va = villages[a]!;
        const vb = villages[b]!;
        const dist = Math.hypot(va.x - vb.x, va.y - vb.y);
        if (dist > RIVAL_RANGE) {
          this.tension[a]![b] = (this.tension[a]![b] ?? 0) * TENSION_DECAY;
          continue;
        }
        const proximity = 1 - dist / RIVAL_RANGE;
        const pressure = (va.population + vb.population) / 60;
        const rise = proximity * (0.05 + pressure * 0.06) * (0.5 + this.rng.float() * 0.6);
        this.tension[a]![b] = (this.tension[a]![b] ?? 0) + rise;

        if (this.tension[a]![b]! >= TENSION_THRESHOLD) {
          this.resolve(a, b);
          this.tension[a]![b] = POST_RAID_TENSION; // longue trêve avant la rancœur suivante
        }
      }
    }
  }

  /** Résout un raid entre deux villages : pertes selon le rapport de force. */
  private resolve(a: number, b: number): void {
    const villages = this.settlements.villages;
    const va = villages[a]!;
    const vb = villages[b]!;

    // On n'achève pas un village exsangue : sous le seuil, pas de bataille.
    const popA = this.agents.countNear(va.x, va.y, VILLAGE_RADIUS);
    const popB = this.agents.countNear(vb.x, vb.y, VILLAGE_RADIUS);
    if (popA < MIN_COMBAT_POP || popB < MIN_COMBAT_POP) return;

    const sA = this.agents.strengthNear(va.x, va.y, VILLAGE_RADIUS);
    const sB = this.agents.strengthNear(vb.x, vb.y, VILLAGE_RADIUS);
    const total = sA + sB || 1;

    const key = `${a}-${b}`;
    if (!this.atWar.has(key)) {
      this.atWar.add(key);
      this.bus.emit("war:declared", { attacker: a, defender: b });
    }

    // Le camp le plus faible enterre le plus de morts (mais jamais tout le monde).
    const lossA = Math.min(popA - MIN_COMBAT_POP, Math.round(BASE_CASUALTIES * (sB / total) + 0.5));
    const lossB = Math.min(popB - MIN_COMBAT_POP, Math.round(BASE_CASUALTIES * (sA / total) + 0.5));
    const killed =
      this.agents.cullNear(va.x, va.y, Math.max(0, lossA)) +
      this.agents.cullNear(vb.x, vb.y, Math.max(0, lossB));

    // Les survivants pleurent leurs morts et redoutent le prochain assaut.
    this.agents.mourn(va.x, va.y, VILLAGE_RADIUS, 0.5);
    this.agents.mourn(vb.x, vb.y, VILLAGE_RADIUS, 0.5);

    const victor = sA >= sB ? a : b;
    this.bus.emit("war:raid", { attacker: a, defender: b, victor, casualties: killed });
  }
}
