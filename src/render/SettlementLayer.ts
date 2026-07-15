import {
  AdditiveBlending,
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
  MeshLambertMaterial,
  MeshStandardMaterial,
  type Object3D,
  PointLight,
  SphereGeometry,
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
const MAX_TEMPLES = 8;

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

/**
 * Temple mégalithique (religions, phase 6) : dolmen central — deux piliers
 * massifs + table de pierre — entouré d'un demi-cercle de menhirs. Érigé par
 * le village quand son culte est assez riche en récits.
 */
function makeTempleGeometry(): BufferGeometry {
  const parts: BufferGeometry[] = [];
  // Piliers du dolmen.
  for (const side of [-1, 1]) {
    const pillar = new BoxGeometry(0.28, 1.0, 0.4);
    pillar.translate(side * 0.42, 0.5, 0);
    paint(pillar, 0x9a938a); // granit clair
    parts.push(pillar);
  }
  // Table (linteau) posée sur les piliers.
  const cap = new BoxGeometry(1.5, 0.22, 0.62);
  cap.translate(0, 1.11, 0);
  paint(cap, 0x8a8378);
  parts.push(cap);
  // Demi-cercle de menhirs dressés autour.
  for (let i = 0; i < 5; i++) {
    const a = Math.PI * 0.25 + (i / 4) * Math.PI * 0.5 + Math.PI; // arc arrière
    const h = 0.55 + (i % 2) * 0.2;
    const menhir = new BoxGeometry(0.2, h, 0.26);
    menhir.rotateY(a);
    menhir.translate(Math.cos(a) * 1.35, h / 2, Math.sin(a) * 1.35);
    paint(menhir, i % 2 === 0 ? 0x958e83 : 0x7f786d);
    parts.push(menhir);
  }
  return mergeGeometries(parts, false)!;
}

/** Feu de camp : rondins croisés + cercle de pierres du foyer. */
function makeCampfireBase(): BufferGeometry {
  const parts: BufferGeometry[] = [];
  for (let i = 0; i < 3; i++) {
    const log = new CylinderGeometry(0.07, 0.07, 0.9, 5);
    log.rotateZ(Math.PI / 2.3);
    log.rotateY((i / 3) * Math.PI);
    log.translate(0, 0.12, 0);
    paint(log, 0x4a3018); // rondins carbonisés
    parts.push(log);
  }
  // Cercle de pierres — signe universel du foyer entretenu.
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    const stone = new BoxGeometry(0.16, 0.12, 0.13);
    stone.rotateY(a + 0.4);
    stone.translate(Math.cos(a) * 0.52, 0.05, Math.sin(a) * 0.52);
    paint(stone, i % 2 === 0 ? 0x8d8578 : 0x7a7266); // granit
    parts.push(stone);
  }
  return mergeGeometries(parts, false)!;
}

/** Braises : petit amas de charbons au cœur du foyer (matériau émissif à part). */
function makeEmbersGeometry(): BufferGeometry {
  const parts: BufferGeometry[] = [];
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + 0.7;
    const r = 0.08 + (i % 2) * 0.07;
    const coal = new BoxGeometry(0.09, 0.06, 0.08);
    coal.rotateY(a * 1.7);
    coal.translate(Math.cos(a) * r, 0.1, Math.sin(a) * r);
    parts.push(coal);
  }
  return mergeGeometries(parts, false)!;
}

export class SettlementLayer {
  private readonly huts: InstancedMesh;
  private readonly totems: InstancedMesh;
  private readonly fieldsMesh: InstancedMesh;
  private readonly temples: InstancedMesh;
  /** Feux de camp (un par village) : flammes, braises, fumée et lumière. */
  private readonly fires = new Group();
  private readonly firesAnim: Array<{
    outer: Mesh;
    inner: Mesh;
    embers: MeshBasicMaterial;
    smokes: Mesh[];
    light: PointLight;
  }> = [];
  private readonly dummy = new Group();

  constructor(
    private readonly sim: Simulation,
    addToScene: (obj: Object3D) => void,
  ) {
    const mat = new MeshStandardMaterial({ vertexColors: true, roughness: 0.9, flatShading: true });
    this.huts = new InstancedMesh(makeHutGeometry(), mat, MAX_HUTS);
    this.totems = new InstancedMesh(makeTotemGeometry(), mat, MAX_TOTEMS);
    this.fieldsMesh = new InstancedMesh(makeFieldGeometry(), mat, MAX_FIELDS);
    this.temples = new InstancedMesh(makeTempleGeometry(), mat, MAX_TEMPLES);
    for (const m of [this.huts, this.totems, this.fieldsMesh, this.temples]) {
      m.frustumCulled = false;
      m.castShadow = true;
      m.receiveShadow = true;
      m.count = 0;
      addToScene(m);
    }
    addToScene(this.fires);
    this.build();
    sim.bus.on("settlements:updated", () => this.build());
    sim.bus.on("religion:templeRaised", () => this.build());
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

    // Temples : posés à l'écart du totem, dos aux huttes, pour les villages
    // dont le culte en a érigé un.
    let tp = 0;
    const cults = this.sim.religion.villageCults;
    for (let v = 0; v < villages.length && tp < MAX_TEMPLES; v++) {
      if (!cults[v]?.temple) continue;
      const village = villages[v]!;
      const tx = village.x - 1.6;
      const ty = village.y - 1.4;
      this.dummy.position.set(tx, groundHeightAt(terrain, tx, ty), ty);
      this.dummy.rotation.set(0, hash01(tx, ty) * Math.PI * 2, 0);
      this.dummy.scale.setScalar(1);
      this.dummy.updateMatrix();
      this.temples.setMatrixAt(tp++, this.dummy.matrix);
    }
    this.temples.count = tp;
    this.temples.instanceMatrix.needsUpdate = true;

    this.buildCampfires();
  }

