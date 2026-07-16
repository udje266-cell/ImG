# ImG — Bible des Assets 3D

*Catalogue complet des assets pour la progression d'une civilisation, de l'âge
de pierre à la civilisation galactique.*

Direction artistique, game design et production 3D. Ce document est la source de
vérité pour tout ce qui doit être **modélisé, texturé, animé et intégré**. Il est
pensé pour Unity **et** pour le moteur actuel du jeu (Three.js/glTF), qui partage
les mêmes conventions (grille, `.glb`, instanciation).

> **Principe directeur : modularité maximale.** On ne modélise **jamais** 50
> métiers × 15 ères = 750 personnages uniques. On construit un petit socle de
> **rigs partagés** + des **kits de costumes/props par ère**. Un « métier » = un
> corps de base + une tenue + un outil. Cette bible décrit ce socle, puis pour
> chaque ère **seulement ce qui change**. C'est ainsi que travaillent les
> studios, et c'est la seule façon de tenir 15 ères sans exploser le budget.

---

## Table des matières

- **Partie I — Cadre global**
  1. [Vision artistique](#1-vision-artistique)
  2. [Standards techniques](#2-standards-techniques)
  3. [Convention de nommage & arborescence](#3-convention-de-nommage--arborescence)
  4. [Système modulaire (rigs, kits, snapping)](#4-système-modulaire)
  5. [Rosters transverses (personnages, faune, flore, ressources)](#5-rosters-transverses)
  6. [Mapping 15 ères ↔ 8 ères du moteur](#6-mapping-des-ères)
  7. [Matrice de priorités & jalons](#7-priorités--jalons-de-production)
- **Partie II — Catalogue par ère** ([1](#ère-1--âge-de-pierre) · [2](#ère-2--néolithique) · [3](#ère-3--âge-du-bronze) · [4](#ère-4--âge-du-fer) · [5](#ère-5--antiquité) · [6](#ère-6--haut-moyen-âge) · [7](#ère-7--moyen-âge) · [8](#ère-8--renaissance) · [9](#ère-9--révolution-industrielle) · [10](#ère-10--époque-moderne) · [11](#ère-11--ère-numérique) · [12](#ère-12--futur-proche) · [13](#ère-13--futur-avancé) · [14](#ère-14--civilisation-interplanétaire) · [15](#ère-15--civilisation-galactique))
- **Partie III — Systèmes transverses**
  - [Arbre technologique complet](#arbre-technologique-complet)
  - [Pipeline de production & dépendances](#pipeline-de-production)
  - [Récapitulatif des livrables & estimation](#récapitulatif-des-livrables)

---

# Partie I — Cadre global

## 1. Vision artistique

- **Style : low-poly moderne « stylised painterly ».** Faces facettées assumées,
  arêtes franches, silhouettes lisibles à 2–3 m de distance caméra. Référence de
  ton : *Godus*, *The Wandering Village*, *Kingdoms & Castles*, *Before We Leave*,
  *Dorfromantik*, packs *KayKit* / *Quaternius* / *Kenney* (déjà utilisés dans le
  jeu, donc **charte de raccord obligatoire** : mêmes proportions, même densité).
- **Lisibilité isométrique d'abord.** Chaque asset doit être identifiable
  **par sa silhouette** en vue 3/4 haute. Détails « du dessus » privilégiés
  (toits, cours, sols), jamais de micro-détail invisible de la caméra de jeu.
- **Palette cohérente, chaude et saturée-douce.** Une **palette maîtresse de 48
  teintes** (bois, pierre, terre, végétal, métal, eau, peau ×5, tissus, néons)
  partagée par toutes les ères via un **atlas de gradient** (cf. §2). Chaque ère
  a une **sous-palette d'accent** (voir tableau ère par ère) : ocre→bronze→acier
  →pierre claire→brique rouge→béton/verre→cyan/blanc irisé→or/violet stellaire.
- **Lecture de l'évolution au premier coup d'œil.** Le joueur doit deviner l'ère
  d'un village à sa silhouette : rond & organique (préhistoire) → orthogonal &
  ordonné (antiquité/médiéval) → dense & vertical (industriel/moderne) → fluide &
  lumineux (futur). Cette **courbe de silhouette** guide toute la production.
- **Émotion cible :** émerveillement bienveillant. Pas de gore, violence
  stylisée (pas de sang), mort suggérée. Compatible tout public.

## 2. Standards techniques

### Grille, unités, échelle

- **1 tuile monde = 1 unité Unity = 1 mètre.** (Le moteur actuel raisonne déjà
  en tuiles ; on aligne 1 tuile = 1 m.)
- **Empreintes bâtiments** en multiples de tuile : `1×1`, `2×2`, `2×3`, `3×3`,
  `4×4`, mégastructures `6×6`+. Toute empreinte **snappe à la grille**.
- **Pivot** : personnages & props au sol → pivot **aux pieds, centré XZ**
  (`y=0` = sol). Bâtiments → pivot **coin bas-arrière-gauche** (ancre de grille)
  ou centre bas selon le kit (documenter par kit). Modules de mur → pivot sur
  l'arête de snap.
- **Orientation** : +Z = « face » du bâtiment / avant du personnage. Y-up.
  Unités en mètres, échelle appliquée (scale = 1 à l'export, jamais de scale
  non-appliqué).
- **Hauteurs de référence** (silhouette lisible) : humain adulte **1,8 m**,
  enfant 1,1 m, hutte 2,5–3 m, maison 4–6 m, tour/temple 8–14 m, gratte-ciel
  18–40 m, mégastructure 60 m+.

### Budgets de polygones (triangles, LOD0)

| Classe d'asset | LOD0 | LOD1 | LOD2 | Notes |
|---|---:|---:|---:|---|
| Personnage (héros/joueur proche) | 3 000–6 000 | 1 500 | 600 | rig complet |
| Personnage foule / instancié | 800–1 500 | 500 | 200 | animations partagées |
| Petit prop / outil | 100–400 | — | *(billboard)* | souvent sans LOD |
| Animal petit (renard, poule) | 700–1 500 | 600 | 250 | |
| Animal grand (cheval, mammouth) | 1 500–3 000 | 1 200 | 500 | |
| Bâtiment T1 (hutte/maison) | 800–2 500 | 1 000 | 400 | |
| Bâtiment T2–T3 (temple, usine) | 2 500–7 000 | 2 500 | 900 | |
| Mégastructure / merveille | 8 000–20 000 | 6 000 | 2 000 | pièce unique |
| Véhicule | 1 500–5 000 | 1 800 | 700 | |
| Arbre / rocher (instancié) | 300–1 200 | 400 | 120 | LOD2 = croix billboard |

> **Repère projet** : le monde entier du moteur actuel ≈ 130 k triangles. Tout
> asset instancié à des centaines d'exemplaires doit viser le **bas** de sa
> fourchette. Un modèle IA (Tripo…) à 1–2 M tris doit être **décimé**
> (`npm run assets:decimate`) avant intégration.

### Textures & matériaux (PBR simplifié)

- **PBR simplifié 3 canaux** : `Albedo` (sRGB), `Normal` (light, optionnel sur
  props), **`ORM` packé** (Occlusion=R, Roughness=G, Metallic=B). Pas de
  clearcoat/anisotropy.
- **Atlas partagé par kit d'ère.** Idéalement **1 seul matériau / atlas par ère**
  pour tout un kit (bâtiments + props), façon KayKit : couleur portée par un
  atlas de **gradient/palette** → tous les meshes d'un kit se rendent en **1 draw
  call instancié**. Vertex colors autorisés en complément.
- **Tailles** : atlas de kit **1024²** ; petits props / UI **512²** ; icônes
  **256²** (voire 128²). Personnages héros : 1024², foule : 512² (atlas partagé
  par famille de tenues).
- **Émissif** obligatoire dès l'ère 9 (fenêtres nuit, néons, réacteurs) → canal
  `Emissive` mono-couleur + masque dans l'atlas.
- **Pas de transparence** sauf verre/effets (tri coûteux) ; feuillages en
  **alpha-clip** uniquement.

### Formats & livrables techniques

- **Modèles** : `.glb` (glTF 2.0 binaire, textures embarquées) = **format
  canon du jeu**. **`.fbx`** fourni en parallèle pour Unity (rig + anims).
- **Source** : `.blend` versionné hors dépôt (LFS ou stockage externe), jamais
  dans `public/`.
- **Textures** : `.png` (albedo/emissive), `.png` linéaire pour ORM/Normal.
- **Icônes** : `.png` (UI), + `.svg` si vectoriel possible.
- **Animations** : clips dans le `.glb`/`.fbx` (voir §4), nommés `anim_*`.
- **LOD** : suffixe `_LOD0/1/2`, ou LODGroup Unity + `_LOD#` dans le `.glb`.

## 3. Convention de nommage & arborescence

**Nommage** (kebab/underscore, ASCII, pas d'espace) :

```
e{NN}_{categorie}_{nom}[_{variante}][_T{niveau}][_LOD{n}].{ext}
```

- `e03` = ère 3 ; `e00` = **transverse / partagé** (rig, atlas de base…).
- `categorie` ∈ `char, anim, flora, res, bld, veh, mil, deco, fx, icon, ui`.
- `variante` : couleur/faction/sexe/saison (`red`, `f`, `winter`…).
- `T1/T2/T3` : niveau d'amélioration d'un bâtiment.

Exemples : `e03_bld_house_a_T2_LOD0.glb`, `e00_char_base_adult_f_LOD0.glb`,
`e09_veh_locomotive_LOD1.fbx`, `e12_mil_drone_swarm_icon.png`.

**Arborescence** (aligne le dépôt actuel `public/models/{characters,animals,props}` en le généralisant) :

```
assets3d/
  _shared/            # e00 : rigs, atlas de base, anims génériques
  e01_stone/  … e15_galactic/
    char/  anim/  flora/  res/  bld/  veh/  mil/  deco/  fx/
  textures/  icons/  lods/
  LICENSES.md         # une ligne de licence par asset (règle du projet)
```

Dans le jeu (runtime), les `.glb` retenus vont dans
`public/models/{characters,animals,props,buildings}/` et sont déclarés dans
`src/render/modelCatalog.ts` + `BuildingModels.ts`. **Toute licence dans
`public/models/LICENSES.md`.**

## 4. Système modulaire

### 4.1 Rigs partagés (la clé de tout)

On maintient **6 squelettes** réutilisés sur les 15 ères :

| Rig | Usage | Anims de base (partagées !) |
|---|---|---|
| `rig_humanoid` | tous les humains, cyborgs, robots humanoïdes, méchas légers | idle, walk, run, carry, work_generic, gather, build, attack_melee, attack_ranged, cast, sit, eat, sleep, cheer, hurt, die, pray, talk |
| `rig_quadruped_s` | renard, chien, mouton, chèvre, loup | idle, walk, run, eat, attack, hurt, die |
| `rig_quadruped_l` | cheval, vache, mammouth, ours, bœuf | idem + mount_ride, rear |
| `rig_bird` | oiseaux, drones organiques, ptérodactyle | fly_loop, glide, land, peck, flee |
| `rig_fish` | poissons, créatures marines | swim, dart, breach |
| `rig_serpent/insect` | serpents, abeilles, essaims | crawl/buzz loops |

**Un métier = `rig_humanoid` + peau/tenue (atlas) + prop d'outil parenté à une
main.** Les 50 « types de personnages » demandés se produisent donc en combinant
**~12 corps de base** (5 tons de peau × silhouettes H/F/enfant/âgé) + **kits de
tenues par ère** + **bibliothèque d'outils** (§5.1). Les animations métier
(mine, pêche, forge…) sont **génériques et partagées** entre toutes les ères.

### 4.2 Kits de bâtiments modulaires

Chaque ère fournit un **kit architectural** : murs, coins, toits, portes,
fenêtres, sols, piliers, escaliers, décor — tous **snappables à la grille**.
Les « bâtiments » (maison, temple, caserne…) sont des **assemblages
pré-fabriqués** de ces modules **plus** quelques hero-props uniques. Avantages :
1 atlas/ère, montée en niveau T1→T3 par **ajout de modules** (étage, aile,
cheminée, dôme), variété visuelle par recombinaison.

### 4.3 Niveaux d'amélioration (T1/T2/T3)

Convention universelle : **T1** = fonctionnel/rustique, **T2** = consolidé/orné,
**T3** = monumental/spécialisé. Produits comme **surcouches additives** sur le
même socle (on empile des modules), pas comme 3 modèles indépendants.

### 4.4 Snapping & sockets

- **Sockets standard** sur bâtiments : `socket_door`, `socket_chimney`,
  `socket_flag`, `socket_light`, `socket_upgrade_*`.
- **Sockets personnages** : `socket_hand_r/l`, `socket_back`, `socket_head`.
- Props (outils, armes, casques) sont **attachés par socket**, jamais fusionnés
  → réutilisation totale.

## 5. Rosters transverses

Ces rosters sont **définis une fois** ; les sections par ère indiquent seulement
les **variantes de tenue/outil** et les **déblocages**.

### 5.1 Roster personnages (matrice métier × disponibilité)

Légende dispo : ● présent · ○ variante de tenue · — indisponible (techno absente).

| Métier / type | Base rig | Ères 1–2 | 3–5 | 6–8 | 9–11 | 12–15 |
|---|---|:--:|:--:|:--:|:--:|:--:|
| Homme / Femme (civil) | humanoid | ● | ○ | ○ | ○ | ○ |
| Enfant / Bébé | humanoid (scalé) | ● | ○ | ○ | ○ | ○ |
| Personne âgée | humanoid | ● | ○ | ○ | ○ | ○ |
| Chef / Dirigeant | humanoid | ● | ○ | ○ | ○ | ○ |
| Prêtre / Chaman | humanoid | ● | ○ | ○ | ○ (laïc) | ○ |
| Marchand | humanoid | ○ | ● | ○ | ○ | ○ |
| Artisan / Forgeron | humanoid | ○ | ● | ○ | ○ | ○ |
| Paysan / Agriculteur | humanoid | ○ | ● | ○ | ○ (auto) | ○ |
| Mineur | humanoid | ○ | ● | ○ | ○ | ○ |
| Chasseur | humanoid | ● | ● | ○ | ○ | — |
| Pêcheur / Marin | humanoid | ● | ● | ○ | ○ | ○ |
| Bûcheron | humanoid | ● | ● | ○ | ○ | ○ |
| Constructeur | humanoid | ● | ● | ○ | ○ | ○ (drone) |
| Ingénieur | humanoid | — | — | ○ | ● | ● |
| Scientifique | humanoid | — | — | ○ (érudit) | ● | ● |
| Médecin | humanoid | — | ○ (guérisseur) | ○ | ● | ● |
| Soldat / Fantassin | humanoid | ● | ● | ● | ● | ● |
| Archer / Tireur | humanoid | ● | ● | ○ | ○ | ○ |
| Cavalier | humanoid + monture | — | ● | ○ | ○ (blindé) | ○ |
| Pilote | humanoid | — | — | ○ | ● | ● |
| Robot / IA humanoïde | humanoid | — | — | — | ○ | ● |
| Cyborg | humanoid | — | — | — | ○ | ● |

**Variantes vestimentaires** : chaque case ● / ○ = un **atlas de tenue** dans le
kit de l'ère. Les silhouettes évoluent (fourrure → toge → armure → costume →
combinaison → exo-suit). Voir chaque ère.

### 5.2 Roster faune (par grands biomes ; réutilisé, retexturé/adapté)

`rig_quadruped_s/l`, `rig_bird`, `rig_fish`, `rig_insect`. **Animaux disparus**
gérés comme skins spéciaux (mammouth = `quadruped_l`, tigre à dents de sabre,
mégacéros, dodo, ptérodactyle). Domestiques = mêmes rigs + variante « apprivoisé »
(licol, harnais via socket). Détail par ère ci-dessous.

### 5.3 Roster flore / biomes

Familles réutilisées, retexturées par biome & saison : `tree_conifer`,
`tree_broadleaf`, `tree_palm`, `tree_dead`, `bush`, `grass_tuft`, `crop_*`
(blé, maïs, riz, vigne, hydroponique…), `mushroom`, `flower_*`, `rock_s/m/l`,
`cliff`, `ground_tile_*`. **Saisons** = 4 variantes d'atlas (printemps/été/
automne/hiver) partagées. Biomes complets : voir §2 palette + chaque ère.

### 5.4 Roster ressources (nœuds exploitables + icônes)

Chaque ressource = **1 nœud dans le monde** (gisement/veine/nappe) + **1 icône
UI** + **1 prop « tas/lingot »** pour stocks/commerce.

| Ressource | Apparaît (ère) | Nœud monde | Prop stock | Icône |
|---|:--:|---|---|---|
| Bois | 1 | arbre/souche | rondins | ● |
| Pierre | 1 | rocher/affleurement | tas de blocs | ● |
| Silex | 1 | nodules gris | éclats | ● |
| Argile | 2 | berge/fosse | briques crues | ● |
| Cuivre | 3 | veine verte | lingots | ● |
| Étain / Bronze | 3 | veine / alliage | lingots | ● |
| Fer | 4 | veine rouille | lingots/barres | ● |
| Or / Argent | 3–5 | filon brillant | lingots/pièces | ● |
| Charbon | 9 | veine noire | tas | ● |
| Pétrole | 10 | nappe/derrick | baril | ● |
| Gaz | 10 | torchère | — (pipeline) | ● |
| Uranium | 11 | minerai luminescent | conteneur | ● |
| Lithium | 11 | salar/veine | cellules | ● |
| Cristaux (mana/énergie) | 12 | druse lumineuse | éclats iridescents | ● |
| Antimatière / Exotique | 14 | confinement | ampoule magnétique | ● |
| Néant / Datamatière | 15 | rift / nœud quantique | fragment | ● |

---

## 6. Mapping des ères

Le moteur a aujourd'hui **8 ères** (`EraSystem.ts`). Cette bible en détaille
**15** : ce sont des **phases artistiques** qui se **replient** sur les 8 codes,
avec **2 tiers post-`Future` à ajouter** si l'on veut aller jusqu'au galactique.

| # Bible | Ère bible | Code moteur (`Era`) | Statut |
|:--:|---|---|---|
| 1 | Âge de pierre (Paléo) | `Stone` (0) | existant |
| 2 | Néolithique | `Stone` (0) tardif | sous-phase |
| 3 | Âge du bronze | `Bronze` (1) | existant |
| 4 | Âge du fer | `Iron` (2) | existant |
| 5 | Antiquité | `Iron` (2) classique | sous-phase |
| 6 | Haut Moyen Âge | `Medieval` (3) précoce | sous-phase |
| 7 | Moyen Âge | `Medieval` (3) | existant |
| 8 | Renaissance | `Renaissance` (4) | existant |
| 9 | Révolution industrielle | `Industrial` (5) | existant |
| 10 | Époque moderne | `Modern` (6) | existant |
| 11 | Ère numérique | `Modern` (6) tardif | sous-phase |
| 12 | Futur proche | `Future` (7) précoce | sous-phase |
| 13 | Futur avancé | `Future` (7) | existant |
| 14 | Civilisation interplanétaire | **`Interplanetary` (8)** | **existant** ✅ |
| 15 | Civilisation galactique | **`Galactic` (9)** | **existant** ✅ |

> **Fait** : l'enum `Era` compte désormais **10 valeurs** (`Interplanetary`,
> `Galactic` ajoutées), `ERA_COUNT=10`, `LAST_ERA=Galactic`, deux paliers
> `ERA_KNOWLEDGE` (90000, 130000), politiques *Union des Mondes* / *Fédération
> Galactique*, métiers, apparences (scaphandre / halo d'énergie) et bâtiments
> procéduraux (habitat-dôme + ascenseur spatial ; nœud orbital + sphère de
> Dyson) — côté TypeScript **et** portage C#. Reste ouvert : si l'on veut la
> granularité des 15 phases côté gameplay, introduire un **sous-niveau
> `subEra`** (0/1) par ère de code, purement cosmétique (swap de kit). Les
> sous-phases (Néolithique, Antiquité, Haut MA, Numérique, Futur proche)
> n'exigent **pas** de nouvelle mécanique, seulement un kit d'assets.

## 7. Priorités & jalons de production

**Priorités** (par asset) :
- **P0 — Essentiel** : le jeu est injouable/illisible sans lui (maison T1,
  villageois de base, ressource-clé, 1 unité militaire, sol/arbre du biome).
- **P1 — Important** : profondeur & variété (métiers, T2/T3, faune, décors,
  véhicules courants).
- **P2 — Optionnel** : polish, merveilles, variantes saisonnières, faune rare.

**Jalons** (vertical slice → contenu) :

| Jalon | Contenu | Objectif |
|---|---|---|
| **M0 — Socle** | 6 rigs + anims génériques + atlas de base + 12 corps | débloque **toute** la production |
| **M1 — Boucle jouable** | ères 1,3,4,7,9,13 en **P0 only** | prouve la courbe d'évolution (1 kit/ère majeure) |
| **M2 — Profondeur** | P1 des mêmes ères + sous-phases 2,5,6,11,12 | variété, métiers, T2/T3 |
| **M3 — Extension** | ères 8,10 + 14,15 (nouveau code) | fin de courbe, mégastructures |
| **M4 — Polish** | P2 partout, merveilles, saisons, faune rare, FX | finition |

**Règle de dépendance** : aucun asset d'ère N+1 ne se produit avant que l'ère N
soit **P0-complète** et validée en `?showcase=1`. Un asset ne « compte » que
livré en `.glb` **décimé**, doté de ses **LOD**, **licencié** et **vérifié en
rendu**.

---

# Partie II — Catalogue par ère

> Chaque ère suit le **même gabarit** : *Civilisation → Personnages → Faune →
> Flore/Biome → Ressources → Bâtiments (T1/T2/T3) → Technologies → Armée →
> Véhicules → Décors/Merveilles → Animations → Fichiers & priorités.* On ne
> répète que **ce qui change** ; le reste hérite du roster transverse (§5).

---

## Ère 1 — Âge de pierre

**Civilisation.** Bandes nomades de chasseurs-cueilleurs. Organisation : tribu
égalitaire, chef de fait. Religion : animisme/chamanisme. Économie : subsistance,
pas de monnaie, don/partage. Urbanisme : campement temporaire autour du feu.
Population : 5–30. Diplomatie : évitement/rivalité pour le gibier.

**Personnages.** Corps de base peu vêtus, **fourrures/peaux**, pieds nus, cheveux
bruts. Métiers actifs : chasseur, cueilleur (paysan proto), pêcheur à la lance,
bûcheron (bâton), constructeur (hutte), chaman (chef+prêtre fusionnés), enfants,
bébés portés, aînés. Silhouette **ronde, trapue**. Props : lance de bois,
propulseur, hache de pierre, panier tressé, torche.

**Faune.** Mammouth (`quad_l`, **disparu**), tigre à dents de sabre (prédateur),
mégacéros/cerf géant, aurochs, bison, loup, renard, lièvre, sanglier ; oiseaux
(corbeau, aigle) ; poissons de rivière ; abeilles sauvages. Pas de domestiques
(sauf **loup en cours d'apprivoisement** → futur chien).

**Flore & biome.** Toundra/steppe & forêt primaire : conifères, feuillus nus,
arbres morts, fougères, champignons, baies, hautes herbes, rochers erratiques,
sol de terre/roche/neige. Feux de forêt possibles.

**Ressources.** Bois, pierre, **silex** (outils), baies/gibier (nourriture),
os/peaux (artisanat), argile (fin d'ère).

**Bâtiments (kit « campement »).**
- **T1** Hutte en peaux sur perches (`1×1`, ronde) · Foyer/feu de camp · Séchoir
  à viande.
- **T2** Hutte en torchis/branchage renforcée · Abri sous roche aménagé · Réserve
  (fosse).
- **T3** Tente longue de clan · **Cercle cérémoniel** (menhirs bruts, cf.
  monument existant) · Atelier de taille du silex.

**Technologies.** **Feu** (déblocage : départ ; effet : cuisson, chaleur, éloigne
prédateurs), **Taille de la pierre/Silex** (outils → +récolte), **Lance/Chasse
coordonnée**, **Langage/Rituel** (cohésion, +foi), **Vêtement en peau** (survie
froid), **Apprivoisement du loup** (→ chien).

**Armée.** Chasseurs-guerriers à lance, **lanceurs de pierre** (fronde primitive),
massue. Pas d'unités spécialisées. Tactique : meute.

**Véhicules.** **Traîneau** tiré à la main / **travois**. (Pas de roue.)

**Décors/Merveilles.** Peintures rupestres (décal falaise), monolithes,
ossements de mammouth, sentiers de terre, gué de rivière, feu de camp (existant).
**Merveille : la Première Flamme** (grand foyer sacré).

**Animations.** Génériques + `hunt_spear`, `knap_flint`, `warm_by_fire`,
`carry_baby`, `ritual_dance`.

**Fichiers & priorités.**
- P0 : `e01_char_base_{m,f}`, `e01_char_hunter`, `e01_bld_hut_hide_T1`,
  `e01_res_flint/wood/stone`, `e01_flora_conifer/rock/grass`, `e01_anim_hunt`,
  campfire (✔ existant), monument menhir (✔ existant).
- P1 : chaman, aînés/enfants, mammouth+sabre+loup, T2, traîneau, séchoir.
- P2 : peintures rupestres, merveille Première Flamme, faune rare, variantes hiver.

---

## Ère 2 — Néolithique

**Civilisation.** **Révolution agricole** : sédentarisation, premiers villages,
propriété, stocks → hiérarchie naissante, chefs et prêtres distincts. Religion :
culte de la fertilité, mégalithisme. Économie : troc, surplus agricole.
Urbanisme : hameau permanent, greniers, enclos. Population : 30–150.

**Personnages.** Tenues **tissées (lin brut)** + peaux, poterie portée.
**Nouveaux métiers** : paysan (houe), éleveur, potier (artisan), tisserand,
constructeur en torchis, prêtre mégalithique. Silhouette plus droite.

**Faune.** **Domestication** : chien (✔), chèvre, mouton, porc, bœuf, volaille.
Sauvages : cerf, sanglier, loup, oiseaux. Abeilles (ruche primitive), poissons.

**Flore & biome.** Clairières défrichées, **champs cultivés** (blé/orge, lin),
vergers, prairies pâturées, forêt reculée. Cultures = nouvel asset clé.

**Ressources.** Bois, pierre, argile (poterie/briques), silex, **grain**, laine,
lait/viande, os. Or/cuivre natif en fin d'ère (pépites).

**Bâtiments (kit « village néolithique »).**
- **T1** Maison ronde en torchis toit de chaume (`1×1`) · Grenier sur pilotis ·
  Enclos à bétail · Four à poterie.
- **T2** Longère rectangulaire · Puits · Atelier potier · Aire de battage.
- **T3** **Enceinte de pieux** · **Temple mégalithique** (dolmen — ✔ existant) ·
  Cromlech.

**Technologies.** **Agriculture** (déblocage : sédentarité ; effet : nourriture
stable → croissance pop), **Élevage/Domestication**, **Poterie** (stockage),
**Tissage**, **Construction en torchis**, **Mégalithisme** (foi, prestige),
**Roue de potier** (précurseur roue).

**Armée.** Milice paysanne (lance, arc court, fronde), massue de pierre polie,
palissade défensive. Guerre pour terres/greniers.

**Véhicules.** Traîneau, **radeau/pirogue** (rivière), portage.

**Décors/Merveilles.** Champs en damier, murets de pierre sèche, épouvantails,
menhirs alignés, tumulus. **Merveille : Cercle de Pierres (Stonehenge-like).**

**Animations.** `farm_hoe`, `sow_seed`, `harvest_sickle`, `herd_animal`,
`throw_pot`, `weave`.

**Fichiers & priorités.**
- P0 : maison ronde T1, grenier, champ de blé, paysan, chèvre/mouton/chien.
- P1 : potier/tisserand, T2, enclos, four, pirogue, temple mégalithique (✔).
- P2 : cromlech, merveille cercle de pierres, tumulus, ruche.

---

## Ère 3 — Âge du bronze

**Civilisation.** Chefferies/cités-états naissantes, **écriture** (pictogrammes),
premières routes commerciales (étain !). Religion : panthéon, temples-greniers,
prêtres-scribes. Économie : **monnaie-marchandise**, commerce longue distance.
Urbanisme : cité fortifiée en adobe, palais. Population : 150–1 000.

**Personnages.** **Tuniques de lin, ceintures, sandales**, bijoux de bronze.
Nouveaux : marchand (balance), scribe (érudit/scientifique proto), forgeron du
bronze, prêtre-roi, soldat en cuir+bronze. Silhouette drapée.

**Faune.** Bœuf de trait, âne, cheval (attelage naissant), chèvre/mouton/porc,
chien ; faune du Croissant fertile (lion, autruche), poissons de mer, oiseaux.

**Flore & biome.** Plaine alluviale irriguée, **canaux**, palmiers-dattiers,
oliviers, vignes, roseaux, blé/orge, sol ocre/limon. Biome méditerranéen/aride.

**Ressources.** **Cuivre + étain → Bronze**, or, argent, argile (brique crue),
bois, pierre, grain, textile, sel.

**Bâtiments (kit « cité de bronze », adobe — ✔ maison procédurale existante).**
- **T1** Maison d'adobe toit-terrasse (`1×1`) · Grenier · Atelier de fondeur.
- **T2** Maison à cour (`2×2`) · Marché · **Ziggurat/temple** · Fonderie.
- **T3** **Palais** · Muraille d'adobe + porte · **Canal d'irrigation** · Archive
  de tablettes.

**Technologies.** **Métallurgie du bronze** (armes/outils supérieurs),
**Écriture** (administration, +recherche), **Roue & attelage** (transport,
char), **Irrigation**, **Voile** (navigation côtière), **Monnaie/Commerce**,
**Astronomie** (calendrier).

**Armée.** Lanciers de bronze, **archers**, **char de guerre** (2 chevaux),
épéistes (épée courte), fronde. Muraille & tour de guet.

**Véhicules.** **Char à roues**, **chariot à bœufs**, **galère à rames/voile**,
radeau de commerce.

**Décors/Merveilles.** Obélisque (✔ monument), statues divines, jardins irrigués,
routes de terre battue, digues. **Merveille : Grande Ziggurat / Jardins suspendus.**

**Animations.** `forge_smith`, `write_tablet`, `trade_weigh`, `drive_chariot`,
`row_galley`, `irrigate`.

**Fichiers & priorités.**
- P0 : adobe T1 (✔), grenier, marché, forgeron/marchand/lancier, bronze/cuivre.
- P1 : ziggurat, palais, char, galère, muraille, scribe, T2/T3.
- P2 : jardins suspendus, obélisques (✔), statues, canaux animés.

---

## Ère 4 — Âge du fer

**Civilisation.** Royaumes territoriaux, armées de masse, lois écrites. Religion
structurée (temples, clergé). Économie monétaire, foires. Urbanisme : ville en
pierre, forum, remparts. Population : 1 000–10 000.

**Personnages.** **Tuniques + cuirasses de fer/cuir clouté**, casques, capes.
Nouveaux : légionnaire, forgeron du fer, ingénieur militaire (proto), médecin
(guérisseur aux herbes), cavalier. Silhouette martiale.

**Faune.** Cheval de selle/trait, bœuf, mule, chien de garde ; faune tempérée
(cerf, ours, loup, aigle), volailles, porcs ; poissons, dauphins.

**Flore & biome.** Forêt tempérée exploitée, champs clos, vergers, vignes,
pâtures, sol brun. Carrières visibles.

**Ressources.** **Fer** (clé), charbon de bois, bois, pierre de taille, or/argent,
grain, sel, cuir, laine.

**Bâtiments (kit « ville de fer/pierre » — ✔ domus procédurale existante).**
- **T1** Maison de pierre toit de tuiles (`1×1`) · Forge · Grange.
- **T2** Domus à portique (`2×2`) · Marché couvert · **Temple à colonnes** ·
  Caserne · Aqueduc (segment).
- **T3** **Forteresse** · Rempart + tours · **Amphithéâtre/Forum** · Thermes.

**Technologies.** **Métallurgie du fer** (armes/outils de masse), **Loi/État**,
**Route pavée** (logistique), **Aqueduc/Génie civil**, **Monnaie frappée**,
**Voile carrée** (haute mer), **Médecine** (herboristerie).

**Armée.** Fantassin lourd (épée+bouclier), **lanciers en phalange**, archers,
**cavalerie**, **catapulte/baliste**, bélier. Fortifications de pierre.

**Véhicules.** Chariot bâché, char de course, **trirème/galère de guerre**,
navire marchand.

**Décors/Merveilles.** Colonne à statue (✔ monument), arcs de triomphe, bornes
milliaires, aqueduc, ponts de pierre. **Merveille : le Grand Amphithéâtre / le
Phare.**

**Animations.** génériques + `forge_iron`, `march_formation`, `fire_catapult`,
`heal_herbs`, `cavalry_charge`.

**Fichiers & priorités.**
- P0 : maison pierre T1 (✔), forge, caserne, légionnaire/archer/cavalier, fer.
- P1 : temple à colonnes, forteresse, catapulte, trirème, aqueduc, T2/T3.
- P2 : amphithéâtre, phare, thermes, arcs, faune tempérée complète.

---

## Ère 5 — Antiquité (classique)

*Sous-phase d'apogée de `Iron` : même mécanique, kit « âge d'or classique ».*

**Civilisation.** Empire/cités-états savantes, philosophie, démocratie/sénat,
grand commerce maritime, colonies. Religion olympienne + mystères. Urbanisme :
agora, théâtre, bibliothèque, port monumental. Population : 10 000–100 000.

**Personnages.** **Toges, péplos, laurier**, philosophes, sénateurs, **savants**
(vrais scientifiques), médecins hippocratiques, athlètes, marins. Riche variété
de tenues civiques.

**Faune.** Idem ère 4 + éléphant de guerre, chameau (commerce), paons, chevaux
de course. Créatures marines (poulpe, thon).

**Flore & biome.** Méditerranéen d'apogée : oliveraies, vignobles en terrasses,
cyprès, agrumes, blé. Marbre en carrière.

**Ressources.** Fer, bronze, **marbre**, or/argent (monnaie), pourpre, huile,
vin, grain (annone), verre (naissant).

**Bâtiments (kit « classique marbre »).**
- **T1** Maison à atrium · Échoppe d'agora.
- **T2** **Temple péristyle** · Théâtre · Bibliothèque · Gymnase · Port à quais.
- **T3** **Panthéon à dôme** · Colisée · Phare monumental · Sénat.

**Technologies.** **Philosophie/Science** (mathématiques, mécanique — +grosse
recherche), **Démocratie/République**, **Béton romain**, **Verrerie**,
**Cartographie/Navigation hauturière**, **Médecine hippocratique**,
**Mécanique** (vis, poulie, catapulte à torsion).

**Armée.** Phalange/légion d'élite, archers crétois, **cavalerie lourde**,
**éléphants de guerre**, **catapultes à torsion**, marine de guerre (trirème,
quinquérème), tours de siège.

**Véhicules.** Char de course, **navires marchands hauturiers**, galères
de guerre lourdes, chariots de convoi.

**Décors/Merveilles.** Statues de marbre, colonnades, arcs, mosaïques (sol),
routes impériales. **Merveilles : le Colosse, la Grande Bibliothèque, le Phare
d'Alexandrie.**

**Fichiers & priorités.**
- P0 : maison atrium, agora, hoplite/savant, marbre.
- P1 : temple péristyle, théâtre, bibliothèque, éléphant de guerre, quinquérème.
- P2 : les 3 merveilles, colisée, mosaïques, faune exotique.

---

## Ère 6 — Haut Moyen Âge

*Sous-phase précoce de `Medieval` : kit « post-antique / âge sombre ».*

**Civilisation.** Fragmentation féodale, **monastères** gardiens du savoir,
seigneurs de guerre, servage. Religion : christianisme/monachisme dominant.
Économie : domaniale, foires locales, troc partiel. Urbanisme : motte castrale,
village serf, abbaye. Population : bourgs 500–3 000.

**Personnages.** **Tuniques de laine, capes, coiffes, moines en bure**,
chevaliers en cotte de mailles, serfs, seigneurs, évêques. Silhouette sobre.

**Faune.** Cheval de guerre, bœuf de labour, mule, cochon, mouton, chien de
chasse, faucon (chasse), corbeau ; poissons d'étang (viviers).

**Flore & biome.** Forêt dense reconquérante, clairières, champs en assolement,
haies, marais, sol froid. Ambiance brumeuse.

**Ressources.** Fer, bois, pierre, laine, grain, miel/cire, cuir, sel.

**Bâtiments (kit « haut médiéval »).**
- **T1** Chaumière de serf (colombage rustique) · Étable · Moulin à eau.
- **T2** **Motte + donjon de bois** · Église romane · Forge · Grange dîmière.
- **T3** **Abbaye** · **Château de pierre** (donjon carré) · Rempart de bois.

**Technologies.** **Assolement triennal** (rendement), **Moulin à eau/vent**
(énergie mécanique), **Étrier & cavalerie lourde**, **Charrue lourde**,
**Copie manuscrite** (savoir, +foi/recherche lente), **Fortification de terre**.

**Armée.** **Chevalier en mailles**, lanciers, archers, milice de fauchards,
**donjon défensif**. Guerre de razzia et de siège léger.

**Véhicules.** Chariot lourd, drakkar/**knarr** (raid & commerce), barge fluviale.

**Décors/Merveilles.** Croix de chemin, calvaires, ponts de bois, gués, moulins.
**Merveille : la Grande Abbaye.**

**Fichiers & priorités.**
- P0 : chaumière colombage T1, moulin à eau, serf/chevalier-mailles, motte-donjon.
- P1 : abbaye, église romane, château pierre, faucon, knarr, T2/T3.
- P2 : viviers, calvaires, faune de chasse, brume/FX.

---

## Ère 7 — Moyen Âge

**Civilisation.** Apogée féodale et **communale** : villes libres, guildes,
cathédrales, universités naissantes. Religion : Église puissante, pèlerinages.
Économie : monnaie, banques lombardes, grandes foires, guildes. Urbanisme : ville
close, beffroi, cathédrale, marché. Population : 3 000–50 000.

**Personnages.** **Colombage bourgeois**, robes, chaperons, armures de plates,
guildes (artisans variés), marchands, moines, universitaires, hérauts.
Silhouette colorée, statutaire. (✔ maison à colombage & personnages existants.)

**Faune.** Destrier, palefroi, bœuf, âne, cochon urbain, chien, chat, faucon,
poules ; poissons de marché ; rats (peste).

**Flore & biome.** Bocage tempéré, vergers, vignes, jardins clos, champs
labourés, forêt seigneuriale, sol vert. Saisons marquées.

**Ressources.** Fer, pierre de taille, bois, laine/drap, grain, vin, sel, cuir,
argent/or (monnaie), verre coloré (vitraux).

**Bâtiments (kit « ville médiévale » — ✔ KayKit intégré).**
- **T1** Maison à colombage (`1×1`, ✔) · Échoppe d'artisan · Puits.
- **T2** Maison-atelier de guilde (`2×2`) · **Église/beffroi** · Halle de marché ·
  Forge · Taverne · Moulin.
- **T3** **Cathédrale gothique** · **Château fort** (courtines, donjon) ·
  Université · Remparts + barbacane · Port marchand.

**Technologies.** **Guildes/Métiers**, **Comptabilité/Banque**, **Voûte gothique**
(cathédrales), **Moulin à vent**, **Université/Scolastique** (recherche),
**Arbalète**, **Haut fourneau** (fin d'ère), **Boussole** (navigation).

**Armée.** **Chevalerie de plates**, **arbalétriers**, archers longs, piquiers,
**trébuchet**, tours de siège, **premières bombardes** (fin d'ère), garnison de
château.

**Véhicules.** Chariots de foire, **cog/nef** (commerce & guerre), barges,
carrosse seigneurial.

**Décors/Merveilles.** Croix de marché, fontaines, statues de saints, ponts de
pierre habités, remparts, vitraux (émissif). **Merveille : la Cathédrale / le
Grand Beffroi.**

**Fichiers & priorités.**
- P0 : colombage T1 (✔), marché, forgeron/arbalétrier/chevalier, cathédrale (✔),
  château (✔ église/château KayKit).
- P1 : guildes, université, trébuchet, cog, moulin à vent, T2/T3.
- P2 : cathédrale-merveille, vitraux animés, carrosse, rats/peste FX.

---

## Ère 8 — Renaissance

**Civilisation.** **Humanisme**, mécénat, imprimerie, banques, États modernes,
**grandes découvertes** (colonies, routes océaniques). Religion : réforme,
sécularisation naissante. Économie : capitalisme marchand, bourse, manufactures.
Urbanisme : ville idéale, place, palais, dômes. Population : 50 000–300 000.

**Personnages.** **Pourpoints, fraises, robes à vertugadin, chapeaux à plume**,
savants (Vinci-like), artistes, banquiers, explorateurs, mousquetaires,
imprimeurs, médecins. Silhouette élégante, riche. (✔ demeure Renaissance existante.)

**Faune.** Chevaux de parade, mules de bât, chiens de compagnie, faune coloniale
(perroquet, lama, tortue), poissons, oiseaux exotiques.

**Flore & biome.** Jardins à la française, vergers greffés, vignobles, plantes du
Nouveau Monde (maïs, tomate, tabac), sol soigné. Biome « civilisé ».

**Ressources.** Fer/acier, or/argent (afflux colonial), marbre, bois précieux,
**verre optique**, papier, épices, soie, salpêtre (poudre).

**Bâtiments (kit « Renaissance »).**
- **T1** Demeure bourgeoise à corniche (`1×1`, ✔) · Boutique · Atelier d'artiste.
- **T2** **Palais/villa** (`2×2`) · Banque · Imprimerie · Manufacture · Académie ·
  Théâtre.
- **T3** **Basilique à dôme** (✔ dôme monument) · Citadelle bastionnée ·
  Observatoire · Arsenal naval.

**Technologies.** **Imprimerie** (diffusion du savoir → boom recherche),
**Perspective/Ingénierie** (Vinci), **Poudre à canon/Balistique**,
**Navigation océanique/Caravelle**, **Banque/Bourse**, **Optique** (lunette),
**Anatomie/Médecine moderne**, **Fortification bastionnée (trace italienne)**.

**Armée.** **Mousquetaires (arquebuse)**, piquiers (tercio), **artillerie de
campagne (canons)**, cavalerie de reîtres, **galions armés**, forts en étoile.

**Véhicules.** **Caravelle/galion**, carrosse, chariots de manufacture, premières
machines de Vinci (char, aile — prototypes/merveilles).

**Décors/Merveilles.** Statues classiques, fontaines monumentales, jardins
géométriques, obélisques, ponts ornés. **Merveilles : la Basilique à dôme, la
Machine volante de Vinci, l'Horloge astronomique.**

**Fichiers & priorités.**
- P0 : demeure T1 (✔), marché/boutique, mousquetaire/canonnier, galion, or.
- P1 : palais, imprimerie, banque, académie, dôme (✔), fort en étoile, T2/T3.
- P2 : merveilles Vinci, observatoire, jardins, faune coloniale.

---

## Ère 9 — Révolution industrielle

**Civilisation.** **Industrialisation**, urbanisation massive, capitalisme
industriel, nations, empires coloniaux, classe ouvrière, syndicats. Religion :
recul, philanthropie. Économie : usines, chemin de fer, charbon-acier, bourse.
Urbanisme : ville-usine, faubourgs ouvriers, gares. Population : millions.

**Personnages.** **Redingotes, hauts-de-forme, robes à crinoline, casquettes
ouvrières, uniformes à galons**, ingénieurs, ouvriers, industriels, scientifiques
(labo), médecins, cheminots, mineurs de charbon. (✔ bâtisse brique existante.)

**Faune.** Chevaux de trait/omnibus (déclinants), pigeons voyageurs, chiens,
chats de fabrique, bétail d'abattoir, rats. Faune coloniale exhibée (zoos).

**Flore & biome.** Campagne mécanisée + **friches industrielles**, parcs urbains,
arbres suie, sol pavé/charbonneux. Ciel de fumée (FX).

**Ressources.** **Charbon** (clé), **fer→acier**, cuivre, bois, coton/laine
(textile), or (étalon), pierre, verre plat, premiers **hydrocarbures**.

**Bâtiments (kit « industriel brique » — ✔ maison brique existante).**
- **T1** Maison ouvrière en rangée (`1×1`, ✔) · Atelier · Entrepôt.
- **T2** **Usine à cheminée** (`2×3`) · **Gare** · Banque · Hôpital · École ·
  Pont de fer.
- **T3** **Grande manufacture** · **Tour de l'horloge** (✔ Big Ben monument) ·
  Gare monumentale · Haut fourneau · Palais d'exposition (verre & fer).

**Technologies.** **Machine à vapeur** (moteur universel), **Chemin de fer**,
**Métallurgie de l'acier (Bessemer)**, **Électricité (dynamo, lampe)**,
**Télégraphe**, **Chimie industrielle**, **Médecine (asepsie, vaccins)**,
**Production de masse**.

**Armée.** **Fantassins à fusil (à percussion puis à répétition)**, artillerie
rayée, **cuirassés à vapeur**, **canonnières**, premiers **trains blindés**,
mitrailleuse (fin d'ère), forts modernes.

**Véhicules.** **Locomotive + wagons**, omnibus/tram hippomobile puis à vapeur,
**paquebot/cuirassé à vapeur**, premières **automobiles** (fin d'ère), dirigeable
(proto), montgolfière.

**Décors/Merveilles.** Réverbères (gaz→électrique, émissif), ponts métalliques,
viaducs, statues civiques, **réseau ferroviaire**, canaux industriels. **Merveilles :
la Tour de fer (Eiffel-like), le Palais de cristal, le Grand Canal.**

**Fichiers & priorités.**
- P0 : maison ouvrière T1 (✔), usine à cheminée, gare, ouvrier/ingénieur/
  fusilier, charbon+acier, locomotive.
- P1 : tour horloge (✔), hôpital, banque, cuirassé, tram, pont de fer, T2/T3.
- P2 : Tour de fer, Palais de cristal, automobile, dirigeable, FX fumée.

---

## Ère 10 — Époque moderne

**Civilisation.** **XXᵉ siècle** : États-nations de masse, démocraties &
idéologies, guerres mondiales (hors-champ, ton pacifié), société de
consommation, médias de masse, ONU/diplomatie globale. Économie : industrie
lourde + services, pétrole, automobile. Urbanisme : métropole verticale,
banlieues, autoroutes, aéroports. Population : dizaines de millions/cité.

**Personnages.** **Costumes-cravates, robes modernes, jeans, uniformes
militaires modernes, blouses de labo, salopettes**, pilotes, scientifiques,
médecins hospitaliers, ouvriers, cadres, policiers. (✔ immeuble béton/verre
existant.)

**Faune.** Animaux de compagnie (chien, chat), bétail industriel (hors-vue),
pigeons urbains, chevaux de sport/police, faune de parcs, zoos. Espèces
menacées (message écologique).

**Flore & biome.** Métropole + périurbain : arbres d'alignement, gazon, parcs,
agriculture intensive (champs géants, serres), sol asphalte/béton. Pollution FX.

**Ressources.** **Pétrole** (clé), **gaz**, charbon, acier, aluminium, cuivre,
béton, verre, plastiques, uranium (fin d'ère), or/devises.

**Bâtiments (kit « moderne béton/verre » — ✔ immeuble existant).**
- **T1** Pavillon/immeuble bas (`1×1`, ✔) · Commerce · Station-service.
- **T2** **Immeuble de bureaux** (`2×2`) · Hôpital moderne · Université · Usine
  automatisée · Stade · Centrale (charbon/gaz).
- **T3** **Gratte-ciel** (✔ tour de verre monument) · **Aéroport** · **Centrale
  nucléaire** · Barrage hydro · Port à conteneurs · Complexe militaire.

**Technologies.** **Moteur à combustion/Automobile**, **Aviation**, **Électronique
/Radio-TV**, **Pétrochimie/Plastiques**, **Énergie nucléaire**, **Antibiotiques/
Médecine moderne**, **Fusée/Spatial (Spoutnik)**, **Informatique (mainframe)**.

**Armée.** **Infanterie mécanisée**, **chars de combat**, **avions de chasse/
bombardiers**, **hélicoptères**, **sous-marins**, **porte-avions**, **artillerie
lourde**, **missiles balistiques (proto)**, DCA, bases militaires.

**Véhicules.** **Automobile, camion, bus**, **train électrique/TGV (fin)**,
**avion de ligne**, hélicoptère, **cargo/pétrolier**, **fusée**, sous-marin.

**Décors/Merveilles.** Autoroutes & échangeurs, ponts suspendus, pylônes &
**réseau électrique**, panneaux, stades, monuments civiques. **Merveilles : le
Pont suspendu géant, le Gratte-ciel emblématique, la Rampe de lancement (spatial).**

**Fichiers & priorités.**
- P0 : immeuble T1 (✔), bureaux, hôpital, voiture, char/avion, pétrole.
- P1 : gratte-ciel (✔), aéroport, centrale nucléaire, porte-avions, TGV, T2/T3.
- P2 : merveilles, barrage, réseau électrique, FX pollution/nuit émissive.

---

## Ère 11 — Ère numérique

*Sous-phase tardive de `Modern` : kit « smart city / haute-tech contemporaine ».*

**Civilisation.** **Mondialisation & Internet** : économie de la connaissance,
plateformes, réseaux sociaux, gouvernance des données, transition écologique.
Religion : pluralisme/laïcité. Économie : numérique, services, finance
algorithmique, renouvelables. Urbanisme : **ville intelligente**, campus tech,
data centers, mobilité douce. Population : mégapoles.

**Personnages.** **Tenues casual-tech, hoodies, tailleurs slim, exosquelettes
d'assistance (proto), tenues connectées**, développeurs, data-scientists,
chirurgiens robot-assistés, techniciens renouvelables, streamers, agents de
drones. Lunettes AR.

**Faune.** Animaux de compagnie « augmentés » (colliers GPS), robots animaliers
(chien-robot), faune réensauvagée (rewilding), pollinisateurs sous surveillance.

**Flore & biome.** **Végétalisation urbaine** : toits verts, murs végétaux,
fermes verticales, parcs dépollués, forêts protégées, **panneaux solaires** comme
« flore » technologique. Sol perméable, pistes cyclables.

**Ressources.** **Lithium** (batteries), **terres rares**, silicium, cuivre,
**données** (ressource abstraite), uranium, hydrogène, recyclé (économie
circulaire), énergie solaire/éolienne.

**Bâtiments (kit « numérique / durable »).**
- **T1** Logement connecté · Boutique/coworking · Borne de recharge.
- **T2** **Campus tech** (`2×2`) · **Data center** · Hôpital connecté · Ferme
  verticale · Parc éolien/solaire.
- **T3** **Tour bioclimatique** · **Fusion/centrale renouvelable géante** ·
  Aéroport hub · Centre de contrôle drones · Bourse numérique.

**Technologies.** **Internet/Réseaux**, **Informatique personnelle & mobile**,
**Intelligence artificielle (faible)**, **Robotique industrielle**, **Énergies
renouvelables/Batteries**, **Génétique/CRISPR**, **Impression 3D**,
**Véhicules autonomes/électriques**, **Réalité augmentée**.

**Armée.** **Drones (recon & combat)**, **cyber-guerre (unités « hacker »)**,
soldats connectés/exosquelette léger, **véhicules autonomes militaires**, défense
antimissile, satellites de surveillance. Ton dissuasif/défensif.

**Véhicules.** **Voiture électrique autonome**, **e-VTOL/taxi-drone (proto)**,
train maglev, cargo automatisé, **hyperloop (proto)**, vélo/trottinette partagés.

**Décors/Merveilles.** Écrans géants (émissif), mobilier urbain intelligent,
bornes, panneaux solaires, éoliennes, réseaux 5G, jardins connectés.
**Merveilles : le Réacteur à Fusion, la Méga-ferme verticale, le Réseau orbital
de satellites.**

**Fichiers & priorités.**
- P0 : logement connecté, data center, dev/technicien, drone, lithium/données.
- P1 : campus, ferme verticale, tour bioclimatique, voiture autonome, T2/T3.
- P2 : fusion, merveilles, chien-robot, FX néon/hologrammes UI.

---

## Ère 12 — Futur proche

*Sous-phase précoce de `Future` : kit « solarpunk / cyber sobre ».*

**Civilisation.** **Post-rareté naissante** : automatisation généralisée, revenu
universel, gouvernance IA-assistée, colonisation orbitale/lunaire. Religion :
transhumanisme, spiritualités hybrides. Économie : énergie quasi-gratuite
(fusion), fabrication additive, **IA forte** émergente. Urbanisme : arcologies,
dômes, villes autosuffisantes. Population : régulée, augmentée.

**Personnages.** **Combinaisons techniques lumineuses, exosquelettes, implants
discrets**, ingénieurs orbitaux, cyberneticiens, IA humanoïdes (androïdes),
médecins nano, pilotes de navette, cultivateurs hydroponiques. **Premiers
cyborgs & robots humanoïdes** (roster §5.1). (✔ tour de verre existante.)

**Faune.** Faune restaurée & bio-ingénierée, **animaux-robots** utilitaires,
espèces « dé-extinctes » (mammouth de retour !), pollinisateurs-drones,
aquaculture. Bio-dômes.

**Flore & biome.** **Solarpunk** : villes-jardins, forêts verticales, algues
énergétiques, cultures sous dôme, **bio-luminescence** (émissif doux). Nature &
techno fusionnées. Sol propre.

**Ressources.** **Fusion (hélium-3)**, **cristaux/énergie**, lithium/terres rares
recyclés, **matériaux composites/graphène**, eau (colonies), **nanomatière**,
données/IA.

**Bâtiments (kit « futur proche »).**
- **T1** Module d'habitat lumineux · Fab-lab (impression) · Serre hydroponique.
- **T2** **Arcologie (bloc)** (`2×2`) · Centre IA · Hôpital nano · **Spatioport
  léger** · Ferme algale.
- **T3** **Arcologie-dôme** (`4×4`) · **Réacteur à fusion** · **Ascenseur spatial
  (base)** · Usine de robots · Centre de terraformation (proto).

**Technologies.** **Fusion nucléaire**, **IA forte/AGI**, **Robotique humanoïde**,
**Nanotechnologie/Médecine régénérative**, **Fabrication additive avancée**,
**Vol spatial réutilisable/Colonie lunaire**, **Interfaces neuronales**,
**Cybernétique**.

**Armée.** **Robots de combat & méchas légers**, **exosquelettes de combat**,
**essaims de drones**, **armes à énergie dirigée (proto)**, **boucliers/défenses
laser**, drones orbitaux, guerre défensive automatisée.

**Véhicules.** **Véhicule antigravité (proto)**, **VTOL personnel**, **navette
spatiale réutilisable**, capsule orbitale, transport maglev/hyperloop, rover
lunaire.

**Décors/Merveilles.** Hologrammes urbains, panneaux d'énergie, jardins
lumineux, dômes, tours-jardins, plateformes orbitales visibles. **Merveilles :
l'Ascenseur spatial, la Première Colonie lunaire, le Cerveau-IA planétaire.**

**Fichiers & priorités.**
- P0 : module habitat, centre IA, ingénieur/androïde, drone/mécha léger, fusion.
- P1 : arcologie, spatioport, réacteur fusion, VTOL, navette, T2/T3.
- P2 : ascenseur spatial, colonie lunaire, animaux-robots, bio-luminescence FX.

---

## Ère 13 — Futur avancé

**Civilisation.** **Post-humanité planétaire** : société d'abondance,
conscience augmentée, IA co-gouvernante, **planète-cité (écoumènopolis)**,
terraformation locale. Religion : cosmisme, fusion homme-machine. Économie :
énergie illimitée, matière programmable. Urbanisme : mégastructures continues,
niveaux empilés, ciel domestiqué. Population : milliards intégrés.

**Personnages.** **Cyborgs avancés, androïdes conscients, humains augmentés,
avatars holographiques**, architectes planétaires, xéno-biologistes, IA
incarnées, gardiens de la biosphère, pilotes interorbitaux. Silhouettes
fluides, lumineuses.

**Faune.** Écosystèmes synthétiques, créatures bio-ingénierées, **gardiens
robotiques géants**, faune adaptée aux dômes/orbites, IA-animales.

**Flore & biome.** **Biosphère contrôlée** : forêts-cathédrales, océans
artificiels, jardins gravitationnels, flore luminescente, atmosphère gérée.
Mégastructures verdies.

**Ressources.** **Antimatière (naissante)**, **matière programmable/nanomatière**,
énergie de fusion/solaire orbitale (Dyson-proto), **cristaux exotiques**, éléments
transuraniens, eau/atmosphère (terraformation).

**Bâtiments (kit « mégastructure »).**
- **T1** Cellule d'habitat modulaire (empilable) · Nano-fabrique.
- **T2** **Tour-arcologie kilométrique** · Centre de terraformation · Hôpital de
  régénération · **Spatioport orbital**.
- **T3** **Mégastructure continue (district)** · **Anneau/plateforme orbitale** ·
  **Cœur-IA planétaire** · Usine d'antimatière · Bouclier planétaire.

**Technologies.** **IA super-intelligente**, **Matière programmable**,
**Terraformation**, **Propulsion avancée (fusion/ion/antimatière-proto)**,
**Téléportation quantique de données**, **Immortalité/Upload**, **Méga-ingénierie
orbitale (essaim de Dyson-proto)**, **Champs de force**.

**Armée.** **Méchas lourds**, **robots de combat autonomes**, **flottes de
drones orbitaux**, **armes à énergie/plasma**, **défenses orbitales (canons/
lasers)**, boucliers planétaires, IA de guerre défensive.

**Véhicules.** **Vaisseaux interorbitaux**, **antigravité généralisée**,
navettes de masse, transporteurs orbitaux, rovers de terraformation, capsules
de saut.

**Décors/Merveilles.** Villes-lumière étagées, ascenseurs orbitaux multiples,
anneaux planétaires, hologrammes-cité, jardins gravitationnels. **Merveilles :
l'Anneau orbital, le Cœur-Monde (IA), l'Océan artificiel.**

**Fichiers & priorités.**
- P0 : cellule habitat, tour-arcologie, cyborg/androïde, mécha lourd, antimatière.
- P1 : mégastructure district, plateforme orbitale, cœur-IA, vaisseau interorbital.
- P2 : anneau orbital, océan artificiel, faune synthétique, FX énergie/champs.

---

## Ère 14 — Civilisation interplanétaire

*Nouveau tier de code `Interplanetary (8)`.*

**Civilisation.** **Espèce multi-mondes** : colonies sur planètes/lunes/astéroïdes,
gouvernance fédérale du système, **terraformation à grande échelle**, IA & humains
augmentés en symbiose. Religion : cosmisme mûr. Économie : commerce interplanétaire,
énergie d'étoile (Dyson partiel), ressources d'astéroïdes. Urbanisme : cités sous
dôme, habitats O'Neill, stations. Population : multi-planétaire.

**Personnages.** **Combinaisons spatiales stylisées, exo-suits gravitationnels,
androïdes coloniaux, xéno-explorateurs, terraformeurs, pilotes interplanétaires,
diplomates de la Fédération**. Adaptés à faible/haute gravité.

**Faune.** **Xéno-faune** (créatures d'autres mondes, bio-ingénierées ou
indigènes), faune d'habitat spatial (biosphères closes), animaux-drones
d'exploration, écosystèmes terraformés.

**Flore & biome.** **Biomes planétaires variés** : désert martien terraformé
(rouge→vert), lune glacée, jungle exoplanétaire, monde océan, astéroïde minier.
Flore adaptée (xéno-plantes, lichens spatiaux, forêts sous dôme). Ciels étrangers.

**Ressources.** **Hélium-3 lunaire**, **glace d'eau (comètes/lunes)**, **métaux
d'astéroïdes (platine, fer, nickel)**, **antimatière**, **énergie stellaire
(Dyson)**, **cristaux exotiques**, deutérium, régolithe.

**Bâtiments (kit « colonial spatial »).**
- **T1** Dôme d'habitat colonial · Sas/module · Extracteur de régolithe.
- **T2** **Cité sous dôme** (`3×3`) · **Spatioport interplanétaire** · Complexe de
  terraformation · Mine d'astéroïde · Ferme close.
- **T3** **Habitat O'Neill (cylindre)** · **Collecteur stellaire (Dyson-swarm)** ·
  **Chantier spatial** · Cœur de terraformation planétaire · Défense orbitale de
  système.

**Technologies.** **Propulsion interplanétaire (fusion/ion/voile)**,
**Terraformation planétaire**, **Habitats à gravité artificielle**,
**Minage d'astéroïdes**, **Sphère de Dyson (essaim)**, **Écosystèmes clos
autosuffisants**, **IA de flotte**, **Cryogénie/longévité**.

**Armée.** **Flottes spatiales (croiseurs, frégates, chasseurs)**, **plateformes
de défense orbitale**, **méchas de combat lourds**, **drones de guerre spatiale**,
**armes à plasma/rail orbital**, boucliers de système. Doctrine défensive.

**Véhicules.** **Vaisseaux interplanétaires (transport, minier, exploration)**,
**navettes planète-orbite**, rovers de terraformation, **remorqueurs
d'astéroïdes**, capsules de colons.

**Décors/Merveilles.** Dômes coloniaux, ascenseurs orbitaux planétaires, anneaux
de stations, champs de panneaux stellaires, terraformeurs géants. **Merveilles :
la Sphère de Dyson (partielle), le Cylindre O'Neill, la Planète terraformée.**

**Fichiers & priorités.**
- P0 : dôme d'habitat, spatioport interplanétaire, colon/terraformeur, chasseur
  spatial, hélium-3/métaux d'astéroïde, 2–3 biomes planétaires.
- P1 : cité-dôme, O'Neill, mine d'astéroïde, flotte, croiseur, terraformation.
- P2 : Dyson-swarm, xéno-faune, merveilles, FX atmosphères planétaires.

---

## Ère 15 — Civilisation galactique

*Nouveau tier de code `Galactic (9)`.*

**Civilisation.** **Empire/Fédération galactique** : voyage supraluminique,
maîtrise de l'énergie d'étoiles entières, IA-divinités, **méga-ingénierie
stellaire**, contact/xéno-diplomatie, conscience distribuée. Religion :
transcendance, fusion avec le cosmos. Économie : post-matérielle, énergie de type
II (Kardashev), matière-énergie à volonté. Urbanisme : mondes-artefacts, sphères,
anneaux-mondes. Population : galactique.

**Personnages.** **Êtres post-humains, IA incarnées et éthérées, avatars
énergétiques, gardiens stellaires, xéno-ambassadeurs, architectes galactiques,
holos-consciences**. Silhouettes lumineuses, semi-abstraites, personnalisables
(hologrammes). Le « personnage » devient parfois un **artefact/vaisseau**.

**Faune.** **Xéno-espèces galactiques**, créatures stellaires/du vide,
**écosystèmes d'anneaux-mondes**, entités énergétiques, faune bio-forgée sur
mesure. Bestiaire cosmique.

**Flore & biome.** **Biomes artificiels d'anneau-monde/sphère**, jardins
stellaires, nébuleuses domestiquées, mondes-forêts, océans de plasma contrôlé,
**flore énergétique/cristalline**. Cieux galactiques (fond d'étoiles, nébuleuses).

**Ressources.** **Énergie stellaire (Dyson complète, type II)**, **antimatière de
masse**, **matière exotique/négative** (distorsion), **trous noirs artificiels
(mini)**, **datamatière/néant quantique**, **éléments forgés en étoile**.

**Bâtiments / mégastructures (kit « stellaire »).**
- **T1** Nœud d'habitat orbital · Relais FTL · Collecteur d'énergie stellaire.
- **T2** **Cité-anneau (segment)** · **Chantier de vaisseaux-monde** · Nexus IA
  galactique · Porte des étoiles (stargate).
- **T3** **Sphère de Dyson complète** · **Anneau-monde (Ringworld)** ·
  **Cerveau-Matriochka (IA stellaire)** · **Berceau de trou noir (énergie)** ·
  Monde-artefact.

**Technologies.** **Voyage supraluminique (FTL/distorsion/trou de ver)**,
**Sphère de Dyson complète (Kardashev II)**, **Ingénierie stellaire (déplacer/
allumer des étoiles)**, **IA-dieu/Matriochka**, **Matière programmable à l'échelle
planétaire**, **Portes des étoiles**, **Contrôle de trous noirs**,
**Transcendance/conscience distribuée**.

**Armée.** **Vaisseaux-mondes de guerre**, **flottes stellaires**, **canons à
antimatière/rayons stellaires**, **manipulateurs de gravité (armes)**,
**boucliers de système**, **essaims autonomes**, défenses de type II. Le conflit
devient stratégie d'échelle cosmique (ton : équilibre/gardien).

**Véhicules.** **Vaisseaux FTL (exploration, colonie, guerre)**, **vaisseaux-
mondes**, portails/portes des étoiles (téléportation), navettes de saut, sondes
galactiques.

**Décors/Merveilles.** Sphères de Dyson, anneaux-mondes, portes stellaires,
nébuleuses aménagées, étoiles domestiquées, champs de vaisseaux. **Merveilles
ultimes : la Sphère de Dyson, l'Anneau-Monde, le Cerveau-Matriochka, la Porte
Galactique.** *(Fin de la courbe de progression — apogée du jeu.)*

**Fichiers & priorités.**
- P0 : nœud d'habitat orbital, cité-anneau (segment), post-humain/IA, vaisseau
  FTL, énergie stellaire, fond galactique.
- P1 : sphère de Dyson, chantier de vaisseaux-monde, nexus IA, flotte stellaire.
- P2 : anneau-monde, Matriochka, porte galactique, xéno-faune cosmique, FX
  stellaires/distorsion.

---

# Partie III — Systèmes transverses

## Arbre technologique complet

Colonne « débloque » = ce que la techno **rend productible/constructible**.
Coût = ressources dominantes. (Conditions détaillées gérées côté `EraSystem`/
recherche.)

| Techno | Ère | Prérequis | Coût dominant | Débloque (gameplay) |
|---|:--:|---|---|---|
| Feu | 1 | — | — | cuisson, chaleur, éloigne prédateurs |
| Silex/Taille | 1 | Feu | silex | outils → +récolte, lance |
| Apprivoisement | 1→2 | Chasse | nourriture | chien (compagnon/chasse) |
| Agriculture | 2 | Silex | grain, eau | champs, sédentarité, +pop |
| Élevage | 2 | Apprivoisement | enclos | bétail, laine, lait |
| Poterie/Tissage | 2 | Agriculture | argile | stockage, textile |
| Roue | 2→3 | Poterie | bois | chariot, char, moulin |
| Écriture | 3 | Agriculture | argile | administration, +recherche |
| Bronze | 3 | Feu, minage | cuivre+étain | armes/outils bronze |
| Irrigation | 3 | Agriculture | eau, terre | rendement, cités fluviales |
| Voile | 3 | Roue | bois, textile | navigation côtière, commerce |
| Monnaie | 3 | Écriture | or/argent | marché, commerce, prix |
| Fer | 4 | Bronze | fer, charbon | armée de masse, outils fer |
| Route pavée | 4 | Roue | pierre | logistique, +commerce |
| Aqueduc/Génie | 4 | Fer | pierre | villes, santé, +pop |
| Loi/État | 4 | Écriture | — | stabilité, impôts |
| Philosophie/Science | 5 | Écriture | — | +++recherche, mécanique |
| Béton | 5 | Aqueduc | pierre, chaux | grands bâtiments, dômes |
| Navigation hauturière | 5 | Voile | — | colonies, exploration |
| Assolement/Moulin | 6 | Agriculture | bois | énergie mécanique, +rendement |
| Cavalerie lourde | 6 | Fer, élevage | fer | chevaliers |
| Voûte gothique | 7 | Béton/pierre | pierre | cathédrales |
| Université | 7 | Écriture, Loi | — | recherche soutenue |
| Banque | 7 | Monnaie | or | crédit, grands projets |
| Boussole | 7 | Navigation | fer | haute mer fiable |
| Poudre à canon | 7→8 | Chimie proto | salpêtre | bombardes, mousquets |
| Imprimerie | 8 | Université | papier | +++diffusion recherche |
| Caravelle/Océan | 8 | Boussole | bois | Grandes Découvertes |
| Optique | 8 | Imprimerie | verre | lunette, science |
| Fortif. bastionnée | 8 | Poudre | pierre | forts en étoile |
| Machine à vapeur | 9 | Optique, Fer | charbon+acier | usines, train, bateau vapeur |
| Chemin de fer | 9 | Vapeur | acier | logistique de masse |
| Acier (Bessemer) | 9 | Fer, charbon | fer+charbon | ponts, gratte-ciel, cuirassés |
| Électricité | 9 | Vapeur | cuivre | éclairage, moteurs, télégraphe |
| Combustion/Auto | 10 | Électricité | pétrole | voiture, camion, avion |
| Aviation | 10 | Combustion | alu | avions, transport aérien |
| Électronique | 10 | Électricité | cuivre, silicium | radio/TV, radar |
| Nucléaire | 10 | Électronique | uranium | centrale, sous-marin, dissuasion |
| Spatial (fusée) | 10→11 | Aviation, Nucléaire | alu, carburant | satellites, lancement |
| Informatique | 10→11 | Électronique | silicium | automatisation, recherche++ |
| Internet | 11 | Informatique | fibre/cuivre | économie numérique, données |
| IA faible | 11 | Internet | données, silicium | optimisation, drones |
| Renouvelables/Batterie | 11 | Électronique | lithium | énergie propre, VE |
| Robotique | 11→12 | IA faible | acier, silicium | usines robots, unités robots |
| Fusion | 12 | Nucléaire, Robotique | hélium-3, cristaux | énergie quasi-illimitée |
| IA forte (AGI) | 12 | IA faible, Info | données | gouvernance, recherche+++ |
| Nanotech | 12 | Robotique | nanomatière | médecine, fab additive |
| Vol spatial réutil. | 12 | Spatial, Fusion | composites | colonie lunaire, spatioport |
| Cybernétique | 12 | Nanotech, IA | composites | cyborgs, exosquelettes |
| Matière programmable | 13 | Nanotech, AGI | nanomatière | mégastructures, réparation |
| Terraformation | 13→14 | Fusion, IA forte | énergie, eau | rendre des mondes habitables |
| Propulsion avancée | 13→14 | Fusion | antimatière | vaisseaux interplanétaires |
| Sphère de Dyson | 14→15 | Prop. avancée | métaux/énergie stellaire | énergie de type II |
| FTL/Distorsion | 15 | Dyson, Antimatière | matière exotique | voyage galactique |
| Ingénierie stellaire | 15 | FTL, Matière prog. | énergie stellaire | anneaux-mondes, déplacer étoiles |
| IA-dieu/Matriochka | 15 | AGI, Dyson | datamatière | apogée : conscience galactique |

## Pipeline de production

**Ordre de fabrication d'un asset** (Definition of Done) :
1. **Concept** (silhouette + palette validées, réf. iso).
2. **Blockout** à l'échelle grille (vérifier lisibilité iso & empreinte).
3. **Modélisation LOD0** (budget respecté) → **LOD1/LOD2** (décimation guidée).
4. **UV + atlas de kit** (partager le matériau d'ère).
5. **Textures** (albedo/ORM/normal/emissive), 512–1024.
6. **Rig & skinning** (réutiliser un `rig_*` partagé) + **anims** (réutiliser
   la banque générique, n'ajouter que les clips spécifiques).
7. **Export** `.glb` (jeu) **+** `.fbx` (Unity) + sockets + LOD.
8. **Icône** UI 256².
9. **Décimation** si issu d'IA (`npm run assets:decimate`).
10. **Licence** ajoutée à `LICENSES.md`.
11. **Intégration** : déclarer dans `modelCatalog.ts` / `BuildingModels.ts`.
12. **Vérif** en `?showcase=1` + rendu WebGL headless → capture.

**Dépendances dures** :
- **M0 (socle) avant tout** : rigs + anims + atlas de base + corps de base.
- Un **kit d'ère** = atlas + modules bâtiments + tenues + props, produits
  **ensemble** (cohérence & 1 seul matériau).
- **Réutilisation d'abord** : avant de modéliser, chercher dans les packs CC0
  déjà intégrés (KayKit, Quaternius, Kenney) et dans les kits d'ères voisines.
- **Aucune ère N+1 P0** tant que **ère N P0** n'est pas validée en jeu.

**Sources CC0 recommandées** (déjà éprouvées, GitHub accessible) : **KayKit**
(personnages, médiéval, city, dungeon), **Quaternius** (ultimate packs :
nature, survival, medieval, sci-fi, space), **Kenney** (city, castle, space,
survival). Licences CC0/CC-BY → documenter systématiquement.

## Récapitulatif des livrables

**Par ère, on livre** : liste d'assets (ce doc) · descriptions · rôle gameplay ·
variantes · animations · interactions/dépendances · fichiers (`.glb`/`.fbx`/
textures/icônes/anims) · priorité (P0/P1/P2).

**Estimation de volume** (grâce à la modularité) :

| Bloc | Modèles uniques (ordre de grandeur) |
|---|---:|
| Socle partagé (rigs, corps, anims, props génériques) | ~60 |
| Kits d'ères — bâtiments modulaires (15 × ~25 modules) | ~375 |
| Bâtiments hero/merveilles (15 × ~6) | ~90 |
| Tenues/skins personnages (15 × ~10) | ~150 |
| Faune (rigs partagés × ~40 skins) | ~50 |
| Flore/biomes (familles × variantes saison/biome) | ~80 |
| Ressources (nœuds + stocks + icônes) | ~50 |
| Véhicules (15 × ~4) | ~60 |
| Militaire (unités + engins, 15 × ~5) | ~75 |
| Décors/FX | ~90 |
| **Total indicatif** | **~1 080 modèles** (vs ~10 000 en approche naïve) |

**Prochaines actions concrètes pour le jeu actuel :**
1. **M0** : formaliser les 6 rigs + banque d'anims + atlas de base (beaucoup déjà
   présents via KayKit/Quaternius).
2. **Étendre `EraSystem`** à 10 ères (ajouter `Interplanetary`, `Galactic`) +
   `subEra` cosmétique pour les 5 sous-phases.
3. **Compléter les kits P0** des ères déjà codées (Bronze→Futur) avec le même
   pipeline que l'intégration KayKit récente (téléchargement CC0 → `.glb`
   autonome → `BuildingModels.ts` → vérif).
4. **Produire les 2 nouveaux tiers** (interplanétaire, galactique) en P0 :
   habitat-dôme, mégastructure, vaisseau, unité, ressource, biome — pour clore la
   courbe d'évolution jusqu'au galactique.

---

*Fin de la Bible des Assets 3D. Document vivant : toute nouvelle production met à
jour la section d'ère concernée et `LICENSES.md`.*
