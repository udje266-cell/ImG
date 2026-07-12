/**
 * Simulation calendar: ticks are the single source of truth; day/night,
 * seasons and years are all derived (see docs/TDD.md §4.3).
 *
 * The clock is bus-agnostic: `advance()` returns the calendar transitions
 * that occurred, and the owner (Simulation) publishes them as events.
 */
export const SIM_DT_MS = 100; // simulated milliseconds of real time per tick at speed x1
export const TICKS_PER_DAY = 240; // 24 s per in-game day at speed x1
export const DAYS_PER_SEASON = 12;
export const SEASONS = ["spring", "summer", "autumn", "winter"] as const;
export type Season = (typeof SEASONS)[number];
export const DAYS_PER_YEAR = DAYS_PER_SEASON * SEASONS.length;

export type ClockTransition =
  | { kind: "dayStarted"; day: number }
  | { kind: "seasonChanged"; season: Season; year: number }
  | { kind: "yearStarted"; year: number };

export class GameClock {
  tick = 0;

  /** Fraction of the current day in [0, 1): 0 = midnight, 0.5 = noon. */
  get timeOfDay(): number {
    return (this.tick % TICKS_PER_DAY) / TICKS_PER_DAY;
  }

  /** Absolute day count since world creation. */
  get day(): number {
    return Math.floor(this.tick / TICKS_PER_DAY);
  }

  /** Day within the current season, starting at 0. */
  get dayOfSeason(): number {
    return this.day % DAYS_PER_SEASON;
  }

  get season(): Season {
    const index = Math.floor(this.day / DAYS_PER_SEASON) % SEASONS.length;
    return SEASONS[index]!;
  }

  get year(): number {
    return Math.floor(this.day / DAYS_PER_YEAR);
  }

  /** Sunlight factor in [0, 1]: 0 at midnight, 1 at noon (cosine curve). */
  get daylight(): number {
    return 0.5 - 0.5 * Math.cos(this.timeOfDay * 2 * Math.PI);
  }

  /** Advance one tick and report any calendar transitions that occurred. */
  advance(): ClockTransition[] {
    const previousDay = this.day;
    const previousSeason = this.season;
    const previousYear = this.year;
    this.tick++;

    if (this.day === previousDay) return [];
    const transitions: ClockTransition[] = [{ kind: "dayStarted", day: this.day }];
    if (this.season !== previousSeason) {
      transitions.push({ kind: "seasonChanged", season: this.season, year: this.year });
    }
    if (this.year !== previousYear) {
      transitions.push({ kind: "yearStarted", year: this.year });
    }
    return transitions;
  }
}
