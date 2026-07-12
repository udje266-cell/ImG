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
export type PowerRejectionReason = "insufficient-faith" | "unknown-power";

export type GameEvents = {
  "time:dayStarted": { day: number };
  "time:seasonChanged": { season: Season; year: number };
  "time:yearStarted": { year: number };
  /** Chunks whose biomes were recomputed this tick (renderer redraws them). */
  "terrain:modified": { chunkIds: number[] };
  "intent:invokePower": PowerInvocation;
  "power:invoked": { power: PowerId; cost: number };
  "power:rejected": { power: PowerId; reason: PowerRejectionReason };
};
