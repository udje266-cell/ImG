# ADR 0002 — Rendu 3D via Three.js, mobile via Capacitor

**Statut** : accepté · **Date** : 2026-07-12 · Complète l'ADR 0001

## Contexte
Le cahier des charges (docs/CAHIER_DES_CHARGES.md) fixe deux exigences nouvelles : un monde **entièrement en 3D** (low poly stylisé) et **Android en priorité, puis iOS**. Candidats : réécrire sous Unity/Godot, ou passer la couche `render` en WebGL (Three.js) et empaqueter avec Capacitor.

## Décision
1. **Three.js** remplace le rendu Canvas 2D — uniquement dans `render/` et `ui/`. C'est la première (et seule) dépendance runtime du projet.
2. **Capacitor** empaquettera le build web en application Android puis iOS (phase Mobile). Les contrôles sont tactiles dès maintenant (1 doigt = sculpter, 2 doigts = caméra).
3. La couche `sim` reste 100 % inchangée : le monde 3D est une *présentation* du même état déterministe (heightmap + biomes). Le style Godus (terrasses) devient géométrique : hauteurs quantifiées en strates réelles dans le maillage.

## Justification
- L'ADR 0001 avait explicitement préparé cette réversibilité : « un portage consisterait à réécrire uniquement render/ et ui/ ». C'est exactement ce qui est fait — 0 ligne de sim modifiée, les ~70 tests passent sans retouche.
- Unity/Godot imposeraient de réécrire *tout* (sim comprise, en C#), de perdre le déterminisme éprouvé, et rendraient impossible la vérification headless en CI.
- Three.js + WebGL tourne très bien sur mobile pour du low poly (un maillage terrain de ~130 k triangles, budget trivial) ; Capacitor est un pipeline Android/iOS éprouvé et déjà maîtrisé par le propriétaire du projet.
- Le low poly stylisé demandé est *plus simple* à produire en vertex colors + flat shading qu'avec des textures.

## Conséquences
- (+) Chemin Android/iOS sans réécriture ; itération et CI inchangées ; une seule base de code.
- (−) « Zéro dépendance runtime » (ADR 0001) devient « une dépendance : three » — assumé, réécrire un moteur WebGL serait de la dette inverse.
- (−) Les performances mobiles devront être surveillées dès la phase Habitants (budget draw calls / instancing pour les milliers d'entités) — critère d'acceptation ajouté à la roadmap.
