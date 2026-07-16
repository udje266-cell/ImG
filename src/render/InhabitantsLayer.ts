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
import { PROFESSION_CODES } from "../sim/agents/AgentSystem";
import { Era } from "../sim/society/EraSystem";
import type { Simulation } from "../sim/world/Simulation";
import { groundHeightAt } from "./TerrainMesh";

/**
 * Hauteur d'un habitant, en unités monde (≈ tuiles). **Délibérément plus basse
 * que les maisons** : un villageois ne doit jamais dépasser son toit.
 */
const AGENT_HEIGHT = 0.8;
/** Plafond d'habitants rendus par métier (borne d'instances). */
const MAX_PER_RIG = 512;
/** Douceur du virage (0 = figé, 1 = instantané) : rotation naturelle. */
const TURN_SMOOTHING = 0.18;
/** Animation de marche : la foulée avance avec la distance parcourue. */
const STRIDE = 8;
const BOB_AMP = 0.05;
const LEAN = 0.13;
const SWAY = 0.09;
const IDLE_BOB = 0.009;
const ARM_SWING = 0.62;
const LEG_SWING = 0.5;

/** Geste de travail d'un métier (bras droit), joué à l'arrêt. */
interface Work {
  base: number; // angle de repos du bras (radians, avant = positif)
  amp: number; // amplitude du geste
  freq: number; // cadence (rad/s)
  effort?: number; // léger buste en avant + abaissement sur le coup
}
/**
 * Gestes de métier (index = code métier). À l'arrêt, l'habitant **travaille** :
 * le fermier bêche, le forgeron martèle, l'ouvrier visse, le prêtre bénit, etc.
 * Les métiers sans geste (marchand) se contentent de respirer.
 */
const WORK: (Work | undefined)[] = [];
WORK[PROFESSION_CODES.hunter] = { base: 0.12, amp: 0.14, freq: 1.4 }; // guette
WORK[PROFESSION_CODES.farmer] = { base: 0.2, amp: 0.9, freq: 3.0, effort: 0.03 }; // bêche
WORK[PROFESSION_CODES.smith] = { base: 0.12, amp: 1.15, freq: 4.3, effort: 0.035 }; // martèle
WORK[PROFESSION_CODES.priest] = { base: 0.12, amp: 0.28, freq: 1.2 }; // bénit
WORK[PROFESSION_CODES.warrior] = { base: 0.1, amp: 0.22, freq: 1.0 }; // garde
WORK[PROFESSION_CODES.scholar] = { base: 0.68, amp: 0.06, freq: 1.8 }; // lit
WORK[PROFESSION_CODES.worker] = { base: 0.32, amp: 0.5, freq: 2.7, effort: 0.02 }; // visse
WORK[PROFESSION_CODES.engineer] = { base: 0.6, amp: 0.13, freq: 3.4 }; // pianote
/** Nombre de métiers (index = code, cf. `PROFESSION_CODES`). */
const NUM_PROFESSIONS = Object.keys(PROFESSION_CODES).length;
/** Capacité de suivi d'orientation/foulée, indexée par index d'agent stable. */
const MAX_TRACK = 4096;
/** Teint de peau (partagé). */
const SKIN = 0xcaa176;

/** Habit d'une ère : couleur du vêtement, des jambes, et silhouette en robe ou non. */
interface Look {
  coat: number;
  legs: number;
  robe?: boolean;
}

/** Habit par ère — chaque âge a SA tenue (le joueur lit l'époque à la silhouette). */
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

type Add = (g: BufferGeometry, hex: number, tf?: (g: BufferGeometry) => void) => void;

