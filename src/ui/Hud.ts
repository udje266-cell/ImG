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

/**
 * HUD façon god-game mobile (docs/GDD.md §5.3) : pastilles de ressources
 * (Foi + barre, Dévotion), ligne de calendrier, message flash. Les boutons
 * d'action sont dans la barre du bas (gérés par InputController).
 */
export class Hud {
  private readonly faithVal: HTMLElement;
  private readonly faithBar: HTMLElement;
  private readonly sparkVal: HTMLElement;
  private readonly sparkBar: HTMLElement;
  private readonly devotionVal: HTMLElement;
  private readonly populationVal: HTMLElement;
  private readonly clock: HTMLElement;
  private readonly flashEl: HTMLElement;
  private flashUntil = 0;

  constructor(root: Document = document) {
    this.faithVal = root.getElementById("faith-val")!;
    this.faithBar = root.getElementById("faith-bar")!;
    this.sparkVal = root.getElementById("spark-val")!;
    this.sparkBar = root.getElementById("spark-bar")!;
    this.devotionVal = root.getElementById("devotion-val")!;
    this.populationVal = root.getElementById("population-val")!;
    this.clock = root.getElementById("clock")!;
    this.flashEl = root.getElementById("flash")!;
  }

  /** Message temporaire (sauvegarde, déblocage de pouvoir...). */
  flash(message: string): void {
    this.flashEl.textContent = message;
    this.flashEl.classList.add("show");
    this.flashUntil = performance.now() + FLASH_DURATION_MS;
  }

  update(sim: Simulation, time: TimeControlState): void {
    const clock = sim.clock;
    const totalMinutes = Math.floor(clock.timeOfDay * 24 * 60);
    const hours = String(Math.floor(totalMinutes / 60)).padStart(2, "0");
    const minutes = String(totalMinutes % 60).padStart(2, "0");
    const speed = time.paused ? "⏸ Pause" : `▶ ×${time.speed}`;

    this.faithVal.textContent = String(Math.floor(sim.faith.current));
    this.faithBar.style.width = `${(sim.faith.current / sim.faith.max) * 100}%`;
    this.sparkVal.textContent = String(Math.floor(sim.spark.current));
    this.sparkBar.style.width = `${(sim.spark.current / sim.spark.max) * 100}%`;
    this.devotionVal.textContent = String(Math.floor(sim.progression.devotion));
    this.populationVal.textContent = String(sim.agents.count);
    const era = sim.era.info;
    const voyage = sim.voyage;
    const island = voyage.island > 0 ? ` · Île ${voyage.island + 1}` : "";
    let ship = "";
    if (voyage.shipReady) ship = "  ·  ⛵ Navire prêt";
    else if (voyage.shipProgress > 0) ship = `  ·  ⛵ ${Math.floor(voyage.shipProgress * 100)}%`;
    this.clock.textContent =
      `An ${clock.year + 1} · ${SEASON_LABELS[clock.season]} j${clock.dayOfSeason + 1} · ${hours}:${minutes}  ${speed}` +
      `  ·  ${era.icon} ${era.name} · ${era.politics}${island}${ship}`;

    if (performance.now() >= this.flashUntil) {
      this.flashEl.classList.remove("show");
    }
  }
}