  /** Nombre de temples érigés (debug/vérification). */
  get templeCount(): number {
    return this.temples.count;
  }

  /**
   * Un feu de camp par village, à côté du totem (rebâti avec les villages).
   * Anatomie réaliste : cercle de pierres + rondins carbonisés, braises
   * émissives pulsantes, flamme à DEUX couches en blending additif (enveloppe
   * orange + cœur jaune-blanc, comme un vrai feu), volutes de fumée qui
   * montent et se dissipent, et lumière chaude vacillante.
   */
  private buildCampfires(): void {
    this.fires.clear();
    this.firesAnim.length = 0;
    const terrain = this.sim.terrain;
    const baseGeo = makeCampfireBase();
    const embersGeo = makeEmbersGeometry();
    const baseMat = new MeshStandardMaterial({ vertexColors: true, roughness: 0.95, flatShading: true });

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

      // Braises : orange profond qui pulse (matériau propre à chaque feu).
      const embersMat = new MeshBasicMaterial({ color: 0xff5a1f });
      fire.add(new Mesh(embersGeo, embersMat));

      // Flamme externe (enveloppe orange, additive → lueur photogénique).
      const outer = new Mesh(
        new ConeGeometry(0.2, 0.62, 7),
        new MeshBasicMaterial({
          color: 0xff7a26,
          transparent: true,
          opacity: 0.75,
          blending: AdditiveBlending,
          depthWrite: false,
        }),
      );
      outer.position.y = 0.42;
      fire.add(outer);

      // Cœur de flamme (jaune-blanc, plus court et plus vif).
      const inner = new Mesh(
        new ConeGeometry(0.1, 0.38, 6),
        new MeshBasicMaterial({
          color: 0xffe9a3,
          transparent: true,
          opacity: 0.95,
          blending: AdditiveBlending,
          depthWrite: false,
        }),
      );
      inner.position.y = 0.34;
      fire.add(inner);

      // Volutes de fumée : trois sphères qui montent en boucle, éclairées par
      // la scène (Lambert) donc sombres la nuit, teintées par le feu en dessous.
      const smokes: Mesh[] = [];
      for (let s = 0; s < 3; s++) {
        const smoke = new Mesh(
          new SphereGeometry(0.11, 6, 5),
          new MeshLambertMaterial({ color: 0x8f959d, transparent: true, opacity: 0.3, depthWrite: false }),
        );
        fire.add(smoke);
        smokes.push(smoke);
      }

      // Halo chaud : braise le jour, phare du village la nuit.
      const light = new PointLight(0xff8b3d, 0, 10, 2);
      light.position.y = 0.7;
      fire.add(light);

      this.fires.add(fire);
      this.firesAnim.push({ outer, inner, embers: embersMat, smokes, light });
    }
  }

  /** Anime flammes, braises, fumée et lumières — chaque frame. */
  update(timeSeconds: number, daylight: number): void {
    const night = 1 - daylight;
    for (let i = 0; i < this.firesAnim.length; i++) {
      const f = this.firesAnim[i]!;
      // Vacillement organique : deux fréquences décorrélées + phase par feu.
      const flicker =
        0.82 + 0.12 * Math.sin(timeSeconds * 13 + i * 2.7) + 0.06 * Math.sin(timeSeconds * 29 + i * 1.3);

      f.outer.scale.set(flicker, 1 + 0.24 * Math.sin(timeSeconds * 17 + i * 3.7), flicker);
      f.outer.rotation.y = timeSeconds * 1.6 + i;
      const innerFlick = 0.85 + 0.15 * Math.sin(timeSeconds * 31 + i * 4.3);
      f.inner.scale.set(innerFlick, 1 + 0.3 * Math.sin(timeSeconds * 23 + i * 1.9), innerFlick);
      f.inner.rotation.y = -timeSeconds * 2.2 + i;

      // Braises : rougeoiement lent entre orange sombre et vif.
      const glow = 0.55 + 0.45 * Math.sin(timeSeconds * 5 + i * 2.2) ** 2;
      f.embers.color.setRGB(1, 0.22 + 0.2 * glow, 0.05 + 0.08 * glow);

      // Fumée : cycle vertical continu, s'élargit et s'estompe en montant.
      for (let s = 0; s < f.smokes.length; s++) {
        const cycle = (timeSeconds * 0.28 + s / f.smokes.length + i * 0.13) % 1;
        const smoke = f.smokes[s]!;
        smoke.position.set(
          0.06 * Math.sin(timeSeconds * 1.1 + s * 2.4 + i), // dérive du vent
          0.55 + cycle * 1.5,
          0.05 * Math.cos(timeSeconds * 0.9 + s * 1.7),
        );
        const grow = 0.7 + cycle * 1.8;
        smoke.scale.setScalar(grow);
        (smoke.material as MeshLambertMaterial).opacity = 0.32 * (1 - cycle) * (0.5 + 0.5 * night);
      }

      // Lumière : chaleur discrète le jour, halo puissant la nuit.
      f.light.intensity = (1.4 + 9.5 * night) * flicker;
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
