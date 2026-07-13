import {
  AmbientLight,
  Color,
  DirectionalLight,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  PlaneGeometry,
  Raycaster,
  RingGeometry,
  Scene,
  Vector2,
  WebGLRenderer,
} from "three";
import type { Simulation } from "../sim/world/Simulation";
import { CameraRig } from "./CameraRig";
import { ForestLayer } from "./ForestLayer";
import { InhabitantsLayer } from "./InhabitantsLayer";
import { Showcase } from "./Showcase";
import { TerrainMesh } from "./TerrainMesh";
import { WeatherLayer } from "./WeatherLayer";

const DAY_SKY = new Color("#a9d7ef");
const NIGHT_SKY = new Color("#0b1026");

const DAY_SUN_INTENSITY = 2.4;
const NIGHT_AMBIENT = 0.18;

/**
 * 3D scene orchestrator (docs/TDD.md §4.5): owns the WebGL renderer, the
 * terrain mesh, the water plane and the day/night lighting driven by the
 * simulation clock. Reads the simulation, never mutates it.
 */
export class SceneRenderer {
  readonly rig: CameraRig;

  private readonly renderer: WebGLRenderer;
  private readonly scene = new Scene();
  private readonly sun: DirectionalLight;
  private readonly ambient: AmbientLight;
  private readonly terrainMesh: TerrainMesh;
  private readonly weatherLayer: WeatherLayer;
  private readonly brushRing: Mesh;
  private readonly raycaster = new Raycaster();
  private readonly pointerNdc = new Vector2();
  private readonly skyColor = new Color();
  private viewW = 1;
  private viewH = 1;
  private showcase: Showcase | null = null;
  private forest: ForestLayer | null = null;
  private inhabitants: InhabitantsLayer | null = null;
  private lastFrameAt: number | null = null;

