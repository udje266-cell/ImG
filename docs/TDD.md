# ImG — Technical Design Document (TDD)

> Voir `adr/0001-choix-stack.md` pour la justification du stack.
> Diagrammes : `UML.md`. Planification : `ROADMAP.md`.

---

## 1. Stack technique

| Domaine | Choix | Raison |
|---|---|---|
| Langage | TypeScript (strict) | typage fort, refactoring sûr, écosystème |
| Build | Vite | démarrage instantané, HMR, build optimisé |
| Tests | Vitest | rapide, API Jest, natif Vite |
| Rendu | **Three.js (WebGL), 3D low poly** — voir ADR 0002 | cahier des charges §4/§10 ; cantonné à `render/` |
| Mobile | **Capacitor** (Android prioritaire, puis iOS) — ADR 0002 | cahier des charges §11 |
| Dépendances runtime | **une seule : `three`** | déterminisme et maîtrise ; la sim reste sans dépendance |

**Convention** : documentation en français, code/identifiants/messages de commit en anglais.

## 2. Principes d'architecture

1. **Séparation stricte des couches** — dépendances autorisées dans un seul sens :

   ```
   app  →  ui  →  render  →  sim  →  core
   ```
   - `core` : noyau générique (ECS, EventBus, RNG, temps, math). Aucune notion de gameplay.
   - `sim` : **toute** la logique métier. N'importe **jamais** `render`, `ui`, `app`, ni aucune API navigateur (`window`, `document`, `canvas`). Testable en Node pur.
   - `render` : lit l'état de `sim`, ne le modifie **jamais**.
   - `ui` : entrées utilisateur → **intents** publiés sur l'EventBus. Ne modifie jamais `sim` directement.
   - `app` : composition root (câblage, boucle de jeu).

