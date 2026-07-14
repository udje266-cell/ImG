import { describe, expect, it } from "vitest";
import { Simulation } from "../../src/sim/world/Simulation";
import { POWER_CATALOG } from "../../src/sim/powers/catalog";
import { POWER_UNLOCK_THRESHOLDS } from "../../src/sim/powers/ProgressionSystem";
import type { PowerId } from "../../src/sim/powers/Power";
import { HERBIVORE } from "../../src/sim/ecology/FaunaSystem";

/** Simulation avec tous les pouvoirs débloqués et de la Foi à revendre. */
function godSim(): Simulation {
  const sim = new Simulation({ seed: 42, width: 64, height: 64 });
  sim.progression.addDevotion(5000); // franchit tous les seuils
  sim.faith.add(1_000_000);
  return sim;
}

function cast(sim: Simulation, power: PowerId, x: number, y: number, radius: number): void {
  sim.bus.emit("intent:invokePower", { power, x, y, radius } as never);
  sim.step();
}

/** Première tuile de terre ferme trouvée (les pouvoirs de faune y opèrent). */
function landTile(sim: Simulation): { x: number; y: number } {
  for (let y = 4; y < sim.terrain.height - 4; y++)
    for (let x = 4; x < sim.terrain.width - 4; x++)
      if (!sim.terrain.isWater(x, y)) return { x, y };
  return { x: 32, y: 32 };
}

describe("Catalogue des pouvoirs (grimoire) — cohérence", () => {
  it("expose chaque PowerId simulé et aligne les seuils de déblocage", () => {
    for (const meta of POWER_CATALOG) {
      if (meta.power === null) continue;
      expect(POWER_UNLOCK_THRESHOLDS[meta.power]).toBe(meta.unlock);
    }
    // Tout PowerId a au moins une entrée de catalogue.
    const covered = new Set(POWER_CATALOG.filter((m) => m.power).map((m) => m.power));
    for (const id of Object.keys(POWER_UNLOCK_THRESHOLDS) as PowerId[]) {
      expect(covered.has(id)).toBe(true);
    }
  });

  it("n'invoque jamais un pouvoir inconnu quand tous sont débloqués", () => {
    const sim = godSim();
    const rejects: string[] = [];
    sim.bus.on("power:rejected", (e) => rejects.push(e.reason));
    for (const meta of POWER_CATALOG) {
      if (!meta.power) continue;
      // Construit l'intention comme le fait l'InputController (direction pour le terraforming).
      const inv =
        meta.power === "terraform"
          ? { power: "terraform", x: 20, y: 20, radius: 4, direction: meta.direction ?? 1 }
          : { power: meta.power, x: 20, y: 20, radius: 4 };
      sim.bus.emit("intent:invokePower", inv as never);
    }
    sim.step();
    expect(rejects).not.toContain("unknown-power");
    expect(rejects).not.toContain("locked");
  });
});

describe("Effets des pouvoirs (écriture sur variables partagées)", () => {
  it("Orogenèse élève le relief, Bassin l'abaisse", () => {
    const sim = godSim();
    const h0 = sim.terrain.heightAt(20, 20);
    cast(sim, "orogenesis", 20, 20, 5);
    expect(sim.terrain.heightAt(20, 20)).toBeGreaterThan(h0);

    const h1 = sim.terrain.heightAt(44, 44);
    cast(sim, "basin", 44, 44, 5);
    expect(sim.terrain.heightAt(44, 44)).toBeLessThan(h1);
  });

  it("Sécheresse assèche le sol", () => {
    const sim = godSim();
    const i = sim.terrain.index(30, 30);
    sim.terrain.setMoisture(30, 30, 0.8);
    cast(sim, "drought", 30, 30, 4);
    expect(sim.terrain.moisture[i]!).toBeLessThan(0.8);
  });

  it("Foudre calcine la flore et décime la faune d'un point", () => {
    const sim = godSim();
    sim.flora.setDensity(32, 32, 0.9);
    for (let k = 0; k < 6; k++) sim.fauna.spawn(HERBIVORE, 32 + 0.3 * k, 32);
    const faunaBefore = sim.fauna.count;
    cast(sim, "lightning", 32, 32, 2);
    expect(sim.flora.densityAt(32, 32)).toBe(0);
    expect(sim.fauna.count).toBeLessThan(faunaBefore);
  });

  it("Réveil du Titan soulève un cône et brûle la végétation alentour", () => {
    const sim = godSim();
    sim.flora.setDensity(16, 16, 0.8);
    const h0 = sim.terrain.heightAt(16, 16);
    cast(sim, "volcano", 16, 16, 4);
    expect(sim.terrain.heightAt(16, 16)).toBeGreaterThan(h0);
    expect(sim.flora.densityAt(16, 16)).toBe(0);
  });

  it("Séisme modifie le relief dans la zone", () => {
    const sim = godSim();
    const before = [sim.terrain.heightAt(40, 40), sim.terrain.heightAt(41, 40), sim.terrain.heightAt(40, 41)];
    cast(sim, "earthquake", 40, 40, 5);
    const after = [sim.terrain.heightAt(40, 40), sim.terrain.heightAt(41, 40), sim.terrain.heightAt(40, 41)];
    expect(after).not.toEqual(before);
  });

  it("Appel des Bêtes fait apparaître un troupeau", () => {
    const sim = godSim();
    const { x, y } = landTile(sim);
    const before = sim.fauna.count;
    cast(sim, "spawnHerd", x, y, 6);
    expect(sim.fauna.count).toBeGreaterThan(before);
  });

  it("Corne d'Abondance verdit et rassasie les habitants", () => {
    const sim = godSim();
    // Cible une tuile végétalisée (capacité écologique > 0), pas encore saturée.
    let tx = 32;
    let ty = 32;
    let best = 0;
    for (let y = 4; y < 60; y++)
      for (let x = 4; x < 60; x++) {
        const d = sim.flora.densityAt(x, y);
        if (d > 0.02 && d < 0.6 && d > best) {
          best = d;
          tx = x;
          ty = y;
        }
      }
    for (let k = 0; k < 8; k++) sim.agents.spawn(tx + k * 0.2, ty);
    const flora0 = sim.flora.densityAt(tx, ty);
    cast(sim, "abundance", tx, ty, 8);
    expect(sim.flora.densityAt(tx, ty)).toBeGreaterThan(flora0);
  });

  it("Onction ravive la ferveur — le revenu de Foi augmente", () => {
    const sim = godSim();
    for (let k = 0; k < 10; k++) sim.agents.spawn(32 + k * 0.1, 32);
    const income0 = sim.agents.faithIncome();
    cast(sim, "benediction", 32, 32, 6);
    expect(sim.agents.faithIncome()).toBeGreaterThan(income0);
  });

  it("Appel du Lointain rassemble les habitants vers un point", () => {
    const sim = godSim();
    for (let k = 0; k < 12; k++) sim.agents.spawn(32 + Math.cos(k) * 8, 32 + Math.sin(k) * 8);
    const spread = (): number => {
      const s = sim.agents.snapshot();
      let max = 0;
      for (let i = 0; i < s.count; i++) max = Math.max(max, Math.hypot(s.x[i]! - 32, s.y[i]! - 32));
      return max;
    };
    const before = spread();
    sim.bus.emit("intent:invokePower", { power: "beckon", x: 32, y: 32, radius: 15 });
    for (let i = 0; i < 200; i++) sim.step();
    expect(spread()).toBeLessThan(before);
  });
});
