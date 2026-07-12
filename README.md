# ImG — « I'm God »

Un **god game 3D** original : le joueur incarne une divinité qui influence — sans jamais le contrôler — un monde vivant, procédural et entièrement terraformable, peuplé d'habitants autonomes qui construisent, commercent, croient et se font la guerre. Style low poly stylisé, pensé **mobile d'abord** (Android puis iOS via Capacitor). Référence produit : [docs/CAHIER_DES_CHARGES.md](docs/CAHIER_DES_CHARGES.md).

## Démarrage

```bash
npm install
npm run dev        # jeu sur http://localhost:5173 (ajouter ?seed=42 pour changer de monde)
npm test           # suite de tests (unitaires + intégration + architecture)
npm run build      # typecheck strict + build de production
```

**Contrôles tactiles** : 1 doigt = sculpter (outil ⛰️/🕳️ dans la barre) · 2 doigts = déplacer + pincer pour zoomer.
**Contrôles souris/clavier** : clic gauche = sculpter (Maj = inverser) · clic droit/milieu = caméra · molette = zoom · Q/E = pivoter · Espace = pause · 1/2/3 = vitesse ×1/×4/×16.

## Documentation

| Document | Contenu |
|---|---|
| [docs/GDD.md](docs/GDD.md) | Game Design Document : vision, piliers, systèmes de jeu |
| [docs/TDD.md](docs/TDD.md) | Technical Design Document : architecture, couches, performance |
| [docs/UML.md](docs/UML.md) | Diagrammes (composants, classes, séquences, états) |
| [docs/ROADMAP.md](docs/ROADMAP.md) | Feuille de route par phases + priorités du MVP |
| [docs/adr/](docs/adr/) | Décisions d'architecture (ADR) |

## Architecture en bref

```
app → ui → render → sim → core     (les dépendances ne remontent jamais)
```

- **`core`** : noyau générique — EventBus typé, RNG déterministe, ECS, horloge de jeu.
- **`sim`** : toute la logique métier, 100 % pure (zéro API navigateur, zéro dépendance), déterministe, testable headless.
- **`render`** : lecture seule de la sim — rendu 3D low poly (Three.js) : maillage terrassé à couleurs par sommet, soleil jour/nuit, eau translucide (ADR 0002).
- **`ui`** : traduit les entrées (tactile + souris) en *intents* publiés sur l'Event Bus — jamais d'accès direct à la sim.

Ces règles ne sont pas des conventions : elles sont **vérifiées par la suite de tests** (`tests/architecture.test.ts`).

## État du projet

Phase 0 livrée (voir la roadmap) : monde procédural avec 12 biomes, cycle jour/nuit, saisons, terraforming temps réel qui recalcule les biomes (creusez sous le niveau de la mer : l'eau monte ; élevez un pic : la neige apparaît), et la Foi comme ressource divine consommée par les pouvoirs.
