# ImG.Core — cœur de simulation en C# (Unity-ready)

Portage **C# pur** du cœur déterministe du jeu (actuellement en TypeScript dans
`../src`). Objectif : préparer une éventuelle bascule vers **Unity** comme moteur
de rendu, **sans toucher au jeu web** qui reste la version de référence jouable.

## Pourquoi cette étape (et pas un projet Unity complet tout de suite)

- La logique de jeu (RNG, worldgen, biomes, terrain, économie…) est **agnostique
  du moteur** : elle ne dépend d'aucune API de rendu. On la porte donc en C# pur,
  compilable et **testable en CI** (`dotnet test`), avant d'y brancher un moteur.
- On garde le **déterminisme identique au TypeScript** : les tests
  (`ImG.Core.Tests`) contiennent des **valeurs de référence extraites de
  l'implémentation TS** (mêmes seeds → mêmes suites RNG, même bruit, même monde).
  C'est la garantie que le portage ne dérive pas.
- Le jeu web (`../`) continue de tourner et de produire l'APK : **rien n'est
  cassé**.

## Contenu (première tranche)

| Fichier | Rôle |
|---|---|
| `ImG.Core/Math/Rng.cs` | RNG splitmix32 forkable — **identique bit pour bit** au TS |
| `ImG.Core/Math/Noise2D.cs` | bruit de valeur + fBm |
| `ImG.Core/Time/GameClock.cs` | calendrier (jour/nuit, saisons, années) |
| `ImG.Core/Events/EventBus.cs` | bus d'événements typé (emit / queue / drain) |
| `ImG.Core/Worldgen/Biome.cs` | classification des 12 biomes |
| `ImG.Core/Worldgen/WorldGenerator.cs` | pipeline de génération procédurale |
| `ImG.Core/Terrain/TerrainGrid.cs` | grille de terrain (chunks, biomes dérivés) |
| `ImG.Core/Powers/FaithSystem.cs`, `SparkSystem.cs` | ressources divines (Foi, Étincelle) |
| `ImG.Core/Society/EraSystem.cs` | 8 âges historiques (Pierre → Futur, Savoir, politique) |
| `ImG.Core/Weather/WeatherSystem.cs`, `Seasons.cs` | météo cellulaire (nuages, vent, pluie/neige) |

La suite (flore, faune, habitants, villages, religions, les 22 pouvoirs) se
portera de la même façon, chaque système avec ses tests de non-régression.

## Compiler & tester

```bash
cd unity
dotnet test        # compile ImG.Core + lance les tests xUnit (déterminisme vs TS)
```

## Intégration Unity (plus tard)

`ImG.Core` cible **netstandard2.1** (compatible Unity 2021+). Pour l'utiliser
dans Unity : déposer les sources sous `Assets/ImG.Core/` avec un
`ImG.Core.asmdef`, puis écrire la **couche de rendu Unity** (MonoBehaviours qui
lisent l'état de la simulation, comme `../src/render` le fait avec Three.js).
Le cœur, lui, ne changera pas.