2. **Simulation déterministe** — même seed + mêmes intents ⇒ même monde, au tick près.
   - RNG maison (`splitmix32`) avec **streams nommés** par système (`rng.fork("weather")`) : ajouter un consommateur de hasard ne désynchronise pas les autres.
   - Pas de `Math.random`, pas de `Date.now` dans `sim` (règle vérifiée par test d'architecture).
   - Itération des collections en ordre stable.

3. **Boucle à pas fixe** — la simulation avance par **ticks** de durée fixe (`SIM_DT = 100 ms` de temps simulé) via un accumulateur ; le rendu tourne à la fréquence de l'écran et interpole. Vitesse ×0/×1/×4/×16 = nombre de ticks consommés par frame.

4. **Event Bus typé** — communication inter-modules découplée.
   - `EventMap` central : chaque nom d'événement est typé avec son payload.
   - Deux canaux : `emit` (immédiat, intra-tick) et `queue` (différé, drainé en fin de tick — évite les cascades réentrantes).
   - Conventions de nommage : `domaine:fait` au passé pour les faits (`terrain:modified`, `season:changed`), `domaine/verbe` à l'impératif pour les intents UI (`intent:invokePower`).

5. **ECS pragmatique** (pour les entités : habitants, animaux, plantes, bâtiments)
   - Entités = entiers. Composants = données pures dans des stores typés. Systèmes = fonctions ordonnancées.
   - Le **terrain n'est pas dans l'ECS** : c'est une ressource singleton en typed arrays (voir §4).
   - Optimisation prévue (phase Habitants) : stores SoA (`Float32Array`) pour les composants chauds (position, besoins), index spatial en grille de hachage pour les requêtes de voisinage. Objectif : **10 000+ entités à 60 fps**.

6. **Zéro dette** : chaque module livré avec ses tests ; API publiques documentées (TSDoc) ; pas de `any` ; CI = `typecheck + tests + build`.

## 3. Structure des dossiers

```
ImG/
├── docs/                     # GDD, TDD, UML, ROADMAP, ADRs
│   └── adr/
├── src/
│   ├── core/                 # noyau générique, réutilisable, sans gameplay
│   │   ├── ecs/              # World, ComponentStore, Scheduler
│   │   ├── events/           # EventBus typé + EventMap du jeu
│   │   ├── math/             # RNG déterministe, bruit (fBm), utilitaires
│   │   └── time/             # GameClock : ticks, jour/nuit, saisons, calendrier
│   ├── sim/                  # logique métier PURE (aucune API navigateur)
│   │   ├── world/            # état racine de la simulation (Simulation)
│   │   ├── worldgen/         # génération procédurale, classification des biomes
│   │   ├── terrain/          # grille de terrain, terraforming, chunks sales
│   │   ├── powers/           # pouvoirs divins + système de Foi
│   │   ├── weather/          # (phase 2) météo cellulaire
│   │   ├── ecology/          # (phase 3) flore, faune, ressources
│   │   ├── agents/           # (phase 4) habitants : besoins, utility AI
│   │   ├── economy/          # (phase 5)
│   │   ├── religion/         # (phase 6)
│   │   ├── tech/             # (phase 7)
│   │   ├── diplomacy/        # (phase 8)
│   │   └── save/             # (phase 2) sérialisation versionnée
│   ├── render/               # Canvas : caméra, rendu terrain par chunks, overlays
│   ├── ui/                   # HUD, contrôleur d'entrées → intents
│   └── app/                  # main.ts, GameLoop (composition root)
├── tests/                    # miroirs de src/ (unitaires + architecture)
├── index.html
└── (config : package.json, tsconfig.json, vite.config.ts)
```

## 4. Conception des systèmes clés

### 4.1 Terrain (`sim/terrain`)
- `TerrainGrid` : `Float32Array` pour `height`, `temperature`, `moisture` ; `Uint8Array` pour `biome` (dérivé, cache). Taille MVP : 256×256 (65 k cellules), extensible.
- Découpage en **chunks 32×32**. Toute modification marque le chunk *dirty* → recalcul local des biomes + re-rendu du chunk seul. Événement `terrain:modified {chunkIds}`.
- Terraforming = pinceau (rayon, intensité, falloff) appliqué par `TerraformPower` ; coût en Foi ∝ Σ|Δheight|.

### 4.2 Génération du monde (`sim/worldgen`)
- Pipeline pur : `seed → WorldGenConfig → TerrainGrid`.
- Altitude : fBm 5 octaves + masque insulaire radial (option). Température : gradient latitudinal + refroidissement altitudinal + bruit. Humidité : fBm indépendant.
- `classifyBiome(height, temp, moisture, seaLevel)` : fonction pure, table de seuils (testée exhaustivement).

### 4.3 Temps (`core/time`)
- `GameClock` : `tick` (entier, source de vérité), dérive `timeOfDay ∈ [0,1)`, `dayOfSeason`, `season`, `year`. Constantes : 1 jour = 240 ticks (24 s ×1), 1 saison = 12 jours.
- Publie `time:dayStarted`, `time:seasonChanged`, `time:yearStarted` sur le bus.

### 4.4 Foi & pouvoirs (`sim/powers`)
- `FaithSystem` : réserve, plafond, régénération (MVP : régénération de base ; branchée sur les croyants en phase 6).
- `Power` (interface) : `id`, `cost(params)`, `apply(sim, params)`. Registre de pouvoirs. L'UI publie `intent:invokePower` ; `PowerSystem` valide (Foi suffisante) puis exécute dans le tick — l'UI ne touche jamais la sim.

### 4.5 Rendu 3D (`render`, Three.js — ADR 0002)
- `TerrainMesh` : maillage heightmap (grille de sommets aux coins de tuiles) ; hauteur des sommets **quantifiée en terrasses** (`terraces.ts`, un cran = `LAYER_STEP`) pour le style Godus en vraie géométrie ; **couleurs par sommet** (palette pastel par biome fondue bilinéairement, fonds marins sable→bleu selon profondeur) ; flat shading, zéro texture. À réception de `terrain:modified`, seuls les sommets couverts par les chunks sales (+ bord) sont recalculés.
- `SceneRenderer` : scène, soleil directionnel + hémisphérique pilotés par `clock.timeOfDay` (couleur du ciel incluse), plan d'eau translucide au niveau de la mer, raycasting écran→tuile pour la sculpture.
- `CameraRig` : caméra perspective en vue divine (cible au sol, distance, azimut) ; pan/zoom/rotation ; conversions écran↔monde par raycast.
- L'échantillonneur bilinéaire (`heightSampler.ts`) sert aux hauteurs des coins de tuiles ; `groundHeightAt` (exporté par `TerrainMesh`) est la vérité unique de « poser quelque chose au sol ».

### 4.5 bis Pipeline d'assets 3D (`render/modelCatalog.ts`, `render/ModelLibrary.ts`)
- Modèles glTF binaires dans `public/models/{characters,animals}/` — **chaque ajout exige sa ligne de licence dans `public/models/LICENSES.md`** (CC0/Apache/MIT libres ; CC-BY avec attribution ; le reste arbitré).
- `MODEL_CATALOG` (pur, testé) déclare id, URL relative, catégorie, hauteur cible en tuiles et indice de clip d'idle ; `ModelLibrary` charge, met en cache par URL, normalise l'échelle par bounding box et ancre au sol.
- Mode `?showcase=1` : asset viewer permanent — tous les modèles du catalogue posés sur la terre la plus proche du centre, animés, à midi figé. Tout nouveau modèle se juge là avant d'entrer en jeu.
- Perf : ce chemin (SkinnedMesh + AnimationMixer) est réservé aux petites quantités ; la phase Habitants passera à l'instanciation (voir §5).

### 4.6 Sauvegarde (`sim/save`, phase 2)
- Snapshot versionné : `{version, seed, tick, terrainDelta, entities, resources}`.
- Le terrain sauvegarde **seed + deltas** (cellules modifiées) plutôt que la grille entière.
- Migrations par version croissante ; round-trip testé (save→load→save identique).

### 4.7 Agents (phase 4 — cadrage)
- Stores SoA pour position/besoins ; index spatial (grille de hachage, cellule = 8 tuiles).
- Décision en deux temps : **Utility AI** choisit un objectif (rare, LOD-isé : agents hors écran décident moins souvent), **plan simple** l'exécute tick par tick.
- Pathfinding : A* hiérarchique par chunks + cache de chemins ; budget de recherche par tick (file de requêtes).

## 5. Performance — budgets et stratégies
- Budget tick sim : **≤ 8 ms** (à ×16 : plusieurs ticks/frame). Budget rendu : ≤ 6 ms.
- Stratégies : typed arrays, zéro allocation dans les boucles chaudes, dirty tracking partout (chunks, ferveur, prix), LOD de décision pour les agents, systèmes cadencés (météo : 1/10 ticks ; écologie : 1/5).
- Mesure avant optimisation : compteur de perf par système (temps/tick), affichable en overlay debug.

## 6. Tests
- **Unitaires** : chaque module de `core` et `sim` (déterminisme RNG/worldgen, invariants de biomes, coûts de Foi, transitions d'horloge…).
- **Architecture** : test qui échoue si `sim/` ou `core/` importent `render/ui/app` ou utilisent `Math.random`/`Date.now`.
- **Intégration** : scénarios de simulation headless (N ticks, assertions sur l'état).
- Politique : une fonctionnalité sans test ne passe pas en `main`.

## 7. Gestion des erreurs & invariants
- `sim` lance des erreurs sur violation d'invariant (dev) ; assertions désactivables en build prod.
- Les intents invalides (Foi insuffisante, cible hors carte) sont **refusés proprement** avec événement `power:rejected {reason}` — jamais d'état partiel.
