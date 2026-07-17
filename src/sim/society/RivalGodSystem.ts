import { PLAYER_FACTION, type AgentSystem } from "../agents/AgentSystem";
import type { SettlementSystem } from "./SettlementSystem";

/**
 * Dieux-IA rivaux (Étape 3 — cahier des charges : « les autres villages auront
 * leurs propres dieux, pilotés par une IA »).
 *
 * Chaque faction non-joueur (≥ 1) présente sur la carte est un **dieu-IA** : il
 * accumule SA propre Foi (la ferveur de ses ouailles) et, dès qu'il en a assez,
 * **agit** — il ravive la ferveur de ses villages et **reconquiert** les âmes
 * que le joueur lui a converties (halo de reconversion autour de ses foyers).
 * La conversion devient ainsi une **lutte** : cesser d'évangéliser, c'est
 * laisser le dieu rival reprendre son peuple.
 *
 * Déterministe (pure accumulation, aucun aléa). Foi par dieu transitoire (elle
 * se reconstitue) — non sérialisée. Le joueur (faction 0) est géré à part
 * (`FaithSystem`) et ignoré ici.
 */
export const RIVAL_GOD_INTERVAL = 60;
/** Foi qu'un dieu-IA doit amasser avant d'agir (tempo de ses interventions). */
const ACT_COST = 18;
/** Rayon d'action d'un dieu-IA autour de chacun de ses villages. */
const ACT_RADIUS = 10;
/** Ferveur ravivée chez ses ouailles quand il agit. */
const BLESS_FERVOUR = 0.07;
/** Reconquête : conviction rendue à ses âmes égarées, par action. */
const RECLAIM = 0.06;

export class RivalGodSystem {
  /** Foi amassée par chaque dieu-IA (faction → réserve). Transitoire. */
  private readonly faith = new Map<number, number>();

  constructor(
    private readonly settlements: SettlementSystem,
    private readonly agents: AgentSystem,
  ) {}

  /** Foi courante d'un dieu-IA (inspection / tests). */
  faithOf(faction: number): number {
    return this.faith.get(faction) ?? 0;
  }

  /**
   * Une passe des dieux-IA : chacun encaisse la ferveur de ses fidèles, puis —
   * s'il en a assez — protège et reconquiert son peuple autour de ses villages.
   */
  update(): void {
    const villages = this.settlements.villages;
    // Factions rivales présentes (au moins un village), joueur exclu.
    const factions = new Set<number>();
    for (const v of villages) if (v.faction !== PLAYER_FACTION) factions.add(v.faction);

    for (const f of factions) {
      const cur = (this.faith.get(f) ?? 0) + this.agents.faithIncomeFor(f);
      if (cur >= ACT_COST) {
        for (const v of villages) {
          if (v.faction !== f) continue;
          // Ravive la ferveur des siens et reconquiert les âmes converties.
          this.agents.bless(v.x, v.y, ACT_RADIUS, 0, BLESS_FERVOUR);
          this.agents.evangelize(v.x, v.y, ACT_RADIUS, f, RECLAIM);
        }
        this.faith.set(f, cur - ACT_COST);
      } else {
        this.faith.set(f, cur);
      }
    }
    // Oublie les factions disparues (village annexé/anéanti) pour ne pas fuir.
    for (const f of [...this.faith.keys()]) if (!factions.has(f)) this.faith.delete(f);
  }
}
