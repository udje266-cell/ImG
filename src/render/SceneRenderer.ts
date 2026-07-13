import {
  ACESFilmicToneMapping,
  Color,
  DirectionalLight,
  Fog,
  HemisphereLight,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  PCFSoftShadowMap,
  PlaneGeometry,
  Raycaster,
  RingGeometry,
  Scene,
  SRGBColorSpace,
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

const DAY_SKY = new Color("#8ec7ef");
const NIGHT_SKY = new Color("#0b1026");
const DUSK_SKY = new Color("#e8a878");
const GROUND_BOUNCE = new Color("#8a7a55"); // lumière rebondie chaude du sol

const DAY_SUN_INTENSITY = 3.1;
const NIGHT_HEMI = 0.12;

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
  private readonly hemi: HemisphereLight;
  private readonly fog: Fog;
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
    // Rendu « cinématographique » : tone-mapping ACES + sortie sRGB + ombres douces.
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = PCFSoftShadowMap;

    const { width, height } = sim.terrain;
    this.rig = new CameraRig(1, width / 2, height / 2);

    // Brume atmosphérique légère, cantonnée aux lointains (garde les couleurs
    // proches saturées ; seul l'horizon se fond dans le ciel).
    this.fog = new Fog(DAY_SKY.getHex(), width * 1.6, width * 3.0);
    this.scene.fog = this.fog;

    this.terrainMesh = new TerrainMesh(sim.terrain, sim.bus);
    this.terrainMesh.mesh.receiveShadow = true;
    this.terrainMesh.mesh.castShadow = true;
    this.scene.add(this.terrainMesh.mesh);

    this.weatherLayer = new WeatherLayer(
      sim,
      (mesh) => this.scene.add(mesh),
      (mesh) => this.scene.remove(mesh),
    );

    const water = new Mesh(
      new PlaneGeometry(width, height),
      new MeshLambertMaterial({ color: 0x3fa8d8, transparent: true, opacity: 0.72 }),
    );
    water.rotation.x = -Math.PI / 2;
    water.position.set(width / 2, 0.15, height / 2);
    water.receiveShadow = true;
    this.scene.add(water);

    // Soleil directionnel chaud, projetant des ombres douces sur le relief.
    this.sun = new DirectionalLight(0xfff0d6, DAY_SUN_INTENSITY);
    this.sun.target.position.set(width / 2, 0, height / 2);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.0006;
    const shadowCam = this.sun.shadow.camera;
    const extent = Math.max(width, height) * 0.62;
    shadowCam.left = -extent;
    shadowCam.right = extent;
    shadowCam.top = extent;
    shadowCam.bottom = -extent;
    shadowCam.near = 1;
    shadowCam.far = Math.max(width, height) * 3.2;
    this.scene.add(this.sun, this.sun.target);

    // Lumière hémisphérique : ciel froid en haut, rebond chaud du sol en bas.
    this.hemi = new HemisphereLight(DAY_SKY.getHex(), GROUND_BOUNCE.getHex(), 0.9);
    this.scene.add(this.hemi);

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
    const elevation = Math.sin(angle);
    this.sun.position.set(
      this.sun.target.position.x + Math.cos(angle) * radius,
      elevation * radius,
      this.sun.target.position.z + radius * 0.35,
    );
    const daylight = sim.clock.daylight;

    // Soleil : chaud et doré près de l'horizon (aube/couchant), blanc à midi.
    const lowSun = 1 - Math.min(1, Math.max(0, elevation) * 2.2); // 1 rasant → 0 haut
    this.sun.color.copy(DUSK_SKY).lerp(new Color(0xfff0d6), 1 - lowSun);
    this.sun.intensity = DAY_SUN_INTENSITY * Math.max(0.02, daylight) ** 1.1;
    this.hemi.intensity = NIGHT_HEMI + 0.85 * daylight;

    // Ciel : nuit → aube dorée → plein jour, et la brume s'y accorde.
    this.skyColor.copy(NIGHT_SKY).lerp(DAY_SKY, daylight);
    if (daylight > 0.05) this.skyColor.lerp(DUSK_SKY, lowSun * 0.5 * daylight);
    this.scene.background = this.skyColor;
    this.fog.color.copy(this.skyColor);

    this.weatherLayer.update();
    this.forest?.refresh();
    this.inhabitants?.update();

    this.rig.update();
    this.renderer.render(this.scene, this.rig.camera);
  }
}
