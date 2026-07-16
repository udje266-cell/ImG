import {
  type BufferGeometry,
  DynamicDrawUsage,
  InstancedMesh,
  type Material,
  Mesh,
  Object3D,
} from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { Rng } from "../core/math/Rng";
import { BARE_THRESHOLD } from "../sim/ecology/FloraSystem";
import type { Simulation } from "../sim/world/Simulation";
import { groundSurfaceAt } from "./TerrainMesh";

/**
 * Plafond d'arbres affichés. L'arbre décimé fait ~7,9 k triangles (ses feuilles
 * sont des îlots séparés que la simplification ne réduit pas davantage), donc
 * 1200 arbres ≈ 9 M tris/frame — correct sur desktop, à la limite haute mobile.
 * OPTIMISATION FUTURE : impostors/billboards pour des forêts denses à moindre
 * coût (voir docs/ROADMAP.md phase Optimisation).
 */
const MAX_TREES = 1200;
/** Densité de flore minimale pour qu'une tuile porte un arbre. */
const TREE_THRESHOLD = 0.35;
/** Hauteur d'un arbre, en unités monde (≈ tuiles). */
const TREE_HEIGHT = 2.6;
/**
 * Espacement des arbres : au plus un arbre par bloc STRIDE×STRIDE tuiles, pour
 * des bosquets aérés plutôt qu'une masse compacte. Chaque bloc tire une
 * position jittée en son sein.
 */
const STRIDE = 4;

/**
 * Forêts instanciées (docs/TDD.md §5) : un seul `InstancedMesh` de l'arbre
 * décimé, dont les instances sont posées sur les tuiles où la densité de
 * flore dépasse un seuil. Placement déterministe (RNG par tuile) donc stable
 * d'une frame à l'autre ; reconstruit uniquement quand la flore change.
 *
 * Un seul draw call pour toute la végétation — des milliers d'arbres tiennent
 * dans le budget mobile.
 */
export class ForestLayer {
  private readonly mesh: InstancedMesh;
  private readonly dummy = new Object3D();
  private dirty = true;

  private constructor(
    private readonly sim: Simulation,
    geometry: BufferGeometry,
    material: Material,
    private readonly baseScale: number,
    addToScene: (mesh: InstancedMesh) => void,
  ) {
    this.mesh = new InstancedMesh(geometry, material, MAX_TREES);
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.mesh.count = 0;
    addToScene(this.mesh);
    sim.bus.on("flora:updated", () => {
      this.dirty = true;
    });
  }

  /** Charge l'arbre du catalogue et construit la couche de forêt. */
  static async create(
    sim: Simulation,
    treeUrl: string,
    addToScene: (mesh: InstancedMesh) => void,
  ): Promise<ForestLayer> {
    const gltf = await new GLTFLoader().loadAsync(treeUrl);
    let mesh: Mesh | null = null;
    gltf.scene.traverse((o) => {
      if (!mesh && (o as Mesh).isMesh) mesh = o as Mesh;
    });
    if (!mesh) throw new Error("ForestLayer: no mesh in tree model");
    const src = mesh as Mesh;

    // Normalise la hauteur du modèle source à TREE_HEIGHT.
    src.geometry.computeBoundingBox();
    const box = src.geometry.boundingBox!;
    const modelHeight = box.max.y - box.min.y || 1;
    const baseScale = TREE_HEIGHT / modelHeight;

    const material = Array.isArray(src.material) ? src.material[0]! : src.material;
    return new ForestLayer(sim, src.geometry, material, baseScale, addToScene);
  }

  /** Reconstruit les instances si la flore a changé (appelé au rendu, throttlé). */
  refresh(): void {
    if (!this.dirty) return;
    this.dirty = false;

    const sim = this.sim;
    const terrain = sim.terrain;
    const flora = sim.flora;
    const rng = new Rng(sim.worldConfig.seed ^ 0x7ee5);
    let count = 0;

    // Un candidat par bloc STRIDE×STRIDE : les arbres restent espacés.
    for (let by = 0; by < terrain.height && count < MAX_TREES; by += STRIDE) {
      for (let bx = 0; bx < terrain.width && count < MAX_TREES; bx += STRIDE) {
        // Position jittée à l'intérieur du bloc.
        const jx = bx + rng.float() * STRIDE;
        const jy = by + rng.float() * STRIDE;
        const tx = Math.min(terrain.width - 1, Math.floor(jx));
        const ty = Math.min(terrain.height - 1, Math.floor(jy));
        const density = flora.densityAt(tx, ty);
        if (density < TREE_THRESHOLD || terrain.isWater(tx, ty)) continue;
        // Densité forte → bloc presque toujours boisé ; densité faible → rare.
        if (rng.float() > (density - BARE_THRESHOLD) * 1.3) continue;

        const scale = this.baseScale * (0.7 + density * 0.5) * (0.85 + rng.float() * 0.3);
        this.dummy.position.set(jx, groundSurfaceAt(terrain, jx, jy), jy);
        this.dummy.rotation.set(0, rng.float() * Math.PI * 2, 0);
        this.dummy.scale.setScalar(scale);
        this.dummy.updateMatrix();
        this.mesh.setMatrixAt(count, this.dummy.matrix);
        count++;
      }
    }

    this.mesh.count = count;
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  /** Nombre d'arbres actuellement instanciés (debug/vérification). */
  get count(): number {
    return this.mesh.count;
  }
}
