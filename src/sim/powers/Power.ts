import type { Simulation } from "../world/Simulation";

/**
 * Divine powers (see docs/GDD.md §5.2, docs/DIVINE_POWERS.md, docs/TDD.md §4.4).
 * Every power invocation is data (a discriminated union), so intents can be
 * queued on the event bus, costed, validated, saved and replayed.
 *
 * La plupart des pouvoirs ciblent une zone (centre + rayon) ; on factorise ce
 * cas dans `AreaParams`. Le terraforming ajoute une direction (élever/abaisser).
 */
export interface AreaParams {
  /** Brush centre, in world tile coordinates. */
  x: number;
  y: number;
  /** Brush radius in tiles. */
  radius: number;
}

export interface TerraformInvocation extends AreaParams {
  power: "terraform";
  /** +1 raises the terrain, -1 lowers it. */
  direction: 1 | -1;
}

/** Levels the land inside the brush towards the height at its centre. */
export interface FlattenInvocation extends AreaParams {
  power: "flatten";
}

/** Sature les nuages au-dessus de la zone : la pluie suit naturellement. */
export interface RainInvocation extends AreaParams {
  power: "rain";
}

/** Fait verdoyer la végétation vers sa capacité dans un rayon (école Nature). */
export interface GrowthInvocation extends AreaParams {
  power: "growth";
}

/** Soulève une montagne escarpée (Géomancie — Orogenèse). */
export interface OrogenesisInvocation extends AreaParams {
  power: "orogenesis";
}

/** Creuse un bassin/lac (Géomancie — Bassin). */
export interface BasinInvocation extends AreaParams {
  power: "basin";
}

/** Assèche le sol : la flore régresse (Climatomancie — Sécheresse). */
export interface DroughtInvocation extends AreaParams {
  power: "drought";
}

/** Foudre : calcine la flore et décime la faune sur une petite zone (Courroux). */
export interface LightningInvocation extends AreaParams {
  power: "lightning";
}

/** Réveille un volcan : cône de roche + terres brûlées alentour (Courroux). */
export interface VolcanoInvocation extends AreaParams {
  power: "volcano";
}

/** Séisme : bouleverse le relief dans un rayon (Courroux). */
export interface EarthquakeInvocation extends AreaParams {
  power: "earthquake";
}

/** Corne d'Abondance : verdure luxuriante + habitants rassasiés (Grâces). */
export interface AbundanceInvocation extends AreaParams {
  power: "abundance";
}

/** Onction : ravive la ferveur des habitants (Grâces). */
export interface BenedictionInvocation extends AreaParams {
  power: "benediction";
}

/** Appel du Lointain : attire les habitants vers un point (Murmures). */
export interface BeckonInvocation extends AreaParams {
  power: "beckon";
}

/** Appel des Bêtes : fait surgir un troupeau d'herbivores (Bestiaire). */
export interface SpawnHerdInvocation extends AreaParams {
  power: "spawnHerd";
}

/** Manne Céleste : le pain du ciel rassasie les habitants (Grâces — Exode 16). */
export interface MannaInvocation extends AreaParams {
  power: "manna";
}

/** Buisson Ardent : prodige qui embrase la ferveur (Mystères — Exode 3). */
export interface BurningBushInvocation extends AreaParams {
  power: "burningBush";
}

/** Nuée de Sauterelles : dévore toute végétation (Fléaux — Exode 10). */
export interface LocustsInvocation extends AreaParams {
  power: "locusts";
}

/** Peste du Bétail : la faune périt (Fléaux — Exode 9). */
export interface LivestockPlagueInvocation extends AreaParams {
  power: "livestockPlague";
}

/** Grêle de Feu : feu et glace ravagent la zone (Fléaux — Exode 9). */
export interface FireHailInvocation extends AreaParams {
  power: "fireHail";
}

/** Ténèbres : l'effroi éteint la ferveur (Fléaux — Exode 10). */
export interface DarknessInvocation extends AreaParams {
  power: "darkness";
}

/** Déluge : pluie diluvienne, le sol se sature (Fléaux — Genèse 7). */
export interface DelugeInvocation extends AreaParams {
  power: "deluge";
}

/** Union of all power invocations — grows as new powers are added. */
export type PowerInvocation =
  | TerraformInvocation
  | FlattenInvocation
  | RainInvocation
  | GrowthInvocation
  | OrogenesisInvocation
  | BasinInvocation
  | DroughtInvocation
  | LightningInvocation
  | VolcanoInvocation
  | EarthquakeInvocation
  | AbundanceInvocation
  | BenedictionInvocation
  | BeckonInvocation
  | SpawnHerdInvocation
  | MannaInvocation
  | BurningBushInvocation
  | LocustsInvocation
  | LivestockPlagueInvocation
  | FireHailInvocation
  | DarknessInvocation
  | DelugeInvocation;

export type PowerId = PowerInvocation["power"];

export interface Power<P extends PowerInvocation = PowerInvocation> {
  readonly id: P["power"];
  /** Faith cost of this invocation. Pure, deterministic, computed before applying. */
  cost(sim: Simulation, params: P): number;
  /** Apply the effect. Only called after the cost has been paid. */
  apply(sim: Simulation, params: P): void;
}
