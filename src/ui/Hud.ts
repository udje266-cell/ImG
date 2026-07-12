import type { Season } from "../core/time/GameClock";
import type { Simulation } from "../sim/world/Simulation";

/** Time control state displayed by the HUD (provided by the app layer). */
export interface TimeControlState {
  paused: boolean;
  speed: number;
}

const SEASON_LABELS: Record<Season, string> = {
  spring: "Printemps",
  summer: "Été",
  autumn: "Automne",
  winter: "Hiver",
};

const FLASH_DURATION_MS = 2600;

/** Minimal HUD: faith, devotion, calendar, time control (docs/GDD.md §5.3). */
export class Hud {
  private flashMessage = "";
  private flashUntil = 0;

  constructor(private readonly element: HTMLElement) {}

  /** Message temporaire (sauvegarde, déblocage de pouvoir...). */
  flash(message: string): void {
    this.flashMessage = message;
    this.flashUntil = performance.now() + FLASH_DURATION_MS;
  }

  update(sim: Simulation, time: TimeControlState): void {
    const clock = sim.clock;
    const totalMinutes = Math.floor(clock.timeOfDay * 24 * 60);
    const hours = String(Math.floor(totalMinutes / 60)).padStart(2, "0");
    const minutes = String(totalMinutes % 60).padStart(2, "0");
    const speed = time.paused ? "Pause" : `Vitesse x${time.speed}`;

    let text =
      `Foi : ${Math.floor(sim.faith.current)} / ${sim.faith.max}\n` +
      `Dévotion : ${Math.floor(sim.progression.devotion)}\n` +
      `An ${clock.year + 1} — ${SEASON_LABELS[clock.season]}, jour ${clock.dayOfSeason + 1} — ${hours}:${minutes}\n` +
      `${speed}`;
    if (performance.now() < this.flashUntil) {
      text += `\n★ ${this.flashMessage}`;
    }
    this.element.textContent = text;
  }
}
