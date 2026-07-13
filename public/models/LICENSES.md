# Licences des modèles 3D embarqués

Tous les modèles sont libres d'utilisation commerciale. Détail par fichier :

## `characters/` — KayKit : Adventurers Character Pack 1.0
`Barbarian.glb`, `Knight.glb`, `Mage.glb`, `Rogue.glb`, `Rogue_Hooded.glb` (+ textures PNG)

- **Auteur** : Kay Lousberg — https://www.kaylousberg.com
- **Licence** : **CC0 1.0** (domaine public, attribution non obligatoire — voir `characters/LICENSE-KayKit.txt`)
- **Source** : https://github.com/KayKit-Game-Assets/KayKit-Character-Pack-Adventures-1.0

## `animals/Fox.glb`
- **Auteurs** : modèle par PixelMannen (**CC0**) ; rigging & animation par @tomkranis (**CC-BY 4.0**)
- **Source** : https://github.com/KhronosGroup/glTF-Sample-Assets/tree/main/Models/Fox
- **Attribution requise (CC-BY)** : « Fox — rig/animation © tomkranis, CC-BY 4.0 » (à reprendre dans les crédits du jeu)

## `animals/Horse.glb`, `animals/Flamingo.glb`, `animals/Parrot.glb`, `animals/Stork.glb`
- **Auteur** : mirada (créés pour « 3 Dreams of Black », projet ro.me de Google Data Arts)
- **Licence** : **Apache 2.0** (via le dépôt three.js — mention à conserver dans les crédits)
- **Source** : https://github.com/mrdoob/three.js/tree/dev/examples/models/gltf

## `characters/prehistoric-man.glb`, `characters/prehistoric-woman.glb` — fournis par le propriétaire
- **Origine** : modèles générés via Tripo, fournis par le propriétaire du projet (détenteur des droits).
- **Traitement** : décimés (~1,9 M tris, ~56 Mo) → ~15 k tris (2,4–2,9 Mo) via `tools/decimate-model.mjs`.
- **Usage** : habitants de l'âge de pierre (base des futurs habitants). Statiques (pas de rig d'animation).

## `props/` — modèles fournis par le propriétaire du projet
`tree.glb`, `terrain-diorama.glb`, `cloud.glb`, `volcano.glb`, `crystal.glb`, `water-surface.glb`

- **Origine** : modèles générés via Tripo, fournis par le propriétaire du projet (détenteur des droits).
- **Traitement** : décimés depuis les sources (~2 M triangles, ~55 Mo) vers des assets game-ready via `tools/decimate-model.mjs` — l'arbre à ~7,9 k tris (2,2 Mo), le diorama à ~22,6 k tris (2,5 Mo). Les sources lourdes ne sont **pas** versionnées.
- **Usage** : l'arbre est un prop de végétation ; le nuage (`cloud.glb`, ~7,7 k tris) est instancié par la couche météo ; le volcan (`volcano.glb`, ~15 k) est un lieu-dit / support du pouvoir « Réveil du Titan » ; les cristaux (`crystal.glb`, ~7,8 k) un gisement / fontaine magique ; la surface d'eau (`water-surface.glb`, ~12 k) une eau stylisée décorative ; le diorama de terrain est **décoratif uniquement** (référence de style) — aucun ne remplace le terrain procédural, qui doit rester déformable en temps réel.

> Règle du projet : tout nouveau modèle ajouté ici DOIT être accompagné de sa
> ligne de licence dans ce fichier. Les licences acceptées sans validation
> sont CC0 et Apache-2.0/MIT ; CC-BY est accepté avec attribution dans les
> crédits ; les modèles fournis par le propriétaire sont acceptés d'office ;
> tout le reste doit être arbitré avant intégration.
