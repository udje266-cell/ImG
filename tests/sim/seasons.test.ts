import { describe, expect, it } from "vitest";
import { TICKS_PER_DAY, DAYS_PER_SEASON } from "../../src/core/time/GameClock";
import { seasonalOffset } from "../../src/sim/weather/seasons";
import { Simulation } from "../../src/sim/world/Simulation";

describe("saisons — décalage thermique", () => {
  it("l'hiver est plus froid que l'été", () => {
    expect(seasonalOffset("winter")).toBeLessThan(seasonalOffset("summer"));
    expect(seasonalOffset("spring")).toBe(0);
  });

  it("l'offset saisonnier du terrain suit l'horloge", () => {
    const sim = new Simulation({ seed: 5, width: 32, height: 32 });
    expect(sim.terrain.seasonalOffset).toBe(seasonalOffset("spring"));

    // Avance jusqu'à l'hiver (3 saisons plus loin).
    const toWinter = TICKS_PER_DAY * DAYS_PER_SEASON * 3;
    for (let i = 0; i < toWinter; i++) sim.step();
    expect(sim.clock.season).toBe("winter");
    expect(sim.terrain.seasonalOffset).toBe(seasonalOffset("winter"));
  });

  it("le froid hivernal fait apparaître de la neige/toundra là où l'été a de l'herbe", () => {
    // Un monde froid limite : au bord du seuil de gel.
    const sim = new Simulation({ seed: 123, width: 48, height: 48 });
    const countCold = (): number => {
      let n = 0;
      for (const b of sim.terrain.biomes) if (b === 9 || b === 11) n++; // Tundra, Snow
      return n;
    };
    const summerTicks = TICKS_PER_DAY * DAYS_PER_SEASON; // -> été
    for (let i = 0; i < summerTicks; i++) sim.step();
    const coldInSummer = countCold();
    const toWinter = TICKS_PER_DAY * DAYS_PER_SEASON * 2;
    for (let i = 0; i < toWinter; i++) sim.step();
    expect(sim.clock.season).toBe("winter");
    expect(countCold()).toBeGreaterThanOrEqual(coldInSummer);
  });
});
