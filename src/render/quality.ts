/**
 * Paliers de qualité graphique — types purs, partagés par le rendu
 * (`SceneRenderer`), l'UI (`Settings`) et l'app (`quality` helpers). Aucune
 * dépendance : garde la couche `render` en dessous de `ui`/`app`.
 */
export type QualityLevel = "low" | "medium" | "high";
export type QualityChoice = "auto" | QualityLevel;
