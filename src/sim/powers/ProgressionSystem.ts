import type { EventBus } from "../../core/events/EventBus";
import type { GameEvents } from "../events";
import type { PowerId } from "./Power";

/**
 * Progression divine v1 (cahier des charges §7) : chaque miracle accompli
 * nourrit la Dévotion (somme de la Foi réellement dépensée). Franchir un
 * seuil débloque un pouvoir — annoncé par `progression:powerUnlocked`.
 *
 * v1 : la dévotion vient uniquement des pouvoirs invoqués. Les prières,
 * temples et sacrifices s'y brancheront aux phases 4-6.
 */
export const POWER_UNLOCK_THRESHOLDS: Record<PowerId, number> = {
  terraform: 0,
  flatten: 120,
  growth: 180,
  orogenesis: 260,
  rain: 300,
  basin: 320,
  drought: 360,
  benediction: 420,
  beckon: 480,
  abundance: 540,
  spawnHerd: 600,
  lightning: 680,
  earthquake: 780,
  volcano: 900,
};

export class ProgressionSystem {
  private lifetimeDevotion = 0;

  constructor(private readonly bus: EventBus<GameEvents>) {
    bus.on("power:invoked", ({ cost }) => this.addDevotion(cost));
  }

  get devotion(): number {
    return this.lifetimeDevotion;
  }

  isUnlocked(power: PowerId): boolean {
    return this.lifetimeDevotion >= POWER_UNLOCK_THRESHOLDS[power];
  }

  unlockedPowers(): PowerId[] {
    return (Object.keys(POWER_UNLOCK_THRESHOLDS) as PowerId[]).filter((p) => this.isUnlocked(p));
  }

  addDevotion(amount: number): void {
    if (amount < 0 || !Number.isFinite(amount)) {
      throw new Error(`ProgressionSystem.addDevotion: invalid amount ${amount}`);
    }
    const before = this.lifetimeDevotion;
    this.lifetimeDevotion += amount;
    for (const [power, threshold] of Object.entries(POWER_UNLOCK_THRESHOLDS) as Array<
      [PowerId, number]
    >) {
      if (before < threshold && this.lifetimeDevotion >= threshold) {
        this.bus.emit("progression:powerUnlocked", { power, devotion: this.lifetimeDevotion });
      }
    }
  }

  /** Restauration depuis une sauvegarde : pose l'état sans ré-émettre. */
  restoreDevotion(value: number): void {
    this.lifetimeDevotion = value;
  }
}
