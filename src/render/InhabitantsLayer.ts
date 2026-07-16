import {
  BoxGeometry,
  Box3,
  BufferAttribute,
  BufferGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DynamicDrawUsage,
  InstancedMesh,
  Matrix4,
  MeshStandardMaterial,
  Object3D,
  SphereGeometry,
} from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { Era } from "../sim/society/EraSystem";
import type { Simulation } from "../sim/world/Simulation";
import { groundHeightAt } from "./TerrainMesh";

/**
 * Hauteur d'un habitant, en unités monde (≈ tuiles). **Délibérément plus basse
 * que les maisons** (la plus courte fait ~1 tuile) : un villageois ne doit
 * jamais dépasser son toit.
 */
const AGENT_HEIGHT = 0.8;
/** Plafond d'habitants rendus (budget d'instances). */
const MAX_AGENTS = 4000;
/** Douceur du virage (0 = figé, 1 = instantané) : rotation naturelle. */
const TURN_SMOOTHING = 0.18;
/** Animation de marche : la foulée avance avec la distance parcourue. */
const STRIDE = 8; // radians de cycle par unité monde (~un pas tous les 0,4)
const BOB_AMP = 0.05; // rebond vertical (unités monde) en marchant
const LEAN = 0.13; // inclinaison avant en marchant (radians)
const SWAY = 0.09; // roulis gauche/droite en marchant (radians)
const IDLE_BOB = 0.009; // respiration au repos
const ARM_SWING = 0.62; // amplitude du balancement des bras (radians)
const LEG_SWING = 0.5; // amplitude du balancement des jambes (radians)
/** Deux silhouettes par ère (jambes / robe) pour que la foule ne soit pas clonée. */
const VARIANTS = 2;
/** Teint de peau (partagé). */
const SKIN = 0xcaa176;

/** Habit d'une ère : couleur du vêtement, des jambes, et silhouette en robe ou non. */
interface Look {
  coat: number;
  legs: number;
  robe?: boolean;
}

/**
 * Habit par ère — chaque âge a SA tenue, de la fourrure préhistorique à la robe
 * irisée galactique. Distinct d'une ère à l'autre (le joueur lit l'époque à la
 * silhouette), au lieu d'un même modèle reteinté partout.
 */
const LOOK: Record<Era, Look> = {
  [Era.Stone]: { coat: 0x6b5236, legs: 0xa9865c }, // fourrure brute, jambes nues
  [Era.Bronze]: { coat: 0xd8c49a, legs: 0xbfa878 }, // tunique de lin
  [Era.Iron]: { coat: 0xb0985e, legs: 0x7f5f3a }, // tunique + cuir
  [Era.Medieval]: { coat: 0x5b4a6e, legs: 0x463a52, robe: true }, // robe de laine
  [Era.Renaissance]: { coat: 0x6a4a8a, legs: 0x372a4e }, // pourpoint teinté
  [Era.Industrial]: { coat: 0x312b26, legs: 0x201c19 }, // redingote sombre
  [Era.Modern]: { coat: 0x3a6088, legs: 0x2b3a4a }, // veste moderne
  [Era.Future]: { coat: 0x7fc8e6, legs: 0x4f9ac6 }, // combinaison claire
  [Era.Interplanetary]: { coat: 0xdfe6ec, legs: 0xb4c0c8 }, // scaphandre
  [Era.Galactic]: { coat: 0xcbb8ff, legs: 0x9a7fd0, robe: true }, // robe irisée
};

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

/** Géométrie vide (maillage de jambe absent pour les silhouettes en robe). */
function emptyGeo(): BufferGeometry {
  const g = new BufferGeometry();
  g.setAttribute("position", new BufferAttribute(new Float32Array(0), 3));
  g.setAttribute("color", new BufferAttribute(new Float32Array(0), 3));
  return g;
}

