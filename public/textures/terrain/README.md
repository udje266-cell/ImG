# Textures du terrain

Quatre matières splattées sur le terrain selon **biome + pente + altitude**
(voir `src/render/TerrainMaterial.ts`), avec leurs **normal maps** :

```
Sand/  Sand_BaseColor.png   Sand_Normal.png
Grass/ Grass_BaseColor.png  Grass_Normal.png
Rock/  Rock_BaseColor.png   Rock_Normal.png
Dirt/  Dirt_BaseColor.png   Dirt_Normal.png
```

- **Grass** : prairies / forêts (terrain vert, faible pente).
- **Sand** : plages et bas-fonds côtiers.
- **Dirt** : pentes moyennes, zones sèches (savane/steppe).
- **Rock** : fortes pentes et hautes altitudes.

## Remplacer par tes propres textures
Les fichiers présents sont des **placeholders** générés par
`tools/gen-placeholder-textures.mjs`. Pour utiliser tes vraies textures,
**écrase simplement ces PNG** en gardant les mêmes noms/chemins — aucun code à
modifier. Formats : PNG, idéalement carrés et tileables (répétables), 256–1024 px.
Les BaseColor sont interprétées en sRGB, les Normal en espace linéaire (normal map tangente classique).

> Régénérer les placeholders : `node tools/gen-placeholder-textures.mjs`.
