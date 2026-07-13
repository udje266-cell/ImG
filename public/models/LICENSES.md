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

## `props/` — modèles fournis par le propriétaire du projet
`tree.glb`, `terrain-diorama.glb`

- **Origine** : modèles générés via Tripo, fournis par le propriétaire du projet (détenteur des droits).
- **Traitement** : décimés depuis les sources (~2 M triangles, ~55 Mo) vers des assets game-ready via `tools/decimate-model.mjs` — l'arbre à ~7,9 k tris (2,2 Mo), le diorama à ~22,6 k tris (2,5 Mo). Les sources lourdes ne sont **pas** versionnées.
- **Usage** : l'arbre est un prop de végétation ; le diorama de terrain est **décoratif uniquement** (référence de style / fond / lieu-dit) — il ne remplace pas le terrain procédural, qui doit rester déformable en temps réel.

> Règle du projet : tout nouveau modèle ajouté ici DOIT être accompagné de sa
> ligne de licence dans ce fichier. Les licences acceptées sans validation
> sont CC0 et Apache-2.0/MIT ; CC-BY est accepté avec attribution dans les
> crédits ; les modèles fournis par le propriétaire sont acceptés d'office ;
> tout le reste doit être arbitré avant intégration.