/** Coiffe compacte par ère, posée sur une tête centrée à `yHead` (rayon ~0.085). */
function addHat(
  era: Era,
  add: (g: BufferGeometry, hex: number, tf?: (g: BufferGeometry) => void) => void,
  yHead: number,
): void {
  const top = yHead + 0.07;
  switch (era) {
    case Era.Stone: // capuche de fourrure
      add(new SphereGeometry(0.1, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2), 0x53412c, (g) => g.translate(0, yHead - 0.02, 0));
      break;
    case Era.Bronze: // bandeau de lin
      add(new CylinderGeometry(0.09, 0.09, 0.035, 10), 0xcdb489, (g) => g.translate(0, yHead + 0.03, 0));
      break;
    case Era.Iron: // casque de bronze + cimier
      add(new SphereGeometry(0.095, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), 0xb87333, (g) => g.translate(0, yHead - 0.01, 0));
      add(new BoxGeometry(0.025, 0.06, 0.16), 0x8a4f22, (g) => g.translate(0, top + 0.02, 0));
      break;
    case Era.Medieval: // chaperon pointu
      add(new ConeGeometry(0.095, 0.17, 8), 0x6a4a7a, (g) => g.translate(0, top + 0.02, 0));
      break;
    case Era.Renaissance: // chapeau à large bord + plume
      add(new CylinderGeometry(0.15, 0.15, 0.02, 12), 0x352616, (g) => g.translate(0, top - 0.02, 0));
      add(new CylinderGeometry(0.085, 0.09, 0.08, 12), 0x4a3524, (g) => g.translate(0, top + 0.03, 0));
      add(new BoxGeometry(0.014, 0.014, 0.16), 0xcf4040, (g) => { g.rotateX(0.5); g.translate(0.04, top + 0.08, -0.06); });
      break;
    case Era.Industrial: // haut-de-forme
      add(new CylinderGeometry(0.12, 0.12, 0.02, 12), 0x1c1815, (g) => g.translate(0, top - 0.02, 0));
      add(new CylinderGeometry(0.078, 0.078, 0.15, 12), 0x211d1a, (g) => g.translate(0, top + 0.06, 0));
      break;
    case Era.Modern: // casque de chantier
      add(new SphereGeometry(0.1, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), 0xf1c40f, (g) => g.translate(0, yHead - 0.01, 0));
      add(new BoxGeometry(0.22, 0.02, 0.09), 0xf1c40f, (g) => g.translate(0, yHead, 0.06));
      break;
    case Era.Future: // casque à visière lumineuse
      add(new SphereGeometry(0.1, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), 0xdbe8f4, (g) => g.translate(0, yHead - 0.01, 0));
      add(new BoxGeometry(0.17, 0.05, 0.05), 0x4fe6ff, (g) => g.translate(0, yHead + 0.01, 0.085));
      break;
    case Era.Interplanetary: // casque de scaphandre : bulle + visière teintée
      add(new SphereGeometry(0.115, 12, 10), 0xe4edf3, (g) => g.translate(0, yHead + 0.01, 0));
      add(new SphereGeometry(0.1, 10, 8, 0, Math.PI * 2, Math.PI / 2.6, Math.PI / 2.2), 0x2b6f8f, (g) => g.translate(0, yHead + 0.01, 0.015));
      break;
    case Era.Galactic: // calotte irisée + halo flottant lumineux
      add(new SphereGeometry(0.088, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2), 0xece0ff, (g) => g.translate(0, yHead, 0));
      add(new CylinderGeometry(0.15, 0.15, 0.014, 20), 0xb98cff, (g) => g.translate(0, top + 0.09, 0));
      add(new SphereGeometry(0.024, 8, 6), 0xe6b8ff, (g) => g.translate(0, top + 0.16, 0));
      break;
  }
}

/** Pivots d'articulation (épaules, hanches) d'un villageois, en unités monde. */
interface Pivots {
  armL: [number, number, number];
  armR: [number, number, number];
  legL: [number, number, number];
  legR: [number, number, number];
}
/** Parties articulées d'un villageois : tronc + membres séparés (+ pivots). */
interface VillagerParts {
  body: BufferGeometry;
  armL: BufferGeometry;
  armR: BufferGeometry;
  legL: BufferGeometry | null; // null pour les silhouettes en robe
  legR: BufferGeometry | null;
  pivots: Pivots;
}

/**
 * Construit un villageois de l'ère en **parties articulées** : tronc (torse,
 * tête, coiffe, robe éventuelle), bras gauche/droit et jambes gauche/droite
 * séparés, chacun avec son pivot (épaule/hanche) pour balancer à la marche.
 * Toutes les parties sont normalisées ensemble (pieds à y=0, hauteur
 * AGENT_HEIGHT). La lance des ères de chasse est attachée au bras droit (elle
 * se balance avec lui).
 */