/** Coiffe compacte par ère, posée sur une tête centrée à `yHead` (rayon ~0.085). */
function addHat(era: Era, add: Add, yHead: number): void {
  const top = yHead + 0.07;
  switch (era) {
    case Era.Stone:
      add(new SphereGeometry(0.1, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2), 0x53412c, (g) => g.translate(0, yHead - 0.02, 0));
      break;
    case Era.Bronze:
      add(new CylinderGeometry(0.09, 0.09, 0.035, 10), 0xcdb489, (g) => g.translate(0, yHead + 0.03, 0));
      break;
    case Era.Iron:
      add(new SphereGeometry(0.095, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), 0xb87333, (g) => g.translate(0, yHead - 0.01, 0));
      add(new BoxGeometry(0.025, 0.06, 0.16), 0x8a4f22, (g) => g.translate(0, top + 0.02, 0));
      break;
    case Era.Medieval:
      add(new ConeGeometry(0.095, 0.17, 8), 0x6a4a7a, (g) => g.translate(0, top + 0.02, 0));
      break;
    case Era.Renaissance:
      add(new CylinderGeometry(0.15, 0.15, 0.02, 12), 0x352616, (g) => g.translate(0, top - 0.02, 0));
      add(new CylinderGeometry(0.085, 0.09, 0.08, 12), 0x4a3524, (g) => g.translate(0, top + 0.03, 0));
      add(new BoxGeometry(0.014, 0.014, 0.16), 0xcf4040, (g) => { g.rotateX(0.5); g.translate(0.04, top + 0.08, -0.06); });
      break;
    case Era.Industrial:
      add(new CylinderGeometry(0.12, 0.12, 0.02, 12), 0x1c1815, (g) => g.translate(0, top - 0.02, 0));
      add(new CylinderGeometry(0.078, 0.078, 0.15, 12), 0x211d1a, (g) => g.translate(0, top + 0.06, 0));
      break;
    case Era.Modern:
      add(new SphereGeometry(0.1, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), 0xf1c40f, (g) => g.translate(0, yHead - 0.01, 0));
      add(new BoxGeometry(0.22, 0.02, 0.09), 0xf1c40f, (g) => g.translate(0, yHead, 0.06));
      break;
    case Era.Future:
      add(new SphereGeometry(0.1, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), 0xdbe8f4, (g) => g.translate(0, yHead - 0.01, 0));
      add(new BoxGeometry(0.17, 0.05, 0.05), 0x4fe6ff, (g) => g.translate(0, yHead + 0.01, 0.085));
      break;
    case Era.Interplanetary:
      add(new SphereGeometry(0.115, 12, 10), 0xe4edf3, (g) => g.translate(0, yHead + 0.01, 0));
      add(new SphereGeometry(0.1, 10, 8, 0, Math.PI * 2, Math.PI / 2.6, Math.PI / 2.2), 0x2b6f8f, (g) => g.translate(0, yHead + 0.01, 0.015));
      break;
    case Era.Galactic:
      add(new SphereGeometry(0.088, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2), 0xece0ff, (g) => g.translate(0, yHead, 0));
      add(new CylinderGeometry(0.15, 0.15, 0.014, 20), 0xb98cff, (g) => g.translate(0, top + 0.09, 0));
      add(new SphereGeometry(0.024, 8, 6), 0xe6b8ff, (g) => g.translate(0, top + 0.16, 0));
      break;
  }
}

/**
 * Accessoire de métier, tenu dans la main droite (~x 0.2, y 0.34) — il est
 * ajouté au **bras droit**, donc il se balance avec lui à la marche. Chaque
 * métier a le sien : lance (chasseur), houe (fermier), marteau (forgeron),
 * bâton (prêtre), besace (marchand), épée (guerrier), livre (érudit), clé
 * (ouvrier), tablette (ingénieur). Métiers gated par ère → pas d'anachronisme.
 */
