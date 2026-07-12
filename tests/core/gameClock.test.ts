import { describe, expect, it } from "vitest";
import {
  DAYS_PER_SEASON,
  GameClock,
  SEASONS,
  TICKS_PER_DAY,
  type ClockTransition,
} from "../../src/core/time/GameClock";

function advanceCollecting(clock: GameClock, ticks: number): ClockTransition[] {
  const all: ClockTransition[] = [];
  for (let i = 0; i < ticks; i++) all.push(...clock.advance());
  return all;
}

describe("GameClock", () => {
  it("starts at tick 0, day 0, spring, year 0", () => {
    const clock = new GameClock();
    expect(clock.tick).toBe(0);
    expect(clock.day).toBe(0);
    expect(clock.season).toBe("spring");
    expect(clock.year).toBe(0);
    expect(clock.timeOfDay).toBe(0);
  });

  it("emits no transition within a day, then dayStarted at day boundary", () => {
    const clock = new GameClock();
    expect(advanceCollecting(clock, TICKS_PER_DAY - 1)).toEqual([]);
    expect(clock.advance()).toEqual([{ kind: "dayStarted", day: 1 }]);
  });

  it("changes season after DAYS_PER_SEASON days", () => {
    const clock = new GameClock();
    const transitions = advanceCollecting(clock, TICKS_PER_DAY * DAYS_PER_SEASON);
    const seasonChanges = transitions.filter((t) => t.kind === "seasonChanged");
    expect(seasonChanges).toEqual([{ kind: "seasonChanged", season: "summer", year: 0 }]);
    expect(clock.season).toBe("summer");
    expect(clock.dayOfSeason).toBe(0);
  });

  it("cycles through all four seasons and starts a new year", () => {
    const clock = new GameClock();
    const oneYear = TICKS_PER_DAY * DAYS_PER_SEASON * SEASONS.length;
    const transitions = advanceCollecting(clock, oneYear);
    const seasons = transitions.filter((t) => t.kind === "seasonChanged").map((t) => t.season);
    expect(seasons).toEqual(["summer", "autumn", "winter", "spring"]);
    expect(transitions.filter((t) => t.kind === "yearStarted")).toEqual([{ kind: "yearStarted", year: 1 }]);
    expect(clock.year).toBe(1);
  });

  it("daylight peaks at noon and bottoms at midnight", () => {
    const clock = new GameClock();
    expect(clock.daylight).toBeCloseTo(0, 5); // midnight
    clock.tick = TICKS_PER_DAY / 2;
    expect(clock.daylight).toBeCloseTo(1, 5); // noon
    clock.tick = TICKS_PER_DAY / 4;
    expect(clock.daylight).toBeCloseTo(0.5, 5); // sunrise
  });
});
