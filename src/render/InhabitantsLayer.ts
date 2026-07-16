import {
  BoxGeometry,
  BufferAttribute,
  type BufferGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DynamicDrawUsage,
  InstancedMesh,
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

/**
 * Villageois procédural de l'ère (unités monde, pieds à y=0, hauteur ~0.8).
 * Corps low-poly + tenue et coiffe propres à l'époque + (variante) jambes ou
 * robe. Couleurs cuites en couleurs de sommets → un seul matériau instancié.
 */
function makeVillager(era: Era, variant: number): BufferGeometry {
  const parts: BufferGeometry[] = [];
  const add = (g: BufferGeometry, hex: number, tf?: (g: BufferGeometry) => void): void => {
    if (tf) tf(g);
    paintGeo(g, hex);
    parts.push(g);
  };
  const look = LOOK[era];
  const robe = look.robe || variant === 1;

  // Bas du corps : robe évasée (couleur du vêtement) ou deux jambes.
  if (robe) {
    add(new ConeGeometry(0.145, 0.4, 10), look.coat, (g) => g.translate(0, 0.2, 0));
  } else {
    for (const sx of [-1, 1]) {
      add(new BoxGeometry(0.075, 0.34, 0.095), look.legs, (g) => g.translate(sx * 0.06, 0.17, 0));
    }
  }
  // Buste (évasé vers le bas) dans la couleur de la tenue.
  add(new CylinderGeometry(0.1, 0.135, 0.28, 8), look.coat, (g) => g.translate(0, 0.46, 0));
  // Épaules un peu plus larges au futur/interplanétaire (tenue technique).
  if (era === Era.Interplanetary || era === Era.Future) {
    add(new CylinderGeometry(0.14, 0.14, 0.1, 10), look.coat, (g) => g.translate(0, 0.56, 0));
  }
  // Bras le long du corps + mains (peau).
  for (const sx of [-1, 1]) {
    add(new BoxGeometry(0.052, 0.26, 0.07), look.coat, (g) => {
      g.rotateZ(sx * 0.06);
      g.translate(sx * 0.155, 0.46, 0);
    });
    add(new BoxGeometry(0.05, 0.05, 0.06), SKIN, (g) => g.translate(sx * 0.17, 0.33, 0));
  }
  // Cou + tête (peau).
  add(new CylinderGeometry(0.03, 0.03, 0.04, 6), SKIN, (g) => g.translate(0, 0.6, 0));
  const yHead = 0.66;
  add(new SphereGeometry(0.085, 10, 8), SKIN, (g) => g.translate(0, yHead, 0));
  // Coiffe/casque de l'ère.
  addHat(era, add, yHead);

  const geo = mergeGeometries(parts, false)!;
  // Normalise à AGENT_HEIGHT (pieds à y=0) : hauteur identique à toutes les ères,
  // toujours plus basse que les maisons, quelle que soit la coiffe.
  geo.computeBoundingBox();
  const box = geo.boundingBox!;
  const h = box.max.y - box.min.y || 1;
  const s = AGENT_HEIGHT / h;
  geo.translate(0, -box.min.y, 0);
  geo.scale(s, s, s);
  return geo;
}

/**
 * Rendu des habitants (docs/TDD.md §4.5, phase C) : villageois **procéduraux
 * par ère** (aucun modèle externe), un `InstancedMesh` par silhouette, orientés
 * chaque frame vers leur direction de marche depuis le snapshot du
 * `AgentSystem`. Les tenues et coiffes se reconstruisent à chaque changement
 * d'ère (l'apparence évolue avec l'âge). Lecture seule de la simulation.
 */
export class InhabitantsLayer {
  private readonly meshes: InstancedMesh[] = [];
  private readonly dummy = new Object3D();
  // Orientation « naturelle » : chaque habitant regarde là où il marche, et
  // tourne en douceur (pas de virage instantané). Suivi de la vitesse par index.
  private readonly heading = new Float32Array(MAX_AGENTS);
  private readonly prevX = new Float32Array(MAX_AGENTS);
  private readonly prevY = new Float32Array(MAX_AGENTS);
  private primed = false;

  constructor(
    private readonly sim: Simulation,
    addToScene: (mesh: InstancedMesh) => void,
  ) {
    const mat = new MeshStandardMaterial({ vertexColors: true, roughness: 0.85, flatShading: true });
    for (let v = 0; v < VARIANTS; v++) {
      const mesh = new InstancedMesh(makeVillager(sim.era.era, v), mat, MAX_AGENTS);
      mesh.instanceMatrix.setUsage(DynamicDrawUsage);
      mesh.frustumCulled = false;
      mesh.castShadow = true;
      mesh.count = 0;
      this.meshes.push(mesh);
      addToScene(mesh);
    }
    // Changement d'ère : les tenues et coiffes se reconstruisent.
    sim.bus.on("era:advanced", ({ era }) => {
      for (let v = 0; v < this.meshes.length; v++) {
        this.meshes[v]!.geometry.dispose();
        this.meshes[v]!.geometry = makeVillager(era as Era, v);
      }
    });
  }

  /** Repositionne les instances depuis le snapshot des agents (chaque frame). */
  update(): void {
    const snap = this.sim.agents.snapshot();
    const terrain = this.sim.terrain;
    const modelCount = this.meshes.length || 1;
    const counts = new Array(this.meshes.length).fill(0);

    for (let i = 0; i < snap.count; i++) {
      const wx = snap.x[i]!;
      const wy = snap.y[i]!;
      // Répartit les habitants entre les silhouettes disponibles.
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
      this.dummy.scale.setScalar(1); // géométrie déjà normalisée à AGENT_HEIGHT
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
