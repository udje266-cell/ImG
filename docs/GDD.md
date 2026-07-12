# ImG — Game Design Document (GDD)

> **Titre de travail** : *ImG* (« I'm God »)
> **Genre** : God Game / simulation de monde vivant
> **Plateforme** : Web (navigateur), portable vers desktop (Electron/Tauri) ultérieurement
> **Version du document** : 1.0 — voir l'historique git pour les révisions

---

## 1. Vision

Le joueur incarne une **divinité** qui influence un monde vivant **sans jamais le contrôler directement**. Le monde existe par lui-même : ses habitants naissent, décident, construisent, commercent, croient, se font la guerre et meurent — que le joueur intervienne ou non.

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
Chaque habitant est un **agent** doté de :
- **Besoins** (faim, soif, sommeil, sécurité, social, spirituel) — modèle utilitaire.
- **Décision** : *Utility AI* hiérarchique (choix d'objectif) + arbres de comportement (exécution). Aucun agent n'est contrôlable par le joueur.
- **Mémoire & perception** : connaissance partielle du monde, rumeurs, souvenirs des miracles.
- **Traits** : courage, piété, curiosité, sociabilité — influencent les utilités.

### 4.2 Société
- **Foyers → villages → cités → royaumes** : structures émergentes fondées sur la démographie et les ressources.
- **Professions** émergentes selon les besoins : cueilleur, fermier, bûcheron, mineur, artisan, marchand, prêtre, soldat, dirigeant.
- **Économie** : production/consommation, stocks, prix émergents par offre/demande, routes commerciales entre implantations, marchés.

### 4.3 Technologies
- Arbre technologique **découvert, pas acheté** : les techs émergent de la pratique (pêcher assez → navigation) et se **diffusent** par contact (commerce, migration, guerre).
- Ères : Paléolithique → Néolithique → Âge du bronze → Âge du fer → Antiquité classique → … (extensible).

### 4.4 Religions dynamiques
- Les croyances **émergent** : un miracle observé crée des témoins, les témoins des récits, les récits des dogmes.
- Chaque religion a : divinité(s) visée(s) (dont le joueur), dogmes générés (interdits alimentaires, rites, jours sacrés), clergé, lieux saints, ferveur.
- **Schismes et conversions** dynamiques ; les religions rivales peuvent adorer des dieux imaginaires (non-joueurs) simulés.

### 4.5 Diplomatie & guerre
- Relations entre communautés : opinion, traités (commerce, alliance, tribut), rivalités religieuses et territoriales.
- Guerres avec objectifs (razzia, conquête, conversion forcée), moral, logistique simplifiée. La guerre reste un **échec systémique observable**, pas un mini-jeu de tactique.

---

## 5. Le joueur divin

### 5.1 La Foi (ressource)
- Générée en continu par les croyants : `foi/s = Σ (ferveur × population)` — modulée par prières, temples, fêtes religieuses.
- Dépensée pour tout pouvoir. Réserve plafonnée (extensible par temples/reliques).
- **Perdre toute crédibilité** (miracles ratés, catastrophes attribuées au joueur) fait chuter la ferveur → spirale de déclin possible.

### 5.2 Pouvoirs divins (extraits)
| Catégorie | Pouvoirs | Coût |
|---|---|---|
| Terraforming | élever/abaisser, aplanir, creuser l'eau | faible→fort selon volume |
| Météo | pluie, éclaircie, orage, foudre | moyen |
| Vie | bénir récoltes, soigner, fertilité, faire pousser une forêt | moyen |
| Inspiration | vision (pousse un agent à prier/migrer/bâtir), révélation technologique | fort |
| Colère | séisme, éruption, peste, malédiction | très fort, risque de terreur |

Chaque pouvoir a un **impact de croyance** : les témoins deviennent croyants, sceptiques ou terrifiés selon le contexte.

### 5.3 Interface
- Caméra libre (pan/zoom), temps contrôlable (pause, ×1, ×4, ×16).
- HUD minimal : réserve de Foi, pouvoir sélectionné, taille de pincel, date/saison.
- Calques d'information : biomes, humidité, ferveur, richesse, dangers.

---

## 6. Direction artistique & audio (cadrage)
Référence assumée : **le style de *Godus*** (Populous-like de 22cans), transposé en 2D vue du dessus avec des assets 100 % originaux :
- **Terrain stratifié en terrasses** : les hauteurs continues de la simulation sont quantifiées en strates visuelles discrètes, comme des couches de papier découpé empilées ; chaque coup de pinceau divin ajoute/retire environ une strate.
- **Aplats pastel, zéro texture** : une couleur plate par biome, rayures alternées subtiles entre strates paires/impaires pour que chaque terrasse se lise individuellement, léger éclaircissement avec l'altitude.
- **Liserés de contour** : couture sombre là où deux strates se rencontrent — c'est elle qui dessine les courbes de niveau caractéristiques.
- **Eau en bandes plates** : turquoise clair → bleu profond par paliers de profondeur (pas de dégradé), avec une **ligne d'écume claire** le long des côtes.
- Teinte globale jour/nuit et saisonnière par-dessus.
- Audio : ambiances par biome/météo, motifs musicaux réactifs à la ferveur (post-MVP).

## 7. Ce que le jeu n'est PAS (anti-scope)
- Pas de contrôle direct d'unités (≠ RTS).
- Pas de scénario écrit, pas de quêtes scriptées.
- Pas de 3D au MVP.
- Pas de multijoueur au MVP (architecture déterministe compatible lockstep pour plus tard).

## 8. Critères de succès du MVP
Voir `ROADMAP.md`. En une phrase : **un monde procédural avec biomes, cycle jour/nuit et saisons, que le joueur peut terraformer en temps réel en dépensant une Foi visible, avec des tests verts et une base architecturale saine.**
