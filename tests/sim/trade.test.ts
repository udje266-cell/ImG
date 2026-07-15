import { describe, expect, it } from "vitest";
import { Rng } from "../../src/core/math/Rng";
import { EventBus } from "../../src/core/events/EventBus";
import type { GameEvents } from "../../src/sim/events";
import { AgentSystem } from "../../src/sim/agents/AgentSystem";
import { FloraSystem } from "../../src/sim/ecology/FloraSystem";
import { TerrainGrid } from "../../src/sim/terrain/TerrainGrid";
import { Biome } from "../../src/sim/worldgen/biomes";
import type { SettlementSystem } from "../../src/sim/society/SettlementSystem";
import type { WarSystem } from "../../src/sim/society/WarSystem";
import { TradeSystem } from "../../src/sim/society/TradeSystem";

function greenGrid(): TerrainGrid {
  const g = new TerrainGrid(64, 64, 0.5);
  g.heightMap.fill(0.6);
  g.baseTemperature.fill(0.6);
  g.moisture.fill(0.6);
  g.baselineMoisture.fill(0.6);
  g.biomes.fill(Biome.Grassland);
  return g;
}

const peaceWar = { tensionBetween: () => 0 } as unknown as WarSystem;
const totalWar = { tensionBetween: () => 1 } as unknown as WarSystem;

function setup(bx: number, war: WarSystem): { agents: AgentSystem; bus: EventBus<GameEvents>; trade: TradeSystem } {
  const g = greenGrid();
  const rng = new Rng(42);
  const bus = new EventBus<GameEvents>();
  const agents = new AgentSystem(g, new FloraSystem(g, rng), rng, bus);
  for (let i = 0; i < 12; i++) agents.spawn(10 + (i % 4) * 0.3, 10 + Math.floor(i / 4) * 0.3);
  for (let i = 0; i < 12; i++) agents.spawn(bx + (i % 4) * 0.3, 10 + Math.floor(i / 4) * 0.3);
  const settlements = {
    villages: [
      { x: 10, y: 10, population: 12, huts: 0 },
      { x: bx, y: 10, population: 12, huts: 0 },
    ],
  } as unknown as SettlementSystem;
  return { agents, bus, trade: new TradeSystem(settlements, agents, war, bus) };
}

describe("TradeSystem — commerce entre villages (cahier des charges §5)", () => {
  it("deux villages voisins en paix ouvrent une route et prospèrent", () => {
    const { bus, trade } = setup(30, peaceWar);
    let established = 0;
    bus.on("trade:established", () => established++);

    const favor = trade.update();
    expect(established).toBe(1); // la route s'ouvre une fois
    expect(trade.activeRoutes).toBe(1);
    expect(favor).toBeGreaterThan(0); // prospérité → faveur de Foi
    expect(trade.prosperityOf(0)).toBeGreaterThan(0);
    expect(trade.prosperityOf(1)).toBeGreaterThan(0);
  });

  it("le commerce ravitaille les habitants (contentement en hausse)", () => {
    const { agents, trade } = setup(30, peaceWar);
    for (let i = 0; i < 10; i++) trade.update();
    expect(agents.profile(0).emotions.joy).toBeGreaterThan(0);
  });

  it("la guerre coupe le commerce", () => {
    const { bus, trade } = setup(30, totalWar);
    let established = 0;
    bus.on("trade:established", () => established++);
    const favor = trade.update();
    expect(established).toBe(0);
    expect(trade.activeRoutes).toBe(0);
    expect(favor).toBe(0);
  });

  it("des villages trop éloignés ne commercent pas", () => {
    const { trade } = setup(60, peaceWar); // 50 tuiles > portée (36)
    const favor = trade.update();
    expect(trade.activeRoutes).toBe(0);
    expect(favor).toBe(0);
  });

  it("s'intègre à la Simulation sans casser la Foi", async () => {
    const { Simulation } = await import("../../src/sim/world/Simulation");
    const sim = new Simulation({ seed: 4, width: 48, height: 48 });
    expect(sim.trade.totalProsperity).toBe(0);
    for (let i = 0; i < 50; i++) sim.step();
    expect(Number.isFinite(sim.faith.current)).toBe(true);
  });
});
