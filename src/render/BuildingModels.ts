import { type BufferGeometry, type Material, Mesh, MeshStandardMaterial, Vector3 } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { Era } from "../sim/society/EraSystem";

/**
 * Modèles 3D réels (CC0) des bâtiments par ère — habitations et monuments.
 *
 * Sources CC0 (Kay Lousberg, www.kaylousberg.com) :
 *  - KayKit Medieval Hexagon Pack → maisons/église/château (Moyen Âge, Renaissance) ;
 *  - KayKit City Builder Bits → immeubles/château d'eau (Industrielle → Futur).
 *
 * Chaque modèle est normalisé au chargement (pieds au sol, centré, mis à
 * l'échelle d'une empreinte cible) pour s'insérer dans le rendu instancié des
 * villages sans retoucher les assets. Les ères sans modèle réel (Pierre,
 * Bronze, Fer) retombent sur la géométrie procédurale de `SettlementLayer`.
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
];

/** Monument-repère par ère (empreinte un peu plus large — un point de mire). */
const MONUMENT_URLS: ReadonlyArray<readonly [Era, string, number]> = [
  [Era.Medieval, "models/buildings/monument_medieval.glb", 1.4],
  [Era.Renaissance, "models/buildings/monument_renaissance.glb", 1.5],
  [Era.Industrial, "models/buildings/monument_industrial.glb", 1.1],
  [Era.Modern, "models/buildings/monument_modern.glb", 1.5],
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
    const geos: BufferGeometry[] = [];
    let srcMat: Material | null = null;
    gltf.scene.updateMatrixWorld(true);
    gltf.scene.traverse((o) => {
      const mesh = o as Mesh;
      if (!mesh.isMesh) return;
      const g = mesh.geometry.clone();
      g.applyMatrix4(mesh.matrixWorld);
      // Uniformise les attributs pour une fusion sûre (les modèles KayKit
      // partagent un atlas : position/normal/uv suffisent).
      for (const name of Object.keys(g.attributes)) {
        if (name !== "position" && name !== "normal" && name !== "uv") g.deleteAttribute(name);
      }
      geos.push(g);
      if (!srcMat) srcMat = Array.isArray(mesh.material) ? mesh.material[0]! : mesh.material;
    });
    if (geos.length === 0) return null;
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

    // Matériau propre : atlas texturé conservé, sans flags d'animation.
    const clean = new MeshStandardMaterial({ roughness: 0.85, metalness: 0 });
    const sm = srcMat as unknown as MeshStandardMaterial | null;
    if (sm) {
      if (sm.color) clean.color.copy(sm.color);
      if (sm.map) clean.map = sm.map;
      if (sm.vertexColors) clean.vertexColors = true;
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
