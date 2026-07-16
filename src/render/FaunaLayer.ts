import {
  type BufferGeometry,
  DynamicDrawUsage,
  InstancedMesh,
  type Material,
  Mesh,
  MeshLambertMaterial,
  MeshStandardMaterial,
  Object3D,
} from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { HERBIVORE, PREDATOR } from "../sim/ecology/FaunaSystem";
import type { Simulation } from "../sim/world/Simulation";
import { groundHeightAt } from "./TerrainMesh";

const MAX_PER_SPECIES = 600;
/** Suivi d'orientation : borne large (toutes espèces confondues). */
const MAX_FAUNA = MAX_PER_SPECIES * 2;
/** Douceur du virage des bêtes (0 = figé, 1 = instantané). */
const TURN_SMOOTHING = 0.2;
/** Hauteur cible par espèce (unités monde ≈ tuiles). */
const SPECIES_HEIGHT = [1.4, 0.7]; // herbivore (cheval), prédateur (renard)

/**
 * Rendu de la faune (docs/TDD.md §4.5, phase B) : un `InstancedMesh` par
 * espèce (cheval = herbivore, renard = prédateur), positionné chaque frame
 * depuis le snapshot du `FaunaSystem`. Lecture seule. Deux draw calls.
 */
export class FaunaLayer {
  private readonly meshes: InstancedMesh[] = [];
  private readonly scales: number[] = [];
  private readonly dummy = new Object3D();
  // Orientation naturelle : chaque bête regarde sa direction de course, en
  // tournant progressivement. Suivi de la vitesse par index de snapshot.
  private readonly heading = new Float32Array(MAX_FAUNA);
  private readonly prevX = new Float32Array(MAX_FAUNA);
  private readonly prevY = new Float32Array(MAX_FAUNA);
  private primed = false;

  private constructor(
    private readonly sim: Simulation,
    geometries: BufferGeometry[],
    materials: Material[],
    scales: number[],
    addToScene: (mesh: InstancedMesh) => void,
  ) {
    this.scales = scales;
    for (let s = 0; s < geometries.length; s++) {
      const mesh = new InstancedMesh(geometries[s]!, materials[s]!, MAX_PER_SPECIES);
      mesh.instanceMatrix.setUsage(DynamicDrawUsage);
      mesh.frustumCulled = false;
      mesh.castShadow = true;
      mesh.count = 0;
      this.meshes.push(mesh);
      addToScene(mesh);
    }
  }

  /** `urls[0]` = herbivore, `urls[1]` = prédateur. */
  static async create(
    sim: Simulation,
    urls: [string, string],
    addToScene: (mesh: InstancedMesh) => void,
  ): Promise<FaunaLayer> {
    const loader = new GLTFLoader();
    const geometries: BufferGeometry[] = [];
    const materials: Material[] = [];
    const scales: number[] = [];
    for (let s = 0; s < urls.length; s++) {
      const gltf = await loader.loadAsync(urls[s]!);
      let src: Mesh | null = null;
      gltf.scene.traverse((o) => {
        if (!src && (o as Mesh).isMesh) src = o as Mesh;
      });
      if (!src) continue;
      const mesh = src as Mesh;
      const geo = mesh.geometry;
      // Les modèles animaux sont animés (skinning + morph targets) ; pour un
      // rendu instancié STATIQUE, on retire ces attributs, sinon le shader
      // plante (morphTargetInfluences/skeleton absents sur un InstancedMesh).
      geo.morphAttributes = {};
      geo.deleteAttribute("skinIndex");
      geo.deleteAttribute("skinWeight");
      geo.computeBoundingBox();
      const box = geo.boundingBox!;
      const modelHeight = box.max.y - box.min.y || 1;
      geo.translate(0, -box.min.y, 0); // pieds au sol
      geometries.push(geo);

      // Matériau propre (sans flags d'animation) copiant couleur/texture source.
      const srcMat = Array.isArray(mesh.material) ? mesh.material[0]! : mesh.material;
      const clean = new MeshLambertMaterial({ color: 0xffffff });
      if (srcMat instanceof MeshStandardMaterial || srcMat instanceof MeshLambertMaterial) {
        clean.color.copy(srcMat.color);
        if (srcMat.map) clean.map = srcMat.map;
      }
      clean.vertexColors = geo.hasAttribute("color");
      materials.push(clean);
      scales.push(SPECIES_HEIGHT[s]! / modelHeight);
    }
    return new FaunaLayer(sim, geometries, materials, scales, addToScene);
  }

  update(): void {
    const snap = this.sim.fauna.snapshot();
    const terrain = this.sim.terrain;
    const counts = [0, 0];
    for (let i = 0; i < snap.count; i++) {
      const sp = snap.species[i]! === PREDATOR ? PREDATOR : HERBIVORE;
      const mesh = this.meshes[sp];
      if (!mesh) continue;
      const idx = counts[sp]!;
      if (idx >= MAX_PER_SPECIES) continue;
      const wx = snap.x[i]!;
      const wy = snap.y[i]!;
      // Cap = direction de course (vitesse depuis la frame précédente), lissé.
      if (i < MAX_FAUNA) {
        if (this.primed) {
          const vx = wx - this.prevX[i]!;
          const vy = wy - this.prevY[i]!;
          if (vx * vx + vy * vy > 1e-4) {
            const desired = Math.atan2(vx, vy);
            let d = desired - this.heading[i]!;
            d = Math.atan2(Math.sin(d), Math.cos(d));
            this.heading[i] = this.heading[i]! + d * TURN_SMOOTHING;
          }
        }
        this.prevX[i] = wx;
        this.prevY[i] = wy;
      }
      this.dummy.position.set(wx, groundHeightAt(terrain, wx, wy), wy);
      this.dummy.rotation.set(0, this.heading[i < MAX_FAUNA ? i : 0]!, 0);
      this.dummy.scale.setScalar(this.scales[sp]!);
      this.dummy.updateMatrix();
      mesh.setMatrixAt(idx, this.dummy.matrix);
      counts[sp] = idx + 1;
    }
    this.primed = true;
    for (let s = 0; s < this.meshes.length; s++) {
      this.meshes[s]!.count = counts[s]!;
      this.meshes[s]!.instanceMatrix.needsUpdate = true;
    }
  }
}
