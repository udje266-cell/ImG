import type { Simulation } from "../world/Simulation";
import { areaCost, forEachDisc, hash01 } from "./brush";
import type {
  DarknessInvocation,
  DelugeInvocation,
  FireHailInvocation,
  LivestockPlagueInvocation,
  LocustsInvocation,
  Power,
} from "./Power";

/**
 * École des Fléaux (docs/DIVINE_POWERS.md) — châtiments inspirés de la Sainte
 * Bible : les plaies d'Égypte (Exode 7–12) et le Déluge (Genèse 7). Chaque
 * fléau écrit dans les variables partagées de la simulation (flore, faune,
 * ferveur, humidité) — les conséquences émergent, rien n'est scripté. Les
 * témoins en font des récits de Crainte : régner par les fléaux fait naître
 * des cultes de la peur (ReligionSystem).
 */

/**
 * Nuée de Sauterelles (Exode 10:14-15 — « elles dévorèrent toute l'herbe de
 * la terre ») : toute végétation du disque est dévorée. Famine à suivre pour
 * qui en dépendait — herbivores comme habitants.
 */
export class LocustsPower implements Power<LocustsInvocation> {
  readonly id = "locusts" as const;

  cost(_sim: Simulation, params: LocustsInvocation): number {
    return areaCost(110, 9, params);
  }

  apply(sim: Simulation, params: LocustsInvocation): void {
    sim.flora.scorch(params.x, params.y, params.radius * 1.3);
    sim.bus.emit("flora:updated", {});
  }
}

/**
 * Peste du Bétail (Exode 9:3-6 — « tout le bétail des Égyptiens mourut ») :
 * la faune du disque périt. Les prédateurs perdent leurs proies, les
 * chasseurs leur gibier.
 */
export class LivestockPlaguePower implements Power<LivestockPlagueInvocation> {
  readonly id = "livestockPlague" as const;

  cost(_sim: Simulation, params: LivestockPlagueInvocation): number {
    return areaCost(100, 8, params);
  }

  apply(sim: Simulation, params: LivestockPlagueInvocation): void {
    sim.fauna.cull(params.x, params.y, params.radius);
  }
}

/**
 * Grêle de Feu (Exode 9:23-25 — « il tomba de la grêle, et le feu se mêlait
 * à la grêle ») : la végétation brûle, la faune périt, la terre est criblée
 * d'impacts et les survivants tremblent.
 */
export class FireHailPower implements Power<FireHailInvocation> {
  readonly id = "fireHail" as const;

  cost(_sim: Simulation, params: FireHailInvocation): number {
    return areaCost(160, 12, params);
  }

  apply(sim: Simulation, params: FireHailInvocation): void {
    const { x, y, radius } = params;
    sim.flora.scorch(x, y, radius * 0.9);
    sim.fauna.cull(x, y, radius * 0.8);
    // Impacts de grêlons géants : petits cratères épars (déterministes).
    forEachDisc(sim.terrain, x, y, radius, (tx, ty, f) => {
      if (hash01(tx * 3.7 + x, ty * 5.1 + y) > 0.88) {
        sim.terrain.modifyHeight(tx, ty, -0.012 * f);
      }
    });
    sim.agents.terrify(x, y, radius, 0.15);
    sim.bus.emit("flora:updated", {});
  }
}

/**
 * Ténèbres (Exode 10:22-23 — « il y eut d'épaisses ténèbres… on ne se voyait
 * pas l'un l'autre ») : l'effroi éteint la ferveur des habitants du disque.
 * Le revenu de Foi s'effondre — mais le récit nourrit le culte de la Crainte.
 */
export class DarknessPower implements Power<DarknessInvocation> {
  readonly id = "darkness" as const;

  cost(_sim: Simulation, params: DarknessInvocation): number {
    return areaCost(120, 10, params);
  }

  apply(sim: Simulation, params: DarknessInvocation): void {
    sim.agents.terrify(params.x, params.y, params.radius, 0.6);
  }
}

/**
 * Déluge (Genèse 7:11-12 — « les écluses des cieux s'ouvrirent, et la pluie
 * tomba sur la terre ») : les nuages saturent sur une vaste région et le sol
 * s'engorge d'eau. La pluie torrentielle qui suit est le comportement normal
 * de la météo — le miracle ouvre les écluses, la nature fait le reste.
 */
export class DelugePower implements Power<DelugeInvocation> {
  readonly id = "deluge" as const;

  cost(_sim: Simulation, params: DelugeInvocation): number {
    return areaCost(300, 18, params);
  }

  apply(sim: Simulation, params: DelugeInvocation): void {
    const { x, y, radius } = params;
    sim.weather.seedClouds(x, y, radius * 2);
    forEachDisc(sim.terrain, x, y, Math.round(radius * 1.5), (tx, ty, f) => {
      const cur = sim.terrain.moisture[sim.terrain.index(tx, ty)]!;
      sim.terrain.setMoisture(tx, ty, Math.max(cur, 0.6 + 0.4 * f));
    });
  }
}
