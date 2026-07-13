# Workflow des assets 3D

## Où vivent les modèles
`public/models/{characters,animals,props}/` — chargés en glTF par `ModelLibrary`,
déclarés dans `src/render/modelCatalog.ts`, licences dans
`public/models/LICENSES.md`. Le mode `?showcase=1` affiche tout le catalogue.

## Ajouter un modèle

1. **Exporter en `.glb`** (glTF binaire). Depuis Blender : Fichier → Exporter → glTF 2.0.
2. **Décimer si lourd.** Les modèles générés par IA (Tripo…) font souvent
   1–2 M triangles pour ~55 Mo — injouables sur mobile (tout notre monde ≈
   130 k triangles). Le style *paraît* low-poly mais le maillage est
   sur-densifié. On décime sans perte visible :

   ```bash
   npm run assets:decimate -- <source.glb> public/models/props/<nom>.glb <ratio>
   ```

   `ratio` = fraction de triangles conservée. Repères mesurés :
   - arbre : `0.0015` → 1,95 M → 7,9 k tris, 55 Mo → 2,2 Mo
   - diorama de terrain : `0.012` → 1,88 M → 22,6 k tris, 56 Mo → 2,5 Mo

   Vise **< quelques milliers de triangles** pour un prop instancié,
   **< ~30 k** pour une pièce décorative unique.
3. **Ne pas versionner les sources lourdes** — seulement les `.glb` décimés.
4. **Déclarer** le modèle dans `modelCatalog.ts` (id, url relative, catégorie,
   `targetHeight` en tuiles) et **ajouter sa ligne de licence** dans `LICENSES.md`.
5. **Vérifier** dans `?showcase=1` avant de l'utiliser en jeu.

## Textures du terrain (PBR)
Le terrain procédural est habillé par **splatting de 4 matières** (Grass / Sand /
Rock / Dirt) mélangées par biome + pente + altitude dans le shader
(`src/render/TerrainMaterial.ts`). Les textures vivent dans
`public/textures/terrain/<Slot>/<Slot>_{BaseColor,Normal}.png` — vraies textures
**ambientCG (CC0)** en 512 px (Color + NormalGL). Les remplacer = écraser les PNG,
aucun code à toucher. Licences : `public/textures/terrain/LICENSES.md`.

## Budgets (rappel)
- Monde (terrain procédural) : ~130 k triangles.
- Prop instancié (arbre, rocher) : viser < 3–8 k triangles, réutilisé via
  instanciation pour en afficher des milliers (phase Écologie/Habitants).
- Le terrain procédural **n'est jamais un modèle importé** : il est généré et
  déformable en temps réel. Un diorama de terrain cuit ne peut servir que de
  décor / référence de style.