function addTool(profession: number, era: Era, add: Add): void {
  const hx = 0.205;
  switch (profession) {
    case PROFESSION_CODES.hunter: // lance
      add(new CylinderGeometry(0.011, 0.011, 0.55, 6), 0x6b4a2a, (g) => { g.rotateX(-0.08); g.translate(hx, 0.36, 0); });
      add(new ConeGeometry(0.028, 0.09, 6), era === Era.Stone ? 0x8f8378 : 0xb87333, (g) => { g.rotateX(-0.08); g.translate(hx, 0.65, 0); });
      break;
    case PROFESSION_CODES.warrior: // épée : lame + garde
      add(new BoxGeometry(0.026, 0.3, 0.012), 0xc6ccd2, (g) => g.translate(hx, 0.46, 0.02));
      add(new BoxGeometry(0.1, 0.024, 0.03), 0x6a5030, (g) => g.translate(hx, 0.31, 0.02));
      add(new BoxGeometry(0.03, 0.06, 0.03), 0x4a3a24, (g) => g.translate(hx, 0.27, 0.02));
      break;
    case PROFESSION_CODES.farmer: // houe : manche + lame coudée
      add(new CylinderGeometry(0.012, 0.012, 0.5, 6), 0x6b4a2a, (g) => { g.rotateX(-0.06); g.translate(hx, 0.34, 0.02); });
      add(new BoxGeometry(0.03, 0.05, 0.09), 0x707078, (g) => g.translate(hx, 0.11, 0.08));
      break;
    case PROFESSION_CODES.smith: // marteau : manche + tête de fer
      add(new CylinderGeometry(0.013, 0.013, 0.32, 6), 0x6b4a2a, (g) => g.translate(hx, 0.36, 0));
      add(new BoxGeometry(0.09, 0.07, 0.07), 0x484852, (g) => g.translate(hx, 0.53, 0));
      break;
    case PROFESSION_CODES.priest: // bâton + orbe doré
      add(new CylinderGeometry(0.012, 0.012, 0.62, 6), 0x6a4a2a, (g) => g.translate(hx, 0.4, 0));
      add(new SphereGeometry(0.04, 10, 8), 0xd8b24a, (g) => g.translate(hx, 0.73, 0));
      break;
    case PROFESSION_CODES.merchant: // besace + cordon
      add(new BoxGeometry(0.1, 0.12, 0.09), 0xb08a5a, (g) => g.translate(hx, 0.28, 0.03));
      add(new BoxGeometry(0.055, 0.03, 0.05), 0x7a5c34, (g) => g.translate(hx, 0.35, 0.03));
      break;
    case PROFESSION_CODES.scholar: // livre : couverture + pages
      add(new BoxGeometry(0.11, 0.085, 0.03), 0x7a3a2a, (g) => g.translate(0.19, 0.35, 0.06));
      add(new BoxGeometry(0.1, 0.02, 0.026), 0xe8dcc0, (g) => g.translate(0.19, 0.35, 0.075));
      break;
    case PROFESSION_CODES.worker: // clé à molette : manche + tête fourchue
      add(new CylinderGeometry(0.013, 0.013, 0.26, 6), 0x8a9098, (g) => g.translate(hx, 0.34, 0));
      add(new BoxGeometry(0.07, 0.05, 0.045), 0x9aa0a8, (g) => g.translate(hx, 0.49, 0));
      add(new BoxGeometry(0.028, 0.03, 0.05), 0x70767e, (g) => g.translate(hx, 0.53, 0.03));
      break;
    case PROFESSION_CODES.engineer: // tablette : boîtier + écran cyan
      add(new BoxGeometry(0.09, 0.12, 0.014), 0x2b3440, (g) => g.translate(0.19, 0.36, 0.06));
      add(new BoxGeometry(0.075, 0.1, 0.006), 0x4fe6ff, (g) => g.translate(0.19, 0.36, 0.069));
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
  legL: BufferGeometry | null;
  legR: BufferGeometry | null;
  pivots: Pivots;
}

/**
 * Construit un villageois de l'ère et du **métier** en parties articulées :
 * tronc + bras + jambes séparés (pivots épaule/hanche), l'**accessoire du
 * métier** attaché au bras droit. Toutes les parties sont normalisées ensemble
 * (pieds à y=0, hauteur AGENT_HEIGHT), donc l'accessoire ne dépasse jamais.
 */
function buildVillager(era: Era, profession: number): VillagerParts {
  const look = LOOK[era];
  const robe = !!look.robe;
  const bodyG: BufferGeometry[] = [];
  const armLG: BufferGeometry[] = [];
  const armRG: BufferGeometry[] = [];
  const legLG: BufferGeometry[] = [];
  const legRG: BufferGeometry[] = [];
  const to = (arr: BufferGeometry[]): Add => (g, hex, tf) => {
    if (tf) tf(g);
    paintGeo(g, hex);
    arr.push(g);
  };
  const body = to(bodyG);

  if (robe) {
    body(new ConeGeometry(0.145, 0.4, 10), look.coat, (g) => g.translate(0, 0.2, 0));
  } else {
    to(legLG)(new BoxGeometry(0.075, 0.34, 0.095), look.legs, (g) => g.translate(-0.06, 0.17, 0));
    to(legRG)(new BoxGeometry(0.075, 0.34, 0.095), look.legs, (g) => g.translate(0.06, 0.17, 0));
  }
  body(new CylinderGeometry(0.1, 0.135, 0.28, 8), look.coat, (g) => g.translate(0, 0.46, 0));
  if (era === Era.Interplanetary || era === Era.Future) {
    body(new CylinderGeometry(0.14, 0.14, 0.1, 10), look.coat, (g) => g.translate(0, 0.56, 0));
  }
  // Bras gauche (nu de tout outil).
  to(armLG)(new BoxGeometry(0.052, 0.26, 0.07), look.coat, (g) => { g.rotateZ(0.06); g.translate(-0.155, 0.46, 0); });
  to(armLG)(new BoxGeometry(0.05, 0.05, 0.06), SKIN, (g) => g.translate(-0.17, 0.33, 0));
  // Bras droit + main + ACCESSOIRE DE MÉTIER.
  to(armRG)(new BoxGeometry(0.052, 0.26, 0.07), look.coat, (g) => { g.rotateZ(-0.06); g.translate(0.155, 0.46, 0); });
  to(armRG)(new BoxGeometry(0.05, 0.05, 0.06), SKIN, (g) => g.translate(0.17, 0.33, 0));
  addTool(profession, era, to(armRG));
  // Cou + tête + yeux + coiffe.
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

  // Normalisation commune : pieds à y=0, hauteur = AGENT_HEIGHT (déterminée par
  // la tête/coiffe, identique pour tous les métiers → même taille partout).
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

/** Gréement instancié d'un métier : tronc + 4 membres + pivots + présence de jambes. */
interface Rig {
  body: InstancedMesh;
  armL: InstancedMesh;
  armR: InstancedMesh;
  legL: InstancedMesh;
  legR: InstancedMesh;
  pivots: Pivots;
  hasLegs: boolean;
}

/**
 * Rendu des habitants (docs/TDD.md §4.5, phase C) : villageois **procéduraux,
 * articulés et par métier** (aucun modèle externe). Un gréement par métier
 * (tronc + bras + jambes séparés + accessoire du métier au bras droit) ;
 * à la marche, bras et jambes se **balancent en opposition**. Tenues et coiffes
 * se reconstruisent à chaque changement d'ère. Lecture seule de la simulation.
 */
export class InhabitantsLayer {
  private readonly rigs: Rig[] = [];
  private readonly dummy = new Object3D();
  // Suivi par **index d'agent stable** (i), pas par emplacement de gréement.
  private readonly heading = new Float32Array(MAX_TRACK);
  private readonly prevX = new Float32Array(MAX_TRACK);
  private readonly prevY = new Float32Array(MAX_TRACK);
  private readonly stridePhase = new Float32Array(MAX_TRACK);
  private primed = false;
  private readonly mLocal = new Matrix4();
  private readonly mRot = new Matrix4();
  private readonly mTmp = new Matrix4();
  private readonly mLimb = new Matrix4();

  constructor(
    private readonly sim: Simulation,
    addToScene: (mesh: InstancedMesh) => void,
  ) {
    const mat = new MeshStandardMaterial({ vertexColors: true, roughness: 0.85, flatShading: true });
    for (let prof = 0; prof < NUM_PROFESSIONS; prof++) {
      const parts = buildVillager(this.sim.era.era, prof);
      const mk = (geo: BufferGeometry): InstancedMesh => {
        const mesh = new InstancedMesh(geo, mat, MAX_PER_RIG);
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

  /** Reconstruit tenues/silhouettes de tous les métiers pour l'ère. */
  private rebuild(era: Era): void {
    for (let prof = 0; prof < this.rigs.length; prof++) {
      const rig = this.rigs[prof]!;
      const parts = buildVillager(era, prof);
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
    this.dummy.rotation.order = "YXZ";

    for (let i = 0; i < snap.count; i++) {
      const wx = snap.x[i]!;
      const wy = snap.y[i]!;
      const atWork = snap.goal[i] === 4; // objectif « work » : à son lieu de travail
      let prof = snap.profession[i]! | 0;
      if (prof < 0 || prof >= this.rigs.length) prof = 0;
      const rig = this.rigs[prof]!;
      const idx = counts[prof]!;
      if (idx >= MAX_PER_RIG || i >= MAX_TRACK) continue;

      let speed = 0;
      if (this.primed) {
        const vx = wx - this.prevX[i]!;
        const vy = wy - this.prevY[i]!;
        speed = Math.sqrt(vx * vx + vy * vy);
        if (vx * vx + vy * vy > 1e-4) {
          const desired = Math.atan2(vx, vy);
          let d = desired - this.heading[i]!;
          d = Math.atan2(Math.sin(d), Math.cos(d));
          this.heading[i] = this.heading[i]! + d * TURN_SMOOTHING;
        }
      } else {
        this.heading[i] = Math.atan2(wx - this.prevX[i]!, wy - this.prevY[i]!) || 0;
      }
      this.prevX[i] = wx;
      this.prevY[i] = wy;

      this.stridePhase[i] = this.stridePhase[i]! + speed * STRIDE;
      const moving = Math.min(1, speed / 0.02);
      const ph = this.stridePhase[i]!;
      const swing = Math.sin(ph);

      // Deux régimes : en marche → foulée articulée ; à l'arrêt → geste de métier.
      let bob: number;
      let lean: number;
      let sway = 0;
      let armRa: number;
      let armLa: number;
      let legLa = 0;
      let legRa = 0;
      if (moving > 0.05) {
        bob = Math.abs(swing) * BOB_AMP * moving;
        lean = LEAN * moving;
        sway = swing * SWAY * moving;
        const a = ARM_SWING * moving * swing;
        armRa = a;
        armLa = -a;
        const l = LEG_SWING * moving * swing;
        legLa = l;
        legRa = -l;
      } else {
        bob = Math.sin(timeSeconds * 2.2 + i * 0.7) * IDLE_BOB;
        lean = 0;
        // Le geste de métier ne se joue qu'À un **vrai lieu de travail**
        // (objectif « work ») : forgeron à la forge, fermier au champ… Ailleurs
        // (arrêt au foyer, halte de flânerie), l'habitant se contente de respirer.
        const work = atWork ? WORK[prof] : undefined;
        if (work) {
          const w = 0.5 - 0.5 * Math.cos(timeSeconds * work.freq + i); // 0→1→0, geste répété
          armRa = work.base + work.amp * w;
          armLa = -0.04;
          if (work.effort) {
            lean = work.effort * 3 * w; // buste en avant sur l'effort
            bob -= work.effort * w; // s'abaisse sur le coup
          }
        } else {
          armRa = 0;
          armLa = 0;
        }
      }

      const groundY = groundHeightAt(terrain, wx, wy);
      this.dummy.position.set(wx, groundY + bob, wy);
      this.dummy.rotation.set(lean, this.heading[i]!, sway);
      this.dummy.scale.setScalar(1);
      this.dummy.updateMatrix();
      const m = this.dummy.matrix;
      rig.body.setMatrixAt(idx, m);

      this.setLimb(rig.armR, idx, m, rig.pivots.armR, armRa);
      this.setLimb(rig.armL, idx, m, rig.pivots.armL, armLa);
      if (rig.hasLegs) {
        this.setLimb(rig.legL, idx, m, rig.pivots.legL, legLa);
        this.setLimb(rig.legR, idx, m, rig.pivots.legR, legRa);
      }

      counts[prof] = idx + 1;
    }
    this.primed = true;

    for (let prof = 0; prof < this.rigs.length; prof++) {
      const rig = this.rigs[prof]!;
      const n = counts[prof]!;
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