function buildVillager(era: Era, variant: number): VillagerParts {
  const look = LOOK[era];
  const robe = look.robe || variant === 1;
  const bodyG: BufferGeometry[] = [];
  const armLG: BufferGeometry[] = [];
  const armRG: BufferGeometry[] = [];
  const legLG: BufferGeometry[] = [];
  const legRG: BufferGeometry[] = [];
  const to = (arr: BufferGeometry[]) => (g: BufferGeometry, hex: number, tf?: (g: BufferGeometry) => void): void => {
    if (tf) tf(g);
    paintGeo(g, hex);
    arr.push(g);
  };
  const body = to(bodyG);

  // Bas du corps : robe évasée (dans le tronc) OU deux jambes articulées.
  if (robe) {
    body(new ConeGeometry(0.145, 0.4, 10), look.coat, (g) => g.translate(0, 0.2, 0));
  } else {
    to(legLG)(new BoxGeometry(0.075, 0.34, 0.095), look.legs, (g) => g.translate(-0.06, 0.17, 0));
    to(legRG)(new BoxGeometry(0.075, 0.34, 0.095), look.legs, (g) => g.translate(0.06, 0.17, 0));
  }
  // Buste + épaules techniques (tronc).
  body(new CylinderGeometry(0.1, 0.135, 0.28, 8), look.coat, (g) => g.translate(0, 0.46, 0));
  if (era === Era.Interplanetary || era === Era.Future) {
    body(new CylinderGeometry(0.14, 0.14, 0.1, 10), look.coat, (g) => g.translate(0, 0.56, 0));
  }
  // Bras gauche / droit (+ mains) — parties séparées, pivot à l'épaule.
  to(armLG)(new BoxGeometry(0.052, 0.26, 0.07), look.coat, (g) => { g.rotateZ(0.06); g.translate(-0.155, 0.46, 0); });
  to(armLG)(new BoxGeometry(0.05, 0.05, 0.06), SKIN, (g) => g.translate(-0.17, 0.33, 0));
  to(armRG)(new BoxGeometry(0.052, 0.26, 0.07), look.coat, (g) => { g.rotateZ(-0.06); g.translate(0.155, 0.46, 0); });
  to(armRG)(new BoxGeometry(0.05, 0.05, 0.06), SKIN, (g) => g.translate(0.17, 0.33, 0));
  // Lance des ères de chasse/guerre — attachée au bras droit.
  if (era === Era.Stone || era === Era.Bronze || era === Era.Iron) {
    to(armRG)(new CylinderGeometry(0.011, 0.011, 0.62, 6), 0x6b4a2a, (g) => { g.rotateX(-0.1); g.translate(0.205, 0.34, 0); });
    to(armRG)(new ConeGeometry(0.028, 0.09, 6), era === Era.Stone ? 0x8f8378 : 0xb87333, (g) => { g.rotateX(-0.1); g.translate(0.205, 0.67, 0); });
  }
  // Cou + tête + yeux + coiffe (tronc).
  body(new CylinderGeometry(0.03, 0.03, 0.04, 6), SKIN, (g) => g.translate(0, 0.6, 0));
  const yHead = 0.66;
  body(new SphereGeometry(0.085, 10, 8), SKIN, (g) => g.translate(0, yHead, 0));
  for (const sx of [-1, 1]) {
    body(new BoxGeometry(0.02, 0.026, 0.018), 0x241d16, (g) => g.translate(sx * 0.031, yHead + 0.004, 0.077));
  }
  addHat(era, body, yHead);

  const bodyGeo = mergeGeometries(bodyG, false)!;
  const armLGeo = mergeGeometries(armLG, false)!;
  const armRGeo = mergeGeometries(armRG, false)!;
  const legLGeo = robe ? null : mergeGeometries(legLG, false)!;
  const legRGeo = robe ? null : mergeGeometries(legRG, false)!;

  // Normalisation commune : pieds à y=0, hauteur = AGENT_HEIGHT.
  const all = [bodyGeo, armLGeo, armRGeo, legLGeo, legRGeo].filter((g): g is BufferGeometry => g !== null);
  const box = new Box3();
  for (const g of all) {
    g.computeBoundingBox();
    box.union(g.boundingBox!);
  }
  const h = box.max.y - box.min.y || 1;
  const s = AGENT_HEIGHT / h;
  const yMin = box.min.y;
  for (const g of all) {
    g.translate(0, -yMin, 0);
    g.scale(s, s, s);
  }
  const norm = (x: number, y: number, z: number): [number, number, number] => [x * s, (y - yMin) * s, z * s];
  const pivots: Pivots = {
    armL: norm(-0.155, 0.58, 0),
    armR: norm(0.155, 0.58, 0),
    legL: norm(-0.06, 0.34, 0),
    legR: norm(0.06, 0.34, 0),
  };
  return { body: bodyGeo, armL: armLGeo, armR: armRGeo, legL: legLGeo, legR: legRGeo, pivots };
}

