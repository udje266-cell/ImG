import {
  BufferAttribute,
  type BufferGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  InstancedMesh,
  MeshStandardMaterial,
  Object3D,
} from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { Simulation } from "../sim/world/Simulation";
import { groundHeightAt } from "./TerrainMesh";

/**
 * Rendu des villages (docs/TDD.md §4.5) : huttes et totems instanciés, posés
 * sur les centres/foyers calculés par `SettlementSystem`. Géométrie low-poly
 * procédurale (pas d'asset externe) au thème préhistorique : mur cylindrique
 * en torchis surmonté d'un toit de chaume conique ; un totem marque le cœur
 * de chaque village. Lecture seule de la simulation, deux draw calls.
 *
 * Les villages sont statiques une fois fondés : la couche se construit une
 * fois (au chargement de la scène) et ne se met plus à jour par frame.
 */
const MAX_HUTS = 240;
const MAX_TOTEMS = 8;

/** Applique une couleur unie (vertex colors) à une géométrie. */
function paint(geo: BufferGeometry, hex: number): BufferGeometry {
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

/** Hutte = mur torchis (cylindre) + toit de chaume (cône), base à y=0. */
function makeHutGeometry(): BufferGeometry {
  const wallH = 0.55;
  const roofH = 0.7;
  const wall = new CylinderGeometry(0.42, 0.5, wallH, 7);
  wall.translate(0, wallH / 2, 0);
  paint(wall, 0x9c6b43); // torchis brun
  const roof = new ConeGeometry(0.7, roofH, 7);
  roof.translate(0, wallH + roofH / 2, 0);
  paint(roof, 0xc9a35c); // chaume paille
  return mergeGeometries([wall, roof], false)!;
}

/** Totem = poteau (cylindre) + tête sculptée (cône), base à y=0. */
function makeTotemGeometry(): BufferGeometry {
  const poleH = 1.5;
  const pole = new CylinderGeometry(0.12, 0.15, poleH, 6);
  pole.translate(0, poleH / 2, 0);
  paint(pole, 0x6b4a2f); // bois sombre
  const head = new ConeGeometry(0.28, 0.5, 6);
  head.translate(0, poleH + 0.2, 0);
  paint(head, 0xb5532e); // tête peinte en ocre rouge
  return mergeGeometries([pole, head], false)!;
}

/** Hash déterministe [0,1) à partir d'une position (variation stable). */
function hash01(x: number, y: number): number {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

export class SettlementLayer {
  private readonly huts: InstancedMesh;
  private readonly totems: InstancedMesh;
  private readonly dummy = new Object3D();

  constructor(
    private readonly sim: Simulation,
    addToScene: (mesh: InstancedMesh) => void,
  ) {
    const mat = new MeshStandardMaterial({ vertexColors: true, roughness: 0.9, flatShading: true });
    this.huts = new InstancedMesh(makeHutGeometry(), mat, MAX_HUTS);
    this.totems = new InstancedMesh(makeTotemGeometry(), mat, MAX_TOTEMS);
    for (const m of [this.huts, this.totems]) {
      m.frustumCulled = false;
      m.castShadow = true;
      m.receiveShadow = true;
      m.count = 0;
      addToScene(m);
    }
    this.build();
  }

  /** (Re)pose huttes et totems depuis l'état courant des villages. */
  build(): void {
    const terrain = this.sim.terrain;
    const { villages, dwellings } = this.sim.settlements;

    let h = 0;
    for (const d of dwellings) {
      if (h >= MAX_HUTS) break;
      const r = hash01(d.x, d.y);
      this.dummy.position.set(d.x, groundHeightAt(terrain, d.x, d.y), d.y);
      this.dummy.rotation.set(0, r * Math.PI * 2, 0);
      this.dummy.scale.setScalar(0.85 + r * 0.4);
      this.dummy.updateMatrix();
      this.huts.setMatrixAt(h++, this.dummy.matrix);
    }
    this.huts.count = h;
    this.huts.instanceMatrix.needsUpdate = true;

    let t = 0;
    for (const v of villages) {
      if (t >= MAX_TOTEMS) break;
      this.dummy.position.set(v.x, groundHeightAt(terrain, v.x, v.y), v.y);
      this.dummy.rotation.set(0, hash01(v.x, v.y) * Math.PI * 2, 0);
      this.dummy.scale.setScalar(1);
      this.dummy.updateMatrix();
      this.totems.setMatrixAt(t++, this.dummy.matrix);
    }
    this.totems.count = t;
    this.totems.instanceMatrix.needsUpdate = true;
  }

  /** Nombre de huttes posées (debug/vérification). */
  get hutCount(): number {
    return this.huts.count;
  }
}
