import {
  BoxGeometry,
  BufferAttribute,
  type BufferGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DynamicDrawUsage,
  InstancedMesh,
  type Material,
  MeshStandardMaterial,
  Mesh,
  Object3D,
  SphereGeometry,
} from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { Era } from "../sim/society/EraSystem";
import type { Simulation } from "../sim/world/Simulation";
import { groundHeightAt } from "./TerrainMesh";

/** Hauteur d'un habitant, en unités monde (≈ tuiles). */
const AGENT_HEIGHT = 1.6;
/** Hauteur (monde) de la tête, où se pose la coiffe. */
const HEAD_Y = 1.42;
/** Plafond d'habitants rendus (budget d'instances). */
const MAX_AGENTS = 4000;
/** Douceur du virage (0 = figé, 1 = instantané) : rotation naturelle. */
const TURN_SMOOTHING = 0.18;

/** Peint une géométrie d'une couleur unie (vertex colors). */
function paintGeo(geo: BufferGeometry, hex: number): BufferGeometry {
  const c = new Color(hex);
  const n = geo.attributes.position!.count;
  const colors = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute("color", new BufferAttribute(colors, 3));
  return geo;
}

/**
 * Coiffe/casque par ère (l'apparence des personnages évolue avec l'âge — comme
 * dans les jeux à ères type Forge of Empires / Age of Empires) : capuche de
 * fourrure (Pierre) → bandeau (Bronze) → casque de bronze (Fer) → chaperon
 * (Moyen Âge) → chapeau à plume (Renaissance) → haut-de-forme (Industrielle) →
 * casque de chantier (Moderne) → visière lumineuse (Futur). Posée sur la tête
 * de chaque habitant. Géométrie authorée en unités monde (indépendante de
 * l'échelle du modèle).
 */
function makeHeadwear(era: Era): BufferGeometry {
  const parts: BufferGeometry[] = [];
  const add = (g: BufferGeometry, hex: number, tf?: (g: BufferGeometry) => void): void => {
    if (tf) tf(g);
    paintGeo(g, hex);
    parts.push(g);
  };
  switch (era) {
    case Era.Stone: // capuche de fourrure
      add(new SphereGeometry(0.14, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2), 0x5a4632, (g) => g.translate(0, 0, 0));
      break;
    case Era.Bronze: // bandeau de lin
      add(new CylinderGeometry(0.14, 0.14, 0.06, 10), 0xcdb489, (g) => g.translate(0, 0.02, 0));
      break;
    case Era.Iron: // casque de bronze + cimier
      add(new SphereGeometry(0.15, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), 0xb87333, (g) => g.translate(0, 0, 0));
      add(new BoxGeometry(0.04, 0.1, 0.24), 0x8a4f22, (g) => g.translate(0, 0.12, 0)); // crête
      break;
    case Era.Medieval: // chaperon pointu
      add(new ConeGeometry(0.15, 0.26, 8), 0x6a4a7a, (g) => g.translate(0, 0.11, 0));
      break;
    case Era.Renaissance: // chapeau à large bord + plume
      add(new CylinderGeometry(0.24, 0.24, 0.03, 12), 0x3a2b1a, (g) => g.translate(0, 0.02, 0)); // bord
      add(new CylinderGeometry(0.14, 0.15, 0.14, 12), 0x4a3524, (g) => g.translate(0, 0.1, 0)); // calotte
      add(new BoxGeometry(0.02, 0.02, 0.24), 0xcf4040, (g) => { g.rotateX(0.5); g.translate(0.06, 0.18, -0.1); }); // plume
      break;
    case Era.Industrial: // haut-de-forme
      add(new CylinderGeometry(0.2, 0.2, 0.03, 12), 0x1e1a18, (g) => g.translate(0, 0.02, 0)); // bord
      add(new CylinderGeometry(0.13, 0.13, 0.26, 12), 0x211d1a, (g) => g.translate(0, 0.17, 0)); // cylindre
      break;
    case Era.Modern: // casque de chantier
      add(new SphereGeometry(0.16, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), 0xf1c40f, (g) => g.translate(0, 0, 0));
      add(new BoxGeometry(0.34, 0.03, 0.14), 0xf1c40f, (g) => g.translate(0, 0.01, 0.08)); // visière
      break;
    case Era.Future: // casque à visière lumineuse
      add(new SphereGeometry(0.16, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), 0xd8e6f2, (g) => g.translate(0, 0, 0));
      add(new BoxGeometry(0.28, 0.08, 0.06), 0x4fe6ff, (g) => g.translate(0, 0.04, 0.13)); // visière cyan
      break;
  }
  return mergeGeometries(parts, false)!;
}

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
  /** Coiffe par ère, posée sur chaque tête (silhouette qui évolue avec l'âge). */
  private headwear!: InstancedMesh;

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
    // Coiffe d'ère (posée sur les têtes) : maillage instancié dédié.
    const headMat = new MeshStandardMaterial({ vertexColors: true, roughness: 0.7, flatShading: true });
    this.headwear = new InstancedMesh(makeHeadwear(sim.era.era), headMat, MAX_AGENTS);
    this.headwear.instanceMatrix.setUsage(DynamicDrawUsage);
    this.headwear.frustumCulled = false;
    this.headwear.castShadow = true;
    this.headwear.count = 0;
    addToScene(this.headwear);

    // Apparence de départ + ré-teinte / re-coiffe à chaque changement d'ère.
    this.applyEraTint(sim.era.era);
    sim.bus.on("era:advanced", ({ era }) => {
      this.applyEraTint(era as Era);
      this.headwear.geometry.dispose();
      this.headwear.geometry = makeHeadwear(era as Era);
    });
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
    let hw = 0; // compteur de coiffes posées

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

      const groundY = groundHeightAt(terrain, wx, wy);
      this.dummy.position.set(wx, groundY, wy);
      this.dummy.rotation.set(0, this.heading[i]!, 0);
      this.dummy.scale.setScalar(this.baseScale);
      this.dummy.updateMatrix();
      mesh.setMatrixAt(idx, this.dummy.matrix);

      // Coiffe d'ère posée sur la tête (même cap, échelle monde).
      this.dummy.position.set(wx, groundY + HEAD_Y, wy);
      this.dummy.scale.setScalar(1);
      this.dummy.updateMatrix();
      this.headwear.setMatrixAt(hw, this.dummy.matrix);
      hw++;

      counts[m] = idx + 1;
    }
    this.primed = true;

    for (let m = 0; m < this.meshes.length; m++) {
      this.meshes[m]!.count = counts[m]!;
      this.meshes[m]!.instanceMatrix.needsUpdate = true;
    }
    this.headwear.count = hw;
    this.headwear.instanceMatrix.needsUpdate = true;
  }
}
