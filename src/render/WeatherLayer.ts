import {
  Color,
  DynamicDrawUsage,
  InstancedMesh,
  Matrix4,
  MeshLambertMaterial,
  Object3D,
  PlaneGeometry,
  Quaternion,
  Vector3,
} from "three";
import type { Simulation } from "../sim/world/Simulation";
import { WEATHER_CELL } from "../sim/weather/WeatherSystem";

/** Altitude (world units) of the cloud sheet above sea level. */
const CLOUD_ALTITUDE = 34;
/**
 * Below this cloudiness a cell draws no cloud puff. Kept high so clear skies
 * stay clear and only building weather (>= this) casts clouds — otherwise the
 * many low-cover cells blanket the world in a dull haze.
 */
const VISIBLE_THRESHOLD = 0.42;

const FAIR_COLOR = new Color("#fbfdff");
const STORM_COLOR = new Color("#9aa3b4");

/**
 * Couche météo (docs/TDD.md §4.5) : une nappe de nuages en `InstancedMesh`
 * (un quad horizontal par cellule météo visible), teintés du blanc au gris
 * orage selon la couverture, et opacité proportionnelle. Lecture seule de la
 * simulation. Un seul draw call pour tous les nuages — budget mobile trivial.
 */
export class WeatherLayer {
  readonly mesh: InstancedMesh;
  private readonly dummy = new Object3D();
  private readonly matrix = new Matrix4();
  private readonly position = new Vector3();
  private readonly quaternion = new Quaternion();
  private readonly scale = new Vector3();
  private readonly flat = new Vector3(1, 1, 1);
  private readonly hidden = new Vector3(0, 0, 0);

  constructor(private readonly sim: Simulation) {
    const weather = sim.weather;
    const count = weather.cellsX * weather.cellsY;
    const geometry = new PlaneGeometry(WEATHER_CELL * 1.25, WEATHER_CELL * 1.25);
    geometry.rotateX(-Math.PI / 2);
    const material = new MeshLambertMaterial({
      transparent: true,
      opacity: 0.7,
      depthWrite: false,
      vertexColors: false,
    });
    this.mesh = new InstancedMesh(geometry, material, count);
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.dummy.rotation.set(0, 0, 0);
  }

  /** Met à jour position, échelle et couleur des puffs depuis l'état météo. */
  update(): void {
    const weather = this.sim.weather;
    const y = CLOUD_ALTITUDE;
    let index = 0;
    for (let cy = 0; cy < weather.cellsY; cy++) {
      for (let cx = 0; cx < weather.cellsX; cx++) {
        const cover = weather.cloudAt(cx, cy);
        if (cover < VISIBLE_THRESHOLD) {
          // Escamote l'instance (échelle nulle).
          this.matrix.compose(this.position.set(0, -1000, 0), this.quaternion, this.hidden);
          this.mesh.setMatrixAt(index, this.matrix);
        } else {
          const wx = cx * WEATHER_CELL + WEATHER_CELL / 2;
          const wz = cy * WEATHER_CELL + WEATHER_CELL / 2;
          const s = 0.6 + cover * 0.7;
          this.matrix.compose(
            this.position.set(wx, y, wz),
            this.quaternion,
            this.scale.copy(this.flat).multiplyScalar(s),
          );
          this.mesh.setMatrixAt(index, this.matrix);
          this.mesh.setColorAt(index, FAIR_COLOR.clone().lerp(STORM_COLOR, cover));
        }
        index++;
      }
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}
