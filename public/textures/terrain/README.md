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

## Textures embarquées (réelles, ambientCG — CC0)
Les PNG présents sont de **vraies textures PBR photographiques** issues
d'[ambientCG](https://ambientcg.com) (domaine public **CC0 1.0**), redimensionnées
à **512 px** (mobile-friendly). On n'utilise que **Color → `_BaseColor`** et
**NormalGL → `_Normal`** (convention OpenGL, attendue par le shader). Voir
`LICENSES.md` pour l'attribution complète.

| Slot | Source ambientCG | Aspect |
|------|------------------|--------|
| Grass | Grass007 | herbe verte |
| Sand  | Ground054 | sol beige/sableux uniforme |
| Rock  | Rock063 | paroi rocheuse naturelle (moussue) |
| Dirt  | Ground103 | terre brune moussue |

## Remplacer par tes propres textures
**Écrase simplement ces PNG** en gardant les mêmes noms/chemins — aucun code à
modifier. Formats : PNG, idéalement carrés et tileables (répétables), 256–1024 px.
Les BaseColor sont interprétées en sRGB, les Normal en espace linéaire (normal map tangente classique).

> Placeholders d'origine (avant intégration des vraies textures) :
> `node tools/gen-placeholder-textures.mjs` les régénère.
