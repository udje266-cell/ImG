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
import { groundHeightAt } from "./TerrainMesh";

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
const TREE_HEIGHT = 3.2;

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

    for (let y = 0; y < terrain.height && count < MAX_TREES; y++) {
      for (let x = 0; x < terrain.width && count < MAX_TREES; x++) {
        const density = flora.densityAt(x, y);
        if (density < TREE_THRESHOLD || terrain.isWater(x, y)) continue;
        // Probabilité de planter ∝ densité au-dessus du seuil : les tuiles
        // très vertes portent un arbre, les rares en portent parfois.
        const chance = (density - BARE_THRESHOLD) * 0.6;
        if (rng.float() > chance) continue;

        const jx = x + 0.5 + (rng.float() - 0.5) * 0.8;
        const jy = y + 0.5 + (rng.float() - 0.5) * 0.8;
        const scale = this.baseScale * (0.75 + density * 0.5) * (0.85 + rng.float() * 0.3);
        this.dummy.position.set(jx, groundHeightAt(terrain, jx, jy), jy);
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
