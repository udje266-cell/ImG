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

### Phase 0.5 — Passage 3D + contrôles tactiles ✅ (livrée)
- Rendu Three.js low poly terrassé (ADR 0002), soleil jour/nuit, plan d'eau.
- Contrôles tactiles (1 doigt = sculpter, 2 doigts = caméra) + souris/clavier desktop.
- La sim reste inchangée — critère de réussite : 0 test modifié.

### Phase 1 — Boucle divine complète ✅ (livrée)
- Pouvoir **Aplanir** (nivelle vers le centre du pinceau), déverrouillé par la Dévotion.
- **Sauvegarde/chargement v1** (seed + deltas terrain + horloge/foi/dévotion), versionnée, round-trip et déterminisme post-chargement testés ; persistance localStorage (S/L + boutons 💾/📂).
- **Progression divine v1** : la Foi dépensée en miracles nourrit la Dévotion ; seuils → `progression:powerUnlocked` (cahier des charges §7).
- Reporté : pinceau paramétrable (phase 2), overlay debug perf (phase 2 — obligatoire avant la météo).

### Phase 1.5 — Empaquetage Android (Capacitor)
- Projet Capacitor, build APK, cibles de perf sur appareil milieu de gamme (60 fps terrain, 30 fps mini).
- Adaptation UI (safe areas, tailles tactiles), puis iOS après validation Android.

