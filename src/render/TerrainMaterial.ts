import {
  type Material,
  MeshStandardMaterial,
  RepeatWrapping,
  SRGBColorSpace,
  type Texture,
  TextureLoader,
  Vector2,
} from "three";

/**
 * Matériau de terrain avec splatting de 4 matières (docs/TDD.md §4.5).
 *
 * Étend `MeshStandardMaterial` (donc conserve ombres, PBR, tone-mapping) via
 * `onBeforeCompile` : le maillage porte un attribut `splat` (vec4 = poids
 * grass/sand/rock/dirt calculés par biome+pente+altitude dans `TerrainMesh`).
 * Le shader échantillonne les 4 BaseColor et les 4 Normal en UV planaires
 * monde (xz) puis les mélange par ces poids. La couleur par sommet (dégradé
 * chaud d'altitude + terrasses) est conservée et teinte le résultat.
 *
 * Les textures sont chargées depuis `public/textures/terrain/` — les remplacer
 * par de vraies PNG (mêmes chemins) suffit.
 */
const NAMES = ["Grass", "Sand", "Rock", "Dirt"] as const;
/** Répétition des textures : 1 unité monde = 1 tuile ; ~1 motif / 6 tuiles. */
const UV_SCALE = 1 / 6;

function loadSet(loader: TextureLoader, name: string, kind: "BaseColor" | "Normal" | "Roughness"): Texture {
  const tex = loader.load(`textures/terrain/${name}/${name}_${kind}.png`);
  tex.wrapS = RepeatWrapping;
  tex.wrapT = RepeatWrapping;
  if (kind === "BaseColor") tex.colorSpace = SRGBColorSpace;
  return tex;
}

export function createTerrainMaterial(): Material {
  const loader = new TextureLoader();
  const base = NAMES.map((n) => loadSet(loader, n, "BaseColor"));
  const normal = NAMES.map((n) => loadSet(loader, n, "Normal"));
  const rough = NAMES.map((n) => loadSet(loader, n, "Roughness"));

  const material = new MeshStandardMaterial({
    vertexColors: true,
    roughness: 1.0,
    metalness: 0,
    // Intensité du relief normal-mappé (textures marquées + relief).
    normalScale: new Vector2(1.1, 1.1),
  });

  const uniforms = {
    uBase0: { value: base[0] }, uBase1: { value: base[1] }, uBase2: { value: base[2] }, uBase3: { value: base[3] },
    uNorm0: { value: normal[0] }, uNorm1: { value: normal[1] }, uNorm2: { value: normal[2] }, uNorm3: { value: normal[3] },
    uRough0: { value: rough[0] }, uRough1: { value: rough[1] }, uRough2: { value: rough[2] }, uRough3: { value: rough[3] },
    uUvScale: { value: UV_SCALE },
  };

  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);

    // --- Vertex : transmettre le splat et l'UV planaire monde ---
    shader.vertexShader =
      "attribute vec4 splat;\nvarying vec4 vSplat;\nvarying vec2 vTerrainUv;\nuniform float uUvScale;\n" +
      shader.vertexShader.replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\n vSplat = splat;\n vTerrainUv = position.xz * uUvScale;",
      );

    // --- Fragment : mélange des 4 BaseColor par le splat, sur la couleur ---
    const header =
      "uniform sampler2D uBase0;uniform sampler2D uBase1;uniform sampler2D uBase2;uniform sampler2D uBase3;\n" +
      "uniform sampler2D uNorm0;uniform sampler2D uNorm1;uniform sampler2D uNorm2;uniform sampler2D uNorm3;\n" +
      "uniform sampler2D uRough0;uniform sampler2D uRough1;uniform sampler2D uRough2;uniform sampler2D uRough3;\n" +
      "varying vec4 vSplat;varying vec2 vTerrainUv;\n";
    shader.fragmentShader = header + shader.fragmentShader;

    // Rugosité PBR mélangée par le splat : sable/roche mats, herbe humide plus lustrée.
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <roughnessmap_fragment>",
      `#include <roughnessmap_fragment>
       vec4 rsw = vSplat / max(vSplat.x + vSplat.y + vSplat.z + vSplat.w, 0.0001);
       float blendedRough =
         texture2D(uRough0, vTerrainUv).g * rsw.x +
         texture2D(uRough1, vTerrainUv).g * rsw.y +
         texture2D(uRough2, vTerrainUv).g * rsw.z +
         texture2D(uRough3, vTerrainUv).g * rsw.w;
       roughnessFactor *= clamp(blendedRough + 0.15, 0.35, 1.0);`,
    );

    // Normalise les poids et blend les couleurs de base.
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <map_fragment>",
      `#include <map_fragment>
       vec4 sw = vSplat / max(vSplat.x + vSplat.y + vSplat.z + vSplat.w, 0.0001);
       vec3 splatCol =
         texture2D(uBase0, vTerrainUv).rgb * sw.x +
         texture2D(uBase1, vTerrainUv).rgb * sw.y +
         texture2D(uBase2, vTerrainUv).rgb * sw.z +
         texture2D(uBase3, vTerrainUv).rgb * sw.w;
       diffuseColor.rgb *= splatCol * 1.9;`,
    );

    // Perturbe la normale avec le mélange des 4 normal maps.
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <normal_fragment_maps>",
      `vec4 nsw = vSplat / max(vSplat.x + vSplat.y + vSplat.z + vSplat.w, 0.0001);
       vec3 mapN =
         texture2D(uNorm0, vTerrainUv).xyz * nsw.x +
         texture2D(uNorm1, vTerrainUv).xyz * nsw.y +
         texture2D(uNorm2, vTerrainUv).xyz * nsw.z +
         texture2D(uNorm3, vTerrainUv).xyz * nsw.w;
       mapN = mapN * 2.0 - 1.0;
       mapN.xy *= 1.1;
       normal = normalize(tbn * mapN);`,
    );

    // TBN nécessaire pour la normal map ; injecte tangentes dérivées.
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <normal_fragment_begin>",
      `#include <normal_fragment_begin>
       vec3 q0 = dFdx(-vViewPosition); vec3 q1 = dFdy(-vViewPosition);
       vec2 st0 = dFdx(vTerrainUv); vec2 st1 = dFdy(vTerrainUv);
       vec3 Ntb = normal;
       vec3 Ttb = normalize(q0 * st1.y - q1 * st0.y);
       vec3 Btb = -normalize(cross(Ntb, Ttb));
       mat3 tbn = mat3(Ttb, Btb, Ntb);`,
    );
  };

  return material;
}
