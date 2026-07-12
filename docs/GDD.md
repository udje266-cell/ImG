# ImG — Game Design Document (GDD)

> **Titre de travail** : *ImG* (« I'm God »)
> **Genre** : God Game 3D / simulation de monde vivant
> **Plateformes** : **Android (priorité), puis iOS** (via Capacitor) ; le web sert de cible de développement et de démo
> **Référence produit** : `CAHIER_DES_CHARGES.md` — ce GDD en est la déclinaison détaillée
> **Version du document** : 2.0 — voir l'historique git pour les révisions

---

## 1. Vision

Le joueur incarne une **divinité** qui influence un monde vivant **en 3D**, **sans jamais le contrôler directement**. Le monde existe par lui-même : ses habitants naissent, décident, construisent, commercent, croient, se font la guerre et meurent — que le joueur intervienne ou non. Le jeu n'a **pas de fin imposée** : chaque partie génère une histoire différente, et **observer sans intervenir** est un style de jeu à part entière.

**Pilier n°1 — Influence, pas contrôle.** Aucun ordre direct. Le joueur agit sur l'environnement (terraforming, météo, miracles) et sur les esprits (inspiration, visions), jamais sur les actes.

**Pilier n°2 — Un monde qui vit sans vous.** Toute mécanique doit fonctionner en autonomie complète. Le test de référence : lancer la simulation 2 heures sans toucher à rien doit produire une histoire intéressante.

**Pilier n°3 — La foi est la monnaie du divin.** Chaque pouvoir consomme de la **Foi**, générée par les croyants. Le joueur est donc en symbiose avec ses fidèles : les aider les fait croire, croire lui donne du pouvoir.

**Pilier n°4 — Conséquences systémiques.** Pas d'événements scriptés : tout émerge de l'interaction des systèmes (écologie → économie → religion → diplomatie → guerre).

---

## 2. Boucle de jeu

### Boucle courte (minute)
1. Observer le monde (habitants, ressources, besoins, dangers).
2. Dépenser de la Foi : terraformer, invoquer la pluie, bénir une récolte…
3. Constater la réaction autonome des habitants.
4. Gagner (ou perdre) de la Foi selon l'impact perçu par les croyants.

### Boucle moyenne (session)
- Guider l'essor d'une communauté : sécuriser nourriture/eau, favoriser l'expansion, orienter les croyances par des miracles ciblés.
- Arbitrer entre plusieurs communautés qui divergent (cultures, religions rivales).

### Boucle longue (partie)
- Accompagner l'évolution technologique (âge de pierre → antiquité → …).
- Voir émerger royaumes, panthéons, guerres de religion, routes commerciales.
- Objectifs sandbox : domination religieuse, prospérité, équilibre écologique — ou pur bac à sable.

---

## 3. Le monde

### 3.1 Génération procédurale
- Monde en **grille 2D** (vue du dessus), généré depuis une **seed** unique et reproductible.
- Couches générées : altitude (heightmap), température (latitude + altitude), humidité (bruit + proximité de l'eau), rivières, gisements de ressources, faune/flore initiales.

### 3.2 Biomes
Classés par (température × humidité × altitude) :

| Biome | Conditions | Ressources typiques |
|---|---|---|
| Océan / Mer | sous le niveau de la mer | poisson |
| Côte / Plage | bord de mer, basse altitude | sel, poisson |
| Prairie | tempéré, humidité moyenne | terres arables, gibier |
| Forêt tempérée | tempéré, humide | bois, gibier, baies |
| Forêt tropicale | chaud, très humide | bois précieux, fruits |
| Savane | chaud, sec | gibier |
| Désert | très chaud, aride | — (oasis rares) |
| Steppe | froid, sec | chevaux, gibier |
| Taïga | froid, humide | bois, fourrures |
| Toundra | très froid | fourrures |
| Montagne | haute altitude | pierre, minerais |
| Neiges éternelles | très haute altitude / polaire | — |

### 3.3 Terraforming temps réel
- Le terrain est **entièrement modifiable** : élever/abaisser le sol, creuser lacs et canaux, aplanir, faire surgir des montagnes.
- Le terraforming **recalcule les biomes** localement (une vallée creusée sous le niveau de la mer se remplit d'eau ; une montagne levée devient enneigée).
- Coût en Foi proportionnel au volume déplacé ; les habitants **réagissent** (peur, émerveillement, réinstallation).

### 3.4 Météo dynamique & saisons
- Cycle **jour/nuit** (impact : activité des agents, dangers nocturnes, visuel).
- **Quatre saisons** modifiant température, croissance des plantes, comportements (semailles, récoltes, hivernage).
- Météo simulée par cellules : nuages, pluie, neige, orages, sécheresses. La pluie recharge l'humidité du sol ; la sécheresse tue les cultures.

### 3.5 Écologie
- **Flore** : croissance, reproduction par essaimage, dépendance à l'humidité/température/saison.
- **Faune** : herbivores et prédateurs, chaînes alimentaires simples, migration, reproduction, extinction locale possible.
- **Ressources** : renouvelables (bois, gibier, poisson) et finies (pierre, minerais). La surexploitation dégrade durablement l'écosystème.

---

## 4. Les habitants

### 4.1 IA autonome
Chaque habitant est un **agent** doté de (cahier des charges §8) :
- **Personnalité** : traits (courage, piété, curiosité, sociabilité…) qui pondèrent toutes les décisions.
- **Mémoire** : connaissance partielle du monde, rumeurs, et surtout **souvenir des interventions du joueur** — un miracle vu enfant façonne le croyant adulte ; les souvenirs se transmettent (déformés) en récits.
- **Émotions** : joie, peur, colère, deuil, émerveillement — modulent les utilités à court terme (un agent terrifié fuit même si son plan disait « récolter »).
- **Besoins** (faim, soif, sommeil, sécurité, social, spirituel) — modèle utilitaire.
- **Objectifs** : buts à long terme émergents (fonder une famille, devenir prêtre, s'enrichir).
- **Famille** : filiation, foyers, héritage — support de la transmission des croyances et des métiers.
- **Profession** : émergente selon les besoins de la communauté.
- **Décision** : *Utility AI* hiérarchique (choix d'objectif) + arbres de comportement (exécution). Aucun agent n'est contrôlable par le joueur.

### 4.2 Société
- **Foyers → villages → cités → royaumes** : structures émergentes fondées sur la démographie et les ressources.
- **Professions** émergentes selon les besoins : cueilleur, fermier, bûcheron, mineur, artisan, marchand, prêtre, soldat, dirigeant.
- **Économie** : production/consommation, stocks, prix émergents par offre/demande, routes commerciales entre implantations, marchés.

### 4.3 Technologies
- Arbre technologique **découvert, pas acheté** : les techs émergent de la pratique (pêcher assez → navigation) et se **diffusent** par contact (commerce, migration, guerre).
- Ères (cahier des charges §9) : **âge de pierre → âge du bronze → âge du fer → moyen âge → renaissance → révolution industrielle → époque moderne → futur.**

### 4.4 Religions dynamiques
- **Les habitants ne voient jamais la divinité** : ils n'ont accès qu'aux événements, qu'ils **interprètent** selon leur culture et le contexte (cahier des charges §6) :

  | Événement | Interprétation typique |
  |---|---|
  | Pluie après sécheresse | bénédiction |
  | Volcan, séisme | colère divine |
  | Éclipse | présage (bon ou funeste selon les dogmes) |
  | Miracle observé | foi renforcée, témoins → récits |
  | Catastrophe sur un rival | élection divine du peuple épargné |

- Les croyances **émergent** : un miracle observé crée des témoins, les témoins des récits, les récits des dogmes. La même intervention peut donc engendrer des dogmes opposés dans deux cultures.
- Chaque religion a : divinité(s) visée(s) (dont le joueur), dogmes générés (interdits alimentaires, rites, jours sacrés), clergé, lieux saints, ferveur.
- **Schismes et conversions** dynamiques ; les religions rivales peuvent adorer des dieux imaginaires (non-joueurs) simulés.

### 4.5 Diplomatie & guerre
- Relations entre communautés : opinion, traités (commerce, alliance, tribut), rivalités religieuses et territoriales.
- Guerres avec objectifs (razzia, conquête, conversion forcée), moral, logistique simplifiée. La guerre reste un **échec systémique observable**, pas un mini-jeu de tactique.

---

## 5. Le joueur divin

### 5.1 La Foi (ressource) et la progression divine
- Générée en continu par les croyants : `foi/s = Σ (ferveur × population)` — amplifiée par les **prières**, les **temples**, les **sacrifices** et les **fêtes religieuses**.
- Dépensée pour tout pouvoir. Réserve plafonnée (extensible par temples/reliques).
- **Progression** (cahier des charges §7) : la puissance divine accumulée au fil des miracles accomplis **débloque de nouveaux pouvoirs** — le panthéon de départ ne connaît que le terraforming ; la pluie, les bénédictions, la création d'espèces puis les catastrophes s'ouvrent avec la dévotion des peuples.
- **Perdre toute crédibilité** (miracles ratés, catastrophes attribuées au joueur) fait chuter la ferveur → spirale de déclin possible.

### 5.2 Pouvoirs divins (extraits)
| Catégorie | Pouvoirs | Coût |
|---|---|---|
| Terraforming | élever/abaisser (montagnes, vallées, falaises), aplanir, creuser rivières/lacs/océans | faible→fort selon volume |
| Climat & météo | pluie, éclaircie, orage, foudre, infléchir le climat local | moyen |
| Vie | faire pousser forêts et plantes, **créer des espèces animales**, bénir récoltes, soigner, fertilité | moyen→fort |
| Inspiration | vision (pousse un agent à prier/migrer/bâtir), révélation technologique | fort |
| Colère | séisme, éruption volcanique, peste, malédiction | très fort, risque de terreur |

Chaque pouvoir a un **impact de croyance** : les témoins deviennent croyants, sceptiques ou terrifiés selon le contexte.

### 5.3 Interface
- Caméra libre (pan/zoom), temps contrôlable (pause, ×1, ×4, ×16).
- HUD minimal : réserve de Foi, pouvoir sélectionné, taille de pincel, date/saison.
- Calques d'information : biomes, humidité, ferveur, richesse, dangers.

---

## 6. Direction artistique & audio (cadrage)
**3D stylisée low poly haut de gamme, colorée et intemporelle** (cahier des charges §10), avec la référence *Godus* assumée pour le langage du terrain — assets 100 % originaux :
- **Terrain 3D en terrasses** : les hauteurs continues de la simulation sont quantifiées en strates géométriques réelles dans le maillage — le relief se lit comme des couches empilées, et chaque geste divin ajoute/retire environ une strate.
- **Low poly + flat shading** : facettes visibles, zéro texture — couleurs par sommet, palette pastel par biome fondue entre tuiles, léger éclaircissement avec l'altitude.
- **Eau** : plan translucide au niveau de la mer ; les fonds se teintent du sable au bleu profond avec la profondeur.
- **Lumière vivante** : soleil directionnel qui suit le cycle jour/nuit, couleur du ciel et de l'ambiance changeant avec l'heure et la saison.
- Audio : ambiances par biome/météo, motifs musicaux réactifs à la ferveur (post-MVP).

## 7. Ce que le jeu n'est PAS (anti-scope)
- Pas de contrôle direct d'unités (≠ RTS).
- Pas de scénario écrit, pas de quêtes scriptées, **pas de fin imposée**.
- Pas de réalisme graphique (le low poly stylisé est un choix, pas une étape).
- Pas de multijoueur au MVP (architecture déterministe compatible lockstep pour plus tard).

## 8. Critères de succès du MVP
Voir `ROADMAP.md`. En une phrase : **un monde procédural avec biomes, cycle jour/nuit et saisons, que le joueur peut terraformer en temps réel en dépensant une Foi visible, avec des tests verts et une base architecturale saine.**