/** Gréement instancié d'une silhouette : tronc + 4 membres + pivots + présence de jambes. */
interface VariantRig {
  body: InstancedMesh;
  armL: InstancedMesh;
  armR: InstancedMesh;
  legL: InstancedMesh;
  legR: InstancedMesh;
  pivots: Pivots;
  hasLegs: boolean;
}

/**
 * Rendu des habitants (docs/TDD.md §4.5, phase C) : villageois **procéduraux et
 * articulés par ère** (aucun modèle externe). Chaque silhouette est un jeu de
 * maillages instanciés (tronc + bras + jambes) ; à la marche, bras et jambes se
 * **balancent en opposition** autour de leurs pivots, cadencés par la foulée.
 * Tenues et coiffes se reconstruisent à chaque changement d'ère. Lecture seule.
 */
export class InhabitantsLayer {
  private readonly rigs: VariantRig[] = [];
  private readonly dummy = new Object3D();
  // Orientation « naturelle » : chaque habitant regarde là où il marche, et
  // tourne en douceur. Suivi de la vitesse et de la foulée par index.
  private readonly heading = new Float32Array(MAX_AGENTS);
  private readonly prevX = new Float32Array(MAX_AGENTS);
  private readonly prevY = new Float32Array(MAX_AGENTS);
  private readonly stridePhase = new Float32Array(MAX_AGENTS);
  private primed = false;
  // Matrices de travail pour composer la rotation d'un membre autour de son pivot.
  private readonly mLocal = new Matrix4();
  private readonly mRot = new Matrix4();
  private readonly mTmp = new Matrix4();
  private readonly mLimb = new Matrix4();

  constructor(
    private readonly sim: Simulation,
    addToScene: (mesh: InstancedMesh) => void,
  ) {
    const mat = new MeshStandardMaterial({ vertexColors: true, roughness: 0.85, flatShading: true });
    for (let v = 0; v < VARIANTS; v++) {
      const parts = buildVillager(this.sim.era.era, v);
      const mk = (geo: BufferGeometry): InstancedMesh => {
        const mesh = new InstancedMesh(geo, mat, MAX_AGENTS);
        mesh.instanceMatrix.setUsage(DynamicDrawUsage);
        mesh.frustumCulled = false;
        mesh.castShadow = true;
        mesh.count = 0;
        addToScene(mesh);
        return mesh;
      };
      this.rigs.push({
        body: mk(parts.body),
        armL: mk(parts.armL),
        armR: mk(parts.armR),
        legL: mk(parts.legL ?? emptyGeo()),
        legR: mk(parts.legR ?? emptyGeo()),
        pivots: parts.pivots,
        hasLegs: parts.legL !== null,
      });
    }
    sim.bus.on("era:advanced", ({ era }) => this.rebuild(era as Era));
  }

  /** Reconstruit les tenues/silhouettes de toutes les variantes pour l'ère. */
  private rebuild(era: Era): void {
    for (let v = 0; v < this.rigs.length; v++) {
      const rig = this.rigs[v]!;
      const parts = buildVillager(era, v);
      rig.body.geometry.dispose();
      rig.body.geometry = parts.body;
      rig.armL.geometry.dispose();
      rig.armL.geometry = parts.armL;
      rig.armR.geometry.dispose();
      rig.armR.geometry = parts.armR;
      rig.legL.geometry.dispose();
      rig.legL.geometry = parts.legL ?? emptyGeo();
      rig.legR.geometry.dispose();
      rig.legR.geometry = parts.legR ?? emptyGeo();
      rig.pivots = parts.pivots;
      rig.hasLegs = parts.legL !== null;
    }
  }

