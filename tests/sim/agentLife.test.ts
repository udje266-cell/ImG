import { describe, expect, it } from "vitest";
import { Rng } from "../../src/core/math/Rng";
import { EventBus } from "../../src/core/events/EventBus";
import type { GameEvents } from "../../src/sim/events";
import { AgentSystem, PROFESSION_LABEL, type Profession } from "../../src/sim/agents/AgentSystem";
import { FloraSystem } from "../../src/sim/ecology/FloraSystem";
import { TerrainGrid } from "../../src/sim/terrain/TerrainGrid";
import { Biome } from "../../src/sim/worldgen/biomes";
import { loadSimulation, serializeSimulation } from "../../src/sim/save/save";
import { Simulation } from "../../src/sim/world/Simulation";

function greenGrid(): TerrainGrid {
  const g = new TerrainGrid(48, 48, 0.5);
  g.heightMap.fill(0.6);
  g.baseTemperature.fill(0.6);
  g.moisture.fill(0.6);
  g.baselineMoisture.fill(0.6);
  g.biomes.fill(Biome.Grassland);
  return g;
}

function makeAgents(bus = new EventBus<GameEvents>()): { agents: AgentSystem; bus: EventBus<GameEvents> } {
  const g = greenGrid();
  const rng = new Rng(42);
  const flora = new FloraSystem(g, rng);
  for (let i = 0; i < 40; i++) flora.update();
  return { agents: new AgentSystem(g, flora, rng, bus), bus };
}

const labelToProfession = (label: string): Profession =>
  (Object.keys(PROFESSION_LABEL) as Profession[]).find((p) => PROFESSION_LABEL[p] === label)!;

describe("AgentSystem — IA vivante (cahier des charges §8)", () => {
  it("chaque habitant a une personnalité à plusieurs traits, dans [0,1]", () => {
    const { agents } = makeAgents();
    agents.populate(30);
    for (let i = 0; i < agents.count; i++) {
      const t = agents.profile(i).traits;
      for (const v of [t.piety, t.courage, t.curiosity, t.sociability]) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      }
    }
  });

  it("la personnalité est déterministe pour une même graine", () => {
    const traits = (): number[] => {
      const { agents } = makeAgents();
      agents.populate(15);
      return agents.count > 0 ? Object.values(agents.profile(3).traits) : [];
    };
    expect(traits()).toEqual(traits());
  });

  it("les professions sont cohérentes avec l'ère et évoluent avec elle", () => {
    const bus = new EventBus<GameEvents>();
    const { agents } = makeAgents(bus);
    agents.populate(40);
    const stoneJobs = new Set(["Chasseur-cueilleur", "Prêtre"]);
    for (let i = 0; i < agents.count; i++) {
      expect(stoneJobs.has(agents.profile(i).profession)).toBe(true);
    }

    // Le peuple entre dans l'âge du fer : de nouveaux métiers apparaissent.
    bus.emit("era:advanced", { era: 2, name: "Âge du Fer", politics: "Royaume" });
    const ironJobs = new Set(["Fermier", "Forgeron", "Prêtre", "Marchand", "Guerrier"]);
    let sawNewJob = false;
    for (let i = 0; i < agents.count; i++) {
      const job = agents.profile(i).profession;
      expect(ironJobs.has(job)).toBe(true);
      if (!stoneJobs.has(job)) sawNewJob = true;
    }
    expect(sawNewJob).toBe(true); // au moins un métier n'existait pas à l'âge de pierre
  });

  it("une bénédiction emplit de joie ; un fléau de peur — les émotions s'estompent", () => {
    const { agents } = makeAgents();
    agents.populate(20);

    agents.bless(24, 24, 100, 0.5, 1);
    expect(agents.profile(0).emotions.joy).toBeGreaterThan(0.2);

    agents.terrify(24, 24, 100, 1);
    const p = agents.profile(0);
    expect(p.emotions.fear).toBeGreaterThan(0.3);
    expect(p.emotions.anger).toBeGreaterThan(0);

    const fearBefore = agents.profile(0).emotions.fear;
    for (let i = 0; i < 300; i++) agents.update(i);
    expect(agents.profile(0).emotions.fear).toBeLessThan(fearBefore); // décroissance
  });

  it("l'émotion dominante bascule de « Serein » à une émotion forte", () => {
    const { agents } = makeAgents();
    agents.populate(5);
    expect(agents.profile(0).dominantEmotion).toBe("Serein");
    agents.terrify(24, 24, 100, 1);
    expect(agents.profile(0).dominantEmotion).toBe("Peur");
  });

  it("populate marie les habitants par couples", () => {
    const { agents } = makeAgents();
    agents.populate(6);
    expect(agents.profile(0).spouse).toBe(1);
    expect(agents.profile(1).spouse).toBe(0);
    expect(agents.profile(2).spouse).toBe(3);
  });

  it("la Genèse marie les Deux Premiers ; leur descendance connaît ses parents", () => {
    const sim = new Simulation({ seed: 11, width: 48, height: 48 });
    sim.genesis();
    expect(sim.agents.profile(0).spouse).toBe(1);
    expect(sim.agents.profile(1).spouse).toBe(0);

    // Entretient le couple pour provoquer des naissances, puis vérifie la filiation.
    for (let i = 0; i < 4000; i++) {
      if (i % 100 === 0) sim.agents.bless(sim.agents.profile(0).index, 0, 999, 1, 0);
      sim.step();
    }
    expect(sim.agents.count).toBeGreaterThan(2); // il y a eu des naissances
    let childWithParents = -1;
    for (let i = 2; i < sim.agents.count; i++) {
      if (sim.agents.profile(i).parents[0] >= 0) {
        childWithParents = i;
        break;
      }
    }
    expect(childWithParents).toBeGreaterThan(-1);
    const parent = sim.agents.profile(childWithParents).parents[0];
    expect(sim.agents.profile(parent).children).toBeGreaterThan(0);
  });

  it("le profil expose profession, traits, émotions, famille et objectif", () => {
    const { agents } = makeAgents();
    agents.populate(4);
    const p = agents.profile(0);
    expect(typeof p.profession).toBe("string");
    expect(labelToProfession(p.profession)).toBeDefined();
    expect(p.parents).toHaveLength(2);
    expect(["forage", "rest", "wander", "worship", "work"]).toContain(p.goal);
  });

  it("l'IA vivante survit au cycle sauvegarde/chargement (traits, métiers, famille)", () => {
    const sim = new Simulation({ seed: 9, width: 48, height: 48 });
    sim.agents.populate(20);
    sim.era.restore({ knowledge: 2500, era: 2 });
    for (let i = 0; i < 300; i++) sim.step();

    const before = sim.agents.profile(5);
    const reloaded = loadSimulation(JSON.parse(JSON.stringify(serializeSimulation(sim))));
    const after = reloaded.agents.profile(5);

    expect(reloaded.agents.count).toBe(sim.agents.count);
    expect(after.traits).toEqual(before.traits);
    expect(after.profession).toBe(before.profession);
    expect(after.spouse).toBe(before.spouse);
    expect(after.emotions).toEqual(before.emotions);
  });
});
