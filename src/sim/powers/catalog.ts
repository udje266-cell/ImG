import type { PowerId } from "./Power";
import { POWER_UNLOCK_THRESHOLDS } from "./ProgressionSystem";

/**
 * Catalogue des pouvoirs divins (docs/DIVINE_POWERS.md) — source unique de
 * vérité pour le **grimoire** (l'onglet dédié de l'UI). Chaque entrée décrit un
 * pouvoir : école, palier, icône, coût de déblocage et — s'il est jouable —
 * l'`power`/`direction` que l'UI enverra en intention. Les entrées `power:null`
 * sont annoncées comme « à venir » (phases ultérieures), pour que le grimoire
 * reflète les 9 écoles du GDD sans simuler d'effet factice.
 */
export type School =
  | "geomancie"
  | "climatomancie"
  | "courroux"
  | "graces"
  | "murmures"
  | "edifications"
  | "mysteres"
  | "bestiaire"
  | "apotheose";

/** Écoles dans l'ordre d'affichage, avec leur libellé et emblème. */
export const SCHOOLS: ReadonlyArray<{ id: School; label: string; icon: string }> = [
  { id: "geomancie", label: "Géomancie", icon: "⛰️" },
  { id: "climatomancie", label: "Climatomancie", icon: "🌦️" },
  { id: "graces", label: "Grâces", icon: "🌾" },
  { id: "murmures", label: "Murmures", icon: "🧭" },
  { id: "bestiaire", label: "Bestiaire", icon: "🦌" },
  { id: "courroux", label: "Courroux", icon: "⚡" },
  { id: "edifications", label: "Édifications", icon: "🏛️" },
  { id: "mysteres", label: "Mystères", icon: "🔮" },
  { id: "apotheose", label: "Apothéose", icon: "🌟" },
];

export interface PowerMeta {
  /** Clé unique de catalogue (peut différer du PowerId — cf. raise/lower). */
  key: string;
  name: string;
  school: School;
  tier: 1 | 2 | 3 | 4 | 5;
  icon: string;
  desc: string;
  /** Seuil de dévotion (déblocage). */
  unlock: number;
  /** Pouvoir de simulation invoqué, ou null si « à venir ». */
  power: PowerId | null;
  /** Sens du terraforming pour les entrées basées dessus. */
  direction?: 1 | -1;
}

const u = POWER_UNLOCK_THRESHOLDS;

