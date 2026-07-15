import type { Season } from "../core/time/GameClock";
import type { PowerId, PowerInvocation } from "./powers/Power";

/**
 * Central event map of the game (see docs/TDD.md §2.4).
 *
 * Naming conventions:
 * - `domain:fact` in past tense for facts that already happened.
 * - `intent:*` for player intents published by the UI; the simulation is the
 *   only layer allowed to act on them.
 */
export type PowerRejectionReason = "insufficient-faith" | "insufficient-spark" | "unknown-power" | "locked";

export type GameEvents = {
  "time:dayStarted": { day: number };
  "time:seasonChanged": { season: Season; year: number };
  "time:yearStarted": { year: number };
  /** Chunks whose biomes were recomputed this tick (renderer redraws them). */
  "terrain:modified": { chunkIds: number[] };
  "intent:invokePower": PowerInvocation;
  "power:invoked": { power: PowerId; cost: number; x: number; y: number; radius: number };
  "power:rejected": { power: PowerId; reason: PowerRejectionReason };
  /** Un seuil de dévotion vient d'être franchi (cahier des charges §7). */
  "progression:powerUnlocked": { power: PowerId; devotion: number };
  /** La flore a évolué ce tick — le rendu des forêts peut se rafraîchir. */
  "flora:updated": Record<string, never>;
  /** Les villages ont changé (nouvelles huttes) — le rendu se reconstruit. */
  "settlements:updated": Record<string, never>;
  /** Le peuple fonde son premier village (assez de descendants). */
  "settlements:founded": Record<string, never>;
  /** Un prêtre s'élève dans un village (assez de récits de miracles). */
  "religion:priestOrdained": { village: number; doctrine: string };
  /** Un village érige un temple à son dieu — la Foi y rayonne. */
  "religion:templeRaised": { village: number; doctrine: string };
  /** La civilisation change d'ère technologique (âge de pierre → fer). */
  "era:advanced": { era: number; name: string; politics: string };
};
