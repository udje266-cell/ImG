# ADR 0001 — Choix du stack : TypeScript + Web, simulation découplée du rendu

**Statut** : accepté · **Date** : 2026-07-12

## Contexte
ImG est un god game systémique visant des milliers d'entités simulées, avec une exigence forte de séparation logique métier / rendu / interface, de déterminisme et de testabilité. Candidats : Unity (C#), Godot (C#/GDScript), Rust + Bevy, TypeScript + Web.

## Décision
**TypeScript strict + Vite + Vitest, rendu Canvas 2D, zéro dépendance runtime.** La couche `sim` est du TypeScript pur sans aucune API navigateur.

## Justification
- La contrainte structurante du projet est la **qualité de la simulation**, pas la puissance du moteur de rendu : un moteur AAA n'apporte rien au MVP 2D vue du dessus.
- Itération immédiate (navigateur), distribution triviale (URL), portage desktop possible (Tauri/Electron).
- Testable et exécutable en CI/headless — condition de la règle « rien ne merge sans tests ».
- Les typed arrays + un rendu par chunks suffisent largement aux budgets visés ; WebGL reste une évolution locale à `render/` si nécessaire.
- **Réversibilité** : `sim` ne connaissant ni le DOM ni le canvas, un portage vers Godot/Unity consisterait à réécrire uniquement `render/` et `ui/` (ou à compiler la sim telle quelle via un runtime JS embarqué).

## Conséquences
- (+) Déterminisme maîtrisé de bout en bout (RNG maison, pas de physique noire).
- (+) Zéro dépendance runtime = zéro rupture d'API externe.
- (−) Pas d'éditeur de scènes ni d'outillage moteur : assumé, le jeu est piloté par les données de simulation.
- (−) Performance mono-thread JS : compensée par typed arrays, dirty tracking, LOD ; Web Workers en réserve pour la phase Habitants si le budget tick est dépassé.
