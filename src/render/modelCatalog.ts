/**
 * Catalogue des modèles 3D embarqués (voir public/models/LICENSES.md pour
 * les licences). Pur : aucune dépendance three — testable en Node.
 *
 * `targetHeight` est la hauteur souhaitée EN TUILES : les modèles sources ont
 * des échelles arbitraires, la ModelLibrary les normalise via leur bounding
 * box. `clipHint` sélectionne l'animation d'idle quand le fichier en contient
 * plusieurs (insensible à la casse, prend la première sinon).
 */
export interface ModelDef {
  id: string;
  url: string;
  category: "character" | "animal" | "prop";
  targetHeight: number;
  clipHint?: string;
  /** Créature volante : posée en l'air (tuiles au-dessus du sol) au showcase. */
  flyHeight?: number;
}

export const MODEL_CATALOG: readonly ModelDef[] = [
  // KayKit Adventurers (CC0) — serviront de base aux habitants.
  { id: "villager-barbarian", url: "models/characters/Barbarian.glb", category: "character", targetHeight: 1.4, clipHint: "idle" },
  { id: "villager-knight", url: "models/characters/Knight.glb", category: "character", targetHeight: 1.4, clipHint: "idle" },
  { id: "villager-mage", url: "models/characters/Mage.glb", category: "character", targetHeight: 1.4, clipHint: "idle" },
  { id: "villager-rogue", url: "models/characters/Rogue.glb", category: "character", targetHeight: 1.4, clipHint: "idle" },
  { id: "villager-rogue-hooded", url: "models/characters/Rogue_Hooded.glb", category: "character", targetHeight: 1.4, clipHint: "idle" },
  // (Les habitants du jeu sont désormais des villageois PROCÉDURAUX par ère —
  //  cf. InhabitantsLayer ; plus aucun modèle humain externe pour la population.)
  // Faune (CC0 / CC-BY / Apache-2.0 — voir LICENSES.md).
  { id: "fox", url: "models/animals/Fox.glb", category: "animal", targetHeight: 0.7, clipHint: "survey" },
  { id: "horse", url: "models/animals/Horse.glb", category: "animal", targetHeight: 1.6 },
  { id: "flamingo", url: "models/animals/Flamingo.glb", category: "animal", targetHeight: 0.9, flyHeight: 2.5 },
  { id: "parrot", url: "models/animals/Parrot.glb", category: "animal", targetHeight: 0.5, flyHeight: 2 },
  { id: "stork", url: "models/animals/Stork.glb", category: "animal", targetHeight: 1.1 },
  // Props décoratifs (modèles Tripo fournis, décimés via tools/decimate-model.mjs).
  { id: "tree", url: "models/props/tree.glb", category: "prop", targetHeight: 4 },
  { id: "terrain-diorama", url: "models/props/terrain-diorama.glb", category: "prop", targetHeight: 3 },
  { id: "cloud", url: "models/props/cloud.glb", category: "prop", targetHeight: 3, flyHeight: 3 },
  // Modèles fournis, décimés : volcan (lieu-dit / pouvoir Titan), cristaux
  // (gisement / fontaine magique), surface d'eau stylisée.
  { id: "volcano", url: "models/props/volcano.glb", category: "prop", targetHeight: 6 },
  { id: "crystal", url: "models/props/crystal.glb", category: "prop", targetHeight: 2 },
  { id: "water-surface", url: "models/props/water-surface.glb", category: "prop", targetHeight: 0.6 },
];