### Phase 2 — Monde dynamique ✅ (livrée en partie)
- **Météo cellulaire** (`WeatherSystem`) : évaporation → nuages advectés par le vent → pluie/neige rechargeant l'humidité du sol → assèchement vers la baseline. Déterministe (stream RNG "weather"), cadencée 1 tick/5, rendu par couche de nuages instanciée.
- **Saisons réelles** : décalage thermique par saison re-classifiant les biomes (la neige/toundra descend en hiver).
- **Pouvoir Pluie** (débloqué à 300 de Dévotion) : ensemence les nuages, la pluie suit naturellement.
- **Overlay de performance** (touche P) : FPS + ms/tick par système (DI de l'horloge de mesure, sim reste pure).
- **Sauvegarde v2** : deltas d'humidité + état météo (nuages/vent/RNG), migration v1→v2 testée.
- Reporté : rivières/écoulement (phase 2.5, avec l'érosion).

### Phase 3 — Écologie (flore livrée ✅)
- **Flore** (`FloraSystem`) : densité de végétation par tuile, croissance logistique selon humidité/biome, essaimage vers les voisins, mortalité en sécheresse et en hiver. Déterministe (stream RNG "flora"), branchée sur l'humidité de la météo (faites pleuvoir → ça verdit). Rendu : **forêts instanciées** de l'arbre décimé (`ForestLayer`, 1 draw call, jusqu'à 1200 arbres).
- **Sauvegarde v3** : densité de flore + RNG, migration v1/v2→v3 testée.
- **Faune** (`FaunaSystem`) ✅ : chaîne alimentaire simple et déterministe (stream "fauna"). Herbivores (chevaux) qui broutent la flore, fuient, se reproduisent, meurent de faim ; prédateurs (renards) qui chassent, se reproduisent, s'éteignent sans proie. Populations auto-régulées avec plafonds, rendu instancié (`FaunaLayer`), sauvegarde v5.
- À venir : ressources renouvelables/finies, migration saisonnière, pouvoirs « faire pousser une forêt » et « créer une espèce animale » (cahier des charges §3).
- **Optimisation identifiée** : l'arbre décimé fait ~7,9 k triangles (feuilles = îlots séparés, non réductibles par simplification) — trop lourd pour des forêts très denses. Prévoir des **impostors/billboards** pour le LOD lointain (phase Optimisation).

### Phase 4 — Les habitants (première itération ✅)
- **`AgentSystem`** : habitants préhistoriques avec besoins (faim, fatigue, ferveur), personnalité (piété), IA utilitaire (forage/repos/errance/prière) ré-évaluée en LOD, déplacement vers cibles, foyers. Stores SoA, déterministe (stream "agents").
- **La Foi est enfin générée par les croyants** (`faithIncome = Σ ferveur × const`) — la boucle du GDD §2 est bouclée.
- Rendu : `InhabitantsLayer` — habitants instanciés (homme/femme préhistoriques), positionnés depuis le snapshot ; HUD population 👥. Sauvegarde v4.
- À venir : perception/mémoire, professions, pathfinding hiérarchique, objectif **10 000 agents à 60 fps** (impostors + index spatial). *(foyers→villages : livré en Phase 5.)*

### Phase 5 — Société & économie
- **Villages (première itération ✅)** — `SettlementSystem` : regroupe les habitants dispersés en grappes déterministes (échantillonnage du point le plus éloigné), fonde un village au barycentre de chacune (calé sur tuile constructible), y plante des huttes, puis **réassigne le foyer** de chaque habitant sur son village → la population se resserre autour des villages (« rest » y ramène chacun). Rendu : `SettlementLayer` (huttes torchis+chaume et totems low-poly instanciés, géométrie procédurale, 2 draw calls). Sauvegarde v6.
- **Vie de village ✅** — *Naissances* : un habitant prospère (nourri, reposé) fonde une famille ; l'enfant naît au foyer, plafond `MAX_POPULATION`. *Expansion* : recensement périodique (`SettlementSystem.expand`, toutes les `SETTLEMENT_INTERVAL` ticks) qui bâtit de nouvelles huttes quand un village dépasse sa capacité (spirale poursuivie). *Champs* : parcelles cultivées semées fertiles en couronne des villages. *Feux de camp* : un par village, flamme animée + halo chaud qui porte la nuit (`SettlementLayer.update`). Sauvegarde v7 (migration v6 : huttes estimées).
- À venir : professions, stocks, production/consommation, prix émergents, commerce inter-villages ; morts naturelles et générations.

### Passe qualité visuelle 2 (✅) — techniques standard appliquées
- **Nuit lisible (« day-for-night »)** : clair de lune directionnel froid opposé au soleil (sans ombres, budget mobile), ambiance nocturne relevée, ciel de nuit bleu profond au lieu de noir.
- **Ciel vivant** : étoiles procédurales scintillantes (grille hashée sur le dôme), disque + halo de lune à l'opposé du soleil.
- **Feu de camp réaliste** : cercle de pierres + rondins carbonisés, braises émissives pulsantes, flamme à deux couches en blending additif (enveloppe orange + cœur jaune-blanc), volutes de fumée cyclées, lumière chaude vacillante (deux fréquences décorrélées).
- **Eau nocturne** : l'éclat spéculaire bascule du soleil à la lune sous l'horizon.
- **Bloom sélectif ✅** : chaîne `EffectComposer` (RenderPass → UnrealBloomPass demi-résolution → OutputPass). Rendu intermédiaire linéaire, tone mapping ACES appliqué en sortie ; seuil > 1 pour que seuls les émissifs brillants (flammes, lune, éclats d'eau plafonnés) rayonnent.
- **Précipitations visibles ✅** : `PrecipitationLayer` — points recyclés (1 draw call) qui tombent sous les cellules météo qui précipitent réellement (`isRaining`/`isSnowing`) ; gouttes bleutées rapides, flocons blancs lents qui ondulent ; pastille ronde générée en code (dégradé radial canvas).
- À venir (qualité) : particules feuilles/braises, impostors LOD pour forêts denses, audio (ambiances jour/nuit, crépitement du feu).

### Phase 6 — Religions dynamiques
- **Moteur d'interprétation (première itération ✅)** — `ReligionSystem` : chaque miracle a des **témoins** (habitants proches, ferveur ravivée selon la nature du prodige : bienfait/courroux/prodige) ; un miracle **sans témoin ne devient jamais un récit**. Les récits rejoignent la **mémoire du village** le plus proche (avec oubli lent) ; la composante dominante fait émerger une **doctrine** (culte de la Providence / de la Crainte / des Prodiges) — le STYLE de règne du joueur façonne les cultes. Assez de récits → un **prêtre** s'élève (prêche périodique, ferveur entretenue) ; la dévotion continue → le village érige un **temple** mégalithique (dolmen + menhirs, rendu instancié) qui rayonne une Foi passive. Sauvegarde v8.
- À venir : sacrifices, schismes, conversions entre villages, dieux rivaux simulés, éclipses/présages interprétés.

### Phase 7 — Technologies
- Découverte par la pratique, diffusion par contact ; **8 ères** : pierre → bronze → fer → moyen âge → renaissance → industrielle → moderne → futur (cahier des charges §9).

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