  constructor(
    readonly canvas: HTMLCanvasElement,
    private readonly sim: Simulation,
  ) {
    this.renderer = new WebGLRenderer({ canvas, antialias: true });

    const { width, height } = sim.terrain;
    this.rig = new CameraRig(1, width / 2, height / 2);

    this.terrainMesh = new TerrainMesh(sim.terrain, sim.bus);
    this.scene.add(this.terrainMesh.mesh);

    this.weatherLayer = new WeatherLayer(
      sim,
      (mesh) => this.scene.add(mesh),
      (mesh) => this.scene.remove(mesh),
    );

    const water = new Mesh(
      new PlaneGeometry(width, height),
      new MeshLambertMaterial({ color: 0x2f8fc4, transparent: true, opacity: 0.55 }),
    );
    water.rotation.x = -Math.PI / 2;
    water.position.set(width / 2, 0, height / 2);
    this.scene.add(water);

    this.sun = new DirectionalLight(0xfff3df, DAY_SUN_INTENSITY);
    this.sun.target.position.set(width / 2, 0, height / 2);
    this.scene.add(this.sun, this.sun.target);
    this.ambient = new AmbientLight(0xdfeaff, 0.5);
    this.scene.add(this.ambient);

    this.brushRing = new Mesh(
      new RingGeometry(0.85, 1, 48),
      new MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7, depthTest: false }),
    );
    this.brushRing.rotation.x = -Math.PI / 2;
    this.brushRing.visible = false;
    this.brushRing.renderOrder = 10;
    this.scene.add(this.brushRing);
  }

  resize(): void {
    this.viewW = this.canvas.clientWidth;
    this.viewH = this.canvas.clientHeight;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(this.viewW, this.viewH, false);
    this.rig.setAspect(this.viewW / this.viewH);
  }

  get width(): number {
    return this.viewW;
  }

  get height(): number {
    return this.viewH;
  }

  /** Raycast a screen point onto the terrain; returns tile coords or null. */
  pickTile(sx: number, sy: number): { x: number; y: number } | null {
    this.pointerNdc.set((sx / this.viewW) * 2 - 1, -(sy / this.viewH) * 2 + 1);
    this.raycaster.setFromCamera(this.pointerNdc, this.rig.camera);
    const hit = this.raycaster.intersectObject(this.terrainMesh.mesh, false)[0];
    if (!hit) return null;
    return { x: Math.floor(hit.point.x), y: Math.floor(hit.point.z) };
  }

  /** Position the brush indicator ring on the terrain under the pointer. */
  updateBrushIndicator(sx: number, sy: number, radiusTiles: number): void {
    this.pointerNdc.set((sx / this.viewW) * 2 - 1, -(sy / this.viewH) * 2 + 1);
    this.raycaster.setFromCamera(this.pointerNdc, this.rig.camera);
    const hit = this.raycaster.intersectObject(this.terrainMesh.mesh, false)[0];
    if (!hit) {
      this.brushRing.visible = false;
      return;
    }
    this.brushRing.visible = true;
    this.brushRing.position.set(hit.point.x, hit.point.y + 0.15, hit.point.z);
    this.brushRing.scale.setScalar(radiusTiles);
  }

  /**
   * Active la scène de validation des modèles (`?showcase=1`) et retourne
   * la position (en tuiles) où pointer la caméra.
   */
  async enableShowcase(sim: Simulation): Promise<{ x: number; y: number }> {
    this.showcase = new Showcase(sim.terrain);
    this.scene.add(this.showcase.group);
    await this.showcase.populate();
    return this.showcase.center;
  }

  /** Charge la couche de forêts instanciées (arbres selon la flore). */
  async enableForest(sim: Simulation, treeUrl: string): Promise<void> {
    this.forest = await ForestLayer.create(sim, treeUrl, (mesh) => this.scene.add(mesh));
  }

  /** Remplace les quads plats de la météo par le modèle de nuage 3D. */
  async enableCloudModel(cloudUrl: string): Promise<void> {
    await this.weatherLayer.useModel(cloudUrl);
  }

  /** Charge le rendu instancié des habitants. */
  async enableInhabitants(sim: Simulation, urls: string[]): Promise<void> {
    this.inhabitants = await InhabitantsLayer.create(sim, urls, (mesh) => this.scene.add(mesh));
  }

  /** Nombre d'habitants simulés (-1 si non initialisés) — debug. */
  get inhabitantCount(): number {
    return this.inhabitants ? this.sim.agents.count : -1;
  }

  /** Nombre d'arbres instanciés (-1 si la forêt n'est pas chargée) — debug. */
  get forestTreeCount(): number {
    return this.forest?.count ?? -1;
  }

  render(sim: Simulation): void {
    // Les animations d'idle du showcase suivent le temps réel du rendu.
    const now = performance.now();
    if (this.showcase && this.lastFrameAt !== null) {
      this.showcase.update(Math.min(0.1, (now - this.lastFrameAt) / 1000));
    }
    this.lastFrameAt = now;

    // Sun wheels around the world with the simulation clock; noon overhead.
    const angle = (sim.clock.timeOfDay - 0.25) * Math.PI * 2;
    const radius = Math.max(sim.terrain.width, sim.terrain.height) * 1.4;
    this.sun.position.set(
      this.sun.target.position.x + Math.cos(angle) * radius,
      Math.sin(angle) * radius,
      this.sun.target.position.z + radius * 0.35,
    );
    const daylight = sim.clock.daylight;
    this.sun.intensity = DAY_SUN_INTENSITY * Math.max(0, daylight) ** 1.2;
    this.ambient.intensity = NIGHT_AMBIENT + 0.45 * daylight;
    this.skyColor.copy(NIGHT_SKY).lerp(DAY_SKY, daylight);
    this.scene.background = this.skyColor;

    this.weatherLayer.update();
    this.forest?.refresh();
    this.inhabitants?.update();

    this.rig.update();
    this.renderer.render(this.scene, this.rig.camera);
  }
}
