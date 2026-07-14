import {
  BoxGeometry,
  BufferAttribute,
  type BufferGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  Group,
  InstancedMesh,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  type Object3D,
  PointLight,
} from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { Simulation } from "../sim/world/Simulation";
import { groundHeightAt } from "./TerrainMesh";

/**
 * Rendu des villages (docs/TDD.md §4.5) : huttes, totems et champs instanciés,
 * plus un feu de camp vivant par village — flamme qui danse et halo de lumière
 * chaude qui porte la nuit (la vie de village se voit de loin). Géométrie
 * low-poly procédurale (pas d'asset externe), thème préhistorique.
 *
 * Se reconstruit sur `settlements:updated` (nouvelles huttes quand le village
 * grandit) ; la flamme et la lumière s'animent chaque frame via `update()`.
 */
const MAX_HUTS = 240;
const MAX_TOTEMS = 8;
const MAX_FIELDS = 24;

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

/** Champ = parcelle de terre labourée (sillons) + rangées de pousses. */
function makeFieldGeometry(): BufferGeometry {
  const parts: BufferGeometry[] = [];
  // Trois sillons de terre retournée, légèrement bombés.
  for (let row = 0; row < 3; row++) {
    const furrow = new BoxGeometry(1.7, 0.12, 0.42);
    furrow.translate(0, 0.06, (row - 1) * 0.56);
    paint(furrow, row % 2 === 0 ? 0x6e4f30 : 0x7d5a37); // terre labourée
    parts.push(furrow);
  }
  // Pousses vertes alignées sur les sillons.
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 4; col++) {
      const sprout = new ConeGeometry(0.09, 0.3, 5);
      sprout.translate((col - 1.5) * 0.42, 0.25, (row - 1) * 0.56);
      paint(sprout, 0x69a03a); // jeunes pousses
      parts.push(sprout);
    }
  }
  return mergeGeometries(parts, false)!;
}

/** Feu de camp : rondins croisés + pierre du foyer (la flamme est à part). */
function makeCampfireBase(): BufferGeometry {
  const parts: BufferGeometry[] = [];
  for (let i = 0; i < 3; i++) {
    const log = new CylinderGeometry(0.07, 0.07, 0.9, 5);
    log.rotateZ(Math.PI / 2.3);
    log.rotateY((i / 3) * Math.PI);
    log.translate(0, 0.12, 0);
    paint(log, 0x5c3f26); // rondins
    parts.push(log);
  }
  return mergeGeometries(parts, false)!;
}

export class SettlementLayer {
  private readonly huts: InstancedMesh;
  private readonly totems: InstancedMesh;
  private readonly fieldsMesh: InstancedMesh;
  /** Feux de camp (un par village) : flammes à animer + lumières nocturnes. */
  private readonly fires = new Group();
  private readonly flames: Mesh[] = [];
  private readonly lights: PointLight[] = [];
  private readonly dummy = new Group();

  constructor(
    private readonly sim: Simulation,
    addToScene: (obj: Object3D) => void,
  ) {
    const mat = new MeshStandardMaterial({ vertexColors: true, roughness: 0.9, flatShading: true });
    this.huts = new InstancedMesh(makeHutGeometry(), mat, MAX_HUTS);
    this.totems = new InstancedMesh(makeTotemGeometry(), mat, MAX_TOTEMS);
    this.fieldsMesh = new InstancedMesh(makeFieldGeometry(), mat, MAX_FIELDS);
    for (const m of [this.huts, this.totems, this.fieldsMesh]) {
      m.frustumCulled = false;
      m.castShadow = true;
      m.receiveShadow = true;
      m.count = 0;
      addToScene(m);
    }
    addToScene(this.fires);
    this.build();
    sim.bus.on("settlements:updated", () => this.build());
  }

  /** (Re)pose huttes, totems, champs et feux depuis l'état des villages. */
  build(): void {
    const terrain = this.sim.terrain;
    const { villages, dwellings, fields } = this.sim.settlements;

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

    let f = 0;
    for (const field of fields) {
      if (f >= MAX_FIELDS) break;
      this.dummy.position.set(field.x, groundHeightAt(terrain, field.x, field.y), field.y);
      this.dummy.rotation.set(0, hash01(field.x, field.y) * Math.PI, 0);
      this.dummy.scale.setScalar(1);
      this.dummy.updateMatrix();
      this.fieldsMesh.setMatrixAt(f++, this.dummy.matrix);
    }
    this.fieldsMesh.count = f;
    this.fieldsMesh.instanceMatrix.needsUpdate = true;

    this.buildCampfires();
  }

  /** Un feu de camp par village, à côté du totem (rebâti avec les villages). */
  private buildCampfires(): void {
    this.fires.clear();
    this.flames.length = 0;
    this.lights.length = 0;
    const terrain = this.sim.terrain;
    const baseGeo = makeCampfireBase();
    const baseMat = new MeshStandardMaterial({ vertexColors: true, roughness: 0.95, flatShading: true });
    const flameMat = new MeshBasicMaterial({ color: 0xffa63d, transparent: true, opacity: 0.92 });

    for (const v of this.sim.settlements.villages.slice(0, MAX_TOTEMS)) {
      // Décalé du totem pour former la place du village.
      const fx = v.x + 0.9;
      const fy = v.y + 0.6;
      const ground = groundHeightAt(terrain, fx, fy);

      const fire = new Group();
      fire.position.set(fx, ground, fy);

      const base = new Mesh(baseGeo, baseMat);
      base.castShadow = true;
      fire.add(base);

      const flame = new Mesh(new ConeGeometry(0.16, 0.5, 6), flameMat);
      flame.position.y = 0.32;
      fire.add(flame);
      this.flames.push(flame);

      // Halo chaud : discret le jour, phare du village la nuit.
      const light = new PointLight(0xff9c4a, 0, 9, 2);
      light.position.y = 0.6;
      fire.add(light);
      this.lights.push(light);

      this.fires.add(fire);
    }
  }

  /** Anime flammes (danse) et lumières (fortes la nuit) — chaque frame. */
  update(timeSeconds: number, daylight: number): void {
    const night = 1 - daylight;
    for (let i = 0; i < this.flames.length; i++) {
      const flicker =
        0.85 + 0.11 * Math.sin(timeSeconds * 11 + i * 2.1) + 0.06 * Math.sin(timeSeconds * 23 + i);
      const flame = this.flames[i]!;
      flame.scale.set(flicker, flicker * (1 + 0.18 * Math.sin(timeSeconds * 17 + i * 3.7)), flicker);
      this.lights[i]!.intensity = (1.2 + 10 * night) * flicker;
    }
  }

  /** Nombre de huttes posées (debug/vérification). */
  get hutCount(): number {
    return this.huts.count;
  }

  /** Nombre de champs posés (debug/vérification). */
  get fieldCount(): number {
    return this.fieldsMesh.count;
  }
}

/** Hash déterministe [0,1) à partir d'une position (variation stable). */
function hash01(x: number, y: number): number {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
}