export const POWER_CATALOG: readonly PowerMeta[] = [
  // — Géomancie —
  { key: "raise", name: "Soulèvement", school: "geomancie", tier: 1, icon: "⛰️", unlock: u.terraform, power: "terraform", direction: 1, desc: "Élève la terre sous un pinceau doux." },
  { key: "lower", name: "Affaissement", school: "geomancie", tier: 1, icon: "🕳️", unlock: u.terraform, power: "terraform", direction: -1, desc: "Abaisse la terre ; sous la mer, l'eau afflue." },
  { key: "flatten", name: "Aplanir", school: "geomancie", tier: 2, icon: "▦", unlock: u.flatten, power: "flatten", desc: "Nivelle le sol vers la hauteur du centre — des plateaux pour bâtir." },
  { key: "orogenesis", name: "Orogenèse", school: "geomancie", tier: 3, icon: "🏔️", unlock: u.orogenesis, power: "orogenesis", desc: "Fait surgir une montagne escarpée ; la neige coiffe les cimes." },
  { key: "basin", name: "Bassin", school: "geomancie", tier: 3, icon: "🌊", unlock: u.basin, power: "basin", desc: "Creuse une cuvette ; un lac ou une baie peut y naître." },

  // — Climatomancie —
  { key: "growth", name: "Verdoiement", school: "climatomancie", tier: 2, icon: "🌱", unlock: u.growth, power: "growth", desc: "La végétation jaillit vers la capacité écologique de la zone." },
  { key: "rain", name: "Ondée", school: "climatomancie", tier: 2, icon: "🌧️", unlock: u.rain, power: "rain", desc: "Sature les nuages ; la pluie et le verdissement suivent." },
  { key: "drought", name: "Sécheresse", school: "climatomancie", tier: 3, icon: "🏜️", unlock: u.drought, power: "drought", desc: "Assèche le sol ; la flore régresse faute d'eau." },
  { key: "seasons", name: "Roue des Saisons", school: "climatomancie", tier: 4, icon: "🔄", unlock: 999, power: null, desc: "Fait basculer la saison localement. (À venir.)" },

  // — Grâces —
  { key: "benediction", name: "Onction", school: "graces", tier: 2, icon: "✨", unlock: u.benediction, power: "benediction", desc: "Ravive la ferveur des habitants — la Foi afflue." },
  { key: "abundance", name: "Corne d'Abondance", school: "graces", tier: 3, icon: "🌾", unlock: u.abundance, power: "abundance", desc: "Verdure luxuriante et habitants rassasiés dans la zone." },

  // — Murmures —
  { key: "beckon", name: "Appel du Lointain", school: "murmures", tier: 2, icon: "🧭", unlock: u.beckon, power: "beckon", desc: "Attire les habitants vers un point, sans les contraindre." },

  // — Bestiaire —
  { key: "spawnHerd", name: "Appel des Bêtes", school: "bestiaire", tier: 3, icon: "🦌", unlock: u.spawnHerd, power: "spawnHerd", desc: "Un troupeau d'herbivores surgit autour du point visé." },
  { key: "totem", name: "Bête Totem", school: "bestiaire", tier: 4, icon: "🐗", unlock: 999, power: null, desc: "Invoque une créature gardienne. (À venir.)" },

  // — Courroux —
  { key: "lightning", name: "Foudre", school: "courroux", tier: 3, icon: "⚡", unlock: u.lightning, power: "lightning", desc: "Un éclair calcine la flore et décime la faune d'un point." },
  { key: "earthquake", name: "Séisme", school: "courroux", tier: 4, icon: "💥", unlock: u.earthquake, power: "earthquake", desc: "Le relief se convulse et se ravine dans un rayon." },
  { key: "volcano", name: "Réveil du Titan", school: "courroux", tier: 5, icon: "🌋", unlock: u.volcano, power: "volcano", desc: "Un cône volcanique jaillit ; tout brûle alentour." },
  { key: "meteor", name: "Larme du Ciel", school: "courroux", tier: 5, icon: "☄️", unlock: 999, power: null, desc: "Une météorite s'abat en cratère. (À venir.)" },

  // — Édifications —
  { key: "temple", name: "Sanctuaire", school: "edifications", tier: 3, icon: "🏛️", unlock: 999, power: null, desc: "Érige un temple qui rayonne la foi. (À venir.)" },
  { key: "bridge", name: "Pont de Pierre", school: "edifications", tier: 2, icon: "🌉", unlock: 999, power: null, desc: "Jette un pont entre deux rives. (À venir.)" },

  // — Mystères —
  { key: "prophecy", name: "Vision Prophétique", school: "mysteres", tier: 3, icon: "👁️", unlock: 999, power: null, desc: "Révèle l'avenir proche d'un peuple. (À venir.)" },
  { key: "awakening", name: "Éveil Spirituel", school: "mysteres", tier: 4, icon: "🕯️", unlock: 999, power: null, desc: "Fait éclore une nouvelle croyance. (À venir.)" },

  // — Apothéose —
  { key: "apotheosis", name: "Apothéose", school: "apotheose", tier: 5, icon: "🌟", unlock: 999, power: null, desc: "Élève un mortel au rang de demi-dieu. (À venir.)" },
  { key: "judgment", name: "Jugement Dernier", school: "apotheose", tier: 5, icon: "⚖️", unlock: 999, power: null, desc: "Scelle le destin du monde. (À venir.)" },
];
