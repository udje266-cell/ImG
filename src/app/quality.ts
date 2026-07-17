/**
 * Qualité graphique (réglable — cahier des charges §11, « Android d'abord »).
 *
 * Trois **paliers** pilotent le coût du rendu ; un quatrième choix, « Auto »,
 * les devine selon l'appareil. Le palier module l'anticrénelage, le bloom, les
 * ombres, la résolution et la densité de faune (cf. `SceneRenderer` et `main`).
 * Le choix est persisté ; le modifier recharge la partie (l'anticrénelage est
 * figé à la création du contexte WebGL, un rechargement est le plus sûr).
 */
import type { QualityChoice, QualityLevel } from "../render/quality";
export type { QualityChoice, QualityLevel } from "../render/quality";

const KEY = "img:quality";

/** Appareil modeste (mobile / GPU faible) → palier bas conseillé. */
export function detectLowSpec(): boolean {
  const coarse = window.matchMedia?.("(pointer: coarse)")?.matches ?? false;
  const mobileUA = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
  const fewCores = (navigator.hardwareConcurrency ?? 8) <= 4;
  const lowMem = ((navigator as unknown as { deviceMemory?: number }).deviceMemory ?? 8) <= 4;
  return coarse || mobileUA || fewCores || lowMem;
}

/** Choix mémorisé (défaut « Auto »). */
export function loadQualityChoice(): QualityChoice {
  const v = window.localStorage.getItem(KEY);
  return v === "low" || v === "medium" || v === "high" || v === "auto" ? v : "auto";
}

export function saveQualityChoice(choice: QualityChoice): void {
  window.localStorage.setItem(KEY, choice);
}

/** Résout un choix en palier concret (« Auto » → bas si appareil modeste, sinon haut). */
export function resolveQuality(choice: QualityChoice): QualityLevel {
  if (choice === "auto") return detectLowSpec() ? "low" : "high";
  return choice;
}
