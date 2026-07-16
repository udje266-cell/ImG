import {
  BufferAttribute,
  type BufferGeometry,
  type Material,
  Mesh,
  MeshStandardMaterial,
  Vector3,
} from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { Era } from "../sim/society/EraSystem";

/**
 * Modèles 3D réels (CC0) des bâtiments par ère — habitations et monuments.
 *
 * Sources CC0 :
 *  - KayKit Medieval Hexagon Pack (Kay Lousberg) → maisons/église/château
 *    (Moyen Âge, Renaissance) ; atlas de texture partagé.
 *  - KayKit City Builder Bits (Kay Lousberg) → immeubles/château d'eau
 *    (Industrielle → Moderne) ; atlas de texture partagé.
 *  - Kenney Space Kit (kenney.nl) → dôme colonial + fusée (Interplanétaire),
 *    structure + antenne stellaire (Galactique) ; couleurs par matériau.
 *
 * Deux familles de matériaux sont gérées au chargement : les modèles à **atlas
 * texturé** (KayKit) conservent leur `map` ; les modèles **multi-matériaux à
 * couleurs unies** (Kenney) voient la couleur de chaque maillage *cuite* en
 * couleurs de sommets, pour préserver leur aspect multicolore en **un seul**
 * `InstancedMesh` (une passe). Chaque modèle est normalisé (pieds au sol,
 * centré, mis à l'échelle d'une empreinte cible). Les ères sans modèle
 * (Pierre, Bronze, Fer) retombent sur la géométrie procédurale.
 */
export interface EraModel {
  geometry: BufferGeometry;
  material: Material;
}

/** Habitation représentative par ère (empreinte ≈ une tuile). */
const HOUSE_URLS: ReadonlyArray<readonly [Era, string, number]> = [
  [Era.Medieval, "models/buildings/house_medieval.glb", 1.15],
  [Era.Renaissance, "models/buildings/house_renaissance.glb", 1.2],
  [Era.Industrial, "models/buildings/house_industrial.glb", 1.2],
  [Era.Modern, "models/buildings/house_modern.glb", 1.15],
  [Era.Future, "models/buildings/house_future.glb", 1.15],
  [Era.Interplanetary, "models/buildings/house_interplanetary.glb", 2.1], // dôme colonial (Kenney) — élargi pour rester plus haut que les habitants
  [Era.Galactic, "models/buildings/house_galactic.glb", 1.15], // structure sci-fi (Kenney)
];

/** Monument-repère par ère (empreinte un peu plus large — un point de mire). */
const MONUMENT_URLS: ReadonlyArray<readonly [Era, string, number]> = [
  [Era.Medieval, "models/buildings/monument_medieval.glb", 1.4],
  [Era.Renaissance, "models/buildings/monument_renaissance.glb", 1.5],
  [Era.Industrial, "models/buildings/monument_industrial.glb", 1.1],
  [Era.Modern, "models/buildings/monument_modern.glb", 1.5],
  [Era.Interplanetary, "models/buildings/monument_interplanetary.glb", 1.5], // pas de tir (Kenney)
  [Era.Galactic, "models/buildings/monument_galactic.glb", 1.4], // antenne stellaire (Kenney)
];

/**
 * Charge un GLB, fusionne ses maillages, centre l'empreinte en XZ, cale les
 * pieds à y=0 et met à l'échelle pour que la plus grande dimension au sol
 * atteigne `footprint`. Retourne `null` si le chargement échoue (fallback).
 */
async function loadNormalized(
  loader: GLTFLoader,
  url: string,
  footprint: number,
): Promise<EraModel | null> {
  try {
    const gltf = await loader.loadAsync(url);
    const meshes: Mesh[] = [];
    gltf.scene.updateMatrixWorld(true);
    gltf.scene.traverse((o) => {
      if ((o as Mesh).isMesh) meshes.push(o as Mesh);
    });
    if (meshes.length === 0) return null;

    const matOf = (m: Mesh): MeshStandardMaterial =>
      (Array.isArray(m.material) ? m.material[0]! : m.material) as MeshStandardMaterial;
    // Un modèle « texturé » (atlas KayKit) porte une `map` ; sinon on est sur un
    // modèle multi-matériaux à couleurs unies (Kenney) → couleurs de sommets.
    const textured = meshes.some((m) => matOf(m).map);

    const geos: BufferGeometry[] = [];
    let firstMat: MeshStandardMaterial | null = null;
    for (const mesh of meshes) {
      const g = mesh.geometry.clone();
      g.applyMatrix4(mesh.matrixWorld);
      // Uniformise les attributs pour une fusion sûre.
      for (const name of Object.keys(g.attributes)) {
        const keep = name === "position" || name === "normal" || (textured && name === "uv");
        if (!keep) g.deleteAttribute(name);
      }
      if (!textured) {
        // Cuit la couleur du matériau en couleurs de sommets (aspect multicolore
        // conservé après fusion en un seul maillage instancié).
        const c = matOf(mesh).color;
        const n = g.attributes.position!.count;
        const colors = new Float32Array(n * 3);
        for (let i = 0; i < n; i++) {
          colors[i * 3] = c.r;
          colors[i * 3 + 1] = c.g;
          colors[i * 3 + 2] = c.b;
        }
        g.setAttribute("color", new BufferAttribute(colors, 3));
      }
      geos.push(g);
      if (!firstMat) firstMat = matOf(mesh);
    }
    const merged = geos.length === 1 ? geos[0]! : mergeGeometries(geos, false);
    if (!merged) return null;

    merged.computeBoundingBox();
    const box = merged.boundingBox!;
    const size = new Vector3();
    box.getSize(size);
    const cx = (box.min.x + box.max.x) / 2;
    const cz = (box.min.z + box.max.z) / 2;
    merged.translate(-cx, -box.min.y, -cz); // centré en XZ, pieds au sol
    const s = footprint / Math.max(size.x, size.z, 1e-3);
    merged.scale(s, s, s);
    merged.computeVertexNormals();

    // Matériau propre, sans flags d'animation.
    const clean = new MeshStandardMaterial({ roughness: 0.8, metalness: 0.05 });
    if (textured && firstMat) {
      if (firstMat.color) clean.color.copy(firstMat.color);
      if (firstMat.map) clean.map = firstMat.map;
      if (firstMat.vertexColors) clean.vertexColors = true;
    } else {
      clean.vertexColors = true; // couleurs cuites depuis les matériaux d'origine
    }
    return { geometry: merged, material: clean };
  } catch {
    return null;
  }
}

/**
 * Jeu de modèles de bâtiments par ère, chargé une fois au démarrage. Les ères
 * absentes utilisent la géométrie procédurale (repli robuste : un asset
 * manquant n'empêche jamais le rendu du village).
 */
export class BuildingModelSet {
  readonly houses = new Map<Era, EraModel>();
  readonly monuments = new Map<Era, EraModel>();

  static async load(): Promise<BuildingModelSet> {
    const set = new BuildingModelSet();
    const loader = new GLTFLoader();
    const jobs: Promise<void>[] = [];
    for (const [era, url, fp] of HOUSE_URLS) {
      jobs.push(
        loadNormalized(loader, url, fp).then((m) => {
          if (m) set.houses.set(era, m);
        }),
      );
    }
    for (const [era, url, fp] of MONUMENT_URLS) {
      jobs.push(
        loadNormalized(loader, url, fp).then((m) => {
          if (m) set.monuments.set(era, m);
        }),
      );
    }
    await Promise.all(jobs);
    return set;
  }
}
