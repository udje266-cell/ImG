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

/** Minimal HUD: faith reserve, calendar, time control (docs/GDD.md §5.3). */
export class Hud {
  constructor(private readonly element: HTMLElement) {}

  update(sim: Simulation, time: TimeControlState): void {
    const clock = sim.clock;
    const totalMinutes = Math.floor(clock.timeOfDay * 24 * 60);
    const hours = String(Math.floor(totalMinutes / 60)).padStart(2, "0");
    const minutes = String(totalMinutes % 60).padStart(2, "0");
    const speed = time.paused ? "Pause" : `Vitesse x${time.speed}`;

    this.element.textContent =
      `Foi : ${Math.floor(sim.faith.current)} / ${sim.faith.max}\n` +
      `An ${clock.year + 1} — ${SEASON_LABELS[clock.season]}, jour ${clock.dayOfSeason + 1} — ${hours}:${minutes}\n` +
      `${speed}`;
  }
}
