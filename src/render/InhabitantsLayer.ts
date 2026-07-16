import {
  type BufferGeometry,
  Color,
  DynamicDrawUsage,
  InstancedMesh,
  type Material,
  type MeshStandardMaterial,
  Mesh,
  Object3D,
} from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { Era } from "../sim/society/EraSystem";
import type { Simulation } from "../sim/world/Simulation";
import { groundHeightAt } from "./TerrainMesh";

/** Hauteur d'un habitant, en unités monde (≈ tuiles). */
const AGENT_HEIGHT = 1.6;
/** Plafond d'habitants rendus (budget d'instances). */
const MAX_AGENTS = 4000;
/** Douceur du virage (0 = figé, 1 = instantané) : rotation naturelle. */
const TURN_SMOOTHING = 0.18;

/**
 * Teinte des habitants par ère (l'apparence évolue avec l'âge) : peaux et
 * fourrures ternes (Pierre) → étoffes tissées (Bronze/Fer) → laines et robes
 * médiévales → riches teintures de la Renaissance → gris ouvrier de l'ère
 * industrielle → tons modernes → combinaisons claires du futur. Multiplie la
 * texture du modèle.
 */
const ERA_TINT: Record<Era, number> = {
  [Era.Stone]: 0xd9c9b6, // peaux, fourrures
  [Era.Bronze]: 0xe8cfa4, // lin tissé
  [Era.Iron]: 0xcdb48c, // tuniques
  [Era.Medieval]: 0x9c7350, // laines et robes brunes
  [Era.Renaissance]: 0x8a6ab0, // teintures riches (pourpre)
  [Era.Industrial]: 0x5c666e, // gris ouvrier
  [Era.Modern]: 0x4f83ad, // vêtements modernes
  [Era.Future]: 0xc8e6ff, // combinaisons claires
};

/**
 * Rendu des habitants (docs/TDD.md §4.5, phase C) : un `InstancedMesh` par
 * modèle de personnage (homme / femme préhistoriques décimés), positionné et
 * orienté chaque frame depuis le snapshot du `AgentSystem`. Lecture seule de
 * la simulation. Deux draw calls pour toute la population.
 *
 * Les modèles étant statiques (pas de rig), l'animation se limite pour
 * l'instant à l'orientation vers la cible ; le squelette viendra plus tard.
 */
export class InhabitantsLayer {
  private readonly meshes: InstancedMesh[] = [];
  private readonly dummy = new Object3D();
  private baseScale = 1;
  // Orientation « naturelle » : chaque habitant regarde là où il marche, et
  // tourne en douceur (pas de virage instantané). Suivi de la vitesse par index.
  private readonly heading = new Float32Array(MAX_AGENTS);
  private readonly prevX = new Float32Array(MAX_AGENTS);
  private readonly prevY = new Float32Array(MAX_AGENTS);
  private primed = false;

  private constructor(
    private readonly sim: Simulation,
    geometries: BufferGeometry[],
    materials: Material[],
    baseScale: number,
    addToScene: (mesh: InstancedMesh) => void,
  ) {
    this.baseScale = baseScale;
    for (let m = 0; m < geometries.length; m++) {
      const mesh = new InstancedMesh(geometries[m]!, materials[m]!, MAX_AGENTS);
      mesh.instanceMatrix.setUsage(DynamicDrawUsage);
      mesh.frustumCulled = false;
      mesh.castShadow = true;
      mesh.count = 0;
      this.meshes.push(mesh);
      addToScene(mesh);
    }
    // Apparence de départ + ré-teinte à chaque changement d'ère.
    this.applyEraTint(sim.era.era);
    sim.bus.on("era:advanced", ({ era }) => this.applyEraTint(era as Era));
  }

  /** Teinte tous les modèles d'habitants selon l'ère (multiplie la texture). */
  private applyEraTint(era: Era): void {
    const hex = ERA_TINT[era] ?? 0xffffff;
    for (const mesh of this.meshes) {
      const mat = mesh.material as MeshStandardMaterial;
      if (mat && (mat as { color?: Color }).color) mat.color = new Color(hex);
    }
  }

  static async create(
    sim: Simulation,
    urls: string[],
    addToScene: (mesh: InstancedMesh) => void,
  ): Promise<InhabitantsLayer> {
    const loader = new GLTFLoader();
    const geometries: BufferGeometry[] = [];
    const materials: Material[] = [];
    let baseScale = 1;
    for (const url of urls) {
      const gltf = await loader.loadAsync(url);
      let src: Mesh | null = null;
      gltf.scene.traverse((o) => {
        if (!src && (o as Mesh).isMesh) src = o as Mesh;
      });
      if (!src) continue;
      const mesh = src as Mesh;
      mesh.geometry.computeBoundingBox();
      const box = mesh.geometry.boundingBox!;
      const modelHeight = box.max.y - box.min.y || 1;
      baseScale = AGENT_HEIGHT / modelHeight;
      // Ancre les pieds au sol (origine du modèle recentrée sur y=min).
      mesh.geometry.translate(0, -box.min.y, 0);
      geometries.push(mesh.geometry);
      materials.push(Array.isArray(mesh.material) ? mesh.material[0]! : mesh.material);
    }
    return new InhabitantsLayer(sim, geometries, materials, baseScale, addToScene);
  }

  /** Repositionne les instances depuis le snapshot des agents (chaque frame). */
  update(): void {
    const snap = this.sim.agents.snapshot();
    const terrain = this.sim.terrain;
    const modelCount = this.meshes.length || 1;
    const counts = new Array(this.meshes.length).fill(0);

    for (let i = 0; i < snap.count && counts[0]! + counts[1 % modelCount]! < MAX_AGENTS * modelCount; i++) {
      const wx = snap.x[i]!;
      const wy = snap.y[i]!;
      // Répartit les habitants entre les modèles disponibles (homme/femme).
      const m = i % modelCount;
      const mesh = this.meshes[m]!;
      const idx = counts[m]!;
      if (idx >= MAX_AGENTS) continue;

      // Cap = direction de marche (vitesse depuis la frame précédente), lissé.
      if (this.primed) {
        const vx = wx - this.prevX[i]!;
        const vy = wy - this.prevY[i]!;
        if (vx * vx + vy * vy > 1e-4) {
          const desired = Math.atan2(vx, vy);
          let d = desired - this.heading[i]!;
          d = Math.atan2(Math.sin(d), Math.cos(d)); // plus court chemin angulaire
          this.heading[i] = this.heading[i]! + d * TURN_SMOOTHING;
        }
      } else {
        this.heading[i] = Math.atan2(wx - this.prevX[i]!, wy - this.prevY[i]!) || 0;
      }
      this.prevX[i] = wx;
      this.prevY[i] = wy;

      this.dummy.position.set(wx, groundHeightAt(terrain, wx, wy), wy);
      this.dummy.rotation.set(0, this.heading[i]!, 0);
      this.dummy.scale.setScalar(this.baseScale);
      this.dummy.updateMatrix();
      mesh.setMatrixAt(idx, this.dummy.matrix);
      counts[m] = idx + 1;
    }
    this.primed = true;

    for (let m = 0; m < this.meshes.length; m++) {
      this.meshes[m]!.count = counts[m]!;
      this.meshes[m]!.instanceMatrix.needsUpdate = true;
    }
  }
}
