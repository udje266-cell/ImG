import {
  type BufferGeometry,
  Color,
  DynamicDrawUsage,
  InstancedMesh,
  type Material,
  Mesh,
  MeshLambertMaterial,
  Object3D,
  PlaneGeometry,
} from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { WEATHER_CELL } from "../sim/weather/WeatherSystem";
import type { Simulation } from "../sim/world/Simulation";

/** Altitude (world units) of the cloud sheet above sea level. */
const CLOUD_ALTITUDE = 42;
/**
 * Below this cloudiness a cell draws no cloud. High threshold => seuls les
 * amas les plus denses deviennent des nuages, le ciel reste dégagé ailleurs
 * (évite le ciel couvert oppressant).
 */
const VISIBLE_THRESHOLD = 0.62;

const FAIR_COLOR = new Color("#fdfeff");
const STORM_COLOR = new Color("#b7bec9");

/**
 * Couche météo (docs/TDD.md §4.5) : un `InstancedMesh` du modèle de nuage
 * volumétrique (fourni, décimé), une instance par cellule météo au-dessus du
 * seuil, teintée du blanc au gris orage selon la couverture. Un seul draw
 * call. Tombe sur un quad plat si le modèle n'est pas encore chargé.
 */
export class WeatherLayer {
  private mesh: InstancedMesh;
  private readonly dummy = new Object3D();
  private readonly tint = new Color();

  constructor(
    private readonly sim: Simulation,
    private readonly addToScene: (mesh: InstancedMesh) => void,
    private readonly removeFromScene: (mesh: InstancedMesh) => void,
  ) {
    // Géométrie de repli (quad plat) jusqu'au chargement du modèle de nuage.
    const fallback = new PlaneGeometry(WEATHER_CELL * 1.2, WEATHER_CELL * 1.2);
    fallback.rotateX(-Math.PI / 2);
    this.mesh = this.buildMesh(fallback, this.defaultMaterial());
    addToScene(this.mesh);
  }

  private defaultMaterial(): Material {
    return new MeshLambertMaterial({ transparent: true, opacity: 0.7, depthWrite: false });
  }

  private buildMesh(geometry: BufferGeometry, material: Material): InstancedMesh {
    const count = this.sim.weather.cellsX * this.sim.weather.cellsY;
    const mesh = new InstancedMesh(geometry, material, count);
    mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    mesh.frustumCulled = false;
    return mesh;
  }

  /** Remplace le quad plat par le vrai modèle de nuage (chargé async). */
  async useModel(cloudUrl: string): Promise<void> {
    const gltf = await new GLTFLoader().loadAsync(cloudUrl);
    let src: Mesh | null = null;
    gltf.scene.traverse((o) => {
      if (!src && (o as Mesh).isMesh) src = o as Mesh;
    });
    if (!src) return;
    const cloudMesh = src as Mesh;

    // Échelle : le modèle (~1 unité) porté à ~1,6 cellule météo de large.
    cloudMesh.geometry.computeBoundingBox();
    const box = cloudMesh.geometry.boundingBox!;
    const width = Math.max(box.max.x - box.min.x, box.max.z - box.min.z) || 1;
    const scale = (WEATHER_CELL * 1.6) / width;
    cloudMesh.geometry.scale(scale, scale, scale);

    const material = new MeshLambertMaterial({
      color: 0xffffff,
      // Émissive douce : les dessous des nuages (dans l'ombre, vus de dessus)
      // restent clairs et cotonneux au lieu de virer au gris sombre.
      emissive: new Color(0x8a919e),
      transparent: true,
      opacity: 0.92,
      depthWrite: false,
    });

    this.removeFromScene(this.mesh);
    this.mesh.dispose();
    this.mesh = this.buildMesh(cloudMesh.geometry, material);
    this.addToScene(this.mesh);
  }

  /** Met à jour position, échelle et teinte des nuages depuis l'état météo. */
  update(): void {
    const weather = this.sim.weather;
    let index = 0;
    for (let cy = 0; cy < weather.cellsY; cy++) {
      for (let cx = 0; cx < weather.cellsX; cx++) {
        const cover = weather.cloudAt(cx, cy);
        if (cover < VISIBLE_THRESHOLD) {
          // Escamote l'instance (échelle nulle, hors champ).
          this.dummy.position.set(0, -1000, 0);
          this.dummy.scale.setScalar(0);
        } else {
          const wx = cx * WEATHER_CELL + WEATHER_CELL / 2;
          const wz = cy * WEATHER_CELL + WEATHER_CELL / 2;
          this.dummy.position.set(wx, CLOUD_ALTITUDE, wz);
          this.dummy.rotation.set(0, ((cx * 73 + cy * 191) % 360) * (Math.PI / 180), 0);
          this.dummy.scale.setScalar(0.35 + cover * 0.4);
          // Remappe [seuil,1] → [0,1] : blanc cotonneux au seuil, gris au plus dense.
          const storminess = (cover - VISIBLE_THRESHOLD) / (1 - VISIBLE_THRESHOLD);
          this.mesh.setColorAt(index, this.tint.copy(FAIR_COLOR).lerp(STORM_COLOR, storminess));
        }
        this.dummy.updateMatrix();
        this.mesh.setMatrixAt(index, this.dummy.matrix);
        index++;
      }
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}
