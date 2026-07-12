# ImG — Feuille de route

> Règle d'or : **chaque phase se termine avec des tests verts, une documentation à jour et un jeu qui tourne**. Aucune phase ne commence si la précédente a laissé de la dette.

## Priorités du MVP

Le MVP (phases 0–1) doit prouver les fondations, pas empiler des features :

| Priorité | Contenu | Justification |
|---|---|---|
| P0 | Noyau : EventBus typé, RNG déterministe, ECS, GameClock, boucle à pas fixe | tout le reste s'appuie dessus |
| P0 | Génération procédurale (seed reproductible) + 12 biomes | identité du jeu, base de toutes les simulations |
| P0 | Rendu chunks + caméra pan/zoom + contrôle du temps | rendre le monde observable |
| P0 | Terraforming temps réel avec recalcul des biomes | pilier « terrain entièrement modifiable » |
| P0 | Foi comme ressource dépensée par les pouvoirs | pilier « la foi est la monnaie du divin » |
| P1 | Cycle jour/nuit + saisons visibles | monde « vivant » minimal |
| P1 | Sauvegarde/chargement versionnés | robustesse exigée dès que l'état devient précieux |
| P2 (post-MVP) | Météo, écologie, habitants… | voir phases |

**Définition of done du MVP** : générer un monde depuis une seed, s'y déplacer, le terraformer (la mer inonde les creux, les sommets s'enneigent), dépenser/régénérer de la Foi, jour/nuit et saisons s'enchaînent — le tout avec suite de tests verte et sans dépendance runtime.

## Phases

### Phase 0 — Fondations ✅ (livrée)
- Scaffold TypeScript strict + Vite + Vitest, zéro dépendance runtime.
- `core` : EventBus typé (emit/queue/drain), RNG `splitmix32` forkable, ECS minimal, GameClock (jour/nuit, saisons), boucle à pas fixe avec vitesses.
- `sim` : worldgen fBm (altitude/température/humidité), 12 biomes, TerrainGrid en typed arrays avec chunks dirty, terraforming par pinceau, FaithSystem + PowerSystem + TerraformPower.
- `render`/`ui` : rendu par chunks avec hillshading, overlay jour/nuit, caméra, HUD Foi/date, souris (pan/zoom/sculpter).
- Tests : unitaires + test d'architecture (pureté de `sim`).

### Phase 1 — Boucle divine complète
- Pouvoirs supplémentaires : aplanir, creuser l'eau, pinceau paramétrable.
- Sauvegarde/chargement (seed + deltas terrain + état), versionnée et testée en round-trip.
- Contrôle du temps finalisé (pause/×1/×4/×16), overlay debug perf par système.

### Phase 2 — Monde dynamique
- Météo cellulaire (nuages, pluie, neige) branchée sur l'humidité du sol.
- Effets saisonniers réels (gel, croissance), rivières simples (écoulement).

### Phase 3 — Écologie
- Flore : croissance/essaimage dépendant humidité/saison. Faune : herbivores/prédateurs, reproduction, migration.
- Ressources renouvelables/finies ; dégradation par surexploitation.

### Phase 4 — Les habitants (jalon critique de perf)
- Agents : besoins, Utility AI, perception, mémoire ; stores SoA + index spatial ; pathfinding hiérarchique budgété.
- Objectif : **10 000 agents à 60 fps**. Foyers, récolte, construction d'abris.
- La Foi devient réellement générée par les croyants.

### Phase 5 — Société & économie
- Villages, professions, stocks, production/consommation, prix émergents, commerce inter-villages.

### Phase 6 — Religions dynamiques
- Témoins de miracles → récits → dogmes ; ferveur, prêtres, temples, schismes, conversions ; dieux rivaux simulés.

### Phase 7 — Technologies
- Découverte par la pratique, diffusion par contact, ères (pierre → bronze → fer → antiquité).

### Phase 8 — Diplomatie & guerre
- Royaumes, opinions, traités, casus belli, guerres avec moral et logistique simplifiée.

### Phase 9 — Pouvoirs avancés & endgame
- Catastrophes (séisme, peste), inspirations/visions, impact de croyance complet des miracles, objectifs sandbox.

### Phase 10 — Polish
- Audio, direction artistique consolidée, tutoriels systémiques, accessibilité, équilibrage global.

## Process qualité (toutes phases)
1. Concevoir : mise à jour GDD/TDD/UML si le design change.
2. Développer : TypeScript strict, TSDoc sur les API publiques.
3. Tester : unitaires + intégration headless ; le test d'architecture reste vert.
4. Vérifier : build prod + lancement réel avant chaque commit.
5. Committer : messages conventionnels (`feat:`, `fix:`, `docs:`, `test:`, `refactor:`).