  /** Pose un membre = matrice de l'agent ∘ rotation autour du pivot du membre. */
  private setLimb(mesh: InstancedMesh, idx: number, m: Matrix4, pivot: [number, number, number], angle: number): void {
    this.mLocal.makeTranslation(pivot[0], pivot[1], pivot[2]);
    this.mRot.makeRotationX(angle);
    this.mLocal.multiply(this.mRot);
    this.mTmp.makeTranslation(-pivot[0], -pivot[1], -pivot[2]);
    this.mLocal.multiply(this.mTmp);
    this.mLimb.multiplyMatrices(m, this.mLocal);
    mesh.setMatrixAt(idx, this.mLimb);
  }

  /** Repositionne et **anime** (marche articulée) les instances chaque frame. */
  update(timeSeconds = 0): void {
    const snap = this.sim.agents.snapshot();
    const terrain = this.sim.terrain;
    const counts = new Array(this.rigs.length).fill(0);
    this.dummy.rotation.order = "YXZ"; // cap (Y) puis inclinaison (X) puis roulis (Z)

    for (let i = 0; i < snap.count; i++) {
      const wx = snap.x[i]!;
      const wy = snap.y[i]!;
      const v = i % this.rigs.length;
      const rig = this.rigs[v]!;
      const idx = counts[v]!;
      if (idx >= MAX_AGENTS) continue;

      // Cap + vitesse depuis la frame précédente (orientation lissée, foulée).
      let speed = 0;
      if (this.primed) {
        const vx = wx - this.prevX[i]!;
        const vy = wy - this.prevY[i]!;
        speed = Math.sqrt(vx * vx + vy * vy);
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

      // Foulée : avance avec la distance ; pilote rebond, inclinaison et
      // balancement des membres. Au repos : légère respiration, membres au neutre.
      this.stridePhase[i] = this.stridePhase[i]! + speed * STRIDE;
      const moving = Math.min(1, speed / 0.02);
      const ph = this.stridePhase[i]!;
      const swing = Math.sin(ph);
      const bob =
        moving > 0.05
          ? Math.abs(Math.sin(ph)) * BOB_AMP * moving
          : Math.sin(timeSeconds * 2.2 + i * 0.7) * IDLE_BOB;
      const lean = LEAN * moving;
      const sway = swing * SWAY * moving;

      const groundY = groundHeightAt(terrain, wx, wy);
      this.dummy.position.set(wx, groundY + bob, wy);
      this.dummy.rotation.set(lean, this.heading[i]!, sway);
      this.dummy.scale.setScalar(1); // géométrie déjà normalisée à AGENT_HEIGHT
      this.dummy.updateMatrix();
      const m = this.dummy.matrix;
      rig.body.setMatrixAt(idx, m);

      // Bras en opposition ; jambes en opposition (bras droit avec jambe gauche).
      const armA = ARM_SWING * moving * swing;
      this.setLimb(rig.armR, idx, m, rig.pivots.armR, armA);
      this.setLimb(rig.armL, idx, m, rig.pivots.armL, -armA);
      if (rig.hasLegs) {
        const legA = LEG_SWING * moving * swing;
        this.setLimb(rig.legL, idx, m, rig.pivots.legL, legA);
        this.setLimb(rig.legR, idx, m, rig.pivots.legR, -legA);
      }

      counts[v] = idx + 1;
    }
    this.primed = true;

    for (let v = 0; v < this.rigs.length; v++) {
      const rig = this.rigs[v]!;
      const n = counts[v]!;
      for (const mesh of [rig.body, rig.armL, rig.armR]) {
        mesh.count = n;
        mesh.instanceMatrix.needsUpdate = true;
      }
      const legN = rig.hasLegs ? n : 0;
      for (const mesh of [rig.legL, rig.legR]) {
        mesh.count = legN;
        mesh.instanceMatrix.needsUpdate = true;
      }
    }
  }
}
